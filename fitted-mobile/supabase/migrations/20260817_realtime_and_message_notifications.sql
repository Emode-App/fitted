-- Live communication for styling sessions.
--
-- Guideline 3.1.3(d) lets a styling session be paid for outside in-app purchase
-- only because it is a *real-time* person-to-person service. That claim was not
-- actually true: the Realtime publication was empty, so nothing streamed, and no
-- notification was ever raised for a direct message or a session transition. A
-- stylist could be booked, paid, and have a live window open without knowing.
--
-- This turns the thread into a live channel and reuses the existing push path
-- (notifications insert -> push_on_notification -> Expo) rather than adding a
-- second mechanism.

-- ---------------------------------------------------------------------------
-- 1. Stream messages and session state to subscribed clients.
--    Realtime honours RLS, so participants only ever receive their own rows.
-- ---------------------------------------------------------------------------

do $pub$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
        alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'styling_sessions'
    ) then
        alter publication supabase_realtime add table public.styling_sessions;
    end if;
end $pub$;

-- ---------------------------------------------------------------------------
-- 2. Allow the new notification types.
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
    check (type = any (array[
        'like', 'comment', 'follow',
        'order_sold', 'order_shipped',
        'message', 'session_booked', 'session_delivered'
    ]));

-- ---------------------------------------------------------------------------
-- 3. Honour per-category preferences for the new types. Unknown keys still
--    default to true, matching the existing behaviour.
-- ---------------------------------------------------------------------------

create or replace function private.allows_notification(recipient uuid, notification_type text)
returns boolean language sql stable security definer set search_path = '' as $fn$
    SELECT coalesce((
        SELECT CASE notification_type
            WHEN 'like' THEN (notification_preferences->>'likes')::boolean
            WHEN 'comment' THEN (notification_preferences->>'comments')::boolean
            WHEN 'follow' THEN (notification_preferences->>'follows')::boolean
            WHEN 'order_sold' THEN (notification_preferences->>'orders')::boolean
            WHEN 'order_shipped' THEN (notification_preferences->>'orders')::boolean
            WHEN 'message' THEN (notification_preferences->>'messages')::boolean
            WHEN 'session_booked' THEN (notification_preferences->>'styling')::boolean
            WHEN 'session_delivered' THEN (notification_preferences->>'styling')::boolean
            ELSE true
        END
        FROM public.user_settings WHERE user_id = recipient
    ), true);
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Raise a notification when a direct message arrives.
--    Blocking is checked here so a blocked sender cannot generate a push.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
    v_recipient uuid;
    v_preview text;
begin
    select p into v_recipient
      from public.conversations c, unnest(c.participant_ids) as p
     where c.id = NEW.conversation_id and p <> NEW.sender_id
     limit 1;

    if v_recipient is null then return NEW; end if;
    if private.is_blocked_between(NEW.sender_id, v_recipient) then return NEW; end if;
    if not private.allows_notification(v_recipient, 'message') then return NEW; end if;

    -- Private media never leaks into a push payload; a label goes to the lock
    -- screen instead of the content.
    v_preview := case
        when NEW.styling_delivery is not null then 'Sent you a styled look'
        when NEW.shared_face_url is not null then 'Shared a photo for your session'
        when NEW.image_url is not null then 'Sent a photo'
        else left(coalesce(NEW.text, ''), 120)
    end;

    insert into public.notifications (user_id, actor_id, type, content)
    values (v_recipient, NEW.sender_id, 'message', v_preview);

    return NEW;
end;
$fn$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message
    after insert on public.messages
    for each row execute function public.notify_on_message();

-- ---------------------------------------------------------------------------
-- 5. Raise a notification on the two session transitions the other party
--    cannot see coming: the booking, and the delivery.
--
--    'active' is deliberately not notified. Either participant may start the
--    window, we cannot tell which one did, and both are in the thread by then --
--    Realtime moves their session bar without a push.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_styling_session()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
    v_recipient uuid;
    v_actor uuid;
    v_type text;
    v_content text;
begin
    if NEW.status is not distinct from OLD.status then return NEW; end if;

    if NEW.status = 'scheduled' then
        v_type := 'session_booked';
        v_recipient := NEW.stylist_id;
        v_actor := NEW.client_id;
        v_content := NEW.duration_minutes::text;
    elsif NEW.status = 'completed' then
        v_type := 'session_delivered';
        v_recipient := NEW.client_id;
        v_actor := NEW.stylist_id;
        v_content := null;
    else
        return NEW;
    end if;

    if not private.allows_notification(v_recipient, v_type) then return NEW; end if;

    insert into public.notifications (user_id, actor_id, type, content)
    values (v_recipient, v_actor, v_type, v_content);

    return NEW;
end;
$fn$;

drop trigger if exists notify_on_styling_session on public.styling_sessions;
create trigger notify_on_styling_session
    after update on public.styling_sessions
    for each row execute function public.notify_on_styling_session();

-- ---------------------------------------------------------------------------
-- 6. Teach the push fan-out about the new types. The order cases are unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.push_order_notification()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
    actor_name text;
    title text;
    body text;
    rec record;
begin
    if NEW.type not in ('order_sold', 'order_shipped', 'message', 'session_booked', 'session_delivered') then
        return NEW;
    end if;

    select coalesce(handle, username, 'Someone') into actor_name
      from public.users where id = NEW.actor_id;
    actor_name := coalesce(actor_name, 'Someone');

    if NEW.type = 'order_sold' then
        title := 'New sale';
        body := actor_name || ' bought from you'
                || case when NEW.content is not null then ' - $' || NEW.content else '' end;
    elsif NEW.type = 'order_shipped' then
        title := 'Order shipped';
        body := actor_name || ' shipped your order';
    elsif NEW.type = 'message' then
        title := actor_name;
        body := coalesce(NEW.content, 'Sent you a message');
    elsif NEW.type = 'session_booked' then
        title := 'Styling session booked';
        body := actor_name || ' booked a ' || coalesce(NEW.content, '60') || ' min session with you';
    else
        title := 'Your look is ready';
        body := actor_name || ' delivered your styling session';
    end if;

    for rec in select token from public.push_tokens where user_id = NEW.user_id loop
        perform net.http_post(
            url := 'https://exp.host/--/api/v2/push/send',
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'to', rec.token,
                'title', title,
                'body', body,
                'sound', 'default',
                'data', jsonb_build_object('type', NEW.type)
            )
        );
    end loop;

    return NEW;
end;
$fn$;
