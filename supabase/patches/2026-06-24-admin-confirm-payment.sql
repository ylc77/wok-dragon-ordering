-- 后台手动确认收款 RPC
-- 有 session 的订单：标记整个 session 已付款 + 清桌 + 创建新 session
-- 无 session 的订单：仅标记当前订单已付款

create or replace function public.admin_confirm_order_payment(
  p_order_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_session_id uuid;
  v_table_id uuid;
  v_payment_status text;
  v_status text;
  v_paid_count int := 0;
  v_cart_deleted int := 0;
  v_now timestamptz := now();
  v_new_session_id uuid;
begin
  -- 权限
  select role into v_role from profiles where id = v_user_id;
  if v_role not in ('admin', 'staff') then
    raise exception '只有管理员或员工可以执行此操作';
  end if;

  if p_payment_method not in ('cash', 'pos') then
    raise exception '付款方式只能是 cash 或 pos';
  end if;

  -- 查询订单
  select o.session_id, o.table_id, o.payment_status, o.status
  into v_session_id, v_table_id, v_payment_status, v_status
  from orders o
  where o.id = p_order_id and o.deleted_at is null;

  if not found then
    raise exception '订单不存在';
  end if;

  if v_payment_status = 'paid' then
    raise exception '该订单已付款，不能重复收款';
  end if;

  if v_status = 'cancelled' then
    raise exception '已取消订单不能确认收款';
  end if;

  -- 有 session → 处理该 session 下所有未付款订单 + 清桌
  if v_session_id is not null then
    -- 锁定 session
    perform 1 from table_sessions s
    where s.id = v_session_id
    for update;

    -- 标记该 session 下所有未取消、未付款订单
    update orders
    set payment_status = 'paid',
        payment_method = p_payment_method,
        paid_at = v_now,
        updated_at = v_now
    where session_id = v_session_id
      and deleted_at is null
      and payment_status <> 'paid'
      and status <> 'cancelled';
    get diagnostics v_paid_count = row_count;

    -- 清空购物车
    with deleted as (
      delete from cart_items
      where session_id = v_session_id
      returning id
    )
    select count(*) into v_cart_deleted from deleted;

    -- 关闭旧 session
    update table_sessions
    set status = 'closed', closed_at = v_now,
        cart_version = cart_version + 1, cart_updated_at = v_now
    where id = v_session_id;

    -- 创建新 active session
    if v_table_id is not null then
      insert into table_sessions (table_id, status)
      values (v_table_id, 'active')
      returning id into v_new_session_id;
    end if;

    return jsonb_build_object(
      'paid_orders_count', v_paid_count,
      'session_closed', true,
      'cart_cleared', v_cart_deleted > 0,
      'new_session_id', v_new_session_id
    );
  end if;

  -- 无 session → 仅标记当前订单
  update orders
  set payment_status = 'paid',
      payment_method = p_payment_method,
      paid_at = v_now,
      updated_at = v_now
  where id = p_order_id;
  get diagnostics v_paid_count = row_count;

  return jsonb_build_object(
    'paid_orders_count', v_paid_count,
    'session_closed', false,
    'cart_cleared', false,
    'new_session_id', null
  );
end;
$$;

revoke execute on function public.admin_confirm_order_payment(uuid, text) from public, anon;
grant execute on function public.admin_confirm_order_payment(uuid, text) to authenticated, service_role;

-- 更新 update_order_status：增加 payment_status='paid' 保护
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_payment_status text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  select status, payment_status into v_current_status, v_payment_status from orders
  where id = p_order_id and deleted_at is null;

  if not found then
    raise exception 'order not found';
  end if;

  -- paid 订单不可修改（status 或 payment_status）
  if v_current_status = 'paid' or v_payment_status = 'paid' then
    raise exception 'paid orders cannot be changed';
  end if;

  -- cancelled 订单不可恢复
  if v_current_status = 'cancelled' then
    raise exception 'cancelled orders cannot be restored';
  end if;

  -- 只允许从 pending 或 preparing 取消
  if p_status = 'cancelled' and v_current_status not in ('pending', 'preparing') then
    raise exception 'only pending or preparing orders can be cancelled';
  end if;

  update orders set status = p_status, updated_at = now()
  where id = p_order_id and deleted_at is null;
end;
$$;
