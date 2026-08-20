-- Brand pages proxied a live sneaker API for "<brand> clothing", which is both the
-- wrong catalogue for apparel and a single upstream away from showing nothing. The
-- brands people tag on their own posts are the best inventory this app has, and
-- nothing was aggregating them.
--
-- Items with no brand stay untagged. Somebody who includes a piece without saying
-- where it is from is correctly recorded as 'Unknown'; brand_feed simply skips
-- those rather than guessing.

create table if not exists public.brands (
    slug          text primary key,
    name          text not null,
    -- A brand with a real presence here (claimed, partnered, or curated in) as
    -- opposed to one that exists only because somebody tagged it.
    is_onboarded  boolean not null default false,
    -- 'directory' = seeded from a reference list, 'user_tag' = learned from a post.
    source        text not null default 'user_tag',
    logo_url      text,
    site_url      text,
    post_count    integer not null default 0,
    first_seen_at timestamptz not null default now(),
    last_tagged_at timestamptz
);

create index if not exists brands_name_lower_idx on public.brands (lower(name));
create index if not exists brands_onboarded_idx on public.brands (is_onboarded) where is_onboarded;

alter table public.brands enable row level security;

drop policy if exists "Brands are readable by everyone" on public.brands;
create policy "Brands are readable by everyone"
    on public.brands for select using (true);
-- No client write policy: brands are derived server-side from tagged posts.

-- Stable key from a display name. Kept in SQL so the trigger and any seeding
-- script cannot disagree about what "Jean Paul Gaultier" collapses to.
create or replace function public.brand_slug(display_name text)
returns text
language sql
immutable
set search_path to ''
as $$
    select nullif(
        trim(both '-' from
            regexp_replace(lower(trim(coalesce(display_name, ''))), '[^a-z0-9]+', '-', 'g')
        ), ''
    );
$$;

-- "More from <brand>": every tagged item across every post, newest first. A view
-- rather than a table so it can never drift from the posts it describes.
create or replace view public.brand_feed as
select
    public.brand_slug(i->>'brand')          as brand_slug,
    i->>'brand'                             as brand_name,
    p.id                                    as post_id,
    p.user_id,
    p.created_at,
    nullif(i->>'name', 'Item')              as item_name,
    i->>'image_url'                         as image_url,
    nullif(i->>'purchase_link', '')         as purchase_link,
    nullif(i->>'price', '')::numeric        as price
from public.posts p
cross join lateral jsonb_array_elements(p.items) i
where coalesce(i->>'brand', '') not in ('', 'Unknown')
  and public.brand_slug(i->>'brand') is not null;

-- Learn brands as they are tagged. Runs on the post rather than the client so a
-- brand cannot be registered without a real post behind it.
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
            -- Keep the display name the directory gave us if there is one.
            name = CASE WHEN brands.source = 'directory' THEN brands.name ELSE EXCLUDED.name END;
    RETURN NEW;
END;
$function$;

drop trigger if exists on_post_register_brands on public.posts;
create trigger on_post_register_brands
    after insert on public.posts
    for each row execute function public.register_tagged_brands();

-- Backfill from posts that already exist.
insert into public.brands (slug, name, source, post_count, last_tagged_at)
select brand_slug, min(brand_name), 'user_tag', count(distinct post_id), max(created_at)
from public.brand_feed
group by brand_slug
on conflict (slug) do nothing;
