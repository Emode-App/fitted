import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWardrobeStore } from '@/stores/wardrobeStore';

// ============================================
// LOCAL USER DATA
//
// Anything cached on the device that belongs to a *person* rather than to the
// device. Device preferences deliberately survive: the theme is a property of the
// phone, not of whoever is holding it.
//
// The wardrobe is stored per account. An earlier attempt kept one shared blob and
// tried to work out, asset by asset, which entries belonged to whom -- that is
// unknowable in general, and getting it wrong destroys real data. Giving each
// account its own slot means there is nothing to guess: signing in loads your
// wardrobe and only yours, and signing out simply detaches it.
// ============================================

const LEGACY_WARDROBE_KEY = 'wardrobe-storage';

/** Per-account slot for the wardrobe store. */
const wardrobeKeyFor = (userId: string) => `wardrobe-storage:${userId}`;

/** Slot used while signed out. Never written to by a signed-in session. */
const DETACHED_WARDROBE_KEY = 'wardrobe-storage:none';

// Loose AsyncStorage keys written directly by screens, none of which are keyed by
// account. `has_onboarded` deliberately is NOT here: clearing it made every account
// switch replay onboarding, and it is now both server-backed (users.onboarded_at)
// and per-account, so it needs no blunt clearing.
const USER_SCOPED_KEYS = [
    'emode_recent_product_searches',
    'has_seen_canvas_tutorial',
    'has_seen_ai_tryon_tutorial',
    'has_seen_marketplace_tutorial',
];

/** Remembers which account the loose keys above belong to. */
const OWNER_KEY = 'local_cache_owner_id';

/**
 * Point the wardrobe store at `userId`'s slot and load it.
 *
 * Reset before rehydrating, because rehydrating a slot that does not exist yet is
 * a no-op — without the reset a brand new account would inherit whatever the
 * previous one left in memory.
 */
// Which slot the store is currently bound to.
//
// claimLocalCache runs twice for a single sign-in -- once from initialize() and
// again when onAuthStateChange reports the same session -- and the reset below is
// destructive. Without this guard the second call wiped whatever had been loaded
// or restored since the first, which is what silently emptied a restored wardrobe.
let attachedKey: string | null = null;

async function attachWardrobe(key: string): Promise<void> {
    if (attachedKey === key) return;

    try {
        useWardrobeStore.persist.setOptions({ name: key });
        useWardrobeStore.getState().resetWardrobe();
        await useWardrobeStore.persist.rehydrate();
        attachedKey = key;
    } catch (error) {
        console.warn('[localUserData] could not attach wardrobe slot:', error);
    }
}

/**
 * Retire the single shared wardrobe blob that predates per-account slots.
 *
 * Its contents cannot be attributed to anyone, so it is not adopted by whoever
 * happens to sign in next. Uploaded photos still exist in storage and are
 * recovered by restoreWardrobeFromStorage(); nothing recoverable is lost here.
 */
async function retireLegacyWardrobe(): Promise<void> {
    try {
        await AsyncStorage.removeItem(LEGACY_WARDROBE_KEY);
    } catch {
        // Best effort — a leftover key is inert now that nothing reads it.
    }
}

/**
 * Detach this device from the signed-in account.
 *
 * The account's own wardrobe slot is left on disk: it is keyed by user id, so it
 * can never be shown to anyone else, and signing back in should not start from
 * nothing. The loose keys are cleared because they are not slotted.
 */
export async function clearLocalUserData(): Promise<void> {
    await attachWardrobe(DETACHED_WARDROBE_KEY);

    try {
        await AsyncStorage.multiRemove([...USER_SCOPED_KEYS, OWNER_KEY, DETACHED_WARDROBE_KEY]);
    } catch (error) {
        console.warn('[localUserData] could not clear cached account data:', error);
    }
}

/**
 * Bind this device's caches to `userId`.
 *
 * Called on sign-in and on launch with an existing session. The wardrobe swap is
 * unconditional — that is what makes account switching correct — while the loose
 * keys are only cleared when they demonstrably belong to somebody else.
 */
export async function claimLocalCache(userId: string): Promise<void> {
    try {
        await retireLegacyWardrobe();
        await attachWardrobe(wardrobeKeyFor(userId));

        const owner = await AsyncStorage.getItem(OWNER_KEY);
        if (owner && owner !== userId) {
            await AsyncStorage.multiRemove(USER_SCOPED_KEYS);
        }

        await AsyncStorage.setItem(OWNER_KEY, userId);
    } catch (error) {
        console.warn('[localUserData] could not claim local cache:', error);
    }
}
