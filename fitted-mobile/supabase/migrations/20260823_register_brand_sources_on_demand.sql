-- Turn a directory entry into a crawl job, the moment somebody wants it.
--
-- The directory holds ~12,400 brands. Fanning all of them into brand_sources
-- would be two crawl jobs each against a schedule that does one job per run --
-- years of queue, most of it for labels nobody will ever post. So the directory
-- and the work queue are kept apart: a brand sits in `brands` costing nothing
-- until it is tagged or opened, and only then earns its rows here.
--
-- brand_seed_queue already sorts tagged brands ahead of the long tail, so a
-- brand registered this way is picked up on the next run rather than joining the
-- back of the line. That ordering is what makes registering late safe.

create or replace function public.ensure_brand_sources(target_slug text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    added integer := 0;
begin
    if target_slug is null then
        return 0;
    end if;

    insert into brand_sources (brand_slug, source, source_slug, is_enabled, page_cursor)
    select b.slug, s.source, s.source_slug, true, 1
    from brands b
    cross join lateral (values
        -- The aggregator's own slug, carried from the directory. Falls back to
        -- the brand key, which is right far more often than not.
        ('lyst',   coalesce(b.lyst_slug, b.slug)),
        -- The marketplace has no slug list to seed from; the brand key is the
        -- best guess, and product_slug_prefix is the fix when it guesses wrong.
        ('stockx', b.slug)
    ) as s(source, source_slug)
    where b.slug = target_slug
      and s.source_slug is not null
    on conflict (brand_slug, source) do nothing;

    get diagnostics added = row_count;
    return added;
end;
$$;

grant execute on function public.ensure_brand_sources(text) to authenticated, service_role;

-- Name-keyed entry point for the app.
--
-- The brand page knows a display name, not a slug. Slugging it client-side would
-- mean a second copy of brand_slug()'s rules in TypeScript, free to drift from
-- the one the trigger and every view use -- and a brand that slugs differently
-- on the two sides silently gets a crawl job nothing ever reads.
create or replace function public.ensure_brand_sources_by_name(brand_name text)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
    select public.ensure_brand_sources(public.brand_slug(brand_name));
$$;

grant execute on function public.ensure_brand_sources_by_name(text) to authenticated, service_role;

-- Tagging a brand on a post now also queues it for crawling.
create or replace function public.register_tagged_brands()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
            -- Keep the display name the directory gave us if there is one.
            name = CASE WHEN brands.source IN ('directory', 'lyst-directory')
                        THEN brands.name ELSE EXCLUDED.name END;

    -- A directory row whose retailer slug equals this row's slug is this brand
    -- under the retailer's spelling.
    UPDATE brands alias
    SET canonical_slug = owner.slug
    FROM brands owner
    WHERE owner.catalog_slug = alias.slug
      AND owner.slug <> alias.slug
      AND alias.canonical_slug IS NULL;

    -- Give every brand just tagged here a crawl job if it has none. This is the
    -- whole point of keeping the directory and the queue separate: the ~12,400
    -- untagged brands stay free, and the handful somebody actually wore start
    -- filling their "More from" section on the next scheduled run.
    PERFORM ensure_brand_sources(brand_slug(i->>'brand'))
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) i
    WHERE COALESCE(i->>'brand', '') NOT IN ('', 'Unknown')
      AND brand_slug(i->>'brand') IS NOT NULL;

    RETURN NEW;
END;
$$;