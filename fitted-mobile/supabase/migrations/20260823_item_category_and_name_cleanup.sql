-- What kind of thing a listing is, so a brand page can be filtered.
--
-- Scrolling Loewe is 193 pairs of sunglasses out of 328 before anything else,
-- because the crawl finds eyewear first and nothing distinguished it. Only the
-- aggregator puts a category in its URLs (/shoes/, /clothing/, ...), and it
-- files eyewear under accessories -- which is exactly the split that matters
-- here -- so the name is classified first and the URL is only the fallback.
create or replace function public.item_category(item_name text, product_url text)
returns text
language sql
immutable
set search_path to ''
as $$
    select case
        -- A part code followed by nothing but a lens width -- "Lw40156u 52mm" --
        -- is a frame. Deliberately narrow: it needs the part code AND the
        -- measurement AND nothing else, so a 42mm watch case cannot match.
        when coalesce(item_name,'') ~* '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s+[0-9]{2}\s?mm\s*$' then 'Eyewear'
        when lower(coalesce(item_name,'')) ~ '(sunglass|eyewear|\mglasses\M|goggle|\mshades\M)' then 'Eyewear'
        when lower(coalesce(item_name,'')) ~ '(sneaker|trainer|shoe|boot|loafer|sandal|slipper|mule|derby|oxford|clog|pump|heel)' then 'Shoes'
        when lower(coalesce(item_name,'')) ~ '(\mbag\M|tote|backpack|clutch|pouch|satchel|duffle|duffel|purse|wallet|cardholder|card holder)' then 'Bags'
        when lower(coalesce(item_name,'')) ~ '(necklace|bracelet|earring|\mring\M|pendant|brooch|cufflink|charm)' then 'Jewelry'
        when lower(coalesce(item_name,'')) ~ '(\mwatch\M|chronograph)' then 'Watches'
        when lower(coalesce(item_name,'')) ~ '(shirt|tee|\mtop\M|trouser|pant|jean|jacket|coat|hoodie|sweater|knit|cardigan|dress|skirt|short|blazer|vest|parka|sweatshirt|jumper|polo|bodysuit|romper|overall)' then 'Clothing'
        when lower(coalesce(item_name,'')) ~ '(\mhat\M|\mcap\M|beanie|scarf|glove|belt|\msock\M|socks|tie\M|bandana|balaclava)' then 'Accessories'
        when product_url ~ '^https?://[^/]+/shoes/'       then 'Shoes'
        when product_url ~ '^https?://[^/]+/clothing/'    then 'Clothing'
        when product_url ~ '^https?://[^/]+/bags/'        then 'Bags'
        when product_url ~ '^https?://[^/]+/jewelry/'     then 'Jewelry'
        when product_url ~ '^https?://[^/]+/watches/'     then 'Watches'
        when product_url ~ '^https?://[^/]+/accessories/' then 'Accessories'
        else 'Other'
    end;
$$;

-- Drop the manufacturer part code some listings lead with.
--
-- "Lw40002f 53mm Sunglasses" is the frame's part number, not its name. The strip
-- is deliberately narrow -- two or three letters followed by FOUR or more digits
-- -- because shorter codes are real model names people search for: Mr530, Ct300
-- and Tf100 are products, not noise, and a blanket rule ate those too.
--
-- If removing the code leaves nothing but a measurement ("52mm"), the category
-- finishes the name rather than shipping a bare number.
create or replace function public.clean_item_name(item_name text, product_url text)
returns text
language sql
immutable
set search_path to ''
as $$
    select case
        when coalesce(item_name,'') !~ '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s' then item_name
        when regexp_replace(item_name, '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s+', '') ~ '[A-Za-z]{3,}'
            then regexp_replace(item_name, '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s+', '')
        when public.item_category(item_name, product_url) = 'Eyewear'
            then regexp_replace(item_name, '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s+', '') || ' Sunglasses'
        when public.item_category(item_name, product_url) <> 'Other'
            then regexp_replace(item_name, '^[A-Za-z]{2,3}[0-9]{4,}[a-z]?\s+', '')
                 || ' ' || public.item_category(item_name, product_url)
        else item_name
    end;
$$;

-- Category is derived at read time, not stored.
--
-- It was briefly a STORED generated column, which is a trap: Postgres computes
-- those at write time and does not recompute when the function behind them is
-- replaced, so refining the classifier left every row holding what the old
-- definition said -- or NULL. An expression index gives the same lookup speed
-- and cannot go stale.
create index if not exists brand_catalog_brand_category_idx
    on public.brand_catalog (brand_slug, public.item_category(name, product_url));

-- brand_items now says what kind of thing each listing is, and shows the name
-- with any manufacturer part code taken off the front.
drop view if exists public.brand_items;

create view public.brand_items
with (security_invoker = true) as
select
    f.brand_slug,
    f.brand_name,
    f.item_name                                        as name,
    f.price,
    f.image_url,
    f.purchase_link                                    as product_url,
    f.post_id,
    true                                               as is_tagged,
    f.created_at                                       as sort_at,
    public.item_category(f.item_name, f.purchase_link) as category
from public.brand_feed f
where f.image_url is not null

union all

select
    c.brand_slug,
    c.brand_name,
    public.clean_item_name(c.name, c.product_url),
    c.price,
    c.image_url,
    c.product_url,
    null::uuid,
    false,
    c.fetched_at,
    public.item_category(c.name, c.product_url)
from public.brand_catalog c
where c.is_active and c.image_url is not null

union all

-- The same catalogue under a brand's other spellings.
select
    alias.slug,
    alias.name,
    public.clean_item_name(c.name, c.product_url),
    c.price,
    c.image_url,
    c.product_url,
    null::uuid,
    false,
    c.fetched_at,
    public.item_category(c.name, c.product_url)
from public.brand_catalog c
join public.brands alias on alias.canonical_slug = c.brand_slug
where c.is_active and c.image_url is not null;

grant select on public.brand_items to anon, authenticated, service_role;
