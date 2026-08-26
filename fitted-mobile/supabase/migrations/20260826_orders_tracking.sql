-- Enough to reach the carrier's own tracking page, and no more.
--
-- Not a delivery-tracking system: the app does not poll a carrier, hold scan
-- history, or know where a parcel is. The seller writes down who is carrying it
-- and the number on the label, and the buyer gets a link out to the people who
-- actually know. That saves the seller answering "where is it" without the app
-- pretending to information it has not got.
--
-- No new policies needed. Sellers already hold UPDATE on their own orders and
-- both parties already hold SELECT, so writing a number and reading it back are
-- covered by the rules that were there.
alter table public.orders
    add column if not exists tracking_carrier text,
    add column if not exists tracking_number text,
    add column if not exists shipped_at timestamptz;

comment on column public.orders.tracking_carrier is
    'usps | ups | fedex | dhl | other. Chooses which tracking URL to build.';
comment on column public.orders.tracking_number is
    'As printed on the label. Never validated against the carrier.';
