-- Serialize reservations for one owner before checking the quota. The API's
-- early count remains useful feedback, but this trigger is authoritative across
-- concurrent requests and independent server instances.
create function public.enforce_tender_reservation_limit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tender-reservation:' || new.owner_id::text, 0));
  if (select count(*) from public.tenders where owner_id = new.owner_id) >= 25 then
    raise sqlstate 'PT429' using message = 'Tender reservation limit reached';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_tender_reservation_limit() from public, anon, authenticated;
grant execute on function public.enforce_tender_reservation_limit() to service_role;

create trigger enforce_tender_reservation_limit
before insert on public.tenders
for each row execute function public.enforce_tender_reservation_limit();
