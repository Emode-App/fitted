// Wardrobe Store - Zustand with AsyncStorage persistence
// Manages folders and assets for the user's clothing wardrobe

import { create } from 'zustand';
// Expo web currently emits dependency ESM inside a classic script. Loading the
// CommonJS middleware entry avoids Zustand's `import.meta.env` devtools branch.
const { persist, createJSONStorage } = require('zustand/middleware') as typeof import('zustand/middleware');
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface Asset {
    id: string;
    name?: string;
    url: string;
    dateAdded: number;
    fileSignature?: string; // For deduplication
    // Product data for items from search
    brand?: string;
    itemName?: string;
    purchaseLink?: string;
    price?: number;
}

export interface Folder {
    id: string;
    name: string;
    assets: Asset[];
    isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Sync sink
//
// The wardrobe is mirrored to wardrobe_folders / wardrobe_assets. The store does
// not import the sync service -- it emits through this sink instead, so the store
// stays free of Supabase and there is no import cycle. Unregistered (signed out)
// the calls are no-ops and the store behaves exactly as it did when it was purely
// local.
// ---------------------------------------------------------------------------
export interface WardrobeSink {
    onAdd?: (folderSlug: string, folderName: string, asset: Asset) => void;
    onRemove?: (url: string) => void;
    onCreateFolder?: (folder: Folder) => void;
    onDeleteFolder?: (folderSlug: string) => void;
}

let sink: WardrobeSink = {};

export const setWardrobeSink = (next: WardrobeSink) => { sink = next; };

// Default folders that every user starts with
const DEFAULT_FOLDERS: Folder[] = [
    { id: 'last_used', name: 'Last Used', isDefault: true, assets: [] },
    { id: 'shirts', name: 'Shirts', isDefault: true, assets: [] },
    { id: 'jackets', name: 'Jackets', isDefault: true, assets: [] },
    { id: 'pants', name: 'Pants', isDefault: true, assets: [] },
    { id: 'shoes', name: 'Shoes', isDefault: true, assets: [] },
    { id: 'accessories', name: 'Accessories', isDefault: true, assets: [] },
];

interface WardrobeState {
    folders: Folder[];
    selectedFolderId: string;
    /**
     * URLs the user has taken out of the wardrobe entirely.
     *
     * Removal is local — the uploaded file stays in storage, deliberately, because
     * published posts reference the same URLs and deleting the object would break
     * them. Without a record of the removal, anything that rebuilds the wardrobe
     * from storage cannot tell a deleted item from a missing one and resurrects it.
     */
    removedUrls: string[];

