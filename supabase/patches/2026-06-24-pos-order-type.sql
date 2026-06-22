-- POS 订单类型：堂食/外带
-- 允许 POS 订单不绑定桌台和 session

-- 1. 新增 order_type 列
alter table public.orders
  add column if not exists order_type text default 'dine_in';

-- 2. 回填历史订单
update public.orders set order_type = 'dine_in' where order_type is null;

-- 3. 加 check 约束（安全处理重复执行）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_order_type_check' and conrelid = 'orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('dine_in', 'takeaway'));
  end if;
end;
$$;

-- 4. 允许 table_id 和 session_id 为 null（仅 POS 使用，顾客端提交不受影响）
alter table public.orders alter column table_id drop not null;
alter table public.orders alter column session_id drop not null;

-- 5. 更新 pos_submit_order RPC
create or replace function public.pos_submit_order(
  p_table_id uuid,
  p_items jsonb,
  p_note text default null,
  p_payment_method text default null,
  p_order_type text default 'dine_in'
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

  -- 校验订单类型
  if p_order_type not in ('dine_in', 'takeaway') then
    raise exception '订单类型只能是 dine_in 或 takeaway';
  end if;

  -- 校验付款方式
  if p_payment_method is not null and p_payment_method not in ('cash', 'pos') then
    raise exception '付款方式只能是 cash 或 pos';
  end if;

  -- 堂食有桌号 → 验证桌台存在 + 获取/创建 session
  if p_order_type = 'dine_in' and p_table_id is not null then
    if not exists (select 1 from restaurant_tables where id = p_table_id) then
      raise exception '桌台不存在';
    end if;

    select id into v_session_id
    from table_sessions
    where table_id = p_table_id and status = 'active';

    if v_session_id is null then
      insert into table_sessions (table_id, status)
      values (p_table_id, 'active')
      returning id into v_session_id;
    end if;
  else
    -- 外带或堂食无桌号 → 不绑定 session/table
    v_session_id := null;
  end if;

  -- 验证 items 是数组
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items 必须是数组';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception '点单不能为空';
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
  insert into orders (session_id, table_id, submitted_by, client_request_id, status, total_price,
    payment_status, payment_method, paid_at, order_type)
  values (v_session_id,
    case when p_order_type = 'dine_in' then p_table_id else null end,
    v_user_id, gen_random_uuid(), 'pending', v_total,
    case when p_payment_method in ('cash', 'pos') then 'paid' else 'unpaid' end,
    p_payment_method,
    case when p_payment_method in ('cash', 'pos') then now() else null end,
    p_order_type)
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
revoke execute on function public.pos_submit_order(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.pos_submit_order(uuid, jsonb, text, text, text) to authenticated, service_role;
