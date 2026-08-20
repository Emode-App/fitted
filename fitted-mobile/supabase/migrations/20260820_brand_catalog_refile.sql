-- A designer index also carries recommendation, recently-viewed and "you may also
-- like" tiles for OTHER labels. The crawler trusted the page it was on, so those
-- were filed under the brand being crawled: 42 Dries Van Noten, 33 Bao Bao Issey
-- Miyake and 19 Rick Owens pieces all sitting under Loewe.
--
-- The product's own URL is /product/<brand>/<name-slug>/<id>, which states whose
-- it is regardless of where it was listed. The parser now keys on that, and this
-- repairs everything already written.

-- Title-case a URL name slug. The retailer has already normalised the product
-- name there, with the brand in its own segment — a far better source than the
-- rendered label, where adjacent spans get concatenated into
-- "Rick OwensGray Tower Felt Cashmere".
create or replace function public.title_from_slug(slug text)
returns text
language sql
immutable
set search_path to ''
as $$
    select nullif(btrim(string_agg(
        case when length(w) <= 2 then upper(w)
             else upper(left(w, 1)) || substr(w, 2) end, ' ' order by ord)), '')
    from unnest(string_to_array(coalesce(slug, ''), '-')) with ordinality as t(w, ord)
    where w <> '';
$$;

-- Re-file rather than delete: the listings are real, they were just misattributed,
-- and their true brands are ones this app now has catalogues for.
update public.brand_catalog c
set brand_slug = b.slug,
    brand_name = b.name
from public.brands b
where b.catalog_slug = substring(c.product_url from '/product/([a-z0-9-]+)/')
  and c.brand_slug <> b.slug;

update public.brand_catalog
set name = public.title_from_slug(substring(product_url from '/product/[a-z0-9-]+/([a-z0-9-]+)/'))
where public.title_from_slug(substring(product_url from '/product/[a-z0-9-]+/([a-z0-9-]+)/')) is not null;

-- A row whose true brand is not in the registry cannot appear on any brand page,
-- so it is retired rather than left mislabelled.
update public.brand_catalog c
set is_active = false
where not exists (
    select 1 from public.brands b
    where b.catalog_slug = substring(c.product_url from '/product/([a-z0-9-]+)/')
);
