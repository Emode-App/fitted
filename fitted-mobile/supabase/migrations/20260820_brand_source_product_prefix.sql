-- Where a source files a brand's products, when that differs from its brand page.
--
-- StockX lists the brand at /brands/jordan but every product under
-- /air-jordan-4-retro-... , and attribution is done by matching the product slug
-- against the brand slug. With nothing to map between the two, every Jordan
-- listing was rejected and the brand came back empty.

alter table public.brand_sources
    add column if not exists product_slug_prefix text;

comment on column public.brand_sources.product_slug_prefix is
    'Prefix a source uses on product URLs for this brand. Falls back to source_slug.';

update public.brand_sources
set product_slug_prefix = 'air-jordan'
where source = 'stockx'
  and source_slug = 'jordan'
  and product_slug_prefix is null;
