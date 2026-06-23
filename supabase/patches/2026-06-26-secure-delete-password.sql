-- 移动 delete_password 到 private schema
-- public.restaurant_settings 不再存储删除密码

-- 1. 创建 private.admin_settings（如果不存在）
create table if not exists private.admin_settings (
  key text primary key,
  value text
);
revoke all on private.admin_settings from public, anon, authenticated;

-- 2. 迁移旧 delete_password 到 private（如果有值）
insert into private.admin_settings (key, value)
select 'delete_password', delete_password
from public.restaurant_settings
where delete_password is not null
on conflict (key) do nothing;

-- 3. 从 public.restaurant_settings 删除 delete_password 列
alter table public.restaurant_settings drop column if exists delete_password;

-- 4. 更新 RPC：从 private 表读取
create or replace function public.admin_hard_delete_order(p_order_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, private
as $$
declare
  v_stored_password text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select value into v_stored_password
  from private.admin_settings
  where key = 'delete_password';

  if v_stored_password is null then
    raise exception '请先设置删除密码';
  end if;

  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码不正确';
  end if;

  delete from order_items where order_id = p_order_id;
  delete from orders where id = p_order_id;

  -- cleanup bill requests
  delete from bill_requests where session_id not in (select id from table_sessions);
end;
$$;

create or replace function public.admin_hard_delete_menu_item(p_item_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, private
as $$
declare
  v_stored_password text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select value into v_stored_password
  from private.admin_settings
  where key = 'delete_password';

  if v_stored_password is null then
    raise exception '请先设置删除密码';
  end if;

  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码不正确';
  end if;

  update public.menu_items set deleted_at = now() where id = p_item_id;
end;
$$;

create or replace function public.admin_hard_delete_menu_category(p_category_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, private
as $$
declare
  v_stored_password text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select value into v_stored_password
  from private.admin_settings
  where key = 'delete_password';

  if v_stored_password is null then
    raise exception '请先设置删除密码';
  end if;

  if extensions.crypt(p_password, v_stored_password) <> v_stored_password then
    raise exception '删除密码不正确';
  end if;

  update public.menu_items set deleted_at = now() where category_id = p_category_id;
  update public.menu_categories set deleted_at = now() where id = p_category_id;
end;
$$;

create or replace function public.admin_set_delete_password(p_password text)
returns void
language plpgsql security definer set search_path = public, private
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  insert into private.admin_settings (key, value)
  values ('delete_password', extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end;
$$;
