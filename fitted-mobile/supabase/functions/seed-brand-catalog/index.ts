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
 * An entry looks like this, with the brand and the product name emitted as
 * adjacent spans that markdown runs together inside one bold run:
 *
 *   [![alt](img)\ **Rick OwensBlack Tower Vega Jeans** \ $1435](https://.../product/rick-owens/black-tower-vega-jeans/19341741)
 *
 * Three things have to be got right, and the first version got none of them:
 *   - the bold markers are part of the label, not part of the name;
 *   - the brand is glued to the front of the name with no separator;
 *   - the page's own sort and filter controls are links too, and one of them
 *     ("Discount: High to low") sailed through as a product.
 */
function parseListings(markdown: string, brandSlug: string): Listing[] {
    const found = new Map<string, Listing>();

    // A product URL is /product/<brand>/<name-slug>/<numeric id>. Both segments
    // are captured: the brand one is the only trustworthy statement of whose
    // product this is, and the name one is the product name already normalised.
    const link = /\[([\s\S]{0,600}?)\]\((https:\/\/www\.ssense\.com\/[a-z-]+\/(?:men|women)\/product\/([a-z0-9-]+)\/([a-z0-9-]+)\/\d+)\)/gi;

    // Only a real CDN transform is an image. The bare host appears on pages as a
    // placeholder and renders as an empty tile.
    const IMAGE = /https:\/\/img\.ssensemedia\.com\/image\/upload\/[^\s)"']+\.jpg/i;

    for (const match of markdown.matchAll(link)) {
        const [, label, productUrl, urlBrand, urlName] = match;
        if (found.has(productUrl)) continue;

        // A designer index also carries recommendations, recently-viewed and
        // "you may also like" tiles for OTHER labels. Trusting the page put every
        // one of those into the brand being crawled — Vivienne Westwood and Nour
        // Hammour pieces filed under Loewe. The brand in the product's own URL is
        // the only claim worth believing.
        if (urlBrand !== brandSlug) continue;

        const imageUrl = squareImage(label.match(IMAGE)?.[0] ?? null);

        // A sale item shows was-price then now-price; the later one is what it
        // costs today.
        const prices = [...label.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)]
            .map((p) => Number(p[1].replace(/,/g, '')))
            .filter((n) => Number.isFinite(n) && n > 0);
        const price = prices.length ? prices[prices.length - 1] : null;

        // Built from the URL's name slug rather than the rendered label. The
        // label is a run of adjacent spans that markdown concatenates, which is
        // where "**Rick OwensGray Tower Felt Cashmere**" came from; the slug is
        // already just the product, with the brand in its own segment.
        const name = urlName
            .split('-')
            .filter(Boolean)
            .map((word) => (word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
            .join(' ');

        if (!name || name.length < 3) continue;

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

/**
 * Rewrite a retailer image URL into a square the app can crop safely.
 *
 * These are Cloudinary transforms, and the listing grid asks for
 * `b_white,c_lpad,g_south,ar_2:3` — a tall 2:3 frame with the product padded
 * toward the bottom. A square tile filling with `cover` then crops the middle of
 * that frame, which is the empty padding above the product, so a perfectly good
 * photo renders as a blank card.
 *
 * Asking for a centred 1:1 instead means the product is what survives the crop.
 */
function squareImage(url: string | null): string | null {
    if (!url) return null;
    return url.replace(
        /\/image\/upload\/[^/]+\/[^/]+\//,
        '/image/upload/b_white,c_pad,ar_1:1/f_auto,c_limit,w_800,q_85/',
    );
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
async function crawlBrand(
    brandSlug: string,
    brandName: string,
    startPage: number,
): Promise<{ listings: Listing[]; nextCursor: number }> {
    const found = new Map<string, Listing>();
    let exhausted = false;

    for (const department of ['men', 'women']) {
        for (let offset = 0; offset < MAX_PAGES_PER_DEPARTMENT; offset++) {
            const page = startPage + offset;
            const url = `https://www.${SOURCE_DOMAIN}/en-us/${department}/designers/${brandSlug}${page > 1 ? `?page=${page}` : ''}`;
            const markdown = await scrape(url);
            if (!markdown) { exhausted = true; break; }

            const listings = parseListings(markdown, brandSlug);
            // Running off the end of the index is how we learn a brand's depth;
            // wrap the cursor back to the front so the next pass refreshes prices.
            if (listings.length === 0) { exhausted = true; break; }

            for (const listing of listings) {
                if (!found.has(listing.productUrl)) found.set(listing.productUrl, listing);
            }

            if (found.size >= MAX_LISTINGS_PER_BRAND) {
                return { listings: [...found.values()], nextCursor: page + 1 };
            }
        }
    }

    return {
        listings: [...found.values()],
        nextCursor: exhausted ? 1 : startPage + MAX_PAGES_PER_DEPARTMENT,
    };
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
                .select('slug, name, catalog_slug, catalog_page_cursor')
                .in('slug', payload.brands.slice(0, MAX_BRANDS_PER_RUN));
            brands = data ?? [];
        } else {
            // Stalest first, so a repeating schedule works through the whole
            // directory instead of re-crawling the same brand forever.
            const { data } = await admin
                .from('brands')
                .select('slug, name, catalog_slug, catalog_page_cursor')
                .not('catalog_slug', 'is', null)
                .order('catalog_synced_at', { ascending: true, nullsFirst: true })
                .limit(MAX_BRANDS_PER_RUN);
            brands = data ?? [];
        }

        if (!brands.length) return json({ error: 'No brands to seed' }, 400);

        const report: Record<string, number> = {};

        for (const brand of brands) {
            const { listings, nextCursor } = await crawlBrand(
                brand.catalog_slug || brand.slug,
                brand.name,
                brand.catalog_page_cursor || 1,
            );

            // Stamp before deciding what to do with the results. A brand that
            // yields nothing must still advance the queue, or a single dead page
            // parks the scheduler on it permanently.
            await admin.from('brands')
                .update({
                    catalog_synced_at: new Date().toISOString(),
                    catalog_page_cursor: nextCursor,
                })
                .eq('slug', brand.slug);

            if (!listings.length) {
                report[brand.slug] = 0;
                continue;
            }

            // Recover images the index page could not give us, capped so one
            // brand cannot burn the whole credit budget on a single run.
            const needsImage = listings.filter((listing) => !listing.imageUrl).slice(0, MAX_IMAGE_LOOKUPS);
            for (const listing of needsImage) {
                listing.imageUrl = squareImage(await resolveImage(listing.productUrl));
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
