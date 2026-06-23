-- ============================================================
-- 2026-06: 售罄标记 + 订单硬删除 + 删除二级密码
-- ============================================================

-- 1. 菜单项增加售罄标记
alter table public.menu_items
  add column if not exists is_sold_out boolean not null default false;

-- 2. 餐馆设置增加删除密码
alter table public.restaurant_settings
  add column if not exists delete_password text;

-- 3. 修改保护触发器：允许通过配置变量绕过删除保护
create or replace function private.protect_order_history()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    -- 如果设置了允许硬删除标记，则放行
    if nullif(current_setting('app.allow_hard_delete', true), '') = 'true' then
      return old;
    end if;
    raise exception 'orders must be archived, not deleted';
  end if;
  if old.status = 'paid' and (
    new.status is distinct from old.status
    or new.payment_status is distinct from old.payment_status
    or new.payment_method is distinct from old.payment_method
    or new.paid_at is distinct from old.paid_at
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'paid order payment history cannot be changed';
  end if;
  return new;
end;
$$;

-- 4. 订单硬删除 RPC（需二级密码验证）
create or replace function public.admin_hard_delete_order(
  p_order_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_password text;
  v_order_status text;
begin
  -- 权限检查
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  -- 读取存储的删除密码
  select delete_password into v_stored_password
  from restaurant_settings
  limit 1;

  -- 密码未设置
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;

  -- 验证密码
  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;

  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除订单';
  end if;

  -- 检查订单是否存在
  select status into v_order_status
  from orders
  where id = p_order_id;

  if not found then
    raise exception '订单不存在';
  end if;

  -- 设置绕过标记，执行硬删除（order_items 会级联删除）
  perform set_config('app.allow_hard_delete', 'true', true);
  delete from orders where id = p_order_id;
end;
$$;

-- 权限授予
revoke execute on function public.admin_hard_delete_order(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_order(uuid, text) to authenticated;

-- 5. 菜单项硬删除 RPC（需二级密码验证，自动解除 order_items 外键引用）
create or replace function public.admin_hard_delete_menu_item(
  p_item_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_password text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select delete_password into v_stored_password
  from restaurant_settings
  limit 1;

  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;

  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;

  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;

  -- 解除 order_items 的外键引用（历史快照已保留菜名）
  update order_items set menu_item_id = null where menu_item_id = p_item_id;

  -- 删除关联的购物车项
  delete from cart_items where menu_item_id = p_item_id;

  -- 硬删除菜品
  delete from menu_items where id = p_item_id;

  if not found then
    raise exception '菜品不存在';
  end if;
end;
$$;

revoke execute on function public.admin_hard_delete_menu_item(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_menu_item(uuid, text) to authenticated;

-- 6. 菜单分类硬删除 RPC（需二级密码验证）
create or replace function public.admin_hard_delete_menu_category(
  p_category_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_password text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select delete_password into v_stored_password
  from restaurant_settings
  limit 1;

  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;

  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;

  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;

  -- 旗下菜品设为无分类
  update menu_items set category_id = null where category_id = p_category_id;

  -- 硬删除分类
  delete from menu_categories where id = p_category_id;

  if not found then
    raise exception '分类不存在';
  end if;
end;
$$;

revoke execute on function public.admin_hard_delete_menu_category(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_menu_category(uuid, text) to authenticated;
