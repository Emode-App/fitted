// Saving individual pieces.
//
// Distinct from saving posts: saved_posts keeps whole fits and is untouched.
// This keeps the pieces inside them, and the pieces in a brand's catalogue.

import { supabase } from './supabase';

export interface SaveableItem {
    brandSlug?: string | null;
    brandName?: string | null;
    name: string;
    imageUrl: string;
    productUrl?: string | null;
    price?: number | null;
    category?: string | null;
    /** The post it was tagged on, when it came from one. */
    sourcePostId?: string | null;
}

export interface SavedItem extends SaveableItem {
    id: string;
    itemKey: string;
    createdAt: string;
}

/**
 * What makes two saves the same piece.
 *
 * Must match saved_items.item_key exactly — the database generates that column
 * and enforces uniqueness on it, so a client that computes the key differently
 * would show a heart as unfilled and then hit a duplicate-key error on tap.
 *
 * A link when there is one. Otherwise brand and name, which is the only durable
 * handle on a piece tagged in a post whose poster left no link.
 */
export function savedItemKey(item: SaveableItem): string {
    const link = (item.productUrl ?? '').trim();
    if (link) return link;

    const composite = `${item.brandSlug ?? ''}|${item.name ?? ''}`.trim().toLowerCase();
    if (composite !== '|') return composite;

    return item.imageUrl;
}

/** Every key this account has saved, for deciding which hearts are filled. */
export async function fetchSavedKeys(userId: string): Promise<Set<string>> {
    const { data, error } = await supabase
        .from('saved_items')
        .select('item_key')
        .eq('user_id', userId);

    if (error) {
        console.warn('[savedItems] could not load keys:', error.message);
        return new Set();
    }
    return new Set((data ?? []).map((row: any) => row.item_key as string));
}

/** The saved pieces themselves, newest first, for the Saved tab. */
export async function fetchSavedItems(userId: string): Promise<SavedItem[]> {
    const { data, error } = await supabase
        .from('saved_items')
        .select('id, item_key, brand_slug, brand_name, name, image_url, product_url, price, category, source_post_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('[savedItems] could not load items:', error.message);
        return [];
    }

    return (data ?? []).map((row: any) => ({
        id: row.id,
        itemKey: row.item_key,
        brandSlug: row.brand_slug,
        brandName: row.brand_name,
        name: row.name,
        imageUrl: row.image_url,
        productUrl: row.product_url,
        price: row.price == null ? null : Number(row.price),
        category: row.category,
        sourcePostId: row.source_post_id,
        createdAt: row.created_at,
    }));
}

export async function saveItem(userId: string, item: SaveableItem): Promise<void> {
    const { error } = await supabase.from('saved_items').insert({
        user_id: userId,
        brand_slug: item.brandSlug ?? null,
        brand_name: item.brandName ?? null,
        name: item.name,
        image_url: item.imageUrl,
        product_url: item.productUrl ?? null,
        price: item.price ?? null,
        category: item.category ?? null,
        source_post_id: item.sourcePostId ?? null,
    });

    // Saving something already saved is a no-op, not a failure -- two surfaces
    // can show the same piece, and the hearts can briefly disagree.
    if (error && error.code !== '23505') throw error;
}

export async function unsaveItem(userId: string, itemKey: string): Promise<void> {
    const { error } = await supabase
        .from('saved_items')
        .delete()
        .eq('user_id', userId)
        .eq('item_key', itemKey);

    if (error) throw error;
}
