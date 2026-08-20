-- Onboarding was gated purely on an AsyncStorage flag, so it re-ran whenever that
-- flag went away: reinstall, new device, or an account switch clearing the device
-- caches. Whether someone has been through onboarding is a fact about the account,
-- not about the phone, so it belongs on the row.
alter table public.users
    add column if not exists onboarded_at timestamptz;

comment on column public.users.onboarded_at is
    'When the account completed onboarding. Server-side gate; the device flag is only a cache.';

-- Everyone who already exists has been through it. Backfilling stops the fix from
-- itself becoming a reason to show onboarding one more time.
update public.users
set onboarded_at = coalesce(onboarded_at, created_at)
where onboarded_at is null;
