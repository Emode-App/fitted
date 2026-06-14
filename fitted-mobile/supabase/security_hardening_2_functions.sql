-- ============================================================
-- SECURITY HARDENING (part 2): lock down the SECURITY DEFINER functions
-- introduced in security_hardening.sql.
--   * Pin search_path to '' (functions fully-qualify every reference) so a
--     malicious object in a user-controlled schema can't be resolved instead.
--   * Revoke direct EXECUTE from clients (these are trigger functions; the
--     trigger still fires regardless, but nobody should be able to CALL them).
-- Idempotent: safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_user_entitlement_columns()
RETURNS TRIGGER
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
        IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
           AND NEW.subscription_status <> 'none' THEN
            NEW.subscription_status := OLD.subscription_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_message_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        NEW.sender_id        := OLD.sender_id;
        NEW.conversation_id  := OLD.conversation_id;
        NEW.text             := OLD.text;
        NEW.image_url        := OLD.image_url;
        NEW.shared_face_url  := OLD.shared_face_url;
        NEW.styling_delivery := OLD.styling_delivery;
        NEW.created_at       := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_private_user_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.private_users (id, email)
    VALUES (NEW.id, (SELECT email FROM auth.users WHERE id = NEW.id))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_user_entitlement_columns() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_message_columns()          FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_private_user_row()          FROM public, anon, authenticated;
