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
    if (!query.trim()) {
        return { products: [], total: 0 };
    }

    // The crawled catalogue answers first: its prices, links and images are all
    // real and it comes back in under a tenth of a second.
    const local = await searchTaggedCatalogue(query, limit);

    // It only covers a small slice of the directory though, so a thin result is
    // usually the catalogue's coverage rather than the piece not existing. The
    // web fills the rest in -- and only the rest, so a verified listing is never
    // pushed down the page by a guess.
    if (local.products.length >= limit) return local;

    const fromWeb = await searchWeb(query);
    if (!fromWeb.length) return local;

    const seen = new Set(local.products.map((p) => `${p.brand}|${p.name}`.toLowerCase()));
    const merged = [...local.products];

    for (const item of fromWeb) {
        if (merged.length >= limit) break;
        const key = `${item.brand}|${item.name}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
    }

    return { products: merged, total: merged.length };
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
