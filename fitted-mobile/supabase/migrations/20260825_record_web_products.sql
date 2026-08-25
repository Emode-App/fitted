-- Web search results are kept, not thrown away.
--
-- Every search asked the model again from scratch, and a grounded model does
-- not return the same set twice: "Leather Ramones Sneakers, $548" turned up in
-- one search and was simply gone from the next. Nothing was wrong with the
-- entry -- it had never been written down, so there was nowhere for it to come
-- back from.
--
-- Storing what a search verifies makes the catalogue grow rather than reroll.
-- The second search for a term answers instantly from these rows, and the web
-- pass behind it adds whatever is new.
create or replace function public.record_web_products(items jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    written integer;
begin
    -- One search returns the same product URL more than once -- different
    -- sellers, or the model simply repeating itself -- and Postgres refuses to
    -- update one row twice in a statement: "ON CONFLICT DO UPDATE command
    -- cannot affect row a second time". That error failed the entire write, so
    -- nothing was recorded at all and the catalogue stayed empty.
    --
    -- Collapsing the batch first turns a duplicate into an improvement: where a
    -- URL repeats, the copy carrying a price and an image wins.
    with candidates as (
        select
            regexp_replace(lower(btrim(item->>'brand')), '[^a-z0-9]+', '-', 'g') as brand_slug,
            btrim(item->>'brand')    as brand_name,
            btrim(item->>'name')     as name,
            nullif(item->>'price', '')::numeric as price,
            nullif(btrim(item->>'imageUrl'), '')  as image_url,
            btrim(item->>'productUrl') as product_url
        from jsonb_array_elements(items) as item
        where coalesce(btrim(item->>'brand'), '') <> ''
          and coalesce(btrim(item->>'name'), '') <> ''
          and coalesce(btrim(item->>'productUrl'), '') <> ''
          and coalesce(btrim(item->>'imageUrl'), '') <> ''
    ),
    deduped as (
        select distinct on (product_url) *
        from candidates
        order by product_url, (price is null), (image_url is null), length(name) desc
    )
    insert into public.brand_catalog
        (brand_slug, brand_name, name, price, image_url, product_url, source, is_active, fetched_at)
    select brand_slug, brand_name, name, price, image_url, product_url, 'web-search', true, now()
    from deduped
    on conflict (product_url) do update set
        -- coalesce, never assign. A later search that could not read a price
        -- off the page must not erase the one an earlier search did read --
        -- that is how the catalogue went backwards the last time rows were
        -- refreshed in place.
        price      = coalesce(excluded.price, public.brand_catalog.price),
        image_url  = coalesce(excluded.image_url, public.brand_catalog.image_url),
        name       = coalesce(nullif(excluded.name, ''), public.brand_catalog.name),
        is_active  = true,
        fetched_at = now();

    get diagnostics written = row_count;
    return written;
end;
$$;

revoke all on function public.record_web_products(jsonb) from public, anon, authenticated;
