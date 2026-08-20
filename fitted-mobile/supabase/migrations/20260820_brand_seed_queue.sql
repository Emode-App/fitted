-- What the catalogue crawler should work on next.
--
-- The crawler picked its job by staleness alone across every directory brand.
-- Nearly all ~1,100 of them have never been tagged by anyone, so the whole
-- Firecrawl budget went to labels nobody had posted while a brand someone
-- actually wore waited weeks -- and that catalogue is exactly what the
-- "More from (brand)" section reads from.
--
-- Tagged brands jump the queue, but only once they are genuinely stale. A plain
-- "tagged first" sort starves the directory: 12 tagged sources against 1,107
-- total means that once those 12 are the freshest rows they win every run
-- forever and nothing else ever builds a catalogue. Bounding the jump to brands
-- not refreshed in the last 12 hours keeps worn brands current and still leaves
-- most runs for the long tail.

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
    case
        when coalesce(b.post_count, 0) > 0
         and (bs.synced_at is null or bs.synced_at < now() - interval '12 hours')
        then 0
        else 1
    end as priority
from public.brand_sources bs
join public.brands b on b.slug = bs.brand_slug;

grant select on public.brand_seed_queue to service_role;

-- Firecrawl answered 429 to most requests at the old every-4-minutes cadence
-- (~4,300 calls a day), and a rate-limited page used to be indistinguishable
-- from an empty one, so the crawl skipped pages it had never read.
select cron.alter_job(
    (select jobid from cron.job where jobname = 'brand-catalog-seed'),
    schedule => '7,37 * * * *'
);
