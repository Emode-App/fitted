-- Clear what has already been paid for before fetching more.
--
-- 2,753 catalogue rows exist with no image, and brand_items only shows rows that
-- have one -- so they are invisible despite having already cost a crawl. Jordan
-- alone was 283 rows with 96 showing. Crawling further only manufactures more of
-- them.
--
-- Sources with hidden rows sort first now, so a run spends its Firecrawl budget
-- making paid-for items visible rather than discovering new ones. Once a brand
-- has nothing parked it falls back into the normal staleness order and resumes
-- crawling, so this drains the backlog rather than starving discovery. The
-- budget itself is unchanged: an index run is roughly four scrapes plus eight
-- image lookups, a recovery run is twelve lookups and no index.
drop view if exists public.brand_seed_queue;

create view public.brand_seed_queue
with (security_invoker = true) as
select
    bs.brand_slug,
    bs.source,
    bs.source_slug,
    bs.product_slug_prefix,
    bs.page_cursor,
    bs.synced_at,
    bs.is_enabled,
    b.name                    as brand_name,
    coalesce(b.post_count, 0) as post_count,
    coalesce(parked.n, 0)     as parked_count,
    case
        -- A tagged brand with hidden items is the worst case: somebody may be
        -- looking at that brand page now, with half of it missing.
        when coalesce(b.post_count, 0) > 0 and coalesce(parked.n, 0) > 0 then 0
        when coalesce(parked.n, 0) > 0                                   then 1
        when coalesce(b.post_count, 0) > 0
         and (bs.synced_at is null or bs.synced_at < now() - interval '12 hours') then 2
        else 3
    end as priority
from public.brand_sources bs
join public.brands b on b.slug = bs.brand_slug
left join lateral (
    select count(*) as n
    from public.brand_catalog c
    where c.brand_slug = bs.brand_slug
      and c.source = bs.source
      and c.image_url is null
) parked on true;

grant select on public.brand_seed_queue to service_role;
