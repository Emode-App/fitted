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

    try {
        const { data, error } = await supabase.functions.invoke('product-search', {
            body: { query, limit },
        });

        if (!error && data?.raw) {
            const upstream = transformResponse(data.raw);
            if (upstream.products.length > 0) return upstream;
        } else if (error) {
            // The upstream is a sneaker database behind a metered API. When its
            // subscription lapses or it rejects the key, every search silently
            // returned nothing at all. Fall through to what this app already knows.
            console.warn('[productSearch] upstream unavailable, using tagged catalogue:', error.message);
        }

        return searchTaggedCatalogue(query, limit);
    } catch (error) {
        console.warn('[productSearch] upstream threw, using tagged catalogue:', error);
        return searchTaggedCatalogue(query, limit);
    }
}

/**
 * Search the pieces people have tagged on their own posts.
 *
 * Not a replacement for a real catalogue -- it only knows what has been worn and
 * attributed here -- but the results are real, they carry the price and link the
 * tagger entered, and they do not disappear when somebody else's API goes down.
 */
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
