-- Bill requests stay separate from payment confirmation. Staff confirmation is
-- atomic: pay orders, handle the request, clear the cart, and close the session.

alter table public.table_sessions
  add column if not exists bill_requested_at timestamptz,
  add column if not exists bill_request_status text not null default 'none',
  add column if not exists bill_payment_method text,
  add column if not exists bill_handled_at timestamptz;

alter table public.table_sessions
  drop constraint if exists table_sessions_bill_request_status_check,
  drop constraint if exists table_sessions_bill_payment_method_check;

alter table public.table_sessions
  add constraint table_sessions_bill_request_status_check
    check (bill_request_status in ('none', 'requested', 'handled')),
  add constraint table_sessions_bill_payment_method_check
    check (bill_payment_method is null or bill_payment_method in ('pos', 'cash'));

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_status_check,
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'paid')),
  add constraint orders_payment_method_check
    check (payment_method is null or payment_method in ('pos', 'cash'));

alter table public.bill_requests
  drop constraint if exists bill_requests_payment_method_check;

update public.bill_requests
set payment_method = 'pos'
where payment_method = 'card';

alter table public.bill_requests
  add constraint bill_requests_payment_method_check
    check (payment_method in ('pos', 'cash'));

create or replace function public.resume_table_session(p_session_id uuid, p_qr_token text)
returns table(
  session_id uuid,
  table_id uuid,
  table_number int,
  session_status text,
  bill_request_status text,
  bill_payment_method text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  return query
  select
    s.id,
    s.table_id,
    t.table_number,
    s.status,
    s.bill_request_status,
    s.bill_payment_method
  from table_sessions s
  join restaurant_tables t on t.id = s.table_id
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and p.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if not found then
    raise exception 'saved table session is invalid for this QR code';
  end if;
end;
$$;

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
  v_existing_method text;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_payment_method not in ('pos', 'cash') then
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

  if not exists (
    select 1
    from orders o
    where o.session_id = p_session_id
      and o.status <> 'cancelled'
      and o.deleted_at is null
  ) then
    raise exception 'at least one submitted order is required before requesting the bill';
  end if;

  select br.id, br.payment_method
  into v_request_id, v_existing_method
  from bill_requests br
  where br.session_id = p_session_id
    and br.status = 'pending'
  limit 1;

  if v_request_id is null then
    insert into bill_requests (
      session_id,
      table_id,
      table_number,
      requested_by,
      payment_method
    )
    values (
      p_session_id,
      v_table_id,
      v_table_number,
      v_user_id,
      p_payment_method
    )
    returning id into v_request_id;

    update table_sessions
    set bill_requested_at = now(),
        bill_request_status = 'requested',
        bill_payment_method = p_payment_method
    where id = p_session_id;
  else
    update table_sessions
    set bill_request_status = 'requested',
        bill_payment_method = v_existing_method,
        bill_requested_at = coalesce(bill_requested_at, now())
    where id = p_session_id;
  end if;

  return query select v_request_id, 'requested'::text;
end;
$$;

create or replace function public.confirm_bill_and_close_session(p_session_id uuid)
returns table(paid_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
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

  select s.status, s.bill_request_status, s.bill_payment_method
  into v_status, v_bill_status, v_payment_method
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

  return query select v_paid_count, v_deleted_count;
end;
$$;

create or replace function public.handle_bill_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select br.session_id
  into v_session_id
  from bill_requests br
  where br.id = p_request_id
    and br.status = 'pending';

  if v_session_id is null then
    raise exception 'pending bill request not found';
  end if;

  perform * from public.confirm_bill_and_close_session(v_session_id);
end;
$$;

revoke execute on function public.resume_table_session(uuid, text) from public, anon;
revoke execute on function public.request_bill(uuid, text) from public, anon;
revoke execute on function public.confirm_bill_and_close_session(uuid) from public, anon;
revoke execute on function public.handle_bill_request(uuid) from public, anon;

grant execute on function public.resume_table_session(uuid, text) to authenticated;
grant execute on function public.request_bill(uuid, text) to authenticated;
grant execute on function public.confirm_bill_and_close_session(uuid) to authenticated;
grant execute on function public.handle_bill_request(uuid) to authenticated;
