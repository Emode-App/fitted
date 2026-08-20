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
// Edge functions are killed at 150s idle. A scrape is roughly 2-6s, so the whole
// budget is about twenty requests — one brand per invocation, and a scheduler
// loops it. Trying to do ten brands at once just times out and writes nothing.
const MAX_BRANDS_PER_RUN = 1;
const MAX_PAGES_PER_DEPARTMENT = 2;
const MAX_LISTINGS_PER_BRAND = 240;
const MAX_IMAGE_LOOKUPS = 8;

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

/** Scrape one URL to markdown. */
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
 * Every listing a retailer has for one brand.
 *
 * Scrapes the designer index directly and walks its pagination, rather than
 * asking search for the page and parsing whatever made it into the result
 * snippet. Search was the first approach and it is not a catalogue API: the same
 * query shape returned 41 products for one brand, 6 for another and nothing at
 * all for a third, because the snippet is chosen for relevance, not completeness.
 *
 * Both the men's and women's index are walked — plenty of brands list a piece
 * under only one — and the URL de-dupe collapses anything carried by both.
 */
async function crawlBrand(brandSlug: string): Promise<Listing[]> {
    const found = new Map<string, Listing>();

    for (const department of ['men', 'women']) {
        for (let page = 1; page <= MAX_PAGES_PER_DEPARTMENT; page++) {
            const url = `https://www.${SOURCE_DOMAIN}/en-us/${department}/designers/${brandSlug}${page > 1 ? `?page=${page}` : ''}`;
            const markdown = await scrape(url);
            if (!markdown) break;

            const listings = parseListings(markdown);
            // An empty page means the brand has no more; stop rather than walking
            // to the cap for a label that only carries a dozen pieces.
            if (listings.length === 0) break;

            for (const listing of listings) {
                if (!found.has(listing.productUrl)) found.set(listing.productUrl, listing);
            }

            if (found.size >= MAX_LISTINGS_PER_BRAND) return [...found.values()];
        }
    }

    return [...found.values()];
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
                .select('slug, name, catalog_slug')
                .in('slug', payload.brands.slice(0, MAX_BRANDS_PER_RUN));
            brands = data ?? [];
        } else {
            // Stalest first, so a repeating schedule works through the whole
            // directory instead of re-crawling the same brand forever.
            const { data } = await admin
                .from('brands')
                .select('slug, name, catalog_slug')
                .not('catalog_slug', 'is', null)
                .order('catalog_synced_at', { ascending: true, nullsFirst: true })
                .limit(MAX_BRANDS_PER_RUN);
            brands = data ?? [];
        }

        if (!brands.length) return json({ error: 'No brands to seed' }, 400);

        const report: Record<string, number> = {};

        for (const brand of brands) {
            const listings = await crawlBrand(brand.catalog_slug || brand.slug);

            // Stamp before deciding what to do with the results. A brand that
            // yields nothing must still advance the queue, or a single dead page
            // parks the scheduler on it permanently.
            await admin.from('brands')
                .update({ catalog_synced_at: new Date().toISOString() })
                .eq('slug', brand.slug);

            if (!listings.length) {
                report[brand.slug] = 0;
                continue;
            }

            // Recover images the index page could not give us, capped so one
            // brand cannot burn the whole credit budget on a single run.
            const needsImage = listings.filter((listing) => !listing.imageUrl).slice(0, MAX_IMAGE_LOOKUPS);
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
