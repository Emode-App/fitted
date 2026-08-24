-- Ask the aggregator's CDN for the full-size photo rather than a thumbnail.
--
-- Its URLs carry the dimensions in the path, and the crawler stored whatever
-- size appeared first in the product page markup: 767 rows at 300x375, 267 at
-- 200x250, 37 at 100x100. Blown up to fill a polaroid on a 3x screen those are
-- visibly pixelated.
--
-- 1040/1300 because the CDN serves only a fixed set of sizes -- 800/1000 returns
-- 403 -- and it is the largest confirmed to resolve for every stored variant.
-- Checked before running: 4KB -> 94KB, 9KB -> 108KB, 2KB -> 54KB.
update public.brand_catalog
set image_url = regexp_replace(image_url, 'lystit\.com/[0-9]+/[0-9]+/', 'lystit.com/1040/1300/')
where image_url ~ 'lystit\.com/[0-9]+/[0-9]+/'
  and image_url !~ 'lystit\.com/1040/1300/';

-- Index the name the view actually exposes.
--
-- brand_items stopped selecting brand_catalog.name directly when part codes
-- started being stripped from it -- it selects clean_item_name(name,
-- product_url). A search therefore filters on the function's result, which the
-- trigram index on the raw column cannot answer, and the planner fell back to
-- scanning every catalogue row: 24ms became 332ms with nothing looking like it
-- had changed. With this, a 144-row search runs in 31ms.
create index if not exists brand_catalog_clean_name_trgm
    on public.brand_catalog
    using gin (public.clean_item_name(name, product_url) gin_trgm_ops);
