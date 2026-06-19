-- Keep one current session ready for each table while requiring staff approval
-- before a device from a closed session can join it.

create table if not exists public.table_reentry_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  closed_session_id uuid not null references public.table_sessions(id) on delete restrict,
  target_session_id uuid not null references public.table_sessions(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  unique (target_session_id, requested_by)
);

create index if not exists idx_table_reentry_requests_status
  on public.table_reentry_requests (status, requested_at desc);

create index if not exists idx_table_reentry_requests_closed_session
  on public.table_reentry_requests (closed_session_id);

create index if not exists idx_table_reentry_requests_table
  on public.table_reentry_requests (table_id);

create index if not exists idx_table_reentry_requests_requested_by
  on public.table_reentry_requests (requested_by);

create index if not exists idx_table_reentry_requests_handled_by
  on public.table_reentry_requests (handled_by);

alter table public.table_reentry_requests enable row level security;
alter table public.table_reentry_requests replica identity full;

grant select on public.table_reentry_requests to authenticated;
revoke insert, update, delete on public.table_reentry_requests from authenticated, anon;

drop policy if exists "table_reentry_requester_or_staff_read" on public.table_reentry_requests;
create policy "table_reentry_requester_or_staff_read"
on public.table_reentry_requests
for select
to authenticated
using (
  requested_by = (select auth.uid())
  or (select private.is_staff())
);

create or replace function private.ensure_active_table_session(p_table_id uuid)
returns uuid
language plpgsql
set search_path = public, private
as $$
declare
  v_session_id uuid;
begin
  select s.id
  into v_session_id
  from public.table_sessions s
  where s.table_id = p_table_id
    and s.status = 'active'
  limit 1;

  if v_session_id is null then
    begin
      insert into public.table_sessions (table_id, status)
      values (p_table_id, 'active')
      returning id into v_session_id;
    exception when unique_violation then
      select s.id
      into v_session_id
      from public.table_sessions s
      where s.table_id = p_table_id
        and s.status = 'active'
      limit 1;
    end;
  end if;

  return v_session_id;
end;
$$;

revoke execute on function private.ensure_active_table_session(uuid) from public, anon, authenticated;

