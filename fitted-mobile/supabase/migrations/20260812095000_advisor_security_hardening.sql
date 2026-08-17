-- Keep security-definer helpers out of the exposed API schema. They remain
-- callable from RLS policies and triggers, but cannot be invoked via /rpc.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

ALTER FUNCTION public.allows_notification(uuid, text) SET SCHEMA private;
ALTER FUNCTION public.is_blocked_between(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_ugc_text_allowed(text) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.allows_notification(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_blocked_between(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_ugc_text_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.allows_notification(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_blocked_between(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_ugc_text_allowed(text) TO anon, authenticated, service_role;

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
    IF NOT private.is_ugc_text_allowed(candidate) THEN
        RAISE EXCEPTION 'Content violates the community guidelines' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_ugc_text_safety() FROM PUBLIC, anon, authenticated;

-- Explicit deny policies document that these are service-only queues and
-- prevent the RLS-without-policy advisor from obscuring real warnings.
CREATE POLICY "Service role only" ON public.account_deletion_requests FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Service role only" ON public.moderation_actions FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Service role only" ON public.moderation_terms FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Service role only" ON public.rate_limits FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Service role only" ON public.stripe_events FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
