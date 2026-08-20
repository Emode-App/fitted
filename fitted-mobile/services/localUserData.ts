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

// Marks that this device's cache has been under ownership tracking for its whole
// life. Describes the cache format rather than the person, so it survives a
// sign-out along with the other device-level preferences.
//
// Without it there is a hole big enough to drive the original bug through: a
// device that already held a wardrobe when ownership tracking shipped has nobody
// stamped, so `owner` is null, the mismatch check never fires, and the next
// account to sign in is quietly recorded as the owner of somebody else's photos.
// Bump the value to force the migration below to run again.
const OWNERSHIP_SCHEMA_KEY = 'local_cache_owner_schema';
const OWNERSHIP_SCHEMA = '1';

// Uploaded wardrobe photos live at `<user id>/wardrobe/...` in the posts bucket,
// so the owner is right there in the URL.
const UUID_SEGMENT = /\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\//;

// AssetGrid adds picked images by their local URI without uploading them.
const DEVICE_URI = /^(file:|ph:|content:|assets-library:)/i;

/**
 * Whether a cached wardrobe asset can be shown to `userId` when we do not know
 * who put it there.
 *
 * Three kinds of URL end up in the wardrobe:
 *   - storage uploads, which carry the uploader's id in the path — keep only mine;
 *   - camera-roll URIs, which name a photo on this phone with no owner attached —
 *     unattributable and personal, so drop them;
 *   - catalog product images, which are public brand imagery and reveal nothing
 *     about whoever browsed them — keep.
 */
function isSafeToKeep(url: string, userId: string): boolean {
    if (!url) return false;
    if (DEVICE_URI.test(url)) return false;

    const owner = UUID_SEGMENT.exec(url)?.[1];
    if (!owner) return true;

    return owner.toLowerCase() === userId.toLowerCase();
}

/**
 * Make sure the wardrobe store has finished loading before we touch it.
 *
 * `persist` reads AsyncStorage asynchronously at module load. Mutating the store
 * while that read is still in flight does nothing useful — the read resolves
 * afterwards, puts the previous account's wardrobe back in memory, and persist
 * writes it straight back to disk. Awaiting it first makes the clear deterministic.
 */
async function settleWardrobeHydration(): Promise<void> {
    try {
        await useWardrobeStore.persist.rehydrate();
    } catch {
        // A store that never hydrated is a store with nothing to race against.
    }
}

/**
 * Wipe every trace of the signed-in account from this device.
 *
 * Resets in-memory store state as well as the persisted copy — clearing only
 * AsyncStorage would leave the old wardrobe on screen until the next cold start,
 * which is exactly the window where it would be seen.
 */
export async function clearLocalUserData(): Promise<void> {
    await settleWardrobeHydration();

    try {
        useWardrobeStore.getState().resetWardrobe();
    } catch {
        // A store that failed to hydrate has nothing to reset.
    }

    try {
        // The reset above also queues a persist write of the empty defaults, which
        // may land after this removal and recreate the key. That is fine: what it
        // would recreate is the empty wardrobe, not the old one.
        await AsyncStorage.multiRemove([...PERSISTED_STORE_KEYS, ...USER_SCOPED_KEYS, OWNER_KEY]);
    } catch (error) {
        console.warn('[localUserData] could not clear cached account data:', error);
    }
}

/**
 * One-time cleanup for a cache that predates ownership tracking.
 *
 * Nothing here is attributable at the folder level, but individual assets are, so
 * this drops only what provably is not `userId`'s rather than emptying the
 * wardrobe of every existing user on upgrade. Recent searches go too — they are
 * personal and there is no way to tell whose they are.
 */
async function migrateUntrackedCache(userId: string): Promise<void> {
    await settleWardrobeHydration();

    try {
        const { folders } = useWardrobeStore.getState();
        let dropped = 0;

        const pruned = folders.map((folder) => {
            const keep = folder.assets.filter((asset) => isSafeToKeep(asset.url, userId));
            if (keep.length === folder.assets.length) return folder;
            dropped += folder.assets.length - keep.length;
            return { ...folder, assets: keep };
        });

        if (dropped > 0) {
            useWardrobeStore.setState({ folders: pruned });
            console.warn(`[localUserData] dropped ${dropped} unattributable wardrobe asset(s)`);
        }
    } catch (error) {
        console.warn('[localUserData] could not prune untracked wardrobe:', error);
    }

    try {
        await AsyncStorage.removeItem('emode_recent_product_searches');
    } catch {
        // Losing the prune of a search history is not worth failing sign-in over.
    }
}

/**
 * Record who this device's cache belongs to, and deal with it first if it belonged
 * to someone else — or if we cannot prove who it belonged to.
 *
 * Sign-out is the primary defence; this is the backstop for the cases where it
 * never ran — the app was force-quit mid-logout, the session expired server-side,
 * a token was revoked from another device, or the cache predates this check
 * existing at all.
 */
export async function claimLocalCache(userId: string): Promise<void> {
    try {
        const [[, owner], [, schema]] = await AsyncStorage.multiGet([
            OWNER_KEY,
            OWNERSHIP_SCHEMA_KEY,
        ]);

        if (owner && owner !== userId) {
            // Known to be someone else's, all of it.
            await clearLocalUserData();
        } else if (schema !== OWNERSHIP_SCHEMA) {
            // Unknown provenance: keep what is demonstrably this account's.
            await migrateUntrackedCache(userId);
        }

        await AsyncStorage.multiSet([
            [OWNER_KEY, userId],
            [OWNERSHIP_SCHEMA_KEY, OWNERSHIP_SCHEMA],
        ]);
    } catch (error) {
        console.warn('[localUserData] could not claim local cache:', error);
    }
}
