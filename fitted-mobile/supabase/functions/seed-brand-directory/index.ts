// @ts-nocheck
// supabase/functions/seed-brand-directory/index.ts
//
// Populates public.brands from the retailer's own designer index.
//
// Seeded from the same source the catalogue is crawled from on purpose. A wider
// directory (Lyst carries several thousand labels against roughly a thousand
// here) buys nothing if the slug does not resolve to a page we can crawl — the
// catalogue job would just 404 its way through the list. Names people tag that
// are not in the directory still register themselves from their posts; they
// simply have no catalogue until a source for them exists.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';

const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY') || '';
const SEED_SECRET = Deno.env.get('CATALOG_SEED_SECRET') || '';
const SOURCE_DOMAIN = 'ssense.com';

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

async function scrape(url: string): Promise<string | null> {
    try {
        const resp = await fetch('https://api.firecrawl.dev/v2/scrape', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
        });
        if (!resp.ok) {
            console.error('scrape', url, resp.status);
            return null;
        }
        return String((await resp.json())?.data?.markdown ?? '');
    } catch (error) {
        console.error('scrape threw', url, error);
        return null;
    }
}

/**
 * Read designer links out of an index page.
 *
 * Entries look like [Rick Owens](https://www.ssense.com/en-us/men/designers/rick-owens).
 * Anything with a further path segment is a category page under a designer
 * (.../rick-owens/sneakers) and is not itself a brand.
 */
function parseDesigners(markdown: string): { name: string; catalogSlug: string }[] {
    const found = new Map<string, string>();
    const link = /\[([^\]\n]{1,80})\]\(https:\/\/www\.ssense\.com\/[a-z-]+\/(?:men|women)\/designers\/([a-z0-9-]+)\/?\)/gi;

    for (const match of markdown.matchAll(link)) {
        const name = match[1].trim();
        const catalogSlug = match[2].toLowerCase();
        if (!name || name.length < 2) continue;
        if (/^(sale|new|all|shop|designers)$/i.test(name)) continue;
        if (!found.has(catalogSlug)) found.set(catalogSlug, name);
    }

    return [...found.entries()].map(([catalogSlug, name]) => ({ name, catalogSlug }));
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
    if (!FIRECRAWL_API_KEY) return json({ error: 'FIRECRAWL_API_KEY is not set' }, 503);

    try {
        const designers = new Map<string, string>();

        for (const department of ['men', 'women']) {
            const markdown = await scrape(`https://www.${SOURCE_DOMAIN}/en-us/${department}/designers`);
            if (!markdown) continue;
            for (const { name, catalogSlug } of parseDesigners(markdown)) {
                if (!designers.has(catalogSlug)) designers.set(catalogSlug, name);
            }
        }

        if (!designers.size) return json({ error: 'No designers found' }, 502);

        // brand_slug() is how tagged names collapse to a key, so a directory entry
        // and the same brand typed into a post land on one row rather than two.
        const rows = [...designers.entries()].map(([catalogSlug, name]) => ({ name, catalogSlug }));

        const { data: slugs, error: slugError } = await admin.rpc('brand_slugs_for', {
            names: rows.map((row) => row.name),
        });
        if (slugError) throw slugError;

        const payload = rows.map((row, index) => ({
            slug: slugs[index],
            name: row.name,
            source: 'directory',
            catalog_slug: row.catalogSlug,
        })).filter((row) => !!row.slug);

        // A brand already known from tagging keeps its post_count and gains the
        // directory's spelling plus the slug the crawler needs.
        const { error } = await admin.from('brands').upsert(payload, { onConflict: 'slug' });
        if (error) throw error;

        return json({ directory: payload.length });
    } catch (error: any) {
        console.error('seed-brand-directory', error?.message);
        return json({ error: 'Directory seeding failed' }, 500);
    }
});
