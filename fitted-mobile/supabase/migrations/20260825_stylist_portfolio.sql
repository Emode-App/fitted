-- A stylist's portfolio, made of other people's faces.
--
-- That is the whole design constraint. A look belongs to the client as much as
-- to the stylist, so nothing is visible on the strength of the stylist's
-- decision alone: a row starts as 'pending', shows to nobody but the two of
-- them, and the client can withdraw approval later without asking anyone.
--
-- See 20260825_portfolio_column_grants.sql for why the client's UPDATE is
-- narrowed to a single column -- a policy chooses rows, never columns.
create table if not exists public.portfolio_items (
    id uuid primary key default gen_random_uuid(),
    stylist_id uuid not null references public.users(id) on delete cascade,
    client_id uuid not null references public.users(id) on delete cascade,
    session_id uuid references public.styling_sessions(id) on delete set null,
    generated_image_url text,
    board_image_url text,
    title text,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'revoked')),
    display_order integer not null default 0,
    requested_at timestamptz not null default now(),
    approved_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    -- One request per session, so a stylist tapping twice cannot pester a
    -- client with duplicates of one look.
    unique (stylist_id, session_id)
);

create index if not exists portfolio_items_stylist_idx
    on public.portfolio_items (stylist_id, status, display_order);
create index if not exists portfolio_items_client_pending_idx
    on public.portfolio_items (client_id) where status = 'pending';

alter table public.portfolio_items enable row level security;

create policy "Approved portfolio items are public"
    on public.portfolio_items for select
    using (status = 'approved' or auth.uid() = stylist_id or auth.uid() = client_id);

-- Only about a session this stylist actually delivered for this client.
-- Without the exists() a stylist could attach any client to any look.
create policy "Stylists request their own delivered work"
    on public.portfolio_items for insert
    to authenticated
    with check (
        auth.uid() = stylist_id
        and status = 'pending'
        and exists (
            select 1 from public.styling_sessions s
            where s.id = session_id
              and s.stylist_id = auth.uid()
              and s.client_id = portfolio_items.client_id
              and s.status in ('delivered', 'completed')
        )
    );

-- Deliberately no stylist branch: letting the stylist update the row is what
-- would make the consent decorative.
create policy "Clients decide on their own likeness"
    on public.portfolio_items for update
    to authenticated
    using (auth.uid() = client_id)
    with check (auth.uid() = client_id);

create policy "Either party removes a portfolio item"
    on public.portfolio_items for delete
    to authenticated
    using (auth.uid() = client_id or auth.uid() = stylist_id);

-- Ordering is the stylist arranging what they were already permitted to show,
-- so it moves through a function rather than an UPDATE policy that would also
-- hand them the status column.
create or replace function public.set_portfolio_order(item_id uuid, new_order integer)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
    update public.portfolio_items
    set display_order = new_order
    where id = item_id and stylist_id = auth.uid() and status = 'approved';
$$;

revoke all on function public.set_portfolio_order(uuid, integer) from public, anon;
grant execute on function public.set_portfolio_order(uuid, integer) to authenticated;
