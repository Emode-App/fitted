-- Unread message counts, and the privilege needed to keep them.
--
-- messages.is_read has existed since the table was created and nothing has ever
-- written to it. Every row in the database is false, including messages both
-- people have plainly read and replied to. So it was not a read flag, it was a
-- column named like one. The tab bar had no unread badge either, while a
-- comment in activity.tsx asserted that it did -- which is how a feature that
-- was never built survives being looked at.
--
-- Marking a message read is an update performed by the *recipient*, not the
-- author, and the existing policy does allow that. It allows rather more:
-- "Users can update messages in their conversations" has no WITH CHECK, so
-- Postgres reuses the USING clause as the check, and a participant may rewrite
-- any column of any message in the thread -- including the text of what the
-- other person said. Nothing in the app does this, but nothing stops it either.
--
-- RLS cannot restrict columns, so the privilege layer does it instead: the
-- client roles lose UPDATE on the table and get it back on is_read alone. This
-- is the same shape as portfolio_column_grants. service_role is deliberately
-- untouched, because revoke-ai-consent clears shared_face_url as an admin.

-- Nothing has ever set this, but the column is nullable and a null would fall
-- outside both `is_read = false` and `is_read = true`, so an unread message
-- could go uncounted. Give it a floor before relying on it.
update public.messages set is_read = false where is_read is null;

alter table public.messages alter column is_read set default false;
alter table public.messages alter column is_read set not null;

-- Counting one person's unread messages in one thread. Partial, because once
-- the app actually marks messages read the overwhelming majority of rows are
-- read and none of them belong in this index.
create index if not exists messages_unread_idx
    on public.messages (conversation_id, sender_id)
    where is_read = false;

revoke update on public.messages from authenticated, anon;
grant update (is_read) on public.messages to authenticated;

-- anon is not granted anything back. Every policy on this table is written
-- against auth.uid(), which is null for anon, so a signed-out client could
-- never have satisfied them -- but a grant that only RLS makes harmless is
-- worth removing while we are here.
