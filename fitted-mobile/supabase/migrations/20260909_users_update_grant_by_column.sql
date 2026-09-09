-- public.users carried a table-wide UPDATE grant to authenticated, and RLS
-- restricts that to your own row -- which is the whole problem. Your own row is
-- where has_pro_tryons, is_verified_boutique, is_verified_stylist and
-- subscription_status live, so any signed-in account could grant itself Pro, a
-- Business shop, or a verification badge with a single PATCH. The flags are
-- rewritten from the store on the next launch, which limits the damage but does
-- not close the door, and the badge columns are not rewritten at all.
--
-- It also meant last_active_at, added for presence, was writable by the very
-- people it makes claims about: "Active now" would have been a thing anyone
-- could assert about themselves at any time.
--
-- So the grant is narrowed to the columns the client legitimately writes --
-- every field on the edit-profile screen, onboarding, and the privacy toggle,
-- and nothing else. Verified against the client: the only entitlement write it
-- ever made was switching Business off, which now goes through
-- downgrade_business_account().

revoke update on public.users from authenticated, anon;

grant update (
    username,
    handle,
    bio,
    location,
    website,
    avatar_url,
    header_url,
    ai_face_url,
    socials,
    favorite_brand,
    favorite_song,
    rate,
    rate_currency,
    styling_rate_cents,
    show_activity_status,
    onboarded_at
) on public.users to authenticated;
