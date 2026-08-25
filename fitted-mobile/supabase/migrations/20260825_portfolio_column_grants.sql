-- An RLS policy says which rows, never which columns.
--
-- "Clients decide on their own likeness" checks only that the row is theirs,
-- which left a client able to rewrite stylist_id and hang a look on somebody
-- who never made it, or edit the image URLs on a row a stylist is showing. The
-- client needs exactly one column: the answer.
revoke update on public.portfolio_items from authenticated;
grant update (status) on public.portfolio_items to authenticated;

-- Which means the timestamps are stamped here rather than sent, since the
-- client can no longer write them.
create or replace function public.stamp_portfolio_decision()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
    if NEW.status is distinct from OLD.status then
        if NEW.status = 'approved' then
            NEW.approved_at := now();
            NEW.revoked_at := null;
        elsif NEW.status = 'revoked' then
            NEW.revoked_at := now();
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists stamp_portfolio_decision on public.portfolio_items;
create trigger stamp_portfolio_decision
    before update on public.portfolio_items
    for each row execute function public.stamp_portfolio_decision();
