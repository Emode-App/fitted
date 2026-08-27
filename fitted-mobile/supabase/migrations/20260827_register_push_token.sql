-- Letting a device token change hands when the person using the phone changes.
--
-- push_tokens maps one Expo token to exactly one user, and the client upserted
-- into it directly with on conflict (token). That works right up until a second
-- account signs in on the same phone: the existing row still belongs to the
-- first account, so the UPDATE arm of the upsert is checked against the UPDATE
-- policy's USING clause, auth.uid() <> user_id, and Postgres refuses with
--
--     new row violates row-level security policy (USING expression)
--
-- which is what the app has been logging on every launch. The row then stays
-- pointed at whoever registered first -- which is also why messages sent to one
-- account were arriving on a phone signed into another. Same cause, two
-- symptoms, and the visible one was the wrong one to chase.
--
-- Loosening the UPDATE policy to USING (true) would fix it and open something
-- worse: anyone holding a token string could point it at themselves and have
-- their notifications delivered to a stranger's lock screen. So the reassignment
-- happens here instead, where the function decides the user_id rather than
-- accepting one. The caller cannot name a user; it only offers a token.

create or replace function public.register_push_token(
    p_token text,
    p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- security definer runs as the owner, so this is the only thing standing
    -- between an anonymous caller and someone else's row. It is not optional.
    if auth.uid() is null then
        raise exception 'not authenticated' using errcode = '42501';
    end if;

    if p_token is null or length(trim(p_token)) = 0 then
        raise exception 'a push token is required' using errcode = '22023';
    end if;

    insert into public.push_tokens as t (token, user_id, platform, updated_at)
    values (p_token, auth.uid(), p_platform, now())
    on conflict (token) do update
        set user_id    = excluded.user_id,
            -- Keep the platform we already know if this caller did not say.
            platform   = coalesce(excluded.platform, t.platform),
            updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

comment on function public.register_push_token(text, text) is
    'Claims a device push token for the calling user, taking it over from a '
    'previous signed-in account on the same device. The user_id comes from '
    'auth.uid() and is never accepted from the caller.';
