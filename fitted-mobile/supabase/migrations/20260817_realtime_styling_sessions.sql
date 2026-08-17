-- Real-time 1:1 styling sessions.
--
-- Apple App Review Guideline 3.1.3(d) permits collecting payment outside of
-- in-app purchase only for "real-time person-to-person services between two
-- individuals". The asynchronous deliver-whenever flow this table originally
-- served does not qualify, so a session now has an explicit live window that
-- both participants occupy. Everything that decides money -- the rate, the
-- platform fee, the split, and every status transition -- is server-owned.

-- ---------------------------------------------------------------------------
-- Stylist rate bounds
-- ---------------------------------------------------------------------------

-- `users.rate` already exists but is free text (a display string like "$100/hr"),
-- so it cannot be trusted for money. Sessions price off a dedicated integer-cents
-- column instead, which also matches the unit Stripe charges in.
alter table public.users
    add column if not exists styling_rate_cents integer,
    add column if not exists rate_currency text not null default 'usd';

-- Bounded so a compromised client cannot advertise a rate that would clear a
-- card for an absurd amount. $5–$500 per session.
alter table public.users
    drop constraint if exists users_styling_rate_bounds;
alter table public.users
    add constraint users_styling_rate_bounds
    check (styling_rate_cents is null or (styling_rate_cents >= 500 and styling_rate_cents <= 50000));

-- ---------------------------------------------------------------------------
-- Session table
-- ---------------------------------------------------------------------------

alter table public.styling_sessions
    add column if not exists duration_minutes integer not null default 60,
    add column if not exists starts_at timestamptz,
    add column if not exists ends_at timestamptz,
    add column if not exists delivered_at timestamptz,
    add column if not exists cancelled_at timestamptz,
    add column if not exists cancel_reason text,
    add column if not exists platform_fee numeric(10,2),
    add column if not exists stylist_amount numeric(10,2),
    add column if not exists delivery_message_id uuid,
    add column if not exists currency text not null default 'usd';

-- The legacy shape hung a session off the payment-request message that created
-- it. Sessions are now booked directly, so that link is optional.
alter table public.styling_sessions alter column message_id drop not null;

alter table public.styling_sessions
    drop constraint if exists styling_sessions_status_check;
alter table public.styling_sessions
    add constraint styling_sessions_status_check
    check (status in (
        'pending_payment',  -- created, awaiting card authorization
        'scheduled',        -- funds authorized, not yet started
        'active',           -- live window open, both participants present
        'delivered',        -- stylist delivered inside the window
        'completed',        -- funds captured and split
        'cancelled',        -- released before capture
        'expired'           -- window closed with no delivery; authorization released
    ));

create unique index if not exists styling_sessions_payment_intent_key
    on public.styling_sessions (stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

-- One live booking per pair at a time.
create unique index if not exists styling_sessions_one_open_per_pair
    on public.styling_sessions (stylist_id, client_id)
    where status in ('pending_payment', 'scheduled', 'active', 'delivered');

create index if not exists styling_sessions_client_idx
    on public.styling_sessions (client_id, created_at desc);
create index if not exists styling_sessions_stylist_idx
    on public.styling_sessions (stylist_id, created_at desc);
create index if not exists styling_sessions_expiry_idx
    on public.styling_sessions (ends_at)
    where status = 'active';

-- ---------------------------------------------------------------------------
-- RLS: participants read their own sessions. All writes are service-role only.
-- ---------------------------------------------------------------------------

alter table public.styling_sessions enable row level security;

drop policy if exists styling_sessions_select on public.styling_sessions;
create policy styling_sessions_select on public.styling_sessions
    for select to authenticated
    using ((select auth.uid()) in (stylist_id, client_id));

revoke insert, update, delete on public.styling_sessions from authenticated, anon;
grant select on public.styling_sessions to authenticated;
grant all on public.styling_sessions to service_role;

-- Reject any client-side write that slips past the grants.
create or replace function public.block_client_styling_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if (select auth.role()) is distinct from 'service_role' then
        raise exception 'styling sessions are managed server-side';
    end if;
    return new;
end;
$$;

drop trigger if exists block_client_styling_writes on public.styling_sessions;
create trigger block_client_styling_writes
    before insert or update or delete on public.styling_sessions
    for each row execute function public.block_client_styling_writes();

-- ---------------------------------------------------------------------------
-- Booking: the amount comes from the stylist's stored rate, never the client.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_styling_session(
    p_client_id uuid,
    p_stylist_id uuid,
    p_conversation_id uuid,
    p_duration_minutes integer,
    p_fee_percent numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_cents integer;
    v_currency text;
    v_fee integer;
    v_net integer;
    v_session_id uuid;
begin
    if p_client_id = p_stylist_id then
        raise exception 'cannot_book_self';
    end if;

    select styling_rate_cents, coalesce(rate_currency, 'usd')
      into v_cents, v_currency
      from public.users
     where id = p_stylist_id and is_verified_stylist = true;

    if v_cents is null then
        raise exception 'stylist_unavailable';
    end if;

    if exists (
        select 1 from public.blocked_users
        where (blocker_id = p_stylist_id and blocked_id = p_client_id)
           or (blocker_id = p_client_id and blocked_id = p_stylist_id)
    ) then
        raise exception 'stylist_unavailable';
    end if;

    if exists (
        select 1 from public.styling_sessions
        where stylist_id = p_stylist_id and client_id = p_client_id
          and status in ('pending_payment', 'scheduled', 'active', 'delivered')
    ) then
        raise exception 'session_already_open';
    end if;

    -- Integer cents throughout; the fee rounds in the platform's favour only to
    -- the nearest cent, and the stylist takes the remainder so the two always
    -- sum back to exactly what the client was charged.
    v_fee := round(v_cents * (p_fee_percent / 100.0));
    v_net := v_cents - v_fee;

    insert into public.styling_sessions (
        stylist_id, client_id, conversation_id, amount, currency,
        duration_minutes, platform_fee, stylist_amount, status
    ) values (
        p_stylist_id, p_client_id, p_conversation_id, v_cents / 100.0, v_currency,
        greatest(15, least(180, coalesce(p_duration_minutes, 60))),
        v_fee / 100.0, v_net / 100.0, 'pending_payment'
    ) returning id into v_session_id;

    return jsonb_build_object(
        'session_id', v_session_id,
        'amount_cents', v_cents,
        'currency', v_currency,
        'platform_fee_cents', v_fee,
        'stylist_amount_cents', v_net
    );
end;
$$;

revoke all on function public.reserve_styling_session(uuid, uuid, uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_styling_session(uuid, uuid, uuid, integer, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Expiry sweep: a window that closes without a delivery releases the hold.
-- The edge function cancels the PaymentIntent; this only marks the rows.
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_styling_sessions()
returns setof public.styling_sessions
language sql security definer set search_path = '' as $$
    update public.styling_sessions
       set status = 'expired',
           cancelled_at = now(),
           cancel_reason = 'window_closed_without_delivery'
     where status = 'active'
       and ends_at is not null
       and ends_at < now()
    returning *;
$$;

revoke all on function public.expire_stale_styling_sessions() from public, anon, authenticated;
grant execute on function public.expire_stale_styling_sessions() to service_role;
