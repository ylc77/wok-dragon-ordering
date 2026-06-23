-- Customer bill requests and per-order kitchen ticket printing.
-- Bill handling is intentionally separate from closing a table session.

alter table public.orders
  add column if not exists kitchen_printed_at timestamptz;

create table if not exists public.bill_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  table_number int not null,
  requested_by uuid references auth.users(id) on delete set null,
  payment_method text not null check (payment_method in ('card', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'handled')),
  requested_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);

alter table public.bill_requests
  add column if not exists table_number int;

update public.bill_requests br
set table_number = rt.table_number
from public.restaurant_tables rt
where rt.id = br.table_id
  and br.table_number is null;

alter table public.bill_requests
  alter column table_number set not null;

create unique index if not exists idx_bill_requests_one_pending_session
  on public.bill_requests (session_id)
  where status = 'pending';

create index if not exists idx_bill_requests_status_requested
  on public.bill_requests (status, requested_at desc);

create index if not exists idx_bill_requests_table
  on public.bill_requests (table_id);

create index if not exists idx_bill_requests_requested_by
  on public.bill_requests (requested_by);

create index if not exists idx_bill_requests_handled_by
  on public.bill_requests (handled_by);

alter table public.bill_requests enable row level security;
alter table public.bill_requests replica identity full;

grant select on public.bill_requests to authenticated;
revoke insert, update, delete on public.bill_requests from authenticated, anon;

drop policy if exists "bill_requests_participant_read" on public.bill_requests;
create policy "bill_requests_participant_read"
on public.bill_requests
for select
to authenticated
using (
  (select private.is_staff())
  or exists (
    select 1
    from public.table_session_participants p
    where p.session_id = bill_requests.session_id
      and p.user_id = (select auth.uid())
  )
);

create or replace function public.request_bill(p_session_id uuid, p_payment_method text)
returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_table_number int;
  v_request_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_payment_method not in ('card', 'cash') then
    raise exception 'invalid payment method';
  end if;

  select s.table_id, t.table_number
  into v_table_id, v_table_number
  from table_sessions s
  join restaurant_tables t on t.id = s.table_id
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and p.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'active table participant is required';
  end if;

  select br.id
  into v_request_id
  from bill_requests br
  where br.session_id = p_session_id
    and br.status = 'pending'
  limit 1;

  if v_request_id is null then
    begin
      insert into bill_requests (session_id, table_id, table_number, requested_by, payment_method)
      values (p_session_id, v_table_id, v_table_number, v_user_id, p_payment_method)
      returning id into v_request_id;
    exception when unique_violation then
      select br.id into v_request_id
      from bill_requests br
      where br.session_id = p_session_id and br.status = 'pending';
    end;
  else
    update bill_requests
    set payment_method = p_payment_method,
        table_number = v_table_number,
        requested_at = now(),
        requested_by = v_user_id
    where id = v_request_id;
  end if;

  return query select v_request_id, 'pending'::text;
end;
$$;

create or replace function public.handle_bill_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  update bill_requests
  set status = 'handled',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'pending bill request not found';
  end if;
end;
$$;

create or replace function public.mark_order_kitchen_printed(p_order_id uuid)
returns table(is_reprint boolean, printed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous timestamptz;
  v_printed_at timestamptz := now();
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select o.kitchen_printed_at
  into v_previous
  from orders o
  where o.id = p_order_id and o.deleted_at is null
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  update orders
  set kitchen_printed_at = v_printed_at
  where id = p_order_id;

  return query select v_previous is not null, v_printed_at;
end;
$$;

revoke execute on function public.request_bill(uuid, text) from public, anon;
revoke execute on function public.handle_bill_request(uuid) from public, anon;
revoke execute on function public.mark_order_kitchen_printed(uuid) from public, anon;
grant execute on function public.request_bill(uuid, text) to authenticated;
grant execute on function public.handle_bill_request(uuid) to authenticated;
grant execute on function public.mark_order_kitchen_printed(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bill_requests'
  ) then
    alter publication supabase_realtime add table public.bill_requests;
  end if;
end;
$$;
