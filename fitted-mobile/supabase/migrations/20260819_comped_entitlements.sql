-- sync-entitlement runs as service_role and unconditionally writes the paid flags
-- from whatever RevenueCat reports, so any manually granted entitlement is erased
-- the next time the app calls it. That made the stylist flow untestable without a
-- real purchase, and left App Review unable to exercise it at all.
alter table public.users
    add column if not exists comped_entitlements text[] not null default '{}';

comment on column public.users.comped_entitlements is
    'Entitlement keys granted outside RevenueCat (staff, App Review, comps). Honoured by sync-entitlement; service_role writes only.';

create or replace function public.protect_user_entitlement_columns()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND coalesce(current_setting('app.entitlement_write', true), '') <> 'on' THEN
        -- Entitlement columns are server-owned in BOTH directions. Only blocking
        -- escalation let a stray client update silently revoke a live entitlement.
        NEW.is_verified_stylist := OLD.is_verified_stylist;
        NEW.is_business_account := OLD.is_business_account;
        NEW.has_pro_tryons      := OLD.has_pro_tryons;
        NEW.comped_entitlements := OLD.comped_entitlements;

        IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
            NEW.subscription_status := OLD.subscription_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- Pinning those columns against every non-service_role writer also locks out admin
-- SQL, which has no JWT and so never looks like service_role. Granting a comp needs
-- one sanctioned door rather than ad-hoc trigger disabling.
create or replace function public.set_comped_entitlements(
    target_user uuid,
    entitlement_keys text[]
)
returns table (id uuid, username text, is_verified_stylist boolean, comped_entitlements text[])
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
    PERFORM set_config('app.entitlement_write', 'on', true);

    UPDATE users u
    SET comped_entitlements = coalesce(entitlement_keys, '{}'),
        is_verified_stylist = ('verified_stylist' = ANY (coalesce(entitlement_keys, '{}'))) OR u.is_verified_stylist,
        is_business_account = ('business_account' = ANY (coalesce(entitlement_keys, '{}'))) OR u.is_business_account,
        has_pro_tryons      = ('pro_tryons'       = ANY (coalesce(entitlement_keys, '{}'))) OR u.has_pro_tryons,
        subscription_status = CASE
            WHEN coalesce(array_length(entitlement_keys, 1), 0) > 0 THEN 'active'
            ELSE u.subscription_status
        END
    WHERE u.id = target_user;

    PERFORM set_config('app.entitlement_write', 'off', true);

    RETURN QUERY
    SELECT u.id, u.username, u.is_verified_stylist, u.comped_entitlements
    FROM users u WHERE u.id = target_user;
END;
$function$;

revoke all on function public.set_comped_entitlements(uuid, text[]) from public, anon, authenticated;

comment on function public.set_comped_entitlements(uuid, text[]) is
    'Admin/service-role only. Grants entitlements outside RevenueCat; honoured by sync-entitlement.';
