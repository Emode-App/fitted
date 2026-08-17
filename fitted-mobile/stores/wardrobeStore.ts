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

    // Actions
    setSelectedFolder: (folderId: string) => void;
    addAsset: (folderId: string, asset: Omit<Asset, 'id' | 'dateAdded'>) => void;
    removeAsset: (folderId: string, assetId: string) => void;
    createFolder: (name: string) => string;
    deleteFolder: (folderId: string) => void;
    getFolder: (folderId: string) => Folder | undefined;
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

                    return { folders: updatedFolders };
                });
            },

            removeAsset: (folderId, assetId) => {
                set((state) => ({
                    folders: state.folders.map(folder => {
                        if (folder.id === folderId) {
                            return {
                                ...folder,
                                assets: folder.assets.filter(a => a.id !== assetId),
                            };
                        }
                        return folder;
                    }),
                }));
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
            },

            getFolder: (folderId) => {
                return get().folders.find(f => f.id === folderId);
            },

            resetWardrobe: () => {
                set({
                    folders: DEFAULT_FOLDERS,
                    selectedFolderId: 'last_used',
                });
            },
        }),
        {
            name: 'wardrobe-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
