-- Fix: confirm_bill_and_close_session now updates bill_requests.status
-- and handles already-closed sessions gracefully

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
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
  end if;

  if v_bill_status <> 'requested' or v_payment_method not in ('pos', 'cash') then
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
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

  update bill_requests
  set status = 'handled', handled_at = v_now
  where session_id = p_session_id and status = 'pending';

  perform private.ensure_active_table_session(v_table_id);

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'confirm_payment', 'session', p_session_id,
    'paid ' || v_paid_count || ' orders, deleted ' || v_deleted_count || ' cart items');

  return query select v_paid_count, v_deleted_count;
end;
$$;
