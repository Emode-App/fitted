-- What a receipt says about the card, and nothing more.
--
-- Brand and last four are what every receipt prints and what a buyer needs to
-- recognise their own payment. They are not card data in the sensitive sense:
-- no number, no expiry, no CVC, nothing that could be used to charge anything.
-- Those stay with Stripe, which is the only place they belong.
--
-- Written by the webhook from the charge, never sent up by the app. A client
-- that could name its own payment method could name somebody else's.
alter table public.orders
    add column if not exists card_brand text,
    add column if not exists card_last4 text;

comment on column public.orders.card_brand is
    'visa | mastercard | amex | ... as Stripe reports it. Display only.';
comment on column public.orders.card_last4 is
    'Last four digits, for recognising a payment on a receipt. Never a full number.';
