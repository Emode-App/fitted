// AI Service - calls the authenticated `ai-proxy` edge function so the Gemini
// API key stays server-side and never ships in the app bundle.

import { supabase } from './supabase';
import { captureException } from './monitoring';
import { searchProducts as searchCatalogProducts } from './productSearch';
import { ensureAiFaceConsent } from './privacyService';

/**
 * Generates a realistic outfit image via the ai-proxy edge function
 * (Gemini 3 Pro Image / Nano Banana). Returns a data: URL.
 */
export async function generateOutfit(
    facePhotoBase64: string | null,
    clothingImagesBase64: string[],
    backgroundPrompt?: string,
    /**
     * Whose face this is. Omit when styling yourself. When a stylist styles a
     * client this must be the client's id — the server checks *their* consent,
     * not the caller's, and requires a live session between the two.
     */
    faceOwnerId?: string,
): Promise<string> {
    if (clothingImagesBase64.length === 0) {
        throw new Error('At least one clothing item is required');
    }

    if (facePhotoBase64 && !faceOwnerId) {
        // Only self-serve generation can be consent-checked on the client. When
        // the face belongs to someone else the server is the only authority.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !(await ensureAiFaceConsent(user.id))) {
            throw new Error('AI face consent is required before generating with a face photo.');
        }
    }

    try {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: {
                action: 'generate-outfit',
                facePhotoBase64,
                clothingImagesBase64,
                backgroundPrompt,
                faceOwnerId,
            },
        });

        if (error) {
            // Supabase wraps non-2xx as FunctionsHttpError; surface the server reason,
            // and give a friendly message when the proxy rate-limits the user (429).
            let reason = error.message || 'Outfit generation failed';
            let rateLimited = false;
            try {
                const body = await error.context?.json?.();
                if (body?.code === 'rate_limited' || body?.code === 'daily_limit') {
                    rateLimited = true;
                    const secs = body.retryAfterSeconds || 0;
                    const mins = Math.ceil(secs / 60);
                    reason = secs > 0
                        ? `You've hit the outfit-generation limit. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
                        : "You've hit the outfit-generation limit. Please try again later.";
                } else if (body?.error) {
                    reason = body.error;
                }
            } catch {
                // ignore parse failures, fall back to error.message
            }
            const e: any = new Error(reason);
            e.isRateLimit = rateLimited;
            throw e;
        }
        if (!data?.image) throw new Error(data?.error || 'No image generated in response.');
        return data.image as string;
    } catch (error: any) {
        console.error('Outfit generation error:', error);
        // Report genuine failures; rate-limiting is an expected user-facing case.
        if (!error?.isRateLimit) {
            captureException(error, { feature: 'generate-outfit' });
        }
        throw error;
    }
}
export interface Product {
    id: string;
    name: string;
    brand: string;
    price: number;
    sku?: string;
    imageUrl?: string;
    purchaseLink: string;
}
/**
 * Searches the authenticated product catalog proxy. Product names, images, and
 * prices come from the upstream catalog rather than an LLM or local mock data.
 */
export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) {
        return [];
    }

    try {
        const { products } = await searchCatalogProducts(query, 12);
        return products.map((item) => ({
            id: item.id,
            name: item.name,
            brand: item.brand,
            price: item.lastSale || item.retailPrice || 0,
            sku: item.styleId || undefined,
            imageUrl: item.imageUrl || item.thumbnail || undefined,
            purchaseLink: `https://stockx.com/search?s=${encodeURIComponent(`${item.brand} ${item.name}`)}`,
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}
