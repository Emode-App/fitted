-- People tag the name they say out loud; retailers file under their own. Somebody
-- writes "Jordan", the catalogue says "Nike Jordan", and the brand page comes back
-- empty despite holding the pieces — two rows in brands for one label.
--
-- canonical_slug points an alias row at the row that owns the catalogue. It is
-- deliberately on brands rather than a separate alias table: an alias IS a brand
-- here, with its own post_count from people tagging it, and only its catalogue
-- comes from somewhere else.
alter table public.brands
    add column if not exists canonical_slug text references public.brands(slug);

create index if not exists brands_canonical_idx
    on public.brands (canonical_slug) where canonical_slug is not null;

-- A directory brand whose retailer slug equals another row's slug is that row
-- under the retailer's spelling. That is exactly the Jordan / Nike Jordan case,
-- and it is a strong enough signal to link automatically.
update public.brands alias
set canonical_slug = owner.slug
from public.brands owner
where owner.catalog_slug = alias.slug
  and owner.slug <> alias.slug
  and alias.canonical_slug is null;

-- Do the same for brands tagged from here on, so the first person to write
-- "Jordan" gets the stock rather than an empty page nobody notices.
create or replace function public.register_tagged_brands()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
    INSERT INTO brands (slug, name, source, post_count, last_tagged_at)
    SELECT brand_slug(i->>'brand'), i->>'brand', 'user_tag', 1, now()
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) i
    WHERE COALESCE(i->>'brand', '') NOT IN ('', 'Unknown')
      AND brand_slug(i->>'brand') IS NOT NULL
    GROUP BY 1, 2
    ON CONFLICT (slug) DO UPDATE
        SET post_count = brands.post_count + 1,
            last_tagged_at = now(),
            name = CASE WHEN brands.source = 'directory' THEN brands.name ELSE EXCLUDED.name END;

    UPDATE brands alias
    SET canonical_slug = owner.slug
    FROM brands owner
    WHERE owner.catalog_slug = alias.slug
      AND owner.slug <> alias.slug
      AND alias.canonical_slug IS NULL;

    RETURN NEW;
END;
$function$;

-- One list per brand. Catalogue rows appear under their own brand and under every
-- alias pointing at it, so a page reached by either spelling shows the same stock.
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
    c.brand_slug, c.brand_name, c.name, c.price, c.image_url, c.product_url,
    null::uuid    as post_id,
    false         as is_tagged,
    c.fetched_at  as sort_at
from public.brand_catalog c
where c.is_active and c.image_url is not null

union all

select
    alias.slug, alias.name, c.name, c.price, c.image_url, c.product_url,
    null::uuid    as post_id,
    false         as is_tagged,
    c.fetched_at  as sort_at
from public.brand_catalog c
join public.brands alias on alias.canonical_slug = c.brand_slug
where c.is_active and c.image_url is not null;
