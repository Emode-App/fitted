import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWardrobeStore } from '@/stores/wardrobeStore';

// ============================================
// LOCAL USER DATA
//
// Anything cached on the device that belongs to a *person* rather than to the
// device. Signing out used to clear the Supabase session, the push token and the
// RevenueCat identity, but left all of this behind — so signing in as a second
// account on the same phone showed the first account's wardrobe, including the
// Last Used folder and every clothing photo they had uploaded, plus their recent
// product searches.
//
// Device preferences deliberately survive: the theme is a property of the phone,
// not of whoever is holding it.
// ============================================

/** Persisted Zustand stores whose contents belong to one account. */
const PERSISTED_STORE_KEYS = [
    'wardrobe-storage',
];

/** Loose AsyncStorage keys written directly by screens. */
const USER_SCOPED_KEYS = [
    'emode_recent_product_searches',
    // Onboarding writes profile fields (bio, location, favourite brand, socials),
    // so a different account genuinely has not completed it.
    'has_onboarded',
    'has_seen_canvas_tutorial',
    'has_seen_ai_tryon_tutorial',
    'has_seen_marketplace_tutorial',
];

/** Remembers who the cache belongs to, so a stale cache can be caught on launch. */
const OWNER_KEY = 'local_cache_owner_id';

/**
 * Wipe every trace of the signed-in account from this device.
 *
 * Resets in-memory store state as well as the persisted copy — clearing only
 * AsyncStorage would leave the old wardrobe on screen until the next cold start,
 * which is exactly the window where it would be seen.
 */
export async function clearLocalUserData(): Promise<void> {
    try {
        useWardrobeStore.getState().resetWardrobe();
    } catch {
        // A store that failed to hydrate has nothing to reset.
    }

    try {
        await AsyncStorage.multiRemove([...PERSISTED_STORE_KEYS, ...USER_SCOPED_KEYS, OWNER_KEY]);
    } catch (error) {
        console.warn('[localUserData] could not clear cached account data:', error);
    }
}

/**
 * Record who this device's cache belongs to, and purge it first if it belonged
 * to someone else.
 *
 * Sign-out is the primary defence; this is the backstop for the cases where it
 * never ran — the app was force-quit mid-logout, the session expired server-side,
 * or a token was revoked from another device.
 */
export async function claimLocalCache(userId: string): Promise<void> {
    try {
        const owner = await AsyncStorage.getItem(OWNER_KEY);
        if (owner && owner !== userId) {
            await clearLocalUserData();
        }
        await AsyncStorage.setItem(OWNER_KEY, userId);
    } catch (error) {
        console.warn('[localUserData] could not claim local cache:', error);
    }
}
