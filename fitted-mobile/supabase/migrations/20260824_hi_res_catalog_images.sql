-- Ask retailer CDNs for a real photo instead of a list thumbnail.
--
-- Both sources hand out grid-sized images and the crawler stored whatever the
-- listing page asked for:
--   * the aggregator puts dimensions in the path -- 300x375, 200x250, 100x100;
--   * the marketplace sizes by query string and asks for w=140&h=75&q=60.
--
-- Either is fine in a search grid and mush once it fills a polaroid. The
-- marketplace one was worse than low-res: forcing h alongside w squashed the
-- shot to a 1.87 aspect against a near-square frame, so the sides -- the back
-- half of a shoe -- were cropped clean off.
--
-- Verified against the live CDNs before running: the aggregator serves only a
-- fixed set of sizes (800/1000 returns 403, 1040/1300 works), and dropping h on
-- the marketplace URL lets the photo keep its own proportions.
create or replace function public.hi_res_image_url(url text)
returns text
language sql
immutable
set search_path to ''
as $$
    select case
        when url is null then null
        when url like '%images.stockx.com%'
            then split_part(url, '?', 1) || '?fit=fill&bg=FFFFFF&w=1000&q=90'
        when url ~ 'lystit\.com/[0-9]+/[0-9]+/'
            then regexp_replace(url, 'lystit\.com/[0-9]+/[0-9]+/', 'lystit.com/1040/1300/')
        else url
    end;
$$;

update public.brand_catalog
set image_url = public.hi_res_image_url(image_url)
where image_url is not null
  and public.hi_res_image_url(image_url) is distinct from image_url;

-- A piece already saved into somebody's wardrobe carries its own copy of the
-- URL, so it keeps the thumbnail unless rewritten here too. This is the row that
-- actually renders on the build-fit canvas.
update public.wardrobe_assets
set url = public.hi_res_image_url(url)
where url is not null
  and public.hi_res_image_url(url) is distinct from url;
