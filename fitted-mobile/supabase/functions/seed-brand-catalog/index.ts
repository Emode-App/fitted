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
const RATE_LIMIT_RETRIES = 3;

/**
 * When this invocation must stop reaching out and write what it has.
 *
 * The gateway drops the request at 150s. Anything the run has not finished by
 * then is picked up next time, which is safe now that a failed fetch no longer
 * moves the page cursor.
 */
let deadline = 0;

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
    // Goes through scrape() so it waits out a 429 like the index crawl does.
    // Its own bare fetch treated a rate-limited product page as one with no
    // photo on it, which parked the row and made the tile look broken.
    const { markdown, failed } = await scrape(productUrl);
    if (!markdown) {
        console.error('resolveImage', productUrl, failed ? 'scrape refused' : 'empty page');
        return null;
    }

    // Any product image, not one site's CDN. Looking only for SSENSE's host
    // is why every Lyst and StockX listing came back imageless and parked —
    // 99 New Balance products found, 16 showing.
    for (const match of markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
        const url = match[1];
        if (!/\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i.test(url)) continue;
        // Sprites, badges, payment marks and tracking pixels are not products.
        if (/(logo|icon|sprite|badge|placeholder|pixel|klarna|afterpay|flag)/i.test(url)) continue;
        return url;
    }

    const candidates = [...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].length;
    console.error('resolveImage', productUrl, `no usable image among ${candidates} candidate(s)`);
    return null;
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
    // Only this one CDN takes transform directives in the path. Other hosts are
    // returned untouched rather than having a path segment mangled into them.
    if (!url.includes('img.ssensemedia.com/image/upload/')) return url;
    return url.replace(
        /\/image\/upload\/[^/]+\/[^/]+\//,
        '/image/upload/b_white,c_pad,ar_1:1/f_auto,c_limit,w_800,q_85/',
    );
}

/**
 * Scrape one URL to markdown, waiting out the rate limiter.
 *
 * Firecrawl answers 429 freely once a run gets going, and this used to report
 * that as null — the same answer it gives for a page with nothing on it. The
 * crawl could not tell "nothing here" from "not allowed to look", so it counted
 * a refusal as an exhausted page, advanced the cursor past pages it had never
 * read, and lost every product on them. `failed` is what lets a caller hold its
 * place instead of stepping over the gap.
 */
async function scrape(url: string): Promise<{ markdown: string | null; failed: boolean }> {
    for (let attempt = 0; ; attempt++) {
        try {
            const resp = await fetch('https://api.firecrawl.dev/v2/scrape', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
            });

            if (resp.status === 429) {
                const retryAfter = Number(resp.headers.get('retry-after'));
                const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
                    ? Math.min(retryAfter * 1000, 15_000)
                    : Math.min(2000 * 2 ** attempt, 15_000);

                // The gateway kills the invocation at 150s, so a run that cannot
                // get through in its slice gives the pages back rather than
                // burning the whole budget waiting and dying mid-write.
                if (attempt >= RATE_LIMIT_RETRIES || Date.now() + waitMs > deadline) {
                    console.error('scrape', url, 'rate limited, yielding');
                    return { markdown: null, failed: true };
                }
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                continue;
            }

            if (!resp.ok) {
                console.error('scrape', url, resp.status);
                return { markdown: null, failed: true };
            }
            return { markdown: String((await resp.json())?.data?.markdown ?? ''), failed: false };
        } catch (error) {
            console.error('scrape threw', url, error);
            return { markdown: null, failed: true };
        }
    }
}

/**
 * A place to crawl a brand's listings from.
 *
 * One source was never going to be enough. A designer retailer is right for Rick
 * Owens and Loewe and useless for sneakers — New Balance genuinely stocks two
 * pieces there, which is why the brand page looked broken when it was not. An
 * aggregator covers both, and a sneaker marketplace covers what it misses.
 */
interface Source {
    name: string;
    /** Index pages for one brand. Several per page number where a site splits by department. */
    indexUrls(sourceSlug: string, page: number): string[];
    /**
     * A product link on that site.
     *
     * `prefix` is what a product slug must lead with to belong to the brand,
     * which is not always the brand slug: StockX lists the brand at
     * /brands/jordan and its products at /air-jordan-4-...
     */
    parse(markdown: string, sourceSlug: string, prefix: string): Listing[];
}

