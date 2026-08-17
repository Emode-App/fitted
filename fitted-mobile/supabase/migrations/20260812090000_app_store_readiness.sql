-- App Store readiness: signup reliability, privacy consent, moderation,
-- entitlement integrity, notification preferences, and RLS hardening.

-- ---------------------------------------------------------------------------
-- Private account metadata and trustworthy entitlement flags
-- ---------------------------------------------------------------------------

ALTER TABLE public.private_users
    ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
    ADD COLUMN IF NOT EXISTS terms_version text;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS has_pro_tryons boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_user_entitlement_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        IF NEW.is_verified_stylist = TRUE AND OLD.is_verified_stylist IS DISTINCT FROM TRUE THEN
            NEW.is_verified_stylist := OLD.is_verified_stylist;
        END IF;
        IF NEW.is_business_account = TRUE AND OLD.is_business_account IS DISTINCT FROM TRUE THEN
            NEW.is_business_account := OLD.is_business_account;
        END IF;
        IF NEW.has_pro_tryons IS DISTINCT FROM OLD.has_pro_tryons THEN
            NEW.has_pro_tryons := OLD.has_pro_tryons;
        END IF;
        IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
           AND NEW.subscription_status <> 'none' THEN
            NEW.subscription_status := OLD.subscription_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_entitlement_columns() FROM PUBLIC, anon, authenticated;

-- The previous trigger referenced public.users.email, which no longer exists.
-- Create the public and private rows from auth metadata even when email
-- confirmation means the mobile client has no session yet.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    requested_username text;
    safe_username text;
    safe_handle text;
