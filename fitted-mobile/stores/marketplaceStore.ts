import { create } from 'zustand';
import { Product, DressingRoomItem } from '@/types';
import { supabase } from '@/services/supabase';
import { PRIVATE_BUCKET, getSignedUrl } from '@/services/privateMedia';
import { generateOutfit } from '@/services/aiService';
import { FREE_HISTORY_LIMIT } from '@/services/revenueCatService';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * One past trip to the Dressing Room.
 *
 * Nothing new is recorded to build this -- every generation has been writing a
 * row to dressing_room_outfits all along, to cache the result. The row already
 * knows the image and which pieces went into it, which is exactly a history
 * entry, so this reads what was already there.
 */
export interface TryOnHistoryEntry {
    id: string;
    createdAt: string;
    /** Storage path. Signed on read; the signature expires, the path does not. */
    imagePath: string;
    imageUrl: string | null;
    productIds: string[];
    /** Hydrated pieces. Shorter than productIds when a seller has delisted one. */
    products: Product[];
}

interface MarketplaceState {
    // Dressing room items
    dressingRoomItems: Product[];
    dressingRoomBadgeCount: number;
    selectedDressingRoomIds: string[];

    // Products cache
    products: Product[];
    isLoadingProducts: boolean;

    // Cart
    cartItems: Product[];
    isLoadingCart: boolean;

    // Outfit generation
    generatedOutfitUrl: string | null;
    isGeneratingOutfit: boolean;

    // Try-on history
    tryOnHistory: TryOnHistoryEntry[];
    isLoadingHistory: boolean;
    /** How many more are kept but not shown, because this account is not Pro. */
    hiddenHistoryCount: number;

    // Actions
    addToDressingRoom: (product: Product) => void;
    removeFromDressingRoom: (productId: string) => void;
    clearDressingRoom: () => void;
    clearBadge: () => void;
    toggleDressingRoomSelection: (productId: string) => void;
    selectAllDressingRoom: () => void;

    // Cart actions
    addToCart: (product: Product, userId: string) => Promise<void>;
    removeFromCart: (productId: string, userId: string) => Promise<void>;
    fetchCart: (userId: string) => Promise<void>;

    // Product fetching
    fetchSellerProducts: (sellerId: string) => Promise<void>;
    searchProducts: (query: string) => Promise<Product[]>;
    deleteProduct: (productId: string) => Promise<void>;

    // Outfit generation - takes optional uploaded image URIs
    generateDressingRoomOutfit: (userId: string, forceRegenerate?: boolean, uploadedImageUris?: string[]) => Promise<string | null>;

    // Try-on history
    fetchTryOnHistory: (userId: string, isPro?: boolean) => Promise<void>;
    reopenTryOn: (entry: TryOnHistoryEntry) => void;
    deleteTryOn: (entryId: string) => Promise<boolean>;

    // Last used items for canvas
    lastUsedItems: Product[];
    sendToCanvas: (product: Product) => void;
}

