-- One source was the wrong shape from the start. A designer retailer is right for
-- Rick Owens and Loewe and useless for sneakers — New Balance came back with 5
-- pieces not because the crawler was broken but because that is genuinely all it
-- stocks. Sneaker brands need a sneaker marketplace; an aggregator covers both.
--
-- Sources are added, never swapped: brand_catalog holds rows from all of them and
-- brand pages read the union, so a brand deep on one source and thin on another
-- shows everything either one found. The slug differs per source too, which is
-- why it cannot live on brands as a single column.
create table if not exists public.brand_sources (
    brand_slug   text not null references public.brands(slug) on delete cascade,
    source       text not null,
    source_slug  text not null,
    -- Each source is walked independently: one going stale must not hold up the
    -- others, and a brand can be many pages deep on one and one page on another.
    page_cursor  integer not null default 1,
    synced_at    timestamptz,
    is_enabled   boolean not null default true,
    primary key (brand_slug, source)
);

create index if not exists brand_sources_stale_idx
    on public.brand_sources (synced_at nulls first) where is_enabled;

alter table public.brand_sources enable row level security;

drop policy if exists "Brand sources are readable by everyone" on public.brand_sources;
create policy "Brand sources are readable by everyone"
    on public.brand_sources for select using (true);

-- Carry over what the single-source columns already knew, so nothing already
-- crawled has to be crawled again.
insert into public.brand_sources (brand_slug, source, source_slug, page_cursor, synced_at)
select slug, 'ssense', catalog_slug, coalesce(catalog_page_cursor, 1), catalog_synced_at
from public.brands
where catalog_slug is not null
on conflict (brand_slug, source) do nothing;

-- Lyst aggregates across retailers, so it is the broad source: it carries the
-- sneaker brands this app's users actually post as well as the designer labels.
insert into public.brand_sources (brand_slug, source, source_slug)
select slug, 'lyst', coalesce(catalog_slug, slug)
from public.brands
where canonical_slug is null
on conflict (brand_slug, source) do nothing;

-- StockX is narrow on purpose: it exists for the brands a designer retailer
-- barely stocks, so the budget is not spent asking a sneaker marketplace about
-- Loewe.
insert into public.brand_sources (brand_slug, source, source_slug)
values
  ('new-balance', 'stockx', 'new-balance'),
  ('jordan',      'stockx', 'jordan'),
  ('nike-jordan', 'stockx', 'jordan')
on conflict (brand_slug, source) do nothing;
