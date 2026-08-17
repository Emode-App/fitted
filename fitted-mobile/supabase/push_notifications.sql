-- ============================================================
-- PUSH NOTIFICATIONS
-- Run in the Supabase SQL Editor / applied via migration. Idempotent.
--
-- Stores Expo push tokens per device and, whenever an order notification row is
-- created, fans out an Expo push to the recipient's devices using pg_net (async
-- HTTP from Postgres). The Expo push endpoint needs no API key.
-- ============================================================

-- Async HTTP from Postgres.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- One row per device token. Re-registering on a different account reassigns the
-- token (token is the primary key), so a device only ever pushes to its current user.
CREATE TABLE IF NOT EXISTS push_tokens (
    token      TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform   TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own push tokens" ON push_tokens;
CREATE POLICY "Users can read own push tokens" ON push_tokens
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can register push tokens" ON push_tokens;
CREATE POLICY "Users can register push tokens" ON push_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push tokens" ON push_tokens;
CREATE POLICY "Users can update own push tokens" ON push_tokens
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push tokens" ON push_tokens;
CREATE POLICY "Users can delete own push tokens" ON push_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- On a new order notification, push to the recipient's devices.
CREATE OR REPLACE FUNCTION push_order_notification()
RETURNS TRIGGER AS $$
DECLARE
    actor_name TEXT;
    title TEXT;
    body TEXT;
    rec RECORD;
BEGIN
    IF NEW.type NOT IN ('order_sold', 'order_shipped') THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(handle, username, 'Someone') INTO actor_name FROM users WHERE id = NEW.actor_id;

    IF NEW.type = 'order_sold' THEN
        title := 'New sale 🛍️';
        body := coalesce(actor_name, 'Someone') || ' bought from you'
                || CASE WHEN NEW.content IS NOT NULL THEN ' · $' || NEW.content ELSE '' END;
    ELSE
        title := 'Order shipped 📦';
        body := coalesce(actor_name, 'Someone') || ' shipped your order';
    END IF;

    FOR rec IN SELECT token FROM push_tokens WHERE user_id = NEW.user_id LOOP
        PERFORM net.http_post(
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
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS push_on_notification ON notifications;
CREATE TRIGGER push_on_notification
    AFTER INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION push_order_notification();
