-- P2: 删除密码改为 bcrypt hash 存储

-- 1. 启用 pgcrypto 扩展
create extension if not exists pgcrypto with schema extensions;

-- 2. 将已有明文密码转为 hash（如果已设置的话）
update restaurant_settings
set delete_password = extensions.crypt(delete_password, extensions.gen_salt('bf'))
where delete_password is not null
  and delete_password != ''
  and length(delete_password) < 60; -- 已经是 hash 的跳过（bcrypt hash 固定 60 字符）

-- 3. 创建密码设置辅助函数
create or replace function public.admin_set_delete_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can set delete password';
  end if;
  if p_password is null or p_password = '' then
    update restaurant_settings set delete_password = null;
  else
    update restaurant_settings
    set delete_password = extensions.crypt(p_password, extensions.gen_salt('bf'));
  end if;
end;
$$;

revoke execute on function public.admin_set_delete_password(text) from public, anon;
grant execute on function public.admin_set_delete_password(text) to authenticated;

-- 4. 更新三个硬删除 RPC 使用 crypt() 验证
create or replace function public.admin_hard_delete_order(
  p_order_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare v_stored_password text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can permanently delete orders';
  end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;
  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码错误，无法删除订单';
  end if;
  perform set_config('app.allow_hard_delete', 'true', true);
  delete from orders where id = p_order_id;
  if not found then raise exception '订单不存在'; end if;
end; $$;

create or replace function public.admin_hard_delete_menu_item(
  p_item_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare v_stored_password text;
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
  update order_items set menu_item_id = null where menu_item_id = p_item_id;
  delete from cart_items where menu_item_id = p_item_id;
  delete from menu_items where id = p_item_id;
  if not found then raise exception '菜品不存在'; end if;
end; $$;

create or replace function public.admin_hard_delete_menu_category(
  p_category_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare v_stored_password text;
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
  update menu_items set category_id = null where category_id = p_category_id;
  delete from menu_categories where id = p_category_id;
  if not found then raise exception '分类不存在'; end if;
end; $$;
