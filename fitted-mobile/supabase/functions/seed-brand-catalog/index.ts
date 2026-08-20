// @ts-nocheck
// supabase/functions/seed-brand-catalog/index.ts
//
// Builds public.brand_catalog from retailer listings via Firecrawl.
//
// This is the offline catalogue builder, not a live search path. Brand pages read
// brand_catalog straight from Postgres; nothing user-facing waits on a crawl. Run
// it on a schedule (pg_cron -> pg_net) or by hand after adding a brand.
//
// It deliberately does NOT write to public.products. That table is marketplace
// inventory with a NOT NULL seller_id and a reservation counter — catalogue rows
// there would read as items somebody on this app is selling.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';

const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY') || '';
const SEED_SECRET = Deno.env.get('CATALOG_SEED_SECRET') || '';
const SOURCE_DOMAIN = 'ssense.com';
const MAX_BRANDS_PER_RUN = 10;

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

interface Listing {
    name: string;
    price: number | null;
    productUrl: string;
    imageUrl: string | null;
}

/**
 * Pull listings out of a retailer index page rendered as markdown.
 *
 * The shape is a markdown link whose label carries an optional image, the product
 * name and a price, and whose href is the product page:
 *
 *   [![alt](image)\ Brand\ Name\ $1690](https://.../product/brand/slug/12345)
 *
 * Anchored on the product URL rather than the label, because the label's
 * whitespace and escaping vary between listing and sale pages while the href
 * shape does not. A sale item shows two prices; the last one is what it costs
 * today, so that is the one kept.
 */
function parseListings(markdown: string): Listing[] {
    const found = new Map<string, Listing>();
    const link = /\[([\s\S]{0,600}?)\]\((https:\/\/www\.ssense\.com\/[^)\s]*\/product\/[^)\s]+)\)/g;

    for (const match of markdown.matchAll(link)) {
        const [, label, productUrl] = match;
        if (found.has(productUrl)) continue;

        const imageUrl = label.match(/\((https:\/\/img\.ssensemedia\.com\/[^)\s]+)\)/)?.[1] ?? null;

        const prices = [...label.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)]
            .map((p) => Number(p[1].replace(/,/g, '')))
            .filter((n) => Number.isFinite(n) && n > 0);
        const price = prices.length ? prices[prices.length - 1] : null;

        // Strip the image, the repeated brand line and the price off the label;
        // the longest line left is the product name.
        const name = label
            .replace(/!\[[\s\S]*?\)/g, ' ')
            .replace(/\$\s?[\d,]+(?:\.\d{2})?/g, ' ')
            .split(/[\\\n]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 2)
            .sort((a, b) => b.length - a.length)[0];

        if (!name) continue;
        found.set(productUrl, { name: name.slice(0, 200), price, productUrl, imageUrl });
    }

    return [...found.values()];
}

/**
 * Fetch the hero image for one product page.
 *
 * Index pages are inconsistent about images: some brands render real CDN URLs in
 * the grid, others lazy-load and emit a base64 placeholder, so roughly half the
 * listings arrive with nothing usable. A row with no image is parked rather than
 * shown — an empty tile looks broken — so this recovers it from the product page.
 *
 * Only called for listings the index page could not supply, since it is one
 * request per product.
 */
async function resolveImage(productUrl: string): Promise<string | null> {
    try {
        const resp = await fetch('https://api.firecrawl.dev/v2/scrape', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ url: productUrl, formats: ['markdown'], onlyMainContent: true }),
        });

        if (!resp.ok) return null;

        const markdown = String((await resp.json())?.data?.markdown ?? '');
        return markdown.match(/https:\/\/img\.ssensemedia\.com\/[^\s)"']+/)?.[0] ?? null;
    } catch {
        return null;
    }
}

async function crawlBrand(brandName: string): Promise<Listing[]> {
    const resp = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            query: `${brandName} designer collection`,
            limit: 3,
            includeDomains: [SOURCE_DOMAIN],
        }),
    });

    if (!resp.ok) {
        console.error('firecrawl', brandName, resp.status, (await resp.text()).slice(0, 200));
        return [];
    }

    const body = await resp.json();
    const pages: any[] = body?.data?.web ?? [];

    // The index page carries the most listings; take whatever every result yields
    // and let the URL de-dupe sort out the overlap.
    return pages.flatMap((page) => parseListings(String(page?.description ?? '')));
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // Crawling costs Firecrawl credits, so this is not open to callers.
    if (!SEED_SECRET || req.headers.get('x-seed-secret') !== SEED_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
    }
    if (!FIRECRAWL_API_KEY) return json({ error: 'FIRECRAWL_API_KEY is not set' }, 503);

    try {
        const payload = await req.json().catch(() => ({}));

        // Named brands, or the least recently refreshed ones from the registry.
        let brands: { slug: string; name: string }[];

        if (Array.isArray(payload?.brands) && payload.brands.length) {
            const { data } = await admin
                .from('brands')
                .select('slug, name')
                .in('slug', payload.brands.slice(0, MAX_BRANDS_PER_RUN));
            brands = data ?? [];
        } else {
            const { data } = await admin
                .from('brands')
                .select('slug, name')
                .order('post_count', { ascending: false })
                .limit(MAX_BRANDS_PER_RUN);
            brands = data ?? [];
        }

        if (!brands.length) return json({ error: 'No brands to seed' }, 400);

        const report: Record<string, number> = {};

        for (const brand of brands) {
            const listings = await crawlBrand(brand.name);
            if (!listings.length) {
                report[brand.slug] = 0;
                continue;
            }

            // Recover images the index page could not give us, capped so one
            // brand cannot burn the whole credit budget on a single run.
            const needsImage = listings.filter((listing) => !listing.imageUrl).slice(0, 20);
            for (const listing of needsImage) {
                listing.imageUrl = await resolveImage(listing.productUrl);
            }

            const { error } = await admin.from('brand_catalog').upsert(
                listings.map((listing) => ({
                    brand_slug: brand.slug,
                    brand_name: brand.name,
                    name: listing.name,
                    price: listing.price,
                    image_url: listing.imageUrl,
                    product_url: listing.productUrl,
                    source: SOURCE_DOMAIN.replace('.com', ''),
                    // Parked, not discarded: the product is still known, and a later
                    // run that resolves its image switches it on without having to
                    // rediscover it.
                    is_active: !!listing.imageUrl,
                    fetched_at: new Date().toISOString(),
                })),
                { onConflict: 'product_url' },
            );

            if (error) {
                console.error('upsert', brand.slug, error.message);
                report[brand.slug] = 0;
            } else {
                report[brand.slug] = listings.filter((listing) => listing.imageUrl).length;
            }
        }

        return json({ seeded: report });
    } catch (error: any) {
        console.error('seed-brand-catalog', error?.message);
        return json({ error: 'Seeding failed' }, 500);
    }
});
