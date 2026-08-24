// Product Search Service - calls the authenticated `product-search` edge
// function so the RapidAPI (KicksDB) key stays server-side, never in the bundle.

import { supabase } from './supabase';

export interface Product {
    id: string;
    name: string;
    brand: string;
    imageUrl: string;
    thumbnail: string;
    styleId: string;
    retailPrice?: number;
    lastSale?: number;
    /** Set when the result came from a tagged post, where somebody entered a real link. */
    purchaseLink?: string;
}
export interface SearchResult {
    products: Product[];
    total: number;
}
/**
 * Search for sneakers/products using KicksDB API
 */
export async function searchProducts(query: string, limit: number = 20): Promise<SearchResult> {
    if (!query.trim()) return { products: [], total: 0 };
    return searchTaggedCatalogue(query, limit);
}

/**
 * The catalogue and the web, as two separate awaits.
 *
 * They used to be one call that resolved when both were done, so the screen sat
 * on a spinner for the length of a grounded web search -- several seconds -- even
 * when the catalogue had answers ready in under a tenth of one. The caller now
 * paints the catalogue immediately and fills the web in behind it.
 */
export async function searchWebProducts(query: string, exclude: Product[] = []): Promise<Product[]> {
    if (query.trim().length < 2) return [];

    const fromWeb = await searchWeb(query);
    if (!fromWeb.length) return [];

    const seen = new Set(exclude.map((p) => `${p.brand}|${p.name}`.toLowerCase()));
    const fresh: Product[] = [];

    for (const item of fromWeb) {
        const key = `${item.brand}|${item.name}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(item);
    }

    return fresh;
}

/**
 * Ask the server to search the live web for pieces the catalogue lacks.
 *
 * Failure here is quiet on purpose: the catalogue results are already on screen
 * and a web lookup that times out should not take them down with it.
 */
async function searchWeb(query: string): Promise<Product[]> {
    try {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: { action: 'search-products', query },
        });

        if (error || !Array.isArray(data?.products)) return [];

        return data.products.map((item: any, index: number) => ({
            id: `web_${index}`,
            name: item.name || 'Item',
            brand: item.brand || '',
            imageUrl: item.imageUrl || '',
            thumbnail: item.imageUrl || '',
            styleId: '',
            retailPrice: typeof item.price === 'number' ? item.price : undefined,
            lastSale: undefined,
            purchaseLink: item.productUrl || undefined,
        }));
    } catch (error) {
        console.warn('[productSearch] web search unavailable:', error);
        return [];
    }
}

async function searchTaggedCatalogue(query: string, limit: number): Promise<SearchResult> {
    try {
        // Matching happens in the database, word by word.
        //
        // This used to send the whole query as one ilike pattern, so
        // "jordan 4 lightning" looked for that exact contiguous string. Names
        // carry the model in the middle -- "Jordan 4 Retro Lightning" -- so
        // multi-word searches reported nothing found for pieces that were
        // sitting in the catalogue. "jordan 4 lakers" matched 0 as a phrase and
        // 1 by words.
        const { data, error } = await supabase.rpc('search_brand_items', {
            q: query.trim(),
            max_rows: limit * 3,
        });

        if (error || !data) {
            console.warn('[productSearch] catalogue search failed:', error?.message);
            return { products: [], total: 0 };
        }

        // The same piece is tagged on every post it appears in; show it once.
        const seen = new Set<string>();
        const products: Product[] = [];

        for (const row of data as any[]) {
            if (products.length >= limit) break;
            const key = `${row.brand_name ?? ''}|${row.name ?? ''}`.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            products.push({
                id: `catalogue_${products.length}`,
                name: row.name || 'Item',
                brand: row.brand_name || '',
                imageUrl: row.image_url || '',
                thumbnail: row.image_url || '',
                styleId: '',
                retailPrice: Number(row.price) || undefined,
                lastSale: undefined,
                purchaseLink: row.product_url || undefined,
            });
        }

        return { products, total: products.length };
    } catch (error) {
        console.warn('[productSearch] catalogue lookup failed:', error);
        return { products: [], total: 0 };
    }
}

/**
 * Transform API response to our Product interface
 */
function transformResponse(data: any): SearchResult {
    // Handle various response formats from KicksDB
    const items = data.hits || data.results || data.Products || data.data || [];

    const products: Product[] = items.map((item: any) => ({
        id: item.objectID || item.id || item.styleId || item.urlKey || Math.random().toString(),
        name: item.name || item.title || item.productName || 'Unknown Product',
        brand: item.brand || item.brandName || 'Unknown Brand',
        imageUrl: item.image?.original || item.thumbnailUrl || item.media?.imageUrl || item.imageUrl || item.thumbnail || '',
        thumbnail: item.image?.small || item.thumbnailUrl || item.media?.thumbUrl || item.thumbnail || item.imageUrl || '',
        styleId: item.styleId || item.sku || item.style_id || '',
        retailPrice: item.retailPrice || item.price || item.retail_price,
        lastSale: item.lastSale || item.market?.lastSale || item.lowestAsk,
    }));

    return {
        products,
        total: data.total || data.nbHits || data.count || products.length,
    };
}
