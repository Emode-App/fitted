-- Match every word of a query, wherever it falls in the name.
--
-- The app searched for the query as one contiguous string: "jordan 4 lightning"
-- became ilike '%jordan 4 lightning%'. Catalogue names carry the model in the
-- middle -- "Jordan 4 Retro Lightning" -- so the phrase never matched and search
-- reported nothing found for pieces sitting right there. Measured:
-- "jordan 4 lakers" matched 0 as a phrase and 1 by words.
--
-- Structure matters for speed. Filtering the brand_items view with
-- `ilike all (array)` cannot use an index -- the planner will not push a runtime
-- array of patterns through a three-way UNION into an expression index -- and
-- took 943ms. Searching the base table with the longest word as an indexable
-- anchor, then applying the rest to that reduced set, takes 69ms.
--
-- Ranking: pieces somebody here actually wore, then an exact phrase hit, then
-- shorter names (a plain "Jordan 4 Retro" beats a six-word collaboration), then
-- newest.
create index if not exists brand_catalog_search_text_trgm
    on public.brand_catalog
    using gin ((coalesce(brand_name, '') || ' ' || coalesce(public.clean_item_name(name, product_url), '')) gin_trgm_ops);

create or replace function public.search_brand_items(q text, max_rows integer default 144)
returns setof public.brand_items
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
    with words as (
        select array_agg(w) as all_words,
               (array_agg(w order by length(w) desc))[1] as anchor
        from unnest(regexp_split_to_array(lower(btrim(coalesce(q, ''))), '\s+')) as w
        where w <> ''
    ),
    patterns as (
        select anchor,
               (select array_agg('%' || w || '%') from unnest(all_words) w) as pats
        from words
    ),
    hits as (
        select c.brand_slug, c.brand_name,
               public.clean_item_name(c.name, c.product_url) as name,
               c.price, c.image_url, c.product_url,
               null::uuid as post_id, false as is_tagged, c.fetched_at as sort_at,
               public.item_category(c.name, c.product_url) as category
        from public.brand_catalog c, patterns p
        where c.is_active and c.image_url is not null
          and (coalesce(c.brand_name, '') || ' ' || coalesce(public.clean_item_name(c.name, c.product_url), ''))
              ilike '%' || p.anchor || '%'
          and (coalesce(c.brand_name, '') || ' ' || coalesce(public.clean_item_name(c.name, c.product_url), ''))
              ilike all (p.pats)

        union all

        select f.brand_slug, f.brand_name, f.item_name, f.price, f.image_url,
               f.purchase_link, f.post_id, true, f.created_at,
               public.item_category(f.item_name, f.purchase_link)
        from public.brand_feed f, patterns p
        where f.image_url is not null
          and (coalesce(f.brand_name, '') || ' ' || coalesce(f.item_name, '')) ilike all (p.pats)
    )
    select *
    from hits
    order by
        is_tagged desc,
        ((coalesce(brand_name, '') || ' ' || coalesce(name, '')) ilike '%' || btrim(q) || '%') desc,
        length(coalesce(name, '')) asc,
        sort_at desc
    limit greatest(1, coalesce(max_rows, 144));
$$;

grant execute on function public.search_brand_items(text, integer) to anon, authenticated, service_role;
