import { supabase } from './supabase';

// ============================================
// PRIVATE MEDIA
// DM images and biometric face photos live in a PRIVATE storage bucket. We
// persist the object *path* (never a public URL) and mint a short-lived signed
// URL at read time, authorized by storage RLS (conversation membership / owner).
// ============================================

export const PRIVATE_BUCKET = 'private-media';

/**
 * Resolve a stored value to something an <Image> can render.
 * - Already a URL (http/https/data/file) → returned unchanged (back-compat with
 *   legacy rows that stored public URLs).
 * - A storage path → a fresh signed URL, or null if the caller isn't authorized.
 */
export async function getSignedUrl(
    pathOrUrl: string | null | undefined,
    expiresIn = 3600
): Promise<string | null> {
    if (!pathOrUrl) return null;
    if (/^(https?:|data:|file:|content:)/.test(pathOrUrl)) return pathOrUrl;

    const { data, error } = await supabase.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(pathOrUrl, expiresIn);

    if (error) {
        console.warn('[privateMedia] createSignedUrl failed:', error.message);
        return null;
    }
    return data?.signedUrl ?? null;
}
