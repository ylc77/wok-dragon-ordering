-- 重置演示数据 RPC
-- 清理测试订单/session/购物车/付款请求，重建每桌 active session
-- 不删除菜单、分类、桌台、二维码、设置、账户

create or replace function public.reset_demo_data(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_orders_deleted int;
  v_cart_deleted int;
  v_sessions_closed int;
  v_sessions_created int;
  v_bills_deleted int;
  v_reentry_deleted int;
  v_table record;
  v_new_session_id uuid;
begin
  -- 权限检查
  if p_confirm <> 'RESET_DEMO_DATA' then
    raise exception '确认文本不正确，请输入 RESET_DEMO_DATA';
  end if;

  select role into v_role from profiles where id = v_user_id;
  if v_role not in ('admin', 'staff') then
    raise exception '只有管理员或员工可以执行此操作';
  end if;

  -- 1. 软删除所有 orders
  with updated as (
    update orders
    set deleted_at = now()
    where deleted_at is null
    returning id
  )
  select count(*) into v_orders_deleted from updated;

  -- 2. 清空 cart_items
  with deleted as (
    delete from cart_items returning id
  )
  select count(*) into v_cart_deleted from deleted;

  -- 3. 删除 bill_requests
  with deleted as (
    delete from bill_requests returning id
  )
  select count(*) into v_bills_deleted from deleted;

  -- 4. 删除 table_reentry_requests
  with deleted as (
    delete from table_reentry_requests returning id
  )
  select count(*) into v_reentry_deleted from deleted;

  -- 5. 关闭所有 active table_sessions
  with updated as (
    update table_sessions
    set status = 'closed', closed_at = now()
    where status = 'active'
    returning id
  )
  select count(*) into v_sessions_closed from updated;

  -- 6. 清理 table_session_participants（关闭 session 后参与者记录已无意义）
  delete from table_session_participants;

  -- 7. 为每张桌创建新的 active session
  v_sessions_created := 0;
  for v_table in select id from restaurant_tables loop
    insert into table_sessions (table_id, status)
    values (v_table.id, 'active')
    returning id into v_new_session_id;
    v_sessions_created := v_sessions_created + 1;
  end loop;

  return jsonb_build_object(
    'orders_soft_deleted', v_orders_deleted,
    'cart_items_deleted', v_cart_deleted,
    'sessions_closed', v_sessions_closed,
    'sessions_created', v_sessions_created,
    'bill_requests_deleted', v_bills_deleted,
    'reentry_requests_deleted', v_reentry_deleted
  );
end;
$$;

-- 权限：仅 authenticated 可执行（函数内部检查 admin/staff）
revoke execute on function public.reset_demo_data(text) from public, anon;
grant execute on function public.reset_demo_data(text) to authenticated;
