-- Harden table entry, ordering locks, payment status and table clearing.

revoke execute on function public.join_table_session(text) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

create or replace function private.guard_cart_ordering_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session_id uuid;
begin
  v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  if (select private.is_staff()) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = v_session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'ordering is closed for this table session';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_order_submission_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (select private.is_staff()) then
    return new;
  end if;

  if not exists (
    select 1
    from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = new.session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'ordering is closed for this table session';
  end if;

  return new;
end;
$$;

create or replace function private.protect_order_history()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'orders must be archived, not deleted';
  end if;
  if old.status = 'paid' and (
    new.status is distinct from old.status
    or new.payment_status is distinct from old.payment_status
    or new.payment_method is distinct from old.payment_method
    or new.paid_at is distinct from old.paid_at
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'paid order payment history cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_cart_ordering_open() from public, anon, authenticated;
revoke execute on function private.guard_order_submission_open() from public, anon, authenticated;
revoke execute on function private.protect_order_history() from public, anon, authenticated;

drop trigger if exists guard_cart_ordering_open on public.cart_items;
create trigger guard_cart_ordering_open
before insert or update or delete on public.cart_items
for each row execute function private.guard_cart_ordering_open();

drop trigger if exists guard_order_submission_open on public.orders;
create trigger guard_order_submission_open
before insert on public.orders
for each row execute function private.guard_order_submission_open();

drop trigger if exists protect_order_history on public.orders;
create trigger protect_order_history
before update or delete on public.orders
for each row execute function private.protect_order_history();

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  if exists (select 1 from orders where id = p_order_id and status = 'paid') then
    raise exception 'paid orders cannot be changed';
  end if;

  update orders
  set status = p_status
  where id = p_order_id and deleted_at is null;

  if not found then
    raise exception 'order not found';
  end if;
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
  v_bill_status text;
  v_deleted_count int := 0;
  v_open_count int := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id, s.bill_request_status
  into v_table_id, v_bill_status
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
    and deleted_at is null
    and status in ('pending', 'preparing', 'served');

  if v_open_count > 0 then
    raise exception 'finish or cancel open orders before clearing the table';
  end if;

  if v_bill_status = 'requested' then
    raise exception 'confirm the bill request before clearing the table';
  end if;

  delete from cart_items where session_id = p_session_id;
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

  if exists (select 1 from cart_items where session_id = p_session_id) then
    raise exception 'submit or remove cart items before requesting the bill';
  end if;

  if not exists (
    select 1 from orders o
    where o.session_id = p_session_id
      and o.status <> 'cancelled'
      and o.deleted_at is null
  ) then
    raise exception 'at least one submitted order is required before requesting the bill';
  end if;

  select br.id, br.payment_method
  into v_request_id, v_existing_method
  from bill_requests br
  where br.session_id = p_session_id and br.status = 'pending'
  limit 1;

  if v_request_id is null then
    insert into bill_requests (session_id, table_id, table_number, requested_by, payment_method)
    values (p_session_id, v_table_id, v_table_number, v_user_id, p_payment_method)
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

revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.close_table_session(uuid) from public, anon;
revoke execute on function public.request_bill(uuid, text) from public, anon;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.close_table_session(uuid) to authenticated;
grant execute on function public.request_bill(uuid, text) to authenticated;