/** Title-case a URL slug, which is the product name the site already normalised. */
function titleFromSlug(slug: string): string {
    return slug
        .split('-')
        .filter(Boolean)
        .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
        .join(' ');
}

function priceFrom(label: string): number | null {
    const prices = [...label.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)]
        .map((p) => Number(p[1].replace(/,/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0);
    // A sale shows was-price then now-price; the later one is what it costs today.
    return prices.length ? prices[prices.length - 1] : null;
}

/**
 * Give rows parked without an image another chance at one.
 *
 * The crawl only ever sees the listings it just fetched, and the page cursor has
 * already moved past the pages those came from -- so a product whose image the
 * index did not carry, and whose turn at the per-run lookup budget never came,
 * stayed parked for good. That is why most of the catalogue was invisible: the
 * rows existed, is_active was false, and nothing ever went back for them.
 *
 * fetched_at is bumped whether or not the lookup worked, so this rotates through
 * the backlog instead of retrying the same unresolvable handful every run.
 */
async function recoverParked(job: any, budget: number): Promise<number> {
    if (budget <= 0) return 0;

    const { data: parked } = await admin
        .from('brand_catalog')
        .select('product_url')
        .eq('brand_slug', job.brand_slug)
        .eq('source', job.source)
        .is('image_url', null)
        .order('fetched_at', { ascending: true })
        .limit(budget);

    let recovered = 0;
    for (const row of parked ?? []) {
        if (Date.now() > deadline) break;
        const imageUrl = squareImage(await resolveImage(row.product_url));
        const patch: Record<string, unknown> = { fetched_at: new Date().toISOString() };
        if (imageUrl) {
            patch.image_url = imageUrl;
            patch.is_active = true;
            recovered++;
        }
        await admin.from('brand_catalog').update(patch).eq('product_url', row.product_url);
    }
    return recovered;
}

const SOURCES: Record<string, Source> = {
    // Designer retailer. Deep on labels it carries, and its product URLs name the
    // brand in their own segment, which is what makes its listings trustworthy.
    ssense: {
        name: 'ssense',
        indexUrls: (slug, page) => ['men', 'women'].map((dept) =>
            `https://www.ssense.com/en-us/${dept}/designers/${slug}${page > 1 ? `?page=${page}` : ''}`),
        parse: (markdown, slug) => parseListings(markdown, slug),
    },

    // Aggregator across many retailers. The widest coverage by far, and the only
    // one of these that carries both a sneaker brand's full range and a designer
    // label's, which is the whole reason for having it.
    lyst: {
        name: 'lyst',
        indexUrls: (slug, page) => [
            `https://www.lyst.com/designer/${slug}/${page > 1 ? `?page=${page}` : ''}`,
        ],
        parse: (markdown, slug, prefix) => {
            const found = new Map<string, Listing>();
            const link = /\[([\s\S]{0,600}?)\]\((https:\/\/www\.lyst\.com\/(?:shoes|clothing|accessories|bags|jewelry|watches)\/([a-z0-9-]+)\/?)\)/gi;

            for (const match of markdown.matchAll(link)) {
                const [, label, rawUrl, nameSlug] = match;
                const productUrl = rawUrl.replace(/\/$/, '');
                if (found.has(productUrl)) continue;

                // Product slugs lead with the brand, so this is how a listing is
                // attributed on a site whose URLs have no brand segment.
                if (!nameSlug.startsWith(prefix)) continue;

                // Slugs end in the site's own listing id — "574-shoes-364" — which
                // reads as part of the product name if it is left on.
                const name = titleFromSlug(
                    nameSlug.slice(prefix.length).replace(/^-+/, '').replace(/-\d+$/, ''),
                ) || titleFromSlug(nameSlug);
                if (!name || name.length < 3) continue;

                const imageUrl = label.match(/https:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp)/i)?.[0] ?? null;
                found.set(productUrl, { name: name.slice(0, 200), price: priceFrom(label), productUrl, imageUrl });
            }
            return [...found.values()];
        },
    },

    // Sneaker marketplace. Narrow on purpose: it is here for the brands the
    // designer retailer barely stocks.
    stockx: {
        name: 'stockx',
        indexUrls: (slug, page) => [
            `https://stockx.com/brands/${slug}?category=sneakers${page > 1 ? `&page=${page}` : ''}`,
        ],
        parse: (markdown, slug, prefix) => {
            const found = new Map<string, Listing>();
            const link = /\[([\s\S]{0,500}?)\]\((https:\/\/stockx\.com\/([a-z0-9-]+))(\?[^)\s]*)?\)/gi;

            for (const match of markdown.matchAll(link)) {
                const [, label, productUrl, nameSlug, query] = match;
                if (found.has(productUrl)) continue;

                // Flat URLs with no brand segment; the product slug is the only
                // signal, and it does not have to match the brand page's slug.
                if (!nameSlug.startsWith(prefix)) continue;
                // A ?size= link is one size of a product already listed, and a
                // sponsored tile is an ad for something the brand may not own.
                if (query && /(^|[?&])(size|sponsored)=/.test(query)) continue;

                // The label carries a clean name between the image and the price,
                // and it keeps the parentheticals — "(2026)", "(GS)" — that the
                // slug drops. Better than reconstructing it from the URL here.
                const name = label
                    .replace(/!\[[\s\S]*?\)/g, ' ')
                    .replace(/\$\s?[\d,]+(?:\.\d{2})?/g, ' ')
                    .replace(/(Lowest Ask|Xpress Ship|Sponsored|US [MW] [\d.]+)/gi, ' ')
                    .split(/[\\\n]+/)
                    .map((part) => part.trim())
                    .filter((part) => part.length > 2)
                    .sort((a, b) => b.length - a.length)[0];

                if (!name || name.length < 3 || /[\[\]()]/.test(name.replace(/\([^)]*\)/g, ''))) continue;

                // Its placeholder is a real URL that resolves to a grey box.
                const rawImage = label.match(/https:\/\/images\.stockx\.com\/[^\s)"']+/i)?.[0] ?? null;
                const imageUrl = rawImage && !/Product-Placeholder/i.test(rawImage) ? rawImage : null;

                found.set(productUrl, { name: name.slice(0, 200), price: priceFrom(label), productUrl, imageUrl });
            }
            return [...found.values()];
        },
    },
};

