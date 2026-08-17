-- Fix: Replace CASE expression with IF/ELSIF so that NEW.<column> references
-- are only evaluated for the matching table.  A CASE expression evaluates all
-- branch expressions, which causes "record has no field" errors when the
-- trigger fires on a table that lacks columns referenced in other branches
-- (e.g. users has no "text" column, but comments/messages do).

CREATE OR REPLACE FUNCTION public.enforce_ugc_text_safety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    candidate text;
BEGIN
    IF TG_TABLE_NAME = 'comments' OR TG_TABLE_NAME = 'messages' THEN
        candidate := NEW.text;
    ELSIF TG_TABLE_NAME = 'posts' THEN
        candidate := NEW.caption;
    ELSIF TG_TABLE_NAME = 'products' THEN
        candidate := concat_ws(' ', NEW.name, NEW.description);
    ELSIF TG_TABLE_NAME = 'users' THEN
        candidate := concat_ws(' ', NEW.username, NEW.handle, NEW.bio);
    ELSE
        RETURN NEW;
    END IF;

    IF NOT private.is_ugc_text_allowed(candidate) THEN
        RAISE EXCEPTION 'Content violates the community guidelines' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_ugc_text_safety() FROM PUBLIC, anon, authenticated;
