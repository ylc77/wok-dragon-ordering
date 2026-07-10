-- Restaurant reservation module for an existing pre-release database.
-- New customer databases receive the same definitions from client-init.sql.

alter table public.restaurant_settings
  alter column feature_flags set default '{"csv_import":true,"ai_menu":true,"ai_image":true,"data_backup":true,"print_agent":true,"reservations":false}'::jsonb;

create table if not exists public.reservation_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  is_enabled boolean not null default true,
  timezone text not null default 'Europe/Athens',
  open_time time not null default time '12:00',
  close_time time not null default time '23:00',
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 15 and 120),
  capacity_per_slot integer not null default 40 check (capacity_per_slot > 0),
  max_party_size integer not null default 12 check (max_party_size between 1 and 100),
  max_advance_days integer not null default 30 check (max_advance_days between 1 and 365),
  minimum_notice_minutes integer not null default 120 check (minimum_notice_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (close_time > open_time)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size > 0),
  guest_name text not null,
  phone text not null,
  note text,
  status text not null default 'confirmed' check (status in ('confirmed', 'arrived', 'completed', 'cancelled', 'no_show')),
  cancelled_at timestamptz,
  legal_terms_version text,
  privacy_policy_version text,
  legal_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservations_slot_status
  on public.reservations (reservation_date, reservation_time, status);
create index if not exists idx_reservations_created_at
  on public.reservations (created_at desc);

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('confirmed', 'arrived', 'completed', 'cancelled', 'no_show'));

drop trigger if exists set_reservation_settings_updated_at on public.reservation_settings;
create trigger set_reservation_settings_updated_at
before update on public.reservation_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_reservations_updated_at on public.reservations;
create trigger set_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

insert into public.reservation_settings (singleton)
select true
where not exists (select 1 from public.reservation_settings);

alter table public.reservation_settings enable row level security;
alter table public.reservations enable row level security;

revoke all on table public.reservation_settings from anon;
revoke all on table public.reservations from anon;
revoke insert, update, delete on table public.reservations from authenticated;
grant select on table public.reservation_settings to anon, authenticated;
grant select, insert, update on table public.reservation_settings to authenticated;
grant select, update on table public.reservations to authenticated;

drop policy if exists "reservation_settings_public_read" on public.reservation_settings;
create policy "reservation_settings_public_read"
on public.reservation_settings for select
to anon, authenticated
using (true);

drop policy if exists "reservation_settings_staff_manage" on public.reservation_settings;
create policy "reservation_settings_staff_manage"
on public.reservation_settings for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "reservations_staff_read" on public.reservations;
create policy "reservations_staff_read"
on public.reservations for select
to authenticated
using ((select private.is_staff()));

drop policy if exists "reservations_staff_update" on public.reservations;
create policy "reservations_staff_update"
on public.reservations for update
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

create or replace function public.get_reservation_slots(p_date date)
returns table (slot_time time, remaining_capacity integer)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  s public.reservation_settings%rowtype;
  local_now timestamp;
begin
  select * into s from public.reservation_settings limit 1;
  if not found or not s.is_enabled then return; end if;

  local_now := now() at time zone s.timezone;
  if p_date < local_now::date or p_date > local_now::date + s.max_advance_days then return; end if;

  return query
  select slot_value::time,
         greatest(0, s.capacity_per_slot - coalesce((
           select sum(r.party_size)::integer
           from public.reservations r
           where r.reservation_date = p_date
             and r.reservation_time = slot_value::time
             and r.status in ('confirmed', 'arrived')
         ), 0))
  from generate_series(
    (p_date + s.open_time)::timestamp,
    (p_date + s.close_time)::timestamp - make_interval(mins => s.slot_interval_minutes),
    make_interval(mins => s.slot_interval_minutes)
  ) as slot_value
  where slot_value >= local_now + make_interval(mins => s.minimum_notice_minutes)
  order by slot_value;
end;
$$;

create or replace function public.create_reservation(
  p_date date,
  p_time time,
  p_party_size integer,
  p_guest_name text,
  p_phone text,
  p_note text default null
)
returns table (reservation_id uuid, reference_code text, reservation_status text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  s public.reservation_settings%rowtype;
  local_now timestamp;
  booked_capacity integer;
  version_no text;
  new_id uuid;
  new_code text;
begin
  select * into s from public.reservation_settings limit 1;
  if not found or not s.is_enabled then raise exception 'Reservations are not available.'; end if;
  local_now := now() at time zone s.timezone;

  if p_date < local_now::date or p_date > local_now::date + s.max_advance_days then
    raise exception 'Selected date is not available.';
  end if;
  if p_party_size < 1 or p_party_size > s.max_party_size then
    raise exception 'Party size is not available.';
  end if;
  if length(btrim(coalesce(p_guest_name, ''))) < 2 or length(btrim(p_guest_name)) > 120 then
    raise exception 'Please provide a valid name.';
  end if;
  if length(btrim(coalesce(p_phone, ''))) < 5 or length(btrim(p_phone)) > 40 then
    raise exception 'Please provide a valid phone number.';
  end if;
  if coalesce(length(p_note), 0) > 1000 then raise exception 'Note is too long.'; end if;
  if p_time < s.open_time or p_time >= s.close_time
     or extract(epoch from (p_time - s.open_time))::integer % (s.slot_interval_minutes * 60) <> 0 then
    raise exception 'Selected time is not available.';
  end if;
  if (p_date + p_time)::timestamp < local_now + make_interval(mins => s.minimum_notice_minutes) then
    raise exception 'Selected time requires more notice.';
  end if;

  perform pg_advisory_xact_lock(hashtext('reservation:' || p_date::text || ':' || p_time::text));
  select coalesce(sum(party_size), 0) into booked_capacity
  from public.reservations
  where reservation_date = p_date and reservation_time = p_time and status in ('confirmed', 'arrived');
  if booked_capacity + p_party_size > s.capacity_per_slot then
    raise exception 'Selected time is fully booked.';
  end if;

  select public.current_legal_version() into version_no;
  new_id := gen_random_uuid();
  new_code := 'RES-' || to_char(p_date, 'YYYYMMDD') || '-' || upper(substr(replace(new_id::text, '-', ''), 1, 6));
  insert into public.reservations (
    id, reference_code, reservation_date, reservation_time, party_size, guest_name, phone, note,
    legal_terms_version, privacy_policy_version, legal_accepted_at
  ) values (
    new_id, new_code, p_date, p_time, p_party_size, btrim(p_guest_name), btrim(p_phone), nullif(btrim(coalesce(p_note, '')), ''),
    version_no, version_no, case when version_no is null then null else now() end
  );
  return query select new_id, new_code, 'confirmed'::text;
end;
$$;

revoke all on function public.get_reservation_slots(date) from public;
revoke all on function public.create_reservation(date, time, integer, text, text, text) from public;
grant execute on function public.get_reservation_slots(date) to anon, authenticated;
grant execute on function public.create_reservation(date, time, integer, text, text, text) to service_role;
