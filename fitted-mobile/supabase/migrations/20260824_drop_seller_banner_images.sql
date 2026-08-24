-- Throw out shop banners that were saved as product photos.
--
-- The aggregator serves two kinds of image. Retailer photos live under
-- /photos/<retailer>/ with a descriptive filename naming the brand and garment.
-- Reseller listings instead carry /lyst_photos/<date>/<numeric id>, and for a
-- marketplace seller that is frequently their SHOP BANNER rather than the item --
-- which is how a Rick Owens bomber came to be represented by a "World Class
-- Fashion" logo, and a scarf by a "philosophy" wordmark.
--
-- The giveaway is reuse: 49 rows were sharing 4 images between them. A photo of
-- one product does not appear on four other products.
update public.brand_catalog
set image_url = null, is_active = false
where image_url like '%/lyst_photos/%';

-- The same test, host-agnostic, for whatever the next source does. An image on
-- four or more differently-named products is not a photo of any of them.
with shared as (
    select image_url
    from public.brand_catalog
    where image_url is not null
    group by image_url
    having count(distinct name) >= 4
)
update public.brand_catalog c
set image_url = null, is_active = false
from shared
where c.image_url = shared.image_url;
