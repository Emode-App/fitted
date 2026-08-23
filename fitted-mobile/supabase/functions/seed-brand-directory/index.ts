// @ts-nocheck
// supabase/functions/seed-brand-directory/index.ts
//
// Populates public.brands from the aggregator's designer index.
//
// This used to scrape a designer retailer's index live. That gave 553 brands --
// the labels one boutique happens to stock -- and silently missed most of what
// people actually wear: Supreme, Stussy, Carhartt and Prada were all absent. The
// list is now carried in the repo instead, 12,420 entries, and seeding is a
// bulk upsert rather than a scrape that can half-fail and leave the directory in
// whatever state the rate limiter allowed.
//
// Seeding the directory does NOT create crawl jobs. Two jobs per brand against a
// schedule that does one job per run would be years of queue, nearly all of it
// for labels nobody will ever post. Brands sit here costing nothing until
// ensure_brand_sources() is called for them -- on tag, or on opening a brand
// page with no catalogue.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';
import designers from './lyst-designers.json' with { type: 'json' };

const SEED_SECRET = Deno.env.get('CATALOG_SEED_SECRET') || '';

// Postgres has a parameter ceiling per statement and the payload is ~12k rows;
// chunking keeps each upsert well inside it.
const CHUNK = 500;

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

interface Designer {
    /** The aggregator's own slug, which is what its URLs use. */
    slug: string;
    name: string;
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    if (!SEED_SECRET || req.headers.get('x-seed-secret') !== SEED_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
    }

    try {
        const rows = designers as Designer[];
        if (!rows.length) return json({ error: 'Seed list is empty' }, 500);

        // brand_slug() is how a typed brand name collapses to a key, so a
        // directory entry and the same brand tagged on a post land on one row.
        //
        // It is deliberately not the aggregator's slug: 13% of the list
        // disagrees, and not over accents -- the site has its own conventions
        // ("10 Crosby Derek Lam" is filed as 10-crosby-by-derek-lam, bare years
        // gain a "-designer" suffix). That slug cannot be derived, so it rides
        // along in lyst_slug for whenever this brand earns a crawl job.
        const { data: slugs, error: slugError } = await admin.rpc('brand_slugs_for', {
            names: rows.map((row) => row.name),
        });
        if (slugError) throw slugError;

        // One brand key can be reached by several spellings in the list; the
        // first wins rather than the upsert fighting itself inside one chunk.
        const byKey = new Map<string, { slug: string; name: string; source: string; lyst_slug: string }>();
        rows.forEach((row, index) => {
            const key = slugs?.[index];
            if (!key || byKey.has(key)) return;
            byKey.set(key, { slug: key, name: row.name, source: 'lyst-directory', lyst_slug: row.slug });
        });

        const payload = [...byKey.values()];
        let written = 0;

        for (let at = 0; at < payload.length; at += CHUNK) {
            // A brand already known from tagging keeps its post_count and gains
            // the directory's spelling plus the slug a crawl would need.
            const { error } = await admin
                .from('brands')
                .upsert(payload.slice(at, at + CHUNK), { onConflict: 'slug' });

            if (error) throw error;
            written += Math.min(CHUNK, payload.length - at);
        }

        return json({ directory: written, listed: rows.length });
    } catch (error: any) {
        console.error('seed-brand-directory', error?.message);
        return json({ error: 'Directory seeding failed' }, 500);
    }
});
