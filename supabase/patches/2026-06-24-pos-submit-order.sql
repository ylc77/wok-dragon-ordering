-- POS 前台点单 RPC
-- staff/admin 专用，直接创建订单，不使用顾客 cart_items

create or replace function public.pos_submit_order(
  p_table_id uuid,
  p_items jsonb,
  p_note text default null
)
returns table(order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_session_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_total numeric(10, 2) := 0;
  v_item jsonb;
  v_menu_item record;
  v_quantity int;
  v_unit_price numeric(10, 2);
  v_line_total numeric(10, 2);
begin
  -- 权限检查
  select role into v_role from profiles where id = v_user_id;
  if v_role not in ('admin', 'staff') then
    raise exception '只有管理员或员工可以执行此操作';
  end if;

  -- 验证桌台存在
  if not exists (select 1 from restaurant_tables where id = p_table_id) then
    raise exception '桌台不存在';
  end if;

  -- 验证 items 是数组
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items 必须是数组';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception '点单不能为空';
  end if;

  -- 获取或创建该桌 active session
  select id into v_session_id
  from table_sessions
  where table_id = p_table_id and status = 'active';

  if v_session_id is null then
    insert into table_sessions (table_id, status)
    values (p_table_id, 'active')
    returning id into v_session_id;
  end if;

  -- 验证所有菜品并计算总价
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::int;
    if v_quantity is null or v_quantity <= 0 then
      raise exception '数量必须大于 0';
    end if;
    if v_quantity > 99 then
      raise exception '数量不能超过 99';
    end if;

    select id, name_zh, name_en, name_el, price
    into v_menu_item
    from menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and is_available = true
      and is_sold_out is not true
      and deleted_at is null;

    if v_menu_item.id is null then
      raise exception '菜品不可售: %', v_item->>'menu_item_id';
    end if;

    v_unit_price := v_menu_item.price;
    v_line_total := v_unit_price * v_quantity;
    v_total := v_total + v_line_total;
  end loop;

  if v_total <= 0 then
    raise exception '订单总额必须大于 0';
  end if;

  -- 创建订单
  insert into orders (session_id, table_id, submitted_by, client_request_id, status, total_price)
  values (v_session_id, p_table_id, v_user_id, gen_random_uuid(), 'pending', v_total)
  returning id, orders.order_number into v_order_id, v_order_number;

  -- 写入订单明细
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::int;

    select id, name_zh, name_en, name_el, price
    into v_menu_item
    from menu_items
    where id = (v_item->>'menu_item_id')::uuid;

    v_unit_price := v_menu_item.price;

    insert into order_items (
      order_id, menu_item_id,
      item_name_zh, item_name_en, item_name_el,
      quantity, note, selected_options,
      unit_price, line_total
    ) values (
      v_order_id, v_menu_item.id,
      v_menu_item.name_zh, v_menu_item.name_en, v_menu_item.name_el,
      v_quantity,
      nullif(trim(coalesce((v_item->>'note')::text, '')), ''),
      coalesce((v_item->'selected_options'), '[]'::jsonb),
      v_unit_price,
      v_unit_price * v_quantity
    );
  end loop;

  return query select v_order_id, v_order_number;
end;
$$;

-- 权限
revoke execute on function public.pos_submit_order(uuid, jsonb, text) from public, anon;
grant execute on function public.pos_submit_order(uuid, jsonb, text) to authenticated, service_role;
