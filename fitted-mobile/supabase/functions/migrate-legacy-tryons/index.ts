// @ts-nocheck
// One-shot maintenance: move generated try-ons out of the public bucket.
//
// Before try-ons moved to private storage, generateDressingRoomOutfit wrote the
// image into the public `products` bucket and stored the full public URL on the
// row. Those images are of the user's own face, and anyone holding the URL can
// still open them -- no signature, no expiry, no account required.
//
// This copies each one into the private bucket, repoints the row, and deletes
// the public original. Idempotent: rows already holding a private path are not
// matched, so re-running it is a no-op.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';

const SEED_SECRET = Deno.env.get('CATALOG_SEED_SECRET') || '';
const PRIVATE_BUCKET = 'private-media';

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Split a public storage URL into the bucket and key it points at. */
function parsePublicUrl(url: string): { bucket: string; key: string } | null {
    const match = url.match(/\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], key: decodeURIComponent(match[2]) };
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!SEED_SECRET || req.headers.get('x-seed-secret') !== SEED_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const params = new URL(req.url).searchParams;
    const dryRun = params.get('dry') === '1';

    // Second pass: generated images left in the public bucket that no row points
    // at any more. They cannot be repointed, because there is nothing to
    // repoint -- but they are still someone's face on a public URL, so the only
    // thing to do with them is delete them.
    if (params.get('orphans') === '1') {
        const { data: objects, error: listError } = await admin.schema('storage')
            .from('objects')
            .select('name')
            .eq('bucket_id', 'products')
            .like('name', 'dressing-room/%');
        if (listError) return json({ error: listError.message }, 500);

        const { data: referenced } = await admin
            .from('dressing_room_outfits')
            .select('generated_image_url');
        const inUse = (referenced || []).map((r: any) => r.generated_image_url);

        // A path counts as referenced whether the row stores it bare or inside
        // an old full public URL, so a mistake here cannot orphan a live image.
        const orphans = (objects || [])
            .map((o: any) => o.name)
            .filter((name: string) => !inUse.some((u: string) => u === name || u.endsWith(name)));

        if (dryRun) return json({ dryRun: true, orphans });

        const { error: rmError } = await admin.storage.from('products').remove(orphans);
        return json({ deleted: rmError ? 0 : orphans.length, orphans, error: rmError?.message });
    }

    const { data: rows, error } = await admin
        .from('dressing_room_outfits')
        .select('id, user_id, generated_image_url')
        .like('generated_image_url', 'http%');
    if (error) return json({ error: error.message }, 500);

    const results: unknown[] = [];
    let moved = 0;

    for (const row of rows || []) {
        const source = parsePublicUrl(row.generated_image_url);
        if (!source) {
            results.push({ id: row.id, status: 'skipped', reason: 'not a public storage url' });
            continue;
        }

        if (dryRun) {
            results.push({ id: row.id, status: 'would move', from: source });
            continue;
        }

        // Download with the service role rather than over HTTP, so this works
        // the same if the bucket is made private before the migration runs.
        const { data: blob, error: dlError } = await admin.storage
            .from(source.bucket).download(source.key);
        if (dlError || !blob) {
            results.push({ id: row.id, status: 'failed', step: 'download', reason: dlError?.message });
            continue;
        }

        // Named by row id, so a retry after a partial failure overwrites its own
        // half-finished copy instead of leaving a second one behind.
        const target = `generated/${row.user_id}/legacy_${row.id}.png`;
        const { error: upError } = await admin.storage
            .from(PRIVATE_BUCKET)
            .upload(target, blob, { contentType: 'image/png', upsert: true });
        if (upError) {
            results.push({ id: row.id, status: 'failed', step: 'upload', reason: upError.message });
            continue;
        }

        // The row is repointed before the original is removed. If this process
        // dies in between, the worst outcome is a public file with nothing
        // referencing it -- recoverable. The other order would lose the image.
        const { error: rowError } = await admin
            .from('dressing_room_outfits')
            .update({ generated_image_url: target })
            .eq('id', row.id);
        if (rowError) {
            results.push({ id: row.id, status: 'failed', step: 'repoint', reason: rowError.message });
            continue;
        }

        const { error: rmError } = await admin.storage
            .from(source.bucket).remove([source.key]);

        moved++;
        results.push({
            id: row.id,
            status: 'moved',
            to: target,
            publicOriginalRemoved: !rmError,
            ...(rmError ? { removeError: rmError.message } : {}),
        });
    }

    return json({ dryRun, candidates: (rows || []).length, moved, results });
});
