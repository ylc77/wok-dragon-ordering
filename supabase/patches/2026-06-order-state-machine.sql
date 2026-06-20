-- P1: 订单状态流转约束 + 加菜数量上限

-- 1. 状态流转约束
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  select status into v_current_status
  from orders
  where id = p_order_id and deleted_at is null;

  if not found then
    raise exception 'order not found';
  end if;

  if v_current_status = 'paid' then
    raise exception 'paid orders cannot be changed';
  end if;

  if v_current_status = 'cancelled' then
    raise exception 'cancelled orders cannot be restored';
  end if;

  if p_status = 'cancelled' and v_current_status not in ('pending', 'preparing') then
    raise exception 'only pending or preparing orders can be cancelled';
  end if;

  update orders
  set status = p_status
  where id = p_order_id and deleted_at is null;
end;
$$;

-- 2. 加菜上限：add_cart_item（仅加上限检查，不改变逻辑）
create or replace function public.add_cart_item(
  p_session_id uuid,
  p_menu_item_id uuid,
  p_quantity int,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_price numeric(10, 2);
  v_cart_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if p_quantity > 99 then
    raise exception 'quantity cannot exceed 99';
  end if;

  if not exists (
    select 1
    from table_sessions s
    join table_session_participants tsp on tsp.session_id = s.id
    where s.id = p_session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and tsp.user_id = v_user_id
  ) then
    raise exception 'not a participant of this active table session';
  end if;

  select price
  into v_price
  from menu_items
  where id = p_menu_item_id
    and is_available = true;

  if v_price is null then
    raise exception 'menu item is unavailable';
  end if;

  insert into cart_items (session_id, menu_item_id, added_by, quantity, note, unit_price)
  values (p_session_id, p_menu_item_id, v_user_id, p_quantity, nullif(trim(coalesce(p_note, '')), ''), v_price)
  on conflict (session_id, menu_item_id, (coalesce(note, ''::text))) do update
    set quantity = cart_items.quantity + excluded.quantity,
        updated_at = now()
  returning id into v_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  return v_cart_item_id;
end;
$$;

-- 3. 加菜上限：update_cart_item_quantity
create or replace function public.update_cart_item_quantity(p_cart_item_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if p_quantity > 99 then
    raise exception 'quantity cannot exceed 99';
  end if;

  select ci.session_id
  into v_session_id
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants tsp on tsp.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id;

  if v_session_id is null then
    raise exception 'cart item is not available for this user';
  end if;

  update cart_items
  set quantity = p_quantity,
      updated_at = now()
  where id = p_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = v_session_id;
end;
$$;
