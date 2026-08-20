-- brands.slug is derived from the display name people type when tagging, so it
-- will not always match the retailer's own slug ("A.P.C." -> "a-p-c" here vs
-- "apc" there). Storing the retailer slug separately means the catalogue crawl
-- always has a URL that resolves, instead of guessing and 404ing.
alter table public.brands
    add column if not exists catalog_slug text,
    add column if not exists catalog_synced_at timestamptz;

create index if not exists brands_catalog_slug_idx
    on public.brands (catalog_slug) where catalog_slug is not null;

-- Refresh oldest-first so a scheduled run works through the whole directory
-- rather than re-crawling the same handful every time.
create index if not exists brands_catalog_stale_idx
    on public.brands (catalog_synced_at nulls first) where catalog_slug is not null;

-- Slug a batch of display names in one round trip, using the same brand_slug()
-- the tagging trigger uses. Keeps a directory entry and a tagged post landing on
-- one row instead of two spellings of the same label.
create or replace function public.brand_slugs_for(names text[])
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
    select array_agg(brand_slug(n) order by ord)
    from unnest(names) with ordinality as t(n, ord);
$$;

revoke all on function public.brand_slugs_for(text[]) from public, anon;
