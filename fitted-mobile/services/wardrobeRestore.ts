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
// Versioned: the v1 run was clobbered by a redundant claimLocalCache resetting the
// store immediately after it, and it had already written its marker, so it would
// never have retried. Bumping the version lets affected devices heal themselves.
const restoredKey = (userId: string) => `wardrobe_restored:v2:${userId}`;

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

        const { addAsset } = useWardrobeStore.getState();
        // addAsset prepends, so walk oldest-first to land on newest-first.
        for (const item of [...found].reverse()) {
            const { data } = supabase.storage.from(BUCKET).getPublicUrl(item.path);
            if (data?.publicUrl) addAsset('last_used', { url: data.publicUrl });
        }

        await AsyncStorage.setItem(restoredKey(userId), '1');

        if (found.length) {
            console.warn(`[wardrobeRestore] restored ${found.length} item(s) for ${userId}`);
        }
        return found.length;
    } catch (error) {
        console.warn('[wardrobeRestore] restore failed:', error);
        return 0;
    }
}
