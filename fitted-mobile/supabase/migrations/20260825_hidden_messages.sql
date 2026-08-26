-- "Delete for me" is not a delete.
--
-- Unsending removes the row for both people, which is why only the sender may
-- do it. Hiding is a private act: it has to work on somebody else's message,
-- must not change what they see, and should survive a reinstall -- so it is a
-- row of its own rather than a flag on the message or a note kept on the phone.
create table if not exists public.hidden_messages (
    user_id uuid not null references public.users(id) on delete cascade,
    message_id uuid not null references public.messages(id) on delete cascade,
    hidden_at timestamptz not null default now(),
    primary key (user_id, message_id)
);

create index if not exists hidden_messages_user_idx
    on public.hidden_messages (user_id);

alter table public.hidden_messages enable row level security;

-- Nobody reads anybody else's hidden list. Which messages a person chose to
-- hide is itself worth keeping private.
create policy "Own hidden list is readable"
    on public.hidden_messages for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Hide a message for yourself"
    on public.hidden_messages for insert
    to authenticated
    with check (
        auth.uid() = user_id
        -- Only within a conversation you are in, so this cannot be used to
        -- probe whether arbitrary message ids exist.
        and exists (
            select 1
            from public.messages m
            join public.conversations c on c.id = m.conversation_id
            where m.id = message_id
              and auth.uid() = any (c.participant_ids)
        )
    );

create policy "Unhide your own"
    on public.hidden_messages for delete
    to authenticated
    using (auth.uid() = user_id);
