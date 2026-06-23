-- ============================================================
-- 2026-06: Admin-only destructive operations + is_admin function
-- ============================================================

-- 1. Add is_admin() function
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

-- 2. Hard delete RPCs: require admin (not just staff)
-- admin_hard_delete_order
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
  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除订单';
  end if;
  perform set_config('app.allow_hard_delete', 'true', true);
  delete from orders where id = p_order_id;
  if not found then raise exception '订单不存在'; end if;
end; $$;

-- admin_hard_delete_menu_item
create or replace function public.admin_hard_delete_menu_item(
  p_item_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare v_stored_password text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can permanently delete menu items';
  end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;
  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;
  update order_items set menu_item_id = null where menu_item_id = p_item_id;
  delete from cart_items where menu_item_id = p_item_id;
  delete from menu_items where id = p_item_id;
  if not found then raise exception '菜品不存在'; end if;
end; $$;

-- admin_hard_delete_menu_category
create or replace function public.admin_hard_delete_menu_category(
  p_category_id uuid, p_password text
) returns void language plpgsql security definer set search_path = public as $$
declare v_stored_password text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can permanently delete categories';
  end if;
  select delete_password into v_stored_password from restaurant_settings limit 1;
  if v_stored_password is null or v_stored_password = '' then
    raise exception '删除密码未设置，请联系技术人员通过数据库配置';
  end if;
  if p_password is null or p_password = '' then
    raise exception '请输入删除密码';
  end if;
  if p_password <> v_stored_password then
    raise exception '删除密码错误，无法删除';
  end if;
  update menu_items set category_id = null where category_id = p_category_id;
  delete from menu_categories where id = p_category_id;
  if not found then raise exception '分类不存在'; end if;
end; $$;

-- 3. Table management: require admin
create or replace function public.create_restaurant_table(p_table_number int, p_label text default null)
returns table(id uuid, table_number int, qr_token text)
language plpgsql security definer set search_path = public as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can create tables';
  end if;
  return query
  insert into restaurant_tables (table_number, label)
  values (p_table_number, p_label)
  returning restaurant_tables.id, restaurant_tables.table_number, restaurant_tables.qr_token;
end; $$;

create or replace function public.regenerate_table_qr_token(p_table_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can regenerate QR tokens';
  end if;
  update restaurant_tables
  set qr_token = encode(gen_random_bytes(16), 'hex')
  where id = p_table_id
  returning qr_token into v_token;
  if v_token is null then raise exception 'table not found'; end if;
  return v_token;
end; $$;
