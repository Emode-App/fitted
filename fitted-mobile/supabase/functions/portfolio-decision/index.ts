// The client's answer, and the copying that answer implies.
//
// A delivery lives in private-media, readable only by the two people in that
// conversation and only through a signed URL that expires. A portfolio is
// public. So approving is not a flag flip -- it is the moment a private image
// becomes a public one, and this is where that copy happens.
//
// Revoking deletes the public copy rather than hiding it. Consent that can be
// withdrawn in the interface while the file stays fetchable is not consent
// withdrawn at all.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const PRIVATE_BUCKET = 'private-media';
const PUBLIC_BUCKET = 'posts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const { item_id, decision } = await req.json().catch(() => ({}));
        if (!item_id || !['approved', 'revoked'].includes(decision)) {
            return json({ error: 'Say which item, and approved or revoked' }, 400);
        }

        const { data: item } = await admin
            .from('portfolio_items')
            .select('*')
            .eq('id', item_id)
            .single();

        if (!item) return json({ error: 'No such portfolio item' }, 404);

        // The decision belongs to the person whose face it is. Checked here as
        // well as in the row policy, because this function runs as service role
        // and would otherwise honour anybody who knew an id.
        if (item.client_id !== user.id) {
            return json({ error: 'This is not your decision to make' }, 403);
        }

        const publicPathFor = (kind: string) => `portfolio/${item.stylist_id}/${item.id}_${kind}.jpg`;

        if (decision === 'revoked') {
            const toRemove = [publicPathFor('generated'), publicPathFor('board')];
            const { error: removeError } = await admin.storage.from(PUBLIC_BUCKET).remove(toRemove);
            // A missing file is the desired end state, so only a real failure
            // stops us -- otherwise the row would stay 'approved' with nothing
            // behind it, which is the wrong way round to fail.
            if (removeError) console.warn('portfolio revoke: could not remove copies:', removeError.message);

            await admin.from('portfolio_items')
                .update({ status: 'revoked', generated_image_url: null, board_image_url: null })
                .eq('id', item.id);

            return json({ ok: true, status: 'revoked' });
        }

        // Approving: copy each private original into the public bucket.
        const copy = async (sourcePath: string | null, kind: string): Promise<string | null> => {
            if (!sourcePath) return null;
            const { data: file, error: downloadError } = await admin.storage
                .from(PRIVATE_BUCKET)
                .download(sourcePath);
            if (downloadError || !file) {
                console.warn(`portfolio approve: could not read ${kind}:`, downloadError?.message);
                return null;
            }

            const target = publicPathFor(kind);
            const { error: uploadError } = await admin.storage
                .from(PUBLIC_BUCKET)
                .upload(target, await file.arrayBuffer(), { contentType: 'image/jpeg', upsert: true });
            if (uploadError) {
                console.warn(`portfolio approve: could not publish ${kind}:`, uploadError.message);
                return null;
            }

            return admin.storage.from(PUBLIC_BUCKET).getPublicUrl(target).data.publicUrl;
        };

        const generatedUrl = await copy(item.source_generated_path, 'generated');
        const boardUrl = await copy(item.source_board_path, 'board');

        if (!generatedUrl && !boardUrl) {
            return json({ error: 'Could not publish that look. Nothing was changed.' }, 500);
        }

        await admin.from('portfolio_items')
            .update({
                status: 'approved',
                generated_image_url: generatedUrl,
                board_image_url: boardUrl,
            })
            .eq('id', item.id);

        return json({ ok: true, status: 'approved' });
    } catch (error: any) {
        console.error('portfolio-decision failed', error?.message);
        return json({ error: 'Could not save your answer' }, 500);
    }
});