    // Actions
    setSelectedFolder: (folderId: string) => void;
    addAsset: (folderId: string, asset: Omit<Asset, 'id' | 'dateAdded'>) => void;
    removeAsset: (folderId: string, assetId: string) => void;
    /** File an item into another folder. Out of Last Used this copies; between named folders it moves. */
    moveAssetToFolder: (assetId: string, fromFolderId: string, toFolderId: string) => void;
    createFolder: (name: string) => string;
    deleteFolder: (folderId: string) => void;
    getFolder: (folderId: string) => Folder | undefined;
    wasRemoved: (url: string) => boolean;
    resetWardrobe: () => void;
}

// Helper for unique asset handling (deduplication)
const upsertAsset = (list: Asset[], newAsset: Asset): Asset[] => {
    // Filter out any asset with same signature (if signature exists)
    let filtered = list;
    if (newAsset.fileSignature) {
        filtered = list.filter(a => a.fileSignature !== newAsset.fileSignature);
    }
    // Also filter by URL to prevent exact duplicates
    filtered = filtered.filter(a => a.url !== newAsset.url);
    return [newAsset, ...filtered];
};

export const useWardrobeStore = create<WardrobeState>()(
    persist(
        (set, get) => ({
            folders: DEFAULT_FOLDERS,
            selectedFolderId: 'last_used',
            removedUrls: [],

            setSelectedFolder: (folderId) => {
                set({ selectedFolderId: folderId });
            },

            addAsset: (folderId, assetData) => {
                const newAsset: Asset = {
                    id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: assetData.name || 'Untitled',
                    url: assetData.url,
                    dateAdded: Date.now(),
                    fileSignature: assetData.fileSignature,
                    // Product data
                    brand: assetData.brand,
                    itemName: assetData.itemName,
                    purchaseLink: assetData.purchaseLink,
                    price: assetData.price,
                };

                set((state) => {
                    let updatedFolders = state.folders.map(folder => {
                        if (folder.id === folderId) {
                            return { ...folder, assets: upsertAsset(folder.assets, newAsset) };
                        }
                        return folder;
                    });

                    // Also add to "Last Used" if target wasn't last_used
                    if (folderId !== 'last_used') {
                        updatedFolders = updatedFolders.map(folder => {
                            if (folder.id === 'last_used') {
                                return { ...folder, assets: upsertAsset(folder.assets, newAsset) };
                            }
                            return folder;
                        });
                    }

                    // Adding something back is an explicit undo of removing it.
                    return {
                        folders: updatedFolders,
                        removedUrls: (state.removedUrls ?? []).filter(u => u !== newAsset.url),
                    };
                });

                const target = get().folders.find(f => f.id === folderId);
                sink.onAdd?.(folderId, target?.name ?? folderId, newAsset);
                if (folderId !== 'last_used') {
                    sink.onAdd?.('last_used', 'Last Used', newAsset);
                }
            },

            removeAsset: (folderId, assetId) => {
                let removedUrlForSink: string | undefined;

                set((state) => {
                    const removedUrl = state.folders
                        .find(f => f.id === folderId)?.assets
                        .find(a => a.id === assetId)?.url;

                    const folders = state.folders.map(folder => {
                        if (folder.id === folderId) {
                            return {
                                ...folder,
                                assets: folder.assets.filter(a => a.id !== assetId),
                            };
                        }
                        return folder;
                    });

                    // An asset added to a named folder is mirrored into Last Used, so
                    // only tombstone once it is gone from everywhere — pulling it out
                    // of Shirts while it still sits in Last Used is not a deletion.
                    const stillPresent = removedUrl
                        ? folders.some(f => f.assets.some(a => a.url === removedUrl))
                        : true;

                    if (removedUrl && !stillPresent) removedUrlForSink = removedUrl;

                    const removedUrls = state.removedUrls ?? [];
                    return {
                        folders,
                        removedUrls: (!removedUrl || stillPresent || removedUrls.includes(removedUrl))
                            ? removedUrls
                            : [...removedUrls, removedUrl],
                    };
                });

                if (removedUrlForSink) sink.onRemove?.(removedUrlForSink);
            },

            /**
             * File an item into another folder.
             *
             * Last Used is a recency view rather than a bucket: addAsset already
             * mirrors everything into it, so an item that lives in Shirts also
             * appears there. Taking it out of Last Used when filing it would
             * therefore contradict what happens when the same item is added
             * from anywhere else, and would make the folder mean two different
             * things depending on how the item arrived. So filing out of Last
             * Used copies, and filing between two named folders moves.
             *
             * Nothing is tombstoned either way -- the item ends up somewhere, so
             * this is never a deletion, and removedUrls must not learn about it.
             */
            moveAssetToFolder: (assetId, fromFolderId, toFolderId) => {
                if (fromFolderId === toFolderId) return;

                let moved: Asset | undefined;
                let destinationName = toFolderId;

                set((state) => {
                    const asset = state.folders
                        .find(f => f.id === fromFolderId)?.assets
                        .find(a => a.id === assetId);
                    if (!asset) return state;

                    moved = asset;
                    destinationName = state.folders.find(f => f.id === toFolderId)?.name ?? toFolderId;

                    const leavesSource = fromFolderId !== 'last_used';

                    return {
                        folders: state.folders.map(folder => {
                            if (folder.id === toFolderId) {
                                return { ...folder, assets: upsertAsset(folder.assets, asset) };
                            }
                            if (leavesSource && folder.id === fromFolderId) {
                                return { ...folder, assets: folder.assets.filter(a => a.id !== assetId) };
                            }
                            return folder;
                        }),
                    };
                });

                if (moved) sink.onAdd?.(toFolderId, destinationName, moved);
            },

            createFolder: (name) => {
                const newId = `custom_${Date.now()}`;
                const newFolder: Folder = {
                    id: newId,
                    name: name.trim(),
                    assets: [],
                    isDefault: false,
                };

                set((state) => ({
                    folders: [...state.folders, newFolder],
                    selectedFolderId: newId,
                }));

                sink.onCreateFolder?.(newFolder);
                return newId;
            },

            deleteFolder: (folderId) => {
                const folder = get().folders.find(f => f.id === folderId);
                // Don't allow deleting default folders
                if (folder?.isDefault) return;

                set((state) => ({
                    folders: state.folders.filter(f => f.id !== folderId),
                    // Reset to last_used if deleted folder was selected
                    selectedFolderId: state.selectedFolderId === folderId
                        ? 'last_used'
                        : state.selectedFolderId,
                }));

                sink.onDeleteFolder?.(folderId);
            },

            getFolder: (folderId) => {
                return get().folders.find(f => f.id === folderId);
            },

            wasRemoved: (url) => (get().removedUrls ?? []).includes(url),

            resetWardrobe: () => {
                set({
                    folders: DEFAULT_FOLDERS,
                    selectedFolderId: 'last_used',
                    removedUrls: [],
                });
            },
        }),
        {
            name: 'wardrobe-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
