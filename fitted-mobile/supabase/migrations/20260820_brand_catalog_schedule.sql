-- Walk the whole brand directory on a schedule.
--
-- seed-brand-catalog does one brand per invocation: an edge function is killed at
-- 150s idle and a scrape is seconds each, so batching ten brands times out and
-- writes nothing. It takes the stalest brand and stamps catalog_synced_at whether
-- or not it found anything, so the queue always advances rather than parking on a
-- brand whose page has gone.
--
-- Every 4 minutes clears roughly 360 brands a day, so the directory refreshes
-- about every day and a half — often enough for prices to mean something without
-- hammering the source or the credit budget.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The shared secret lives in the vault, not inlined into cron.job, whose command
-- column is readable by anyone who can read the schedule.
create or replace function public.run_brand_catalog_seed()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'pg_temp'
as $function$
DECLARE
    seed_secret text;
BEGIN
    SELECT decrypted_secret INTO seed_secret
    FROM vault.decrypted_secrets WHERE name = 'catalog_seed_secret';

    IF seed_secret IS NULL THEN
        RAISE WARNING 'catalog_seed_secret is not in the vault; skipping';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := 'https://scvvbjheyfnxlsiiozta.supabase.co/functions/v1/seed-brand-catalog',
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-seed-secret', seed_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
    );
END;
$function$;

revoke all on function public.run_brand_catalog_seed() from public, anon, authenticated;

select cron.unschedule('brand-catalog-seed')
where exists (select 1 from cron.job where jobname = 'brand-catalog-seed');

select cron.schedule('brand-catalog-seed', '*/4 * * * *', $$select public.run_brand_catalog_seed()$$);