BEGIN
    requested_username := trim(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), ''));
    safe_username := left(nullif(requested_username, ''), 30);
    IF safe_username IS NULL THEN
        safe_username := 'user_' || left(NEW.id::text, 8);
    END IF;

    safe_handle := lower(regexp_replace(safe_username, '[^a-zA-Z0-9_.]', '', 'g'));
    IF safe_handle = '' THEN
        safe_handle := 'user_' || left(NEW.id::text, 8);
    END IF;
    safe_handle := '@' || left(safe_handle, 24);

    IF EXISTS (SELECT 1 FROM public.users WHERE lower(handle) = lower(safe_handle)) THEN
        safe_handle := left(safe_handle, 17) || '_' || left(NEW.id::text, 6);
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE lower(username) = lower(safe_username)) THEN
        safe_username := left(safe_username, 23) || '_' || left(NEW.id::text, 6);
    END IF;

    INSERT INTO public.users (id, username, handle, bio, location, avatar_url)
    VALUES (
        NEW.id,
        safe_username,
        safe_handle,
        '',
        '',
        'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.private_users (id, email, terms_accepted_at, terms_version)
    VALUES (
        NEW.id,
        NEW.email,
        CASE WHEN (NEW.raw_user_meta_data->>'terms_accepted')::boolean IS TRUE THEN now() ELSE NULL END,
        nullif(NEW.raw_user_meta_data->>'terms_version', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        terms_accepted_at = coalesce(public.private_users.terms_accepted_at, EXCLUDED.terms_accepted_at),
        terms_version = coalesce(public.private_users.terms_version, EXCLUDED.terms_version);

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- User-controlled preferences and consent
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    notification_preferences jsonb NOT NULL DEFAULT '{"likes":true,"comments":true,"follows":true,"orders":true}'::jsonb,
    ai_face_consent_at timestamptz,
    ai_face_consent_version text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_preferences_object CHECK (jsonb_typeof(notification_preferences) = 'object')
);

INSERT INTO public.user_settings (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_user_settings_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_settings ON public.users;
CREATE TRIGGER on_user_created_settings
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_settings_row();
REVOKE ALL ON FUNCTION public.create_user_settings_row() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can read settings" ON public.user_settings;
DROP POLICY IF EXISTS "Owners can update settings" ON public.user_settings;
CREATE POLICY "Owners can read settings" ON public.user_settings
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners can update settings" ON public.user_settings
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT, UPDATE ON public.user_settings TO authenticated;
REVOKE ALL ON public.user_settings FROM anon;

-- ---------------------------------------------------------------------------
-- Operational queues: support, external deletion, moderation, AI accounting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    email text,
    category text NOT NULL DEFAULT 'support',
    subject text NOT NULL,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_subject_length CHECK (char_length(subject) BETWEEN 3 AND 120),
    CONSTRAINT support_message_length CHECK (char_length(message) BETWEEN 10 AND 5000)
);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can create support requests" ON public.support_requests;
DROP POLICY IF EXISTS "Users can read own support requests" ON public.support_requests;
CREATE POLICY "Users can create support requests" ON public.support_requests
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can read own support requests" ON public.support_requests
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT ON public.support_requests TO authenticated;
REVOKE ALL ON public.support_requests FROM anon;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    note text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT deletion_email_length CHECK (char_length(email) BETWEEN 3 AND 320),
    CONSTRAINT deletion_note_length CHECK (note IS NULL OR char_length(note) <= 2000)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_pending_per_email
    ON public.account_deletion_requests (lower(email)) WHERE status IN ('pending', 'verified');
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM anon, authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
    target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    reason text,
    actor text NOT NULL DEFAULT 'moderation-team',
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_actions FROM anon, authenticated;
GRANT ALL ON public.moderation_actions TO service_role;

CREATE TABLE IF NOT EXISTS public.moderation_terms (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    pattern text NOT NULL UNIQUE,
    category text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_terms FROM anon, authenticated;
GRANT ALL ON public.moderation_terms TO service_role;

INSERT INTO public.moderation_terms (pattern, category) VALUES
    ('\\mchild[[:space:]-]*(porn|sexual[[:space:]]+abuse)\\M', 'child_safety'),
    ('\\m(go[[:space:]]+)?kill[[:space:]]+yourself\\M', 'self_harm_harassment'),
    ('\\mcredible[[:space:]]+death[[:space:]]+threat\\M', 'violent_threat')
ON CONFLICT (pattern) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_ugc_text_allowed(value text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT value IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.moderation_terms t
        WHERE t.is_active AND value ~* t.pattern
    );
$$;
REVOKE ALL ON FUNCTION public.is_ugc_text_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ugc_text_allowed(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_ugc_text_safety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    candidate text;
BEGIN
    candidate := CASE TG_TABLE_NAME
        WHEN 'comments' THEN NEW.text
        WHEN 'messages' THEN NEW.text
        WHEN 'posts' THEN NEW.caption
        WHEN 'products' THEN concat_ws(' ', NEW.name, NEW.description)
        WHEN 'users' THEN concat_ws(' ', NEW.username, NEW.handle, NEW.bio)
        ELSE NULL
    END;
    IF NOT public.is_ugc_text_allowed(candidate) THEN
        RAISE EXCEPTION 'Content violates the community guidelines' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_ugc_text_safety() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['comments','messages','posts','products','users'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS enforce_ugc_text_safety ON public.%I', table_name);
        EXECUTE format('CREATE TRIGGER enforce_ugc_text_safety BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_ugc_text_safety()', table_name);
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'google-gemini',
    model text NOT NULL,
    status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'blocked')),
    used_face_photo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generations_user_created_idx ON public.generations (user_id, created_at DESC);
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own generation usage" ON public.generations;
CREATE POLICY "Users can read own generation usage" ON public.generations
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.generations TO authenticated;
REVOKE ALL ON public.generations FROM anon;
GRANT ALL ON public.generations TO service_role;

-- Reports are intake-only from clients. Review data and status are service-only.
DROP POLICY IF EXISTS "Users can file reports" ON public.reports;
CREATE POLICY "Users can file reports" ON public.reports
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = reporter_id
        AND content_type IN ('post', 'comment', 'user', 'message', 'ai_generation', 'product')
        AND char_length(coalesce(reason, '')) <= 1000
    );
GRANT INSERT ON public.reports TO authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.reports FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS reports_duplicate_pending_idx
    ON public.reports (reporter_id, content_type, coalesce(content_id, ''), coalesce(reported_user_id::text, ''))
    WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Blocking must be reciprocal and enforced by Postgres, not just feed filters
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS blocked_users_blocked_id_idx ON public.blocked_users (blocked_id);

CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN user_a IS NULL OR user_b IS NULL THEN false
        ELSE EXISTS (
            SELECT 1 FROM public.blocked_users b
            WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
               OR (b.blocker_id = user_b AND b.blocked_id = user_a)
        )
    END;
$$;
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
CREATE POLICY "Profiles visible unless blocked" ON public.users
    FOR SELECT TO anon, authenticated
    USING (NOT public.is_blocked_between((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
CREATE POLICY "Posts visible unless blocked" ON public.posts
    FOR SELECT TO anon, authenticated
    USING (NOT public.is_blocked_between((SELECT auth.uid()), user_id));

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments visible unless blocked" ON public.comments
    FOR SELECT TO anon, authenticated
    USING (NOT public.is_blocked_between((SELECT auth.uid()), user_id));
DROP POLICY IF EXISTS "Users can create comments" ON public.comments;
CREATE POLICY "Users can comment when unblocked" ON public.comments
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = post_id
              AND NOT public.is_blocked_between((SELECT auth.uid()), p.user_id)
        )
    );

DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
CREATE POLICY "Follows visible unless blocked" ON public.follows
    FOR SELECT TO anon, authenticated
    USING (
        NOT public.is_blocked_between((SELECT auth.uid()), follower_id)
        AND NOT public.is_blocked_between((SELECT auth.uid()), following_id)
    );
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow when unblocked" ON public.follows
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = follower_id
        AND follower_id <> following_id
        AND NOT public.is_blocked_between(follower_id, following_id)
    );

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes visible unless blocked" ON public.likes
    FOR SELECT TO anon, authenticated
    USING (NOT public.is_blocked_between((SELECT auth.uid()), user_id));
DROP POLICY IF EXISTS "Users can like posts" ON public.likes;
CREATE POLICY "Users can like posts when unblocked" ON public.likes
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = post_id
              AND NOT public.is_blocked_between((SELECT auth.uid()), p.user_id)
        )
    );

DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create unblocked conversations" ON public.conversations
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = ANY (participant_ids)
        AND array_length(participant_ids, 1) = 2
        AND participant_ids[1] <> participant_ids[2]
        AND NOT public.is_blocked_between(participant_ids[1], participant_ids[2])
    );
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
CREATE POLICY "Users can view unblocked conversations" ON public.conversations
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = ANY (participant_ids)
        AND NOT public.is_blocked_between(participant_ids[1], participant_ids[2])
    );

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages in unblocked conversations" ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = sender_id
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND (SELECT auth.uid()) = ANY (c.participant_ids)
              AND NOT public.is_blocked_between(c.participant_ids[1], c.participant_ids[2])
        )
    );

DROP POLICY IF EXISTS "Public products are viewable by everyone" ON public.products;
CREATE POLICY "Active products visible unless blocked" ON public.products
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND NOT public.is_blocked_between((SELECT auth.uid()), seller_id));

DROP POLICY IF EXISTS "Users can block" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can unblock" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can view own blocks" ON public.blocked_users;
CREATE POLICY "Users can view own blocks" ON public.blocked_users
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = blocker_id);
CREATE POLICY "Users can block" ON public.blocked_users
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = blocker_id AND blocker_id <> blocked_id);
CREATE POLICY "Users can unblock" ON public.blocked_users
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = blocker_id);

-- Blocking immediately removes follows in both directions.
CREATE OR REPLACE FUNCTION public.remove_relationships_after_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.follows
    WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
       OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS remove_relationships_after_block ON public.blocked_users;
