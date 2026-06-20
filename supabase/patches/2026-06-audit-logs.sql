-- P2: 关键操作审计日志

-- 1. 审计日志表
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "audit_logs_staff_read"
  on public.audit_logs for select
  to authenticated
  using ((select private.is_staff()));

create policy "audit_logs_insert"
  on public.audit_logs for insert
  to authenticated
  with check (true);

-- 2. 更新 update_order_status 加入审计
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_order_number bigint;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  select status, order_number into v_current_status, v_order_number
  from orders where id = p_order_id and deleted_at is null;

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

  update orders set status = p_status
  where id = p_order_id and deleted_at is null;

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'update_status', 'order', p_order_id,
    'order #' || v_order_number || ': ' || v_current_status || ' -> ' || p_status);
end;
$$;

-- 3. 更新 confirm_bill_and_close_session 加入审计
create or replace function public.confirm_bill_and_close_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_status text;
  v_bill_request_status text;
  v_bill_payment_method text;
  v_order_ids uuid[];
  v_table_number int;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id, s.status, s.bill_request_status, s.bill_payment_method
  into v_table_id, v_status, v_bill_request_status, v_bill_payment_method
  from table_sessions s where s.id = p_session_id for update;

  if not found or v_status <> 'active' then
    raise exception 'active table session not found';
  end if;

  select array_agg(o.id) into v_order_ids
  from orders o
  where o.session_id = p_session_id
    and o.deleted_at is null
    and o.status in ('pending', 'preparing', 'served');

  update orders
  set status = 'paid',
      payment_status = 'paid',
      payment_method = v_bill_payment_method,
      paid_at = now()
  where id = any(v_order_ids);

  update table_sessions
  set status = 'closed', closed_at = now(),
      bill_request_status = case when v_bill_request_status = 'requested' then 'handled' else v_bill_request_status end,
      bill_handled_at = now()
  where id = p_session_id;

  select t.table_number into v_table_number
  from restaurant_tables t where t.id = v_table_id;

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'confirm_payment', 'session', p_session_id,
    'table ' || coalesce(v_table_number::text, '?') || ', orders: ' || array_to_string(v_order_ids, ','));
end;
$$;

-- 4. 硬删除操作记录审计（在 RPC 内加上 last minute 日志）
create or replace function public.admin_hard_delete_order(
  p_order_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_stored_password text;
  v_order_number bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can permanently delete orders';
  end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then raise exception '请输入删除密码'; end if;
  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码错误，无法删除订单';
  end if;

  select order_number into v_order_number from orders where id = p_order_id;

  perform set_config('app.allow_hard_delete', 'true', true);
  delete from orders where id = p_order_id;
  if not found then raise exception '订单不存在'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'hard_delete', 'order', p_order_id,
    'order #' || coalesce(v_order_number::text, '?') || ' permanently deleted');
end; $$;

create or replace function public.admin_hard_delete_menu_item(
  p_item_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_stored_password text;
  v_item_name text;
begin
  if not (select private.is_admin()) then raise exception 'only admin can permanently delete menu items'; end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then raise exception '请输入删除密码'; end if;
  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;

  select name_zh into v_item_name from menu_items where id = p_item_id;

  update order_items set menu_item_id = null where menu_item_id = p_item_id;
  delete from cart_items where menu_item_id = p_item_id;
  delete from menu_items where id = p_item_id;
  if not found then raise exception '菜品不存在'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'hard_delete', 'menu_item', p_item_id,
    'item "' || coalesce(v_item_name, '?') || '" permanently deleted');
end; $$;

create or replace function public.admin_hard_delete_menu_category(
  p_category_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_stored_password text;
  v_cat_name text;
begin
  if not (select private.is_admin()) then raise exception 'only admin can permanently delete categories'; end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then raise exception '请输入删除密码'; end if;
  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;

  select name_zh into v_cat_name from menu_categories where id = p_category_id;

  update menu_items set category_id = null where category_id = p_category_id;
  delete from menu_categories where id = p_category_id;
  if not found then raise exception '分类不存在'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'hard_delete', 'menu_category', p_category_id,
    'category "' || coalesce(v_cat_name, '?') || '" permanently deleted');
end; $$;
