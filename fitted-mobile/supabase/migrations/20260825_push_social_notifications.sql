-- Likes, comments and follows never reached anybody's phone.
--
-- The function is called push_order_notification and it lived up to the name:
-- its first statement returned early for any type outside commerce and
-- messages, so a like wrote an Activity row and stopped there. Someone
-- watching their phone after being liked saw nothing and reasonably concluded
-- notifications were broken.
--
-- Renaming it is left alone deliberately -- the trigger references it by name
-- and a rename is not worth the risk here -- but it now covers the social types
-- the app actually creates.
--
-- Note the trigger is AFTER INSERT only. Liking a post a second time updates
-- the existing row rather than inserting, so a repeat like is deliberately
-- quiet instead of buzzing somebody's phone twice for the same fit.
create or replace function public.push_order_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    actor_name text; title text; body text; rec record;
begin
    if NEW.type not in (
        'order_sold','order_shipped','message','session_booked','session_delivered',
        'like','comment','follow'
    ) then
        return NEW;
    end if;

    -- Never notify somebody about their own action. The clients already check
    -- this before inserting, but a push is the kind of thing that should not
    -- depend on every caller remembering.
    if NEW.actor_id is not null and NEW.actor_id = NEW.user_id then
        return NEW;
    end if;

    select coalesce(handle, username, 'Someone') into actor_name from public.users where id = NEW.actor_id;
    actor_name := coalesce(actor_name, 'Someone');

    if NEW.type = 'order_sold' then
        title := 'New sale';
        body := actor_name || ' bought from you' || case when NEW.content is not null then ' - $' || NEW.content else '' end;
    elsif NEW.type = 'order_shipped' then
        title := 'Order shipped';
        body := actor_name || ' shipped your order';
    elsif NEW.type = 'message' then
        title := actor_name;
        body := coalesce(NEW.content, 'Sent you a message');
    elsif NEW.type = 'session_booked' then
        title := 'Styling session booked';
        body := actor_name || ' booked a ' || coalesce(NEW.content, '60') || ' min session with you';
    elsif NEW.type = 'like' then
        title := 'emode';
        body := actor_name || ' liked your fit';
    elsif NEW.type = 'comment' then
        title := actor_name;
        body := coalesce(NEW.content, 'Commented on your fit');
    elsif NEW.type = 'follow' then
        title := 'emode';
        body := actor_name || ' followed you';
    else
        title := 'Your look is ready';
        body := actor_name || ' delivered your styling session';
    end if;

    for rec in select token from public.push_tokens where user_id = NEW.user_id loop
        perform net.http_post(
            url := 'https://exp.host/--/api/v2/push/send',
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object('to', rec.token, 'title', title, 'body', body,
                                       'sound', 'default',
                                       'data', jsonb_build_object('type', NEW.type, 'post_id', NEW.post_id))
        );
    end loop;

    return NEW;
end;
$function$;
