-- Fix: request_bill now uses the latest payment_method on re-request
-- Previously when a pending bill request existed, the new payment_method was silently ignored

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
  v_has_open_orders boolean;
  v_accepts_pos boolean;
  v_accepts_cash boolean;
  v_has_cart_items boolean;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_payment_method not in ('pos', 'cash') then
    raise exception 'invalid payment method';
  end if;

  select rs.accept_pos_payment, rs.accept_cash_payment
  into v_accepts_pos, v_accepts_cash
  from restaurant_settings rs
  limit 1;

  if p_payment_method = 'pos' and v_accepts_pos is false then
    raise exception 'POS payment is not available';
  end if;
  if p_payment_method = 'cash' and v_accepts_cash is false then
    raise exception 'cash payment is not available';
  end if;

  select s.table_id, t.table_number
  into v_table_id, v_table_number
  from table_sessions s
  join restaurant_tables t on t.id = s.table_id
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and p.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'not a participant of this active table session';
  end if;

  select exists(select 1 from cart_items where session_id = p_session_id) into v_has_cart_items;
  select exists(select 1 from orders where session_id = p_session_id and status not in ('cancelled') and deleted_at is null) into v_has_open_orders;

  if v_has_cart_items then
    raise exception 'cart must be empty or submitted before requesting the bill';
  end if;

  if not v_has_open_orders then
    raise exception 'at least one submitted order is required';
  end if;

  select br.id, br.payment_method
  into v_request_id, v_existing_method
  from bill_requests br
  where br.session_id = p_session_id
    and br.status = 'pending'
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
    update bill_requests
    set payment_method = p_payment_method
    where id = v_request_id;

    update table_sessions
    set bill_request_status = 'requested',
        bill_payment_method = p_payment_method,
        bill_requested_at = coalesce(bill_requested_at, now())
    where id = p_session_id;
  end if;

  return query select v_request_id, 'requested'::text;
end;
$$;
