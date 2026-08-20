import { supabase } from '@/services/supabase';
import { useWardrobeStore, setWardrobeSink, type Asset, type Folder } from '@/stores/wardrobeStore';

// ============================================
// WARDROBE SYNC
//
// The wardrobe used to live only in AsyncStorage, so it died with the app:
// reinstall, new phone, or a bug in the local cache and it was gone, even though
// every uploaded photo was still sitting in the posts bucket. This makes
// wardrobe_folders / wardrobe_assets the durable copy and leaves the Zustand store
// as the local cache in front of it.
//
// The merge is deliberately additive. The only thing that removes a local item is
// an explicit server-side tombstone, so a failed fetch, a half-written row or an
// offline launch can never empty somebody's wardrobe.
// ============================================

/** Folder slug -> row id, for the account currently synced. */
let folderIds = new Map<string, string>();
/** Folder slug -> row, so folders created on another device can be recreated here. */
let folderRows = new Map<string, { name: string; isDefault: boolean }>();
let activeUserId: string | null = null;

/** Fire-and-forget: a sync failure must never surface as a broken tap. */
function bg(work: Promise<unknown>) {
    work.catch((error) => console.warn('[wardrobeSync] push failed:', error));
}

async function loadFolders(userId: string): Promise<Map<string, string>> {
    const { data, error } = await supabase
        .from('wardrobe_folders')
        .select('id, slug, name, is_default')
        .eq('user_id', userId);

    if (error) throw error;
    folderRows = new Map((data ?? []).map((f: any) => [f.slug as string, { name: f.name as string, isDefault: !!f.is_default }]));
    return new Map((data ?? []).map((f: any) => [f.slug as string, f.id as string]));
}

/** Create a folder row on demand: custom folders, and any missing default. */
async function ensureFolder(userId: string, slug: string, name: string, isDefault = false): Promise<string | null> {
    const known = folderIds.get(slug);
    if (known) return known;

    const { data, error } = await supabase
        .from('wardrobe_folders')
        .upsert({ user_id: userId, slug, name, is_default: isDefault }, { onConflict: 'user_id,slug' })
        .select('id')
        .single();

    if (error || !data) {
        console.warn('[wardrobeSync] could not create folder', slug, error);
        return null;
    }
    folderIds.set(slug, data.id as string);
    return data.id as string;
}

function assetFromRow(row: any): Asset {
    return {
        id: row.id,
        name: row.name ?? undefined,
        url: row.url,
        dateAdded: Date.parse(row.added_at ?? row.created_at ?? '') || Date.now(),
        fileSignature: row.file_signature ?? undefined,
        brand: row.brand ?? undefined,
        itemName: row.item_name ?? undefined,
        purchaseLink: row.purchase_link ?? undefined,
        price: row.price ?? undefined,
    };
}

function rowFromAsset(folderId: string, asset: Asset) {
    return {
        folder_id: folderId,
        url: asset.url,
        name: asset.name ?? null,
        brand: asset.brand ?? null,
        item_name: asset.itemName ?? null,
        purchase_link: asset.purchaseLink ?? null,
        price: asset.price ?? null,
        file_signature: asset.fileSignature ?? null,
        added_at: new Date(asset.dateAdded).toISOString(),
        removed_at: null,
    };
}

async function markRemoved(urls: string[]): Promise<void> {
    const ids = [...folderIds.values()];
    if (ids.length === 0 || urls.length === 0) return;

    const { error } = await supabase
        .from('wardrobe_assets')
        .update({ removed_at: new Date().toISOString() })
        .in('folder_id', ids)
        .in('url', urls);

    if (error) throw error;
}

/**
 * Reconcile the local wardrobe with the server copy.
 *
 * Runs on sign-in. Pushes anything the device has that the server does not, which
 * is how an existing local-only wardrobe gets uploaded the first time; pulls
 * anything the server has that the device does not; and applies tombstones in both
 * directions so a deletion on one phone reaches the other.
 */
let syncInFlight: Promise<void> | null = null;

export async function syncWardrobe(userId: string): Promise<void> {
    // claimLocalCache runs twice for one sign-in, so this does too. Two passes
    // reading and writing the same store is exactly how a stale snapshot gets
    // written back over a good one.
    if (syncInFlight) return syncInFlight;
    syncInFlight = runSync(userId).finally(() => { syncInFlight = null; });
    return syncInFlight;
}

