-- Where the aggregator files this brand, kept for a crawl we have not run yet.
--
-- brands.slug is the app's identity key -- what brand_slug() collapses a typed
-- name onto. It is deliberately NOT the aggregator's slug: 13% of the directory
-- disagrees, and not over accents but over the site's own conventions
-- ("10 Crosby Derek Lam" is filed as 10-crosby-by-derek-lam, bare years gain a
-- "-designer" suffix). The slug cannot be derived from the name, so it has to be
-- carried.
--
-- This exists so a brand can sit in the directory with no crawl job at all and
-- still be registerable the instant somebody wants it. brands.catalog_slug was
-- the old single-source version of this idea; nothing reads it any more.
alter table public.brands
    add column if not exists lyst_slug text;

comment on column public.brands.lyst_slug is
    'Slug this brand is filed under on the aggregator. Seeds brand_sources.source_slug on demand.';

-- Trigram search over the catalogue.
--
-- The item lookup is `ilike '%term%'` across brand_items, a three-way UNION.
-- At 12,690 rows that was a sequential scan over brand_catalog on every
-- keystroke, and the catalogue is early days: one brand alone holds 1,925 rows
-- and most sources have never been crawled. Measured on the same query:
-- 72ms sequential -> 24ms via these indexes.
create extension if not exists pg_trgm;

create index if not exists brand_catalog_brand_name_trgm
    on public.brand_catalog using gin (brand_name gin_trgm_ops);

create index if not exists brand_catalog_name_trgm
    on public.brand_catalog using gin (name gin_trgm_ops);

-- Deliberately NOT indexing brands.canonical_slug here. brands_canonical_idx
-- already covers it, and adding a second partial index changed the planner's
-- estimate enough to turn the alias branch of brand_items into a merge join that
-- walked the whole catalogue -- 24ms became 375ms. Left as a warning.
--
-- That alias branch is still the weakest part of the view: it scans every
-- catalogue row with an image to produce, today, zero rows. It is ~8ms now and
-- will need restructuring long before the catalogue is finished.