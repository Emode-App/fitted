-- Give the starter folders their slugs.
--
-- wardrobe_folders.slug was added NOT NULL when the wardrobe gained a server
-- copy (20260820_wardrobe_server_sync.sql), and this trigger -- which predates
-- it -- was never updated. It fires AFTER INSERT on public.users, inside the
-- same transaction as the auth signup, so EVERY account creation since has
-- failed on the not-null constraint and surfaced to the user as the opaque
-- "Database error saving new user".
--
-- The slugs match what the client's default folders already use (last_used,
-- shirts, ...) and what every existing account holds. They are the key the sync
-- joins on, so inventing new ones here would hand returning users a second set
-- of empty folders.
create or replace function public.create_default_wardrobe()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
BEGIN
    INSERT INTO wardrobe_folders (user_id, slug, name, is_default, position) VALUES
        (NEW.id, 'last_used',   'Last Used',   TRUE,  0),
        (NEW.id, 'shirts',      'Shirts',      FALSE, 1),
        (NEW.id, 'jackets',     'Jackets',     FALSE, 2),
        (NEW.id, 'pants',       'Pants',       FALSE, 3),
        (NEW.id, 'shoes',       'Shoes',       FALSE, 4),
        (NEW.id, 'accessories', 'Accessories', FALSE, 5)
    ON CONFLICT (user_id, slug) DO NOTHING;
    RETURN NEW;
END;
$$;
