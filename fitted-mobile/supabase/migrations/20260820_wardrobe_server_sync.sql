-- The wardrobe has always lived in AsyncStorage. wardrobe_folders/wardrobe_assets
-- were created but never written to, so the wardrobe died with the app: reinstall,
-- new phone, or a bug in the local cache and it was gone. These tables carry only
-- enough columns to hold a URL, so first they have to match what the client stores.

-- Stable per-account key. The client addresses folders by slug ('last_used',
-- 'shirts', ...) while the table uses uuids, so the slug is what lets the two
-- reconcile without a lookup table.
alter table public.wardrobe_folders
    add column if not exists slug text,
    add column if not exists position integer not null default 0;

update public.wardrobe_folders
set slug = coalesce(slug, lower(regexp_replace(name, '\s+', '_', 'g')))
where slug is null;

alter table public.wardrobe_folders
    alter column slug set not null;

create unique index if not exists wardrobe_folders_user_slug_idx
    on public.wardrobe_folders (user_id, slug);

-- Product metadata the client already carries but had nowhere to put.
alter table public.wardrobe_assets
    add column if not exists name text,
    add column if not exists brand text,
    add column if not exists item_name text,
    add column if not exists purchase_link text,
    add column if not exists price numeric,
    add column if not exists added_at timestamptz not null default now(),
    -- Soft delete. Removing an item leaves the uploaded file in storage on purpose,
    -- because published posts embed the same URLs; the tombstone is what stops any
    -- rebuild from handing back something the user threw away. Recording it here
    -- rather than on the device makes the deletion stick across reinstalls too.
    add column if not exists removed_at timestamptz;

-- Makes the sync push idempotent: re-adding the same image to the same folder
-- updates the row instead of duplicating it.
create unique index if not exists wardrobe_assets_folder_url_idx
    on public.wardrobe_assets (folder_id, url);

create index if not exists wardrobe_assets_folder_live_idx
    on public.wardrobe_assets (folder_id) where removed_at is null;

-- Both tables had SELECT/INSERT/DELETE but no UPDATE, so a tombstone or a rename
-- could never have been written.
drop policy if exists "Users can update own wardrobe folders" on public.wardrobe_folders;
create policy "Users can update own wardrobe folders"
    on public.wardrobe_folders for update
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own wardrobe assets" on public.wardrobe_assets;
create policy "Users can update own wardrobe assets"
    on public.wardrobe_assets for update
    using (exists (
        select 1 from public.wardrobe_folders f
        where f.id = wardrobe_assets.folder_id and f.user_id = (select auth.uid())
    ))
    with check (exists (
        select 1 from public.wardrobe_folders f
        where f.id = wardrobe_assets.folder_id and f.user_id = (select auth.uid())
    ));
