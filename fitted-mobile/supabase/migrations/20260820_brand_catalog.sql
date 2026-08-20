-- Reference catalogue for brand pages: what a brand currently sells, gathered
-- from retailer listings by the seed-brand-catalog function.
--
-- Deliberately NOT public.products. That table is marketplace inventory — it has
-- a NOT NULL seller_id, an inventory_count and a reserved_count, and the checkout
-- flow reserves against it. Catalogue rows dropped in there would read as items
-- somebody on this app is selling and could be reserved against stock that does
-- not exist.

create table if not exists public.brand_catalog (
    id           uuid primary key default gen_random_uuid(),
    brand_slug   text not null,
    brand_name   text not null,
    name         text not null,
    price        numeric,
    currency     text not null default 'USD',
    image_url    text,
    product_url  text not null,
    source       text not null,
    category     text,
    is_active    boolean not null default true,
    fetched_at   timestamptz not null default now()
);

-- The retailer URL identifies the listing; re-running a crawl refreshes rather
-- than duplicates.
create unique index if not exists brand_catalog_url_idx on public.brand_catalog (product_url);
create index if not exists brand_catalog_brand_idx on public.brand_catalog (brand_slug) where is_active;

alter table public.brand_catalog enable row level security;

drop policy if exists "Catalogue is readable by everyone" on public.brand_catalog;
create policy "Catalogue is readable by everyone"
    on public.brand_catalog for select using (true);
-- Writes are service-role only: this is crawled, never user-submitted.

-- One list per brand for the app to read: pieces people actually tagged first,
-- then the wider catalogue. is_tagged lets the UI treat them differently — a
-- piece somebody here wore is worth more than a listing.
-- post_id is carried so "More from <brand>" can exclude the post being viewed;
-- catalogue rows are null, which always qualifies. Rows without an image are
-- withheld — an empty tile looks broken, and the row stays in brand_catalog so a
-- later crawl that resolves the image brings it back.
drop view if exists public.brand_items;

create view public.brand_items as
select
    brand_slug, brand_name,
    item_name     as name,
    price, image_url,
    purchase_link as product_url,
    post_id,
    true          as is_tagged,
    created_at    as sort_at
from public.brand_feed
where image_url is not null
union all
select
    brand_slug, brand_name, name, price, image_url, product_url,
    null::uuid    as post_id,
    false         as is_tagged,
    fetched_at    as sort_at
from public.brand_catalog
where is_active
  and image_url is not null;
