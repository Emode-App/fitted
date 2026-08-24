-- Individual pieces somebody wants to keep, as opposed to whole fits.
--
-- saved_posts already keeps fits and stays exactly as it is; this is its
-- sibling, not its replacement. The Saved tab shows both, behind a Fits/Items
-- switch.
--
-- The row is a SNAPSHOT rather than a foreign key, because a saved item has no
-- stable row to point at. Catalogue listings are re-crawled and can vanish or
-- change URL, and a piece tagged on a post lives inside that post's `items`
-- jsonb with no id of its own. Pointing at either would mean saved things
-- quietly disappearing from somebody's list.
create table if not exists public.saved_items (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users(id) on delete cascade,

    -- Snapshot of the piece as it was when saved.
    brand_slug     text,
    brand_name     text,
    name           text not null,
    image_url      text not null,
    product_url    text,
    price          numeric,
    category       text,

    -- Where it was saved from, when that is known. Nulled rather than cascaded
    -- so deleting a post does not delete somebody else's saved piece.
    source_post_id uuid references public.posts(id) on delete set null,

    created_at     timestamptz not null default now(),

    -- What makes two saves the same piece.
    --
    -- A link when there is one. Otherwise brand and name, which is the only
    -- durable handle on a piece tagged in a post where the poster left no link
    -- -- the case this table has to support. Image URL is the last resort.
    --
    -- Generated from built-in functions only. A generated column over a
    -- user-defined function is a trap (it is not recomputed when that function
    -- is replaced); coalesce/nullif/lower/btrim cannot change under it.
    item_key text generated always as (
        coalesce(
            nullif(btrim(coalesce(product_url, '')), ''),
            nullif(lower(btrim(coalesce(brand_slug, '') || '|' || coalesce(name, ''))), '|'),
            image_url
        )
    ) stored,

    constraint saved_items_unique_per_user unique (user_id, item_key)
);

create index if not exists saved_items_user_recent_idx
    on public.saved_items (user_id, created_at desc);

alter table public.saved_items enable row level security;

-- Mirrors saved_posts: yours and nobody else's, in every direction.
drop policy if exists "Users can view own saved items" on public.saved_items;
create policy "Users can view own saved items"
    on public.saved_items for select
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can save items" on public.saved_items;
create policy "Users can save items"
    on public.saved_items for insert
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can unsave items" on public.saved_items;
create policy "Users can unsave items"
    on public.saved_items for delete
    using ((select auth.uid()) = user_id);

grant select, insert, delete on public.saved_items to authenticated;
