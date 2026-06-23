-- ============================================================
-- 2026-06: 同一 Session 多次下单合并到同一 pending 订单
-- ============================================================
-- 场景：顾客在同一桌多次点菜（先点宫保鸡丁，5分钟后又点可乐）
-- 之前：每次提交生成一个新订单
-- 现在：只要上一个订单还在 pending 状态，新菜品追加到同一个订单

create or replace function public.submit_order(p_session_id uuid, p_client_request_id uuid)
returns table(order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_existing_session_id uuid;
  v_existing_order_id uuid;
  v_existing_order_number bigint;
  v_total numeric(10, 2);
  v_order_id uuid;
  v_order_number bigint;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_client_request_id is null then
    raise exception 'client_request_id is required';
  end if;

  -- 幂等性检查：相同 client_request_id 直接返回已有订单
  select o.id, o.order_number, o.session_id
  into v_existing_order_id, v_existing_order_number, v_existing_session_id
  from orders o
  where o.client_request_id = p_client_request_id;

  if v_existing_order_id is not null then
    if v_existing_session_id <> p_session_id then
      raise exception 'client_request_id belongs to a different session';
    end if;
    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and p.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'not a participant of this active table session';
  end if;

  -- 再次幂等性检查（防止并发竞态）
  select o.id, o.order_number, o.session_id
  into v_existing_order_id, v_existing_order_number, v_existing_session_id
  from orders o
  where o.client_request_id = p_client_request_id;

  if v_existing_order_id is not null then
    if v_existing_session_id <> p_session_id then
      raise exception 'client_request_id belongs to a different session';
    end if;
    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  perform 1
  from cart_items ci
  where ci.session_id = p_session_id
  for update;

  select coalesce(sum(ci.unit_price * ci.quantity), 0)
  into v_total
  from cart_items ci
  where ci.session_id = p_session_id;

  if v_total <= 0 then
    raise exception 'cart is empty';
  end if;

  -- 检查该 session 是否已有 pending 订单，有则合并而非新建
  select o.id, o.order_number
  into v_existing_order_id, v_existing_order_number
  from orders o
  where o.session_id = p_session_id
    and o.status = 'pending'
    and o.deleted_at is null
  order by o.created_at asc
  limit 1
  for update of o;

  if v_existing_order_id is not null then
    -- 合并：将购物车项追加到已有 pending 订单
    insert into order_items (
      order_id,
      menu_item_id,
      item_name_zh,
      item_name_en,
      item_name_el,
      quantity,
      note,
      unit_price,
      line_total
    )
    select
      v_existing_order_id,
      ci.menu_item_id,
      mi.name_zh,
      mi.name_en,
      mi.name_el,
      ci.quantity,
      ci.note,
      ci.unit_price,
      ci.unit_price * ci.quantity
    from cart_items ci
    join menu_items mi on mi.id = ci.menu_item_id
    where ci.session_id = p_session_id;

    -- 更新总价，重置打印标记以便厨房看到新菜品
    update orders
    set total_price = total_price + v_total,
        kitchen_printed_at = null
    where id = v_existing_order_id;

    -- 清空购物车
    delete from cart_items ci
    where ci.session_id = p_session_id;

    update table_sessions
    set cart_version = cart_version + 1,
        cart_updated_at = now()
    where id = p_session_id;

    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  -- 无 pending 订单，新建
  insert into orders (session_id, table_id, submitted_by, client_request_id, status, total_price)
  values (p_session_id, v_table_id, v_user_id, p_client_request_id, 'pending', v_total)
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into order_items (
    order_id,
    menu_item_id,
    item_name_zh,
    item_name_en,
    item_name_el,
    quantity,
    note,
    unit_price,
    line_total
  )
  select
    v_order_id,
    ci.menu_item_id,
    mi.name_zh,
    mi.name_en,
    mi.name_el,
    ci.quantity,
    ci.note,
    ci.unit_price,
    ci.unit_price * ci.quantity
  from cart_items ci
  join menu_items mi on mi.id = ci.menu_item_id
  where ci.session_id = p_session_id;

  delete from cart_items ci
  where ci.session_id = p_session_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  return query select v_order_id, v_order_number;
end;
$$;