create or replace function public.create_restaurant_table(p_table_number int, p_label text default null)
returns table(id uuid, table_number int, qr_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table restaurant_tables%rowtype;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  insert into restaurant_tables (table_number, label)
  values (p_table_number, p_label)
  returning * into v_table;

  perform private.ensure_active_table_session(v_table.id);
  return query select v_table.id, v_table.table_number, v_table.qr_token;
end;
$$;

create or replace function public.close_table_session(p_session_id uuid)
returns table(open_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_deleted_count int := 0;
  v_open_count int := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  where s.id = p_session_id
    and s.status = 'active'
  for update;

  if v_table_id is null then
    raise exception 'active table session not found';
  end if;

  select count(*)::int
  into v_open_count
  from orders
  where session_id = p_session_id
    and status in ('pending', 'preparing', 'served');

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set status = 'closed',
      closed_at = now(),
      cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  perform private.ensure_active_table_session(v_table_id);
  return query select v_open_count, v_deleted_count;
end;
$$;

create or replace function public.confirm_bill_and_close_session(p_session_id uuid)
returns table(paid_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_status text;
  v_bill_status text;
  v_payment_method text;
  v_paid_count int := 0;
  v_deleted_count int := 0;
  v_now timestamptz := now();
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id, s.status, s.bill_request_status, s.bill_payment_method
  into v_table_id, v_status, v_bill_status, v_payment_method
  from table_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'table session not found';
  end if;

  if v_status <> 'active' then
    raise exception 'table session is already closed';
  end if;

  if v_bill_status <> 'requested' or v_payment_method not in ('pos', 'cash') then
    raise exception 'a valid bill request is required';
  end if;

  update orders
  set status = 'paid',
      payment_status = 'paid',
      payment_method = v_payment_method,
      paid_at = v_now,
      updated_at = v_now
  where session_id = p_session_id
    and status <> 'cancelled';
  get diagnostics v_paid_count = row_count;

  update bill_requests
  set status = 'handled',
      handled_at = v_now,
      handled_by = auth.uid()
  where session_id = p_session_id
    and status = 'pending';

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set bill_request_status = 'handled',
      bill_handled_at = v_now,
      status = 'closed',
      closed_at = v_now,
      cart_version = cart_version + 1,
      cart_updated_at = v_now
  where id = p_session_id;

  perform private.ensure_active_table_session(v_table_id);
  return query select v_paid_count, v_deleted_count;
end;
$$;

create or replace function public.request_table_reentry(p_closed_session_id uuid, p_qr_token text)
returns table(request_id uuid, request_status text, target_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_target_session_id uuid;
  v_request_id uuid;
  v_request_status text;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  join table_session_participants p on p.session_id = s.id
  join restaurant_tables t on t.id = s.table_id
  where s.id = p_closed_session_id
    and s.status = 'closed'
    and p.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if v_table_id is null then
    raise exception 'closed table participant is required';
  end if;

  v_target_session_id := private.ensure_active_table_session(v_table_id);

  select r.id, r.status
  into v_request_id, v_request_status
  from table_reentry_requests r
  where r.target_session_id = v_target_session_id
    and r.requested_by = v_user_id;

  if v_request_id is null then
    insert into table_reentry_requests (
      table_id,
      closed_session_id,
      target_session_id,
      requested_by
    )
    values (
      v_table_id,
      p_closed_session_id,
      v_target_session_id,
      v_user_id
    )
    returning id, status into v_request_id, v_request_status;
  elsif v_request_status in ('rejected', 'expired') then
    update table_reentry_requests
    set closed_session_id = p_closed_session_id,
        status = 'pending',
        requested_at = now(),
        handled_at = null,
        handled_by = null
    where id = v_request_id
    returning status into v_request_status;
  end if;

  return query select v_request_id, v_request_status, v_target_session_id;
end;
$$;

create or replace function public.approve_table_reentry(p_request_id uuid)
returns table(request_status text, target_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request table_reentry_requests%rowtype;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select *
  into v_request
  from table_reentry_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'pending reentry request not found';
  end if;

  if not exists (
    select 1
    from table_sessions s
    where s.id = v_request.target_session_id
      and s.table_id = v_request.table_id
      and s.status = 'active'
  ) then
    update table_reentry_requests
    set status = 'expired',
        handled_at = now(),
        handled_by = auth.uid()
    where id = p_request_id;
    return query select 'expired'::text, v_request.target_session_id;
    return;
  end if;

  insert into table_session_participants (session_id, user_id)
  values (v_request.target_session_id, v_request.requested_by)
  on conflict on constraint table_session_participants_session_id_user_id_key do nothing;

  update table_reentry_requests
  set status = 'approved',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id;

  return query select 'approved'::text, v_request.target_session_id;
end;
$$;

create or replace function public.reject_table_reentry(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  update table_reentry_requests
  set status = 'rejected',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'pending reentry request not found';
  end if;
end;
$$;

insert into public.table_sessions (table_id, status)
select t.id, 'active'
from public.restaurant_tables t
where t.is_active = true
  and not exists (
    select 1
    from public.table_sessions s
    where s.table_id = t.id
      and s.status = 'active'
  )
on conflict do nothing;

revoke execute on function public.request_table_reentry(uuid, text) from public, anon;
revoke execute on function public.approve_table_reentry(uuid) from public, anon;
revoke execute on function public.reject_table_reentry(uuid) from public, anon;
grant execute on function public.request_table_reentry(uuid, text) to authenticated;
grant execute on function public.approve_table_reentry(uuid) to authenticated;
grant execute on function public.reject_table_reentry(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.table_session_participants;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.table_reentry_requests;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