async function runSync(userId: string): Promise<void> {
    try {
        activeUserId = userId;
        folderIds = await loadFolders(userId);
        if (folderIds.size === 0) return;

        const { data: rows, error } = await supabase
            .from('wardrobe_assets')
            .select('id, folder_id, url, name, brand, item_name, purchase_link, price, file_signature, added_at, created_at, removed_at')
            .in('folder_id', [...folderIds.values()]);

        if (error) throw error;

        const slugByFolderId = new Map([...folderIds].map(([slug, id]) => [id, slug]));
        const serverLive = new Map<string, Map<string, any>>();
        const serverTombstoned = new Set<string>();

        for (const row of rows ?? []) {
            const slug = slugByFolderId.get(row.folder_id);
            if (!slug) continue;
            if (row.removed_at) {
                serverTombstoned.add(row.url);
                continue;
            }
            if (!serverLive.has(slug)) serverLive.set(slug, new Map());
            serverLive.get(slug)!.set(row.url, row);
        }

        const state = useWardrobeStore.getState();
        const localRemoved = new Set(state.removedUrls ?? []);

        // --- pull -------------------------------------------------------------
        const merged: Folder[] = state.folders.map((folder) => {
            const fromServer = serverLive.get(folder.id);
            const haveLocally = new Set(folder.assets.map((a) => a.url));

            const additions: Asset[] = [];
            if (fromServer) {
                for (const [url, row] of fromServer) {
                    if (!haveLocally.has(url) && !localRemoved.has(url)) additions.push(assetFromRow(row));
                }
            }

            // A tombstone from another device is the one thing that deletes locally.
            const survivors = folder.assets.filter((a) => !serverTombstoned.has(a.url));
            if (additions.length === 0 && survivors.length === folder.assets.length) return folder;

            const next = [...additions, ...survivors].sort((a, b) => b.dateAdded - a.dateAdded);
            return { ...folder, assets: next };
        });

        // Folders that exist on the server but not on this device -- created on
        // another phone, or lost with a local cache. Without this the assets inside
        // them would be pulled into nothing and silently dropped.
        const knownSlugs = new Set(merged.map((f) => f.id));
        for (const [slug, rowsForSlug] of serverLive) {
            if (knownSlugs.has(slug)) continue;
            const meta = folderRows.get(slug);
            merged.push({
                id: slug,
                name: meta?.name ?? slug,
                isDefault: meta?.isDefault ?? false,
                assets: [...rowsForSlug.values()]
                    .filter((row) => !localRemoved.has(row.url))
                    .map(assetFromRow)
                    .sort((a, b) => b.dateAdded - a.dateAdded),
            });
        }

        // A sync must never leave the device with less than it started with.
        //
        // The merge reads the store, then writes what it computed. If that read
        // lands before persist has finished rehydrating -- or while a second
        // sign-in pass is running the same code -- the snapshot is empty, and
        // writing it back empties the wardrobe and persists that emptiness. Only
        // an explicit server tombstone is allowed to remove anything, so any
        // other shrinkage means the snapshot was stale and must be discarded.
        const before = state.folders.reduce((n, f) => n + f.assets.length, 0);
        const after = merged.reduce((n, f) => n + f.assets.length, 0);
        const removedByServer = serverTombstoned.size;

        if (after < before - removedByServer) {
            console.warn(
                `[wardrobeSync] refusing to shrink wardrobe ${before} -> ${after}; stale read, leaving local copy alone`,
            );
            return;
        }

        useWardrobeStore.setState({
            folders: merged,
            removedUrls: [...new Set([...localRemoved, ...serverTombstoned])],
        });

        // --- push: local items the server is missing ---------------------------
        for (const folder of merged) {
            const fromServer = serverLive.get(folder.id);
            const missing = folder.assets.filter(
                (a) => !fromServer?.has(a.url) && !serverTombstoned.has(a.url),
            );
            if (missing.length === 0) continue;

            const folderId = await ensureFolder(userId, folder.id, folder.name, !!folder.isDefault);
            if (!folderId) continue;

            const { error: upsertError } = await supabase
                .from('wardrobe_assets')
                .upsert(missing.map((a) => rowFromAsset(folderId, a)), { onConflict: 'folder_id,url' });

            if (upsertError) console.warn('[wardrobeSync] upload failed for', folder.id, upsertError);
        }

        // --- push: local tombstones the server has not recorded -----------------
        const unrecorded = [...localRemoved].filter((url) => !serverTombstoned.has(url));
        if (unrecorded.length > 0) bg(markRemoved(unrecorded));

        const total = merged.reduce((n, f) => n + f.assets.length, 0);
        console.warn(`[wardrobeSync] synced ${total} item(s) across ${merged.length} folder(s)`);
    } catch (error) {
        // Never let a sync failure take the wardrobe down with it. The local copy
        // stays exactly as it was and the next launch tries again.
        console.warn('[wardrobeSync] sync failed, keeping local wardrobe:', error);
    }
}

/**
 * Mirror local wardrobe edits to the server as they happen.
 *
 * Registered at sign-in. Every handler is fire-and-forget; the local store has
 * already applied the change, and syncWardrobe reconciles anything that got lost.
 */
export function startWardrobeSync(userId: string): void {
    setWardrobeSink({
        onAdd: (folderSlug, folderName, asset) => {
            if (activeUserId !== userId) return;
            bg((async () => {
                const folderId = await ensureFolder(userId, folderSlug, folderName);
                if (!folderId) return;
                const { error } = await supabase
                    .from('wardrobe_assets')
                    .upsert(rowFromAsset(folderId, asset), { onConflict: 'folder_id,url' });
                if (error) throw error;
            })());
        },

        onRemove: (url) => {
            if (activeUserId !== userId) return;
            bg(markRemoved([url]));
        },

        onCreateFolder: (folder) => {
            if (activeUserId !== userId) return;
            bg(ensureFolder(userId, folder.id, folder.name, !!folder.isDefault).then(() => undefined));
        },

        onDeleteFolder: (folderSlug) => {
            if (activeUserId !== userId) return;
            const folderId = folderIds.get(folderSlug);
            if (!folderId) return;
            folderIds.delete(folderSlug);
            bg((async () => {
                const { error } = await supabase.from('wardrobe_folders').delete().eq('id', folderId);
                if (error) throw error;
            })());
        },
    });
}

/** Detach on sign-out, so a queued write can never land on the next account. */
export function stopWardrobeSync(): void {
    activeUserId = null;
    folderIds = new Map();
    folderRows = new Map();
    setWardrobeSink({});
}
