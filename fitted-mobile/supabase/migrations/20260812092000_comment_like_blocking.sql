DROP POLICY IF EXISTS "Users can view all comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can insert own likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON public.comment_likes;

CREATE POLICY "Comment likes visible unless blocked" ON public.comment_likes
FOR SELECT TO anon, authenticated
USING (NOT public.is_blocked_between((SELECT auth.uid()), user_id));

CREATE POLICY "Users can like comments when unblocked" ON public.comment_likes
FOR INSERT TO authenticated
WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
        SELECT 1 FROM public.comments c
        WHERE c.id = comment_id
          AND NOT public.is_blocked_between((SELECT auth.uid()), c.user_id)
    )
);

CREATE POLICY "Users can remove own comment likes" ON public.comment_likes
FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);

GRANT SELECT ON public.comment_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.comment_likes TO authenticated;
