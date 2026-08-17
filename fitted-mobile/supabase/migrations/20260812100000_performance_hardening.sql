-- Cover every public-schema foreign key used for joins/cascades.
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON public.drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_dressing_room_items_product_id ON public.dressing_room_items (product_id);
CREATE INDEX IF NOT EXISTS idx_dressing_room_items_user_id ON public.dressing_room_items (user_id);
CREATE INDEX IF NOT EXISTS idx_dressing_room_outfits_user_id ON public.dressing_room_outfits (user_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON public.login_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_report_id ON public.moderation_actions (report_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_user_id ON public.moderation_actions (target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON public.notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON public.notifications (comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_post_id ON public.notifications (post_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON public.products (seller_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON public.reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_post_id ON public.saved_posts (post_id);
CREATE INDEX IF NOT EXISTS idx_styling_sessions_client_id ON public.styling_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_styling_sessions_conversation_id ON public.styling_sessions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_styling_sessions_message_id ON public.styling_sessions (message_id);
CREATE INDEX IF NOT EXISTS idx_styling_sessions_stylist_id ON public.styling_sessions (stylist_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_user_id ON public.support_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_assets_folder_id ON public.wardrobe_assets (folder_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_folders_user_id ON public.wardrobe_folders (user_id);

-- Rewrite only legacy policies that call auth.uid() directly. Evaluating it
-- through an init plan avoids one function call per candidate row.
DO $$
DECLARE
    policy_row record;
    new_qual text;
    new_check text;
    role_list text;
    statement text;
BEGIN
    FOR policy_row IN
        SELECT *
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              (coalesce(qual, '') ~ 'auth\.uid\(\)' AND coalesce(qual, '') !~ 'SELECT auth\.uid')
              OR (coalesce(with_check, '') ~ 'auth\.uid\(\)' AND coalesce(with_check, '') !~ 'SELECT auth\.uid')
          )
    LOOP
        new_qual := CASE WHEN policy_row.qual IS NULL THEN NULL
            ELSE regexp_replace(policy_row.qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g') END;
        new_check := CASE WHEN policy_row.with_check IS NULL THEN NULL
            ELSE regexp_replace(policy_row.with_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g') END;
        SELECT string_agg(quote_ident(role_name::text), ', ')
        INTO role_list
        FROM unnest(policy_row.roles) AS role_name;

        EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
        statement := format(
            'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename,
            policy_row.permissive,
            policy_row.cmd,
            role_list
        );
        IF new_qual IS NOT NULL THEN statement := statement || ' USING (' || new_qual || ')'; END IF;
        IF new_check IS NOT NULL THEN statement := statement || ' WITH CHECK (' || new_check || ')'; END IF;
        EXECUTE statement;
    END LOOP;
END;
$$;
