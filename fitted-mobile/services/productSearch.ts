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

        if (error || !data?.raw) {
            if (error) console.error('Product search error:', error.message);
            return { products: [], total: 0 };
        }

        return transformResponse(data.raw);
    } catch (error) {
        console.error('Product search error:', error);
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
