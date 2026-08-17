-- ============================================================
-- ACCOUNT DELETION  (Apple Guideline 5.1.1(v): in-app account deletion)
-- Run in the Supabase SQL Editor / applied via migration. Idempotent.
--
-- Most child tables cascade from public.users, so deleting the users row removes
-- them automatically. Two FKs use NO ACTION and would otherwise BLOCK the delete
-- (products.seller_id, dressing_room_items.user_id) — clear those first. The
-- auth.users row is removed separately by the delete-account edge function via
-- the admin API (there is no longer an FK from public.users -> auth.users).
--
-- Service-role only: the delete-account edge function calls this with the
-- service key after verifying the caller's JWT.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_account_data(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Conversations use a UUID array rather than a foreign key. Delete them
    -- explicitly so the other participant is not left with an orphaned thread;
    -- messages and styling sessions cascade from the conversation.
    DELETE FROM conversations WHERE p_user_id = ANY (participant_ids);

    -- Non-cascading FKs (would block the users delete):
    DELETE FROM products WHERE seller_id = p_user_id;
    DELETE FROM dressing_room_items WHERE user_id = p_user_id;

    -- Support messages can contain personal information and should not be
    -- retained merely because their FK is SET NULL.
    DELETE FROM support_requests WHERE user_id = p_user_id;

    -- login_sessions references auth.users (that FK may have been dropped) — clear it.
    DELETE FROM login_sessions WHERE user_id = p_user_id;

    -- Everything else (posts, likes, comments, messages, follows, wardrobe,
    -- notifications, drafts, cart_items, styling_sessions, private_users,
    -- reports, blocked_users, ...) cascades from the users row.
    DELETE FROM users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_account_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_account_data(UUID) FROM anon;
REVOKE ALL ON FUNCTION delete_account_data(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_account_data(UUID) TO service_role;
