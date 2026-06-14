-- ============================================================
-- SECURITY HARDENING (part 3): residual advisor items + legacy media
-- Idempotent.
-- ============================================================

-- 1) Notification forgery: the remote INSERT policy used WITH CHECK (true), so
--    any authenticated user could create notifications for anyone, spoofing the
--    actor. Require the inserter to be the actor.
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for others" ON public.notifications;
CREATE POLICY "Users can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() = actor_id);

-- 2) Pin search_path on the remaining SECURITY DEFINER functions flagged by the
--    advisor (these reference public tables with unqualified names, so pin to
--    public rather than '' to keep them working).
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'update_post_likes_count',
              'create_default_wardrobe',
              'handle_new_user',
              'cleanup_old_login_sessions'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    END LOOP;
END $$;

-- 3) Legacy private media: clear any ai_face_url still pointing at a public (http)
--    URL so the app stops serving the old public face photos. Keepers re-upload
--    in the new build (goes to the private bucket). The storage object itself is
--    removed via the Storage API (see deploy notes) — direct DELETE on
--    storage.objects is blocked by Supabase.
UPDATE public.users
SET ai_face_url = NULL
WHERE ai_face_url LIKE 'http%';

-- 4) Revoke direct EXECUTE on the remaining SECURITY DEFINER trigger functions
--    (they still fire on their triggers; nobody should be able to CALL them).
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.proname IN (
              'update_post_likes_count', 'handle_new_user',
              'create_default_wardrobe', 'cleanup_old_login_sessions'
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', r.sig);
    END LOOP;
END $$;