CREATE TRIGGER remove_relationships_after_block
AFTER INSERT ON public.blocked_users
FOR EACH ROW EXECUTE FUNCTION public.remove_relationships_after_block();
REVOKE ALL ON FUNCTION public.remove_relationships_after_block() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage ownership and private face-derived output
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
WHERE id IN ('avatars','posts','products','private-media');

DROP POLICY IF EXISTS "Allow authenticated uploads to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to avatars" ON storage.objects;
CREATE POLICY "Owners upload avatars" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Owners update avatars" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Owners delete avatars" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Users can upload posts" ON storage.objects;
CREATE POLICY "Owners upload post media" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'posts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "Users can delete own posts" ON storage.objects;
CREATE POLICY "Owners delete post media" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Generated images readable by owner" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'generated'
        AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    );
CREATE POLICY "Generated images writable by owner" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'generated'
        AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    );
CREATE POLICY "Generated images deletable by owner" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'generated'
        AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    );

-- ---------------------------------------------------------------------------
-- Notification preference enforcement and function hardening
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Actors can select their own triggered notifications" ON public.notifications;
DROP POLICY IF EXISTS "Actors can update their own triggered notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;

CREATE OR REPLACE FUNCTION public.allows_notification(recipient uuid, notification_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((
        SELECT CASE notification_type
            WHEN 'like' THEN (notification_preferences->>'likes')::boolean
            WHEN 'comment' THEN (notification_preferences->>'comments')::boolean
            WHEN 'follow' THEN (notification_preferences->>'follows')::boolean
            WHEN 'order_sold' THEN (notification_preferences->>'orders')::boolean
            WHEN 'order_shipped' THEN (notification_preferences->>'orders')::boolean
            ELSE true
        END
        FROM public.user_settings WHERE user_id = recipient
    ), true);
$$;
REVOKE ALL ON FUNCTION public.allows_notification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allows_notification(uuid, text) TO authenticated;

CREATE POLICY "Users can create verified social notifications" ON public.notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = actor_id
        AND public.allows_notification(user_id, type)
        AND (
            (type = 'follow' AND EXISTS (
                SELECT 1 FROM public.follows f
                WHERE f.follower_id = actor_id AND f.following_id = user_id
            ))
            OR
            (type = 'like' AND post_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.likes l
                JOIN public.posts p ON p.id = l.post_id
                WHERE l.user_id = actor_id AND l.post_id = notifications.post_id AND p.user_id = notifications.user_id
            ))
            OR
            (type = 'comment' AND comment_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.comments c
                JOIN public.posts p ON p.id = c.post_id
                WHERE c.id = notifications.comment_id AND c.user_id = actor_id AND p.user_id = notifications.user_id
            ))
        )
    );

CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    v_amount text := to_char(NEW.subtotal_amount / 100.0, 'FM999990.00');
    recipient uuid;
    actor uuid;
    notification_type text;
BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
        recipient := NEW.seller_id; actor := NEW.buyer_id; notification_type := 'order_sold';
    ELSIF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled' THEN
        recipient := NEW.buyer_id; actor := NEW.seller_id; notification_type := 'order_shipped';
    ELSE
        RETURN NEW;
    END IF;

    IF recipient IS NOT NULL AND actor IS NOT NULL AND coalesce((
        SELECT (notification_preferences->>'orders')::boolean
        FROM public.user_settings WHERE user_id = recipient
    ), true) THEN
        INSERT INTO public.notifications (user_id, actor_id, type, content, is_read, created_at)
        VALUES (recipient, actor, notification_type, v_amount, false, now());
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_order_status_change() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.protect_order_columns() SET search_path = 'public', 'pg_temp';
ALTER FUNCTION public.push_order_notification() SET search_path = 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.protect_order_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_order_notification() FROM PUBLIC, anon, authenticated;

-- Sensitive idempotency/rate-limit state is never exposed through Data API roles.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE ALL ON public.stripe_events FROM anon, authenticated;
GRANT ALL ON public.rate_limits, public.stripe_events TO service_role;
