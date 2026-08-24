// Which pieces this account has saved.
//
// Held in one store because the same piece shows up in several places at once --
// a brand's grid, a post's "More from" carousel, the item sheet on a post. A
// heart filled in one of them has to be filled in all of them, and per-screen
// state cannot do that.

import { create } from 'zustand';
import {
    fetchSavedKeys,
    saveItem,
    unsaveItem,
    savedItemKey,
    type SaveableItem,
} from '@/services/savedItems';

interface SavedItemsState {
    keys: Set<string>;
    /**
     * Bumped once a write has actually landed.
     *
     * `keys` moves optimistically, so a screen that refetches when `keys`
     * changes races the insert and reads the table before the row is there --
     * which is why a newly saved piece did not appear in the Saved tab until
     * something else forced a reload. Watch this instead and the refetch happens
     * after the server agrees.
     */
    revision: number;
    hydratedFor: string | null;
    /** Load this account's saved keys. Cheap and idempotent per account. */
    hydrate: (userId: string) => Promise<void>;
    isSaved: (item: SaveableItem) => boolean;
    toggle: (userId: string, item: SaveableItem) => Promise<void>;
    /** Drop everything on sign-out, so the next account starts clean. */
    reset: () => void;
}

export const useSavedItemsStore = create<SavedItemsState>((set, get) => ({
    keys: new Set(),
    revision: 0,
    hydratedFor: null,

    hydrate: async (userId) => {
        if (get().hydratedFor === userId) return;
        const keys = await fetchSavedKeys(userId);
        set({ keys, hydratedFor: userId });
    },

    isSaved: (item) => get().keys.has(savedItemKey(item)),

    toggle: async (userId, item) => {
        const key = savedItemKey(item);
        const wasSaved = get().keys.has(key);

        // Fill the heart immediately; a tap that waits on the network reads as
        // broken. Put it back if the write fails.
        const optimistic = new Set(get().keys);
        if (wasSaved) optimistic.delete(key); else optimistic.add(key);
        set({ keys: optimistic });

        try {
            if (wasSaved) await unsaveItem(userId, key);
            else await saveItem(userId, item);
            set({ revision: get().revision + 1 });
        } catch (error) {
            console.warn('[savedItems] toggle failed:', error);
            const reverted = new Set(get().keys);
            if (wasSaved) reverted.add(key); else reverted.delete(key);
            set({ keys: reverted });
        }
    },

    reset: () => set({ keys: new Set(), hydratedFor: null, revision: 0 }),
}));