// Generate cache key from product IDs
function getCacheKey(productIds: string[]): string {
    return [...productIds].sort().join('_');
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
    dressingRoomItems: [],
    dressingRoomBadgeCount: 0,
    selectedDressingRoomIds: [],
    products: [],
    isLoadingProducts: false,
    cartItems: [],
    isLoadingCart: false,
    generatedOutfitUrl: null,
    isGeneratingOutfit: false,
    lastUsedItems: [],
    tryOnHistory: [],
    isLoadingHistory: false,
    hiddenHistoryCount: 0,

    addToDressingRoom: (product: Product) => {
        const { dressingRoomItems, dressingRoomBadgeCount, selectedDressingRoomIds } = get();
        if (dressingRoomItems.find(item => item.id === product.id)) {
            return;
        }
        set({
            dressingRoomItems: [...dressingRoomItems, product],
            dressingRoomBadgeCount: dressingRoomBadgeCount + 1,
            selectedDressingRoomIds: [...selectedDressingRoomIds, product.id], // Auto-select new items
        });
    },

    removeFromDressingRoom: (productId: string) => {
        const { dressingRoomItems, selectedDressingRoomIds } = get();
        set({
            dressingRoomItems: dressingRoomItems.filter(item => item.id !== productId),
            selectedDressingRoomIds: selectedDressingRoomIds.filter(id => id !== productId),
        });
    },

    clearDressingRoom: () => {
        set({
            dressingRoomItems: [],
            dressingRoomBadgeCount: 0,
            selectedDressingRoomIds: [],
            generatedOutfitUrl: null,
        });
    },

    clearBadge: () => {
        set({ dressingRoomBadgeCount: 0 });
    },

    toggleDressingRoomSelection: (productId: string) => {
        const { selectedDressingRoomIds } = get();
        if (selectedDressingRoomIds.includes(productId)) {
            set({
                selectedDressingRoomIds: selectedDressingRoomIds.filter(id => id !== productId),
                generatedOutfitUrl: null, // Clear so regenerate works
            });
        } else {
            set({
                selectedDressingRoomIds: [...selectedDressingRoomIds, productId],
                generatedOutfitUrl: null, // Clear so regenerate works
            });
        }
    },

    selectAllDressingRoom: () => {
        const { dressingRoomItems } = get();
        set({ selectedDressingRoomIds: dressingRoomItems.map(item => item.id) });
    },

    // Cart operations
    addToCart: async (product: Product, userId: string) => {
        try {
            const { error } = await supabase
                .from('cart_items')
                .insert({ user_id: userId, product_id: product.id });

            if (error && error.code !== '23505') throw error; // Ignore duplicate key error

            const { cartItems } = get();
            if (!cartItems.find(item => item.id === product.id)) {
                set({ cartItems: [...cartItems, product] });
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
        }
    },

    removeFromCart: async (productId: string, userId: string) => {
        try {
            await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', userId)
                .eq('product_id', productId);

            const { cartItems } = get();
            set({ cartItems: cartItems.filter(item => item.id !== productId) });
        } catch (error) {
            console.error('Error removing from cart:', error);
        }
    },

    fetchCart: async (userId: string) => {
        set({ isLoadingCart: true });
        try {
            const { data, error } = await supabase
                .from('cart_items')
                .select(`
                    product_id,
                    product:products(*, seller:users(id, username, handle, avatar_url, is_verified_boutique))
                `)
                .eq('user_id', userId);

            if (error) throw error;
            const cartProducts = data?.map((item: any) => item.product).filter(Boolean) || [];
            set({ cartItems: cartProducts });
        } catch (error) {
            console.error('Error fetching cart:', error);
        } finally {
            set({ isLoadingCart: false });
        }
    },

    sendToCanvas: (product: Product) => {
        const { lastUsedItems } = get();
        const filtered = lastUsedItems.filter(item => item.id !== product.id);
        set({
            lastUsedItems: [product, ...filtered].slice(0, 10),
        });
    },

    fetchSellerProducts: async (sellerId: string) => {
        set({ isLoadingProducts: true });
        try {
            const { data, error } = await supabase
                .from('products')
                .select(`
                    *,
                    seller:users(id, username, handle, avatar_url, is_verified_boutique)
                `)
                .eq('seller_id', sellerId)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            set({ products: data || [] });
        } catch (error) {
            console.error('Error fetching seller products:', error);
            set({ products: [] });
        } finally {
            set({ isLoadingProducts: false });
        }
    },

    searchProducts: async (query: string): Promise<Product[]> => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select(`
                    *,
                    seller:users(id, username, handle, avatar_url, is_verified_boutique)
                `)
                .eq('is_active', true)
                .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error searching products:', error);
            return [];
        }
    },

    deleteProduct: async (productId: string): Promise<void> => {
        try {
            // Soft delete - just set is_active to false
            const { error } = await supabase
                .from('products')
                .update({ is_active: false })
                .eq('id', productId);

            if (error) throw error;

            // Remove from local products list
            set(state => ({
                products: state.products.filter(p => p.id !== productId),
                // Also remove from dressing room if present
                dressingRoomItems: state.dressingRoomItems.filter(p => p.id !== productId),
                selectedDressingRoomIds: state.selectedDressingRoomIds.filter(id => id !== productId),
            }));
        } catch (error) {
            console.error('Error deleting product:', error);
            throw error;
        }
    },

    generateDressingRoomOutfit: async (userId: string, forceRegenerate: boolean = false, uploadedImageUris: string[] = []): Promise<string | null> => {
        const { selectedDressingRoomIds, dressingRoomItems } = get();

        // Need at least one selected product OR one uploaded image
        if (selectedDressingRoomIds.length === 0 && uploadedImageUris.length === 0) {
            return null;
        }

        // Include uploaded image URIs in the cache key for uniqueness
        const allIds = [...selectedDressingRoomIds, ...uploadedImageUris.map(uri => uri.slice(-20))];
        const cacheKey = getCacheKey(allIds);

        // Check cache first (unless force regenerate or has uploaded images)
        // Skip cache if there are uploaded images since they're local and may change
        if (!forceRegenerate && uploadedImageUris.length === 0) {
            try {
                const { data: cached } = await supabase
                    .from('dressing_room_outfits')
                    .select('generated_image_url')
                    .eq('cache_key', cacheKey)
                    .single();

                if (cached?.generated_image_url) {
                    const cachedUrl = await getSignedUrl(cached.generated_image_url);
                    if (cachedUrl) {
                        set({ generatedOutfitUrl: cachedUrl });
                        return cachedUrl;
                    }
                }
            } catch {
                // No cache hit, continue to generate
            }
        }

        set({ isGeneratingOutfit: true });

        try {
            // Get selected product images
            const selectedProducts = dressingRoomItems.filter(item =>
                selectedDressingRoomIds.includes(item.id)
            );

            // Convert product images to base64
            const clothingBase64s: string[] = [];
            for (const product of selectedProducts) {
                if (product.image_urls[0]) {
                    try {
                        const response = await fetch(product.image_urls[0]);
                        const blob = await response.blob();
                        const reader = new FileReader();
                        const base64 = await new Promise<string>((resolve) => {
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                        clothingBase64s.push(base64);
                    } catch (e) {
                        console.warn('Failed to fetch product image:', e);
                    }
                }
            }

            // Convert uploaded images to base64
            for (const uri of uploadedImageUris) {
                try {
                    const response = await fetch(uri);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    const base64 = await new Promise<string>((resolve) => {
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    clothingBase64s.push(base64);
                    console.log('Added uploaded image to generation');
                } catch (e) {
                    console.warn('Failed to convert uploaded image:', e);
                }
            }

            if (clothingBase64s.length === 0) {
                throw new Error('No clothing images available');
            }

            console.log('Generating outfit with', clothingBase64s.length, 'clothing items');

            // Fetch user's face photo from profile
            let faceBase64: string | null = null;
            try {
                const { data: userData } = await supabase
                    .from('users')
                    .select('ai_face_url')
                    .eq('id', userId)
                    .single();

                // ai_face_url is a private-bucket path; sign it before fetching.
                const signedFaceUrl = userData?.ai_face_url ? await getSignedUrl(userData.ai_face_url) : null;
                if (signedFaceUrl) {
                    const faceResponse = await fetch(signedFaceUrl);
                    const faceBlob = await faceResponse.blob();
                    const faceReader = new FileReader();
                    faceBase64 = await new Promise<string>((resolve) => {
                        faceReader.onloadend = () => resolve(faceReader.result as string);
                        faceReader.readAsDataURL(faceBlob);
                    });
                }
            } catch (e) {
                console.warn('Could not fetch user face photo:', e);
            }

            // Generate outfit with user's face, white background, standing pose
            const generatedImage = await generateOutfit(
                faceBase64,
                clothingBase64s,
                'a clean white studio background with the model standing upright in a professional fashion pose, like a typical e-commerce product listing'
            );

            // Upload to Supabase Storage
            const base64Data = generatedImage.split(',')[1];
            const fileName = `generated/${userId}/${cacheKey}_${Date.now()}.png`;

            const { error: uploadError } = await supabase.storage
                .from(PRIVATE_BUCKET)
                .upload(fileName, decode(base64Data), {
                    contentType: 'image/png',
                });

            if (uploadError) throw uploadError;

            const privateUrl = await getSignedUrl(fileName);
            if (!privateUrl) throw new Error('Could not open the generated outfit');

            // Cache the result
            await supabase.from('dressing_room_outfits').insert({
                user_id: userId,
                product_ids: selectedDressingRoomIds,
                cache_key: cacheKey,
                generated_image_url: fileName,
            });

            set({ generatedOutfitUrl: privateUrl });
            return privateUrl;

        } catch (error) {
            console.error('Error generating outfit:', error);
            return null;
        } finally {
            set({ isGeneratingOutfit: false });
        }
    },

    fetchTryOnHistory: async (userId: string, isPro: boolean = false) => {
        set({ isLoadingHistory: true });
        try {
            const { data, error } = await supabase
                .from('dressing_room_outfits')
                .select('id, created_at, product_ids, generated_image_url')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(60);
            if (error) throw error;

            // Nothing is deleted for free accounts -- the older entries are
            // still there, and appear the moment they upgrade. The count is
            // what the sheet offers Pro on, so it is worked out before the
            // list is cut rather than guessed at afterwards.
            const all = data || [];
            const rows = isPro ? all : all.slice(0, FREE_HISTORY_LIMIT);
            set({ hiddenHistoryCount: Math.max(0, all.length - rows.length) });

            // Every piece across every entry, fetched once rather than per row --
            // the same jacket turns up in a dozen try-ons.
            const allIds = Array.from(new Set(rows.flatMap((r: any) => r.product_ids || [])));
            let productsById: Record<string, Product> = {};
            if (allIds.length > 0) {
                const { data: products } = await supabase
                    .from('products')
                    .select(`
                        *,
                        seller:users(id, username, handle, avatar_url, is_verified_boutique)
                    `)
                    .in('id', allIds);
                for (const product of products || []) productsById[product.id] = product as Product;
            }

            // Signing is a network call each, so they go together rather than in
            // series behind a spinner.
            const urls = await Promise.all(
                rows.map((r: any) => getSignedUrl(r.generated_image_url).catch(() => null)),
            );

            set({
                tryOnHistory: rows.map((r: any, i: number) => ({
                    id: r.id,
                    createdAt: r.created_at,
                    imagePath: r.generated_image_url,
                    imageUrl: urls[i],
                    productIds: r.product_ids || [],
                    products: (r.product_ids || [])
                        .map((id: string) => productsById[id])
                        .filter(Boolean),
                })),
            });
        } catch (error) {
            console.error('Error fetching try-on history:', error);
        } finally {
            set({ isLoadingHistory: false });
        }
    },

    /**
     * Put a past try-on back on the rack.
     *
     * The image comes along, which is the point -- without it the preview's
     * effect would see an empty generatedOutfitUrl and spend a try-on
     * regenerating something the user is already looking at. Delisted pieces are
     * simply absent, so a fit whose jacket is gone reopens as the rest of it.
     */
    reopenTryOn: (entry: TryOnHistoryEntry) => {
        set({
            dressingRoomItems: entry.products,
            selectedDressingRoomIds: entry.products.map(p => p.id),
            generatedOutfitUrl: entry.imageUrl,
            dressingRoomBadgeCount: 0,
        });
    },

    deleteTryOn: async (entryId: string) => {
        const previous = get().tryOnHistory;
        set({ tryOnHistory: previous.filter(e => e.id !== entryId) });

        const entry = previous.find(e => e.id === entryId);
        const { error } = await supabase.from('dressing_room_outfits').delete().eq('id', entryId);
        if (error) {
            console.error('Error deleting try-on:', error);
            set({ tryOnHistory: previous });
            return false;
        }

        // The row is the only reference to the file, so it goes too -- a face
        // the user asked to forget should not be left sitting in a bucket.
        //
        // Two formats live in this column. Rows written before the move to
        // private storage hold a full public URL into the products bucket;
        // everything since holds a bare path in PRIVATE_BUCKET. Aiming every
        // delete at the private bucket would quietly no-op on the old ones and
        // leave the image up.
        if (entry?.imagePath) {
            const legacy = entry.imagePath.match(/\/object\/public\/([^/]+)\/(.+)$/);
            const [bucket, key] = legacy
                ? [legacy[1], decodeURIComponent(legacy[2])]
                : [PRIVATE_BUCKET, entry.imagePath];
            supabase.storage.from(bucket).remove([key])
                .catch((e: unknown) => console.warn('Could not remove try-on image', e));
        }
        return true;
    },
}));

// Helper to decode base64 to Uint8Array
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

