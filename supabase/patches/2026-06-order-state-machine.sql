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

-- 2. 加菜上限：add_cart_item
create or replace function public.add_cart_item(p_session_id uuid, p_menu_item_id uuid, p_quantity int, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_existing_qty int;
  v_unit_price numeric(10,2);
  v_total_qty int;
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

  select ci.id, ci.quantity
  into v_existing_id, v_existing_qty
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants tsp on tsp.session_id = s.id
  where ci.session_id = p_session_id
    and ci.menu_item_id = p_menu_item_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id
    and coalesce(ci.note, '') = coalesce(p_note, '');

  if v_existing_id is not null then
    v_total_qty := v_existing_qty + p_quantity;
    if v_total_qty > 99 then
      raise exception 'quantity cannot exceed 99';
    end if;
    update cart_items
    set quantity = v_total_qty,
        updated_at = now()
    where id = v_existing_id;
    update table_sessions
    set cart_version = cart_version + 1,
        cart_updated_at = now()
    where id = p_session_id;
    return;
  end if;

  select mi.price
  into v_unit_price
  from menu_items mi
  where mi.id = p_menu_item_id
    and mi.is_available = true
    and mi.deleted_at is null;

  if v_unit_price is null then
    raise exception 'menu item is not available';
  end if;

  insert into cart_items (session_id, menu_item_id, added_by, quantity, note, unit_price)
  values (p_session_id, p_menu_item_id, v_user_id, p_quantity, p_note, v_unit_price);

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;
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
