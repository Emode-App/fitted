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
        // 12 was sized for an upstream that returned almost nothing. The
        // catalogue holds 1,900 Rick Owens pieces alone, so a search that ran
        // out after a dozen results read as a broken feature rather than a
        // deliberate limit.
        const { products } = await searchCatalogProducts(query, 48);
        return products.map((item) => ({
            id: item.id,
            name: item.name,
            brand: item.brand,
            price: item.lastSale || item.retailPrice || 0,
            sku: item.styleId || undefined,
            imageUrl: item.imageUrl || item.thumbnail || undefined,
            // A tagged result carries the link its tagger entered; only fall back to
            // a StockX search for upstream results, which have no link of their own.
            purchaseLink: item.purchaseLink
                || `https://stockx.com/search?s=${encodeURIComponent(`${item.brand} ${item.name}`)}`,
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

export interface ItemSuggestion {
    brand: string | null;
    name: string | null;
    category: string | null;
    confidence: 'high' | 'medium' | 'low';
    recognised: boolean;
    /** Resolved against the real catalogue, never invented by the model. */
    price?: number;
    purchaseLink?: string;
}

/**
 * Suggest what a photographed piece is, so the tagger can fill the item form
 * with one tap instead of typing it.
 *
 * The model supplies only a brand and a name. Price and link are then looked up
 * against the catalogue, because a model asked for those returns a stale price
 * and an invented URL. Anything it does not recognise comes back unrecognised
 * rather than as a confident guess — an unbranded thrift piece should produce
 * nothing, not somebody else's label.
 *
 * This is a suggestion. The caller must show it and write nothing unless the
 * user confirms.
 */
export async function identifyItem(imageBase64: string): Promise<ItemSuggestion | null> {
    try {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: { action: 'identify-item', imageBase64 },
        });

        if (error || !data) {
            console.warn('[identifyItem] failed:', error?.message);
            return null;
        }

        const suggestion: ItemSuggestion = {
            brand: data.brand ?? null,
            name: data.name ?? null,
            category: data.category ?? null,
            confidence: data.confidence ?? 'low',
            recognised: !!data.recognised,
        };

        if (!suggestion.recognised) return suggestion;

        // Try to attach a real price and link. Failing to find one is fine — the
        // fields simply stay empty for the user rather than being filled with a
        // number and a URL nobody can stand behind.
        try {
            const query = [suggestion.brand, suggestion.name].filter(Boolean).join(' ');
            const matches = await searchProducts(query);
            const best = matches[0];
            if (best) {
                if (best.price > 0) suggestion.price = best.price;
                if (best.purchaseLink) suggestion.purchaseLink = best.purchaseLink;
            }
        } catch {
            // Leave price and link unset.
        }

        return suggestion;
    } catch (error) {
        console.warn('[identifyItem] failed:', error);
        return null;
    }
}
