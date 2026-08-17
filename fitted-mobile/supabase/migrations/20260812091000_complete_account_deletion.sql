CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
    DELETE FROM public.conversations WHERE p_user_id = ANY (participant_ids);
    DELETE FROM public.products WHERE seller_id = p_user_id;
    DELETE FROM public.dressing_room_items WHERE user_id = p_user_id;
    DELETE FROM public.support_requests WHERE user_id = p_user_id;
    DELETE FROM public.login_sessions WHERE user_id = p_user_id;
    DELETE FROM public.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
