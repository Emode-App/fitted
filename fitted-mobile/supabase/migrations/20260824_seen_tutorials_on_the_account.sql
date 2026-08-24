-- Which one-time tutorials this account has already been through.
--
-- This lived only in AsyncStorage, and every attempt to keep it there failed a
-- different way: first a bare key that sign-out deliberately wiped, then one
-- slotted per account -- and people still reported the tour on every sign-in.
--
-- Device storage is the wrong home for a fact about an account. It cannot be
-- inspected from the server, so "fixed now" is a claim nobody can check, and it
-- dies on reinstall or a second phone regardless. Same shape as the fix for
-- onboarding replaying, which stopped once the answer moved to
-- users.onboarded_at.
alter table public.user_settings
    add column if not exists seen_tutorials text[] not null default '{}';

comment on column public.user_settings.seen_tutorials is
    'Keys of one-time tutorials this account has dismissed. Server-owned so it survives sign-out, reinstall and a change of device.';

-- Record one, without a read-modify-write from the client.
create or replace function public.mark_tutorial_seen(tutorial_key text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
    insert into public.user_settings (user_id, seen_tutorials)
    values (auth.uid(), array[tutorial_key])
    on conflict (user_id) do update
    set seen_tutorials = (
            select array_agg(distinct k)
            from unnest(public.user_settings.seen_tutorials || excluded.seen_tutorials) k
        ),
        updated_at = now();
$$;

grant execute on function public.mark_tutorial_seen(text) to authenticated;

-- Existing accounts have sat through these repeatedly while the flag kept being
-- lost. Do not make them do it again.
insert into public.user_settings (user_id, seen_tutorials)
select u.id, array['has_seen_canvas_tutorial','has_seen_ai_tryon_tutorial','has_seen_marketplace_tutorial']
from public.users u
on conflict (user_id) do update
set seen_tutorials = (
        select array_agg(distinct k)
        from unnest(public.user_settings.seen_tutorials || excluded.seen_tutorials) k
    ),
    updated_at = now();
