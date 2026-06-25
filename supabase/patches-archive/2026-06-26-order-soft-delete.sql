-- Keep the existing admin delete button behavior, but archive records instead of hard deleting.
-- Historical order_items remain available for audit/export while normal admin queries hide deleted_at rows.

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function private.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'staff')
  );
$$;

grant execute on function private.is_staff() to anon, authenticated;

create table if not exists private.admin_settings (
  key text primary key,
  value text
);

revoke all on private.admin_settings from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurant_settings'
      and column_name = 'delete_password'
  ) then
    execute $migrate$
      insert into private.admin_settings (key, value)
      select 'delete_password', delete_password
      from public.restaurant_settings
      where delete_password is not null
      on conflict (key) do nothing
    $migrate$;
  end if;
end;
$$;

alter table public.orders
  add column if not exists deleted_at timestamptz;

alter table public.menu_items
  add column if not exists deleted_at timestamptz;

alter table public.menu_categories
  add column if not exists deleted_at timestamptz;

create or replace function private.protect_order_history()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
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
    or (
      new.deleted_at is distinct from old.deleted_at
      and nullif(current_setting('app.allow_order_archive', true), '') is distinct from 'true'
    )
  ) then
    raise exception 'paid order payment history cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_order_history on public.orders;
create trigger protect_order_history
before update or delete on public.orders
for each row execute function private.protect_order_history();

create or replace function public.admin_hard_delete_order(p_order_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, private
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

  perform set_config('app.allow_order_archive', 'true', true);

  update public.orders
  set deleted_at = coalesce(deleted_at, now())
  where id = p_order_id;

  if not found then
    raise exception '订单不存在';
  end if;
end;
$$;

create or replace function public.admin_hard_delete_menu_item(p_item_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, private
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

  update public.menu_items
  set deleted_at = coalesce(deleted_at, now())
  where id = p_item_id;

  if not found then
    raise exception '菜品不存在';
  end if;
end;
$$;

create or replace function public.admin_hard_delete_menu_category(p_category_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, private
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

  update public.menu_items
  set deleted_at = coalesce(deleted_at, now())
  where category_id = p_category_id;

  update public.menu_categories
  set deleted_at = coalesce(deleted_at, now())
  where id = p_category_id;

  if not found then
    raise exception '分类不存在';
  end if;
end;
$$;

create or replace function public.admin_set_delete_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public, private
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

revoke execute on function public.admin_hard_delete_order(uuid, text) from public, anon;
revoke execute on function public.admin_hard_delete_menu_item(uuid, text) from public, anon;
revoke execute on function public.admin_hard_delete_menu_category(uuid, text) from public, anon;
revoke execute on function public.admin_set_delete_password(text) from public, anon;

grant execute on function public.admin_hard_delete_order(uuid, text) to authenticated;
grant execute on function public.admin_hard_delete_menu_item(uuid, text) to authenticated;
grant execute on function public.admin_hard_delete_menu_category(uuid, text) to authenticated;
grant execute on function public.admin_set_delete_password(text) to authenticated;

create or replace function private.protect_paid_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.payment_status = 'paid' then
    if new.status <> old.status
      or new.payment_status <> old.payment_status
      or coalesce(new.payment_method, '') <> coalesce(old.payment_method, '')
      or new.paid_at <> old.paid_at
      or new.total_price <> old.total_price
      or (
        new.deleted_at is distinct from old.deleted_at
        and nullif(current_setting('app.allow_order_archive', true), '') is distinct from 'true'
      )
    then
      raise exception 'paid orders cannot be modified';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_paid_order on public.orders;
create trigger trg_protect_paid_order
before update on public.orders
for each row execute function private.protect_paid_order();