/**
 * Walk one source's index for one brand, continuing from where the last run left
 * off. Running off the end wraps the cursor so the next pass refreshes prices
 * rather than stopping.
 */
async function crawlSource(
    source: Source,
    sourceSlug: string,
    prefix: string,
    startPage: number,
): Promise<{ listings: Listing[]; nextCursor: number }> {
    const found = new Map<string, Listing>();
    let exhausted = false;
    let refused = false;

    outer:
    for (let offset = 0; offset < MAX_PAGES_PER_DEPARTMENT; offset++) {
        const page = startPage + offset;

        for (const url of source.indexUrls(sourceSlug, page)) {
            const { markdown, failed } = await scrape(url);
            // Refused, not empty. Keep the page for the next run.
            if (failed) { refused = true; continue; }
            if (!markdown) { exhausted = true; continue; }

            const listings = source.parse(markdown, sourceSlug, prefix);
            if (listings.length === 0) { exhausted = true; continue; }

            for (const listing of listings) {
                if (!found.has(listing.productUrl)) found.set(listing.productUrl, listing);
            }

            if (found.size >= MAX_LISTINGS_PER_BRAND) {
                return { listings: [...found.values()], nextCursor: page + 1 };
            }
        }

        if (exhausted && found.size === 0) break outer;
        if (refused && Date.now() > deadline) break outer;
    }

    // A run that was turned away holds its place. Advancing here is what made
    // rate limiting quietly destructive rather than merely slow: the pages were
    // never read, and stepping over them dropped everything on them until the
    // cursor wrapped the whole catalogue.
    if (refused) {
        return { listings: [...found.values()], nextCursor: startPage };
    }

    return {
        listings: [...found.values()],
        nextCursor: exhausted && found.size === 0 ? 1 : startPage + MAX_PAGES_PER_DEPARTMENT,
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

    // Leave room under the gateway's 150s to finish writing what was gathered.
    deadline = Date.now() + 115_000;

    try {
        const payload = await req.json().catch(() => ({}));
        const only: string[] = Array.isArray(payload?.brands) ? payload.brands : [];
        const onlySource: string | null = typeof payload?.source === 'string' ? payload.source : null;

        // A unit of work is one brand on one source, because that is what fits in
        // the timeout.
        //
        // Brands somebody has actually tagged go first, then stalest within that.
        // Ordering by staleness alone spread the budget evenly over ~1,100
        // directory labels, almost none of which anyone has posted, so the brands
        // whose "More from" section a user was looking at sat uncrawled for weeks
        // while obscure ones were refreshed on schedule.
        let query = admin
            .from('brand_seed_queue')
            .select('brand_slug, source, source_slug, product_slug_prefix, page_cursor, brand_name')
            .eq('is_enabled', true)
            .order('priority', { ascending: true })
            .order('synced_at', { ascending: true, nullsFirst: true })
            .limit(MAX_BRANDS_PER_RUN);

        if (only.length) query = query.in('brand_slug', only);
        if (onlySource) query = query.eq('source', onlySource);

        const { data: jobs, error: jobsError } = await query;
        if (jobsError) throw jobsError;
        if (!jobs?.length) return json({ error: 'Nothing to seed' }, 400);

        const report: Record<string, number> = {};

        for (const job of jobs) {
            const source = SOURCES[job.source];
            const key = `${job.brand_slug}:${job.source}`;

            if (!source) {
                console.error('unknown source', job.source);
                report[key] = 0;
                continue;
            }

            const brandName = (job as any).brand_name ?? job.brand_slug;
            const { listings, nextCursor } = await crawlSource(
                source,
                job.source_slug,
                job.product_slug_prefix || job.source_slug,
                job.page_cursor || 1,
            );

            // Stamp before deciding what to do with the results, or a source that
            // yields nothing parks the scheduler on it permanently.
            await admin.from('brand_sources')
                .update({ synced_at: new Date().toISOString(), page_cursor: nextCursor })
                .eq('brand_slug', job.brand_slug)
                .eq('source', job.source);

            // Recover images the index could not give us, capped so one brand
            // cannot burn the whole credit budget on a single run.
            let budget = MAX_IMAGE_LOOKUPS;
            const missingImages = listings.filter((listing) => !listing.imageUrl).length;
            for (const listing of listings) {
                if (budget <= 0 || Date.now() > deadline) break;
                if (listing.imageUrl) continue;
                budget--;
                listing.imageUrl = squareImage(await resolveImage(listing.productUrl));
            }
            console.log(
                `[${key}] ${listings.length} listing(s), ${missingImages} without an image, ` +
                `${MAX_IMAGE_LOOKUPS - budget} lookup(s) spent, ${budget} left for parked rows`,
            );

            if (!listings.length) {
                report[key] = await recoverParked(job, budget);
                continue;
            }

            // Inherit images already stored for these products before writing.
            //
            // The upsert sets every column, so re-crawling a page whose index
            // markup did not carry an image this time wrote NULL over an image an
            // earlier run had resolved, and flipped is_active back off with it.
            // The catalogue went backwards each time it refreshed: New Balance
            // dropped from 24 visible to 22 on one pass.
            const { data: stored } = await admin
                .from('brand_catalog')
                .select('product_url, image_url')
                .in('product_url', listings.map((listing) => listing.productUrl))
                .not('image_url', 'is', null);

            const knownImages = new Map((stored ?? []).map((row: any) => [row.product_url, row.image_url]));
            for (const listing of listings) {
                if (!listing.imageUrl) listing.imageUrl = knownImages.get(listing.productUrl) ?? null;
            }

            const { error } = await admin.from('brand_catalog').upsert(
                listings.map((listing) => ({
                    brand_slug: job.brand_slug,
                    brand_name: brandName,
                    name: listing.name,
                    price: listing.price,
                    image_url: listing.imageUrl,
                    product_url: listing.productUrl,
                    source: job.source,
                    // Parked, not discarded: the product is still known, and a later
                    // run that resolves its image switches it on without having to
                    // rediscover it.
                    is_active: !!listing.imageUrl,
                    fetched_at: new Date().toISOString(),
                })),
                { onConflict: 'product_url' },
            );

            if (error) {
                console.error('upsert', key, error.message);
                report[key] = 0;
            } else {
                report[key] = listings.filter((listing) => listing.imageUrl).length
                    + await recoverParked(job, budget);
            }
        }

        return json({ seeded: report });
    } catch (error: any) {
        console.error('seed-brand-catalog', error?.message);
        return json({ error: 'Seeding failed' }, 500);
    }
});
