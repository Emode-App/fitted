import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { useWardrobeStore } from '@/stores/wardrobeStore';

// ============================================
// WARDROBE RESTORE
//
// The wardrobe lives in AsyncStorage, so it dies with the app: reinstall, clear
// the app's data, switch phones, or hit a bug in the local cache and it is gone,
// even though every photo in it was uploaded and is still sitting in the posts
// bucket under the uploader's own prefix.
//
// This rebuilds Last Used from those uploads. It runs once per account, and only
// when that account's wardrobe is empty, so it can never fight with a wardrobe
// the user is actively curating.
// ============================================

const BUCKET = 'posts';
// Versioned so a device whose wardrobe was emptied by a bug can recover: the
// marker records that a restore ran, and a bug that discarded the result would
// otherwise leave that marker in place forever.
//
// v1 was clobbered by a redundant claimLocalCache resetting the store right after
// it. v2 survived that but was overwritten by syncWardrobe writing a stale, empty
// snapshot back over it — the sync now refuses to shrink the wardrobe, and this
// bump lets affected devices rebuild from storage one more time.
const restoredKey = (userId: string) => `wardrobe_restored:v3:${userId}`;

// Wardrobe uploads have been written under two layouts. Both are still in the
// bucket, so both have to be read or the older half of a wardrobe stays missing.
const CURRENT_PREFIX = (userId: string) => `${userId}/wardrobe`;
const LEGACY_FOLDER = 'wardrobe';
const LEGACY_PREFIX = (userId: string) => `${userId}_`;

interface Found {
    path: string;
    createdAt: number;
}

async function listCurrent(userId: string): Promise<Found[]> {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(CURRENT_PREFIX(userId), { limit: 1000 });

    if (error || !data) return [];
    return data
        .filter((o) => o.name && !o.name.startsWith('.'))
        .map((o) => ({
            path: `${CURRENT_PREFIX(userId)}/${o.name}`,
            createdAt: Date.parse(o.created_at ?? '') || 0,
        }));
}

async function listLegacy(userId: string): Promise<Found[]> {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(LEGACY_FOLDER, { limit: 1000, search: LEGACY_PREFIX(userId) });

    if (error || !data) return [];
    return data
        .filter((o) => o.name?.startsWith(LEGACY_PREFIX(userId)))
        .map((o) => ({
            path: `${LEGACY_FOLDER}/${o.name}`,
            createdAt: Date.parse(o.created_at ?? '') || 0,
        }));
}

/**
 * Rebuild Last Used for `userId` from their own uploads.
 *
 * Returns how many items were restored; 0 means there was nothing to do, which is
 * the normal case on every launch after the first.
 */
export async function restoreWardrobeFromStorage(userId: string): Promise<number> {
    try {
        if (await AsyncStorage.getItem(restoredKey(userId))) return 0;

        const lastUsed = useWardrobeStore.getState().getFolder('last_used');
        if (lastUsed && lastUsed.assets.length > 0) {
            // Nothing was lost — record that so this never runs for them again.
            await AsyncStorage.setItem(restoredKey(userId), '1');
            return 0;
        }

        const [current, legacy] = await Promise.all([listCurrent(userId), listLegacy(userId)]);
        const found = [...current, ...legacy];

        // Newest first: Last Used is ordered most-recent-first, and upload time is
        // the closest thing to "when did this last matter to you" that survived.
        found.sort((a, b) => b.createdAt - a.createdAt);

        const { addAsset, wasRemoved } = useWardrobeStore.getState();

        let restored = 0;
        let skipped = 0;

        // addAsset prepends, so walk oldest-first to land on newest-first.
        for (const item of [...found].reverse()) {
            const { data } = supabase.storage.from(BUCKET).getPublicUrl(item.path);
            if (!data?.publicUrl) continue;

            // Deleting from the wardrobe leaves the file in storage on purpose —
            // posts reference the same URLs. Restoring blind would therefore hand
            // back everything the user had deliberately thrown away.
            if (wasRemoved(data.publicUrl)) {
                skipped += 1;
                continue;
            }

            addAsset('last_used', { url: data.publicUrl });
            restored += 1;
        }

        await AsyncStorage.setItem(restoredKey(userId), '1');

        if (restored || skipped) {
            console.warn(`[wardrobeRestore] restored ${restored} item(s), skipped ${skipped} previously removed`);
        }
        return restored;
    } catch (error) {
        console.warn('[wardrobeRestore] restore failed:', error);
        return 0;
    }
}
