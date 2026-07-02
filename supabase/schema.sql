-- LEGACY WARNING:
-- This file is kept only as an old schema snapshot for reference.
-- Do NOT use it to initialize a new customer database.
-- New customer setup must run supabase/client-init.sql only.
-- Current 1.0 delivery has no active customer upgrade patches.

-- Wok Dragon Express / 龙城酒楼 legacy schema snapshot.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff')),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_settings
  add column if not exists name_zh text,
  add column if not exists name_en text,
  add column if not exists name_el text,
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists intro_zh text,
  add column if not exists intro_en text,
  add column if not exists intro_el text,
  add column if not exists phone text,
  add column if not exists whatsapp_url text,
  add column if not exists instagram_url text,
  add column if not exists address_zh text,
  add column if not exists address_en text,
  add column if not exists address_el text,
  add column if not exists map_url text,
  add column if not exists opening_hours_zh text,
  add column if not exists opening_hours_en text,
  add column if not exists opening_hours_el text,
  add column if not exists wolt_url text,
  add column if not exists efood_url text,
  add column if not exists box_url text,
  add column if not exists accept_pos_payment boolean not null default true,
  add column if not exists accept_cash_payment boolean not null default true;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_payment_method_check,
  add constraint restaurant_settings_payment_method_check
    check (accept_pos_payment or accept_cash_payment);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  name_el text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.menu_categories(id) on delete set null,
  name_zh text not null,
  name_en text,
  name_el text,
  description_zh text,
  description_en text,
  description_el text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  is_sold_out boolean not null default false,
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_categories_active_sort
  on public.menu_categories (is_active, sort_order);

create index if not exists idx_menu_categories_deleted_sort
  on public.menu_categories (deleted_at, sort_order);

create index if not exists idx_menu_items_category_available_sort
  on public.menu_items (category_id, is_available, sort_order);

create index if not exists idx_menu_items_deleted_category_sort
  on public.menu_items (deleted_at, category_id, sort_order);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number int not null unique check (table_number > 0),
  label text,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  bill_requested_at timestamptz,
  bill_request_status text not null default 'none' check (bill_request_status in ('none', 'requested', 'handled')),
  bill_payment_method text check (bill_payment_method is null or bill_payment_method in ('pos', 'cash')),
  bill_handled_at timestamptz,
  cart_version int not null default 0,
  cart_updated_at timestamptz not null default now()
);

create table if not exists public.table_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  added_by uuid references auth.users(id) on delete set null,
  quantity int not null check (quantity > 0),
  note text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  submitted_by uuid references auth.users(id) on delete set null,
  client_request_id uuid not null unique,
  status text not null default 'pending' check (status in ('pending', 'preparing', 'served', 'paid', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  payment_method text check (payment_method is null or payment_method in ('pos', 'cash')),
  paid_at timestamptz,
  total_price numeric(10, 2) not null check (total_price >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  item_name_zh text not null,
  item_name_en text,
  item_name_el text,
  quantity int not null check (quantity > 0),
  note text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(10, 2) not null check (line_total >= 0)
);

create unique index if not exists idx_table_sessions_one_active
  on public.table_sessions (table_id)
  where status = 'active';

create index if not exists idx_table_sessions_table_status
  on public.table_sessions (table_id, status);

create index if not exists idx_table_session_participants_user_session
  on public.table_session_participants (user_id, session_id);

create index if not exists idx_cart_items_session
  on public.cart_items (session_id);

create unique index if not exists idx_cart_items_merge
  on public.cart_items (session_id, menu_item_id, (coalesce(note, ''::text)));

create index if not exists idx_orders_session
  on public.orders (session_id);

create index if not exists idx_orders_table_created
  on public.orders (table_id, created_at desc);

create index if not exists idx_orders_deleted_created
  on public.orders (deleted_at, created_at desc);

create index if not exists idx_order_items_order
  on public.order_items (order_id);

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

create or replace function private.is_staff()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'staff')
  );
$$;

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_settings_updated_at on public.restaurant_settings;
create trigger set_restaurant_settings_updated_at
before update on public.restaurant_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_menu_categories_updated_at on public.menu_categories;
create trigger set_menu_categories_updated_at
before update on public.menu_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_menu_items_updated_at on public.menu_items;
create trigger set_menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_staff() to anon, authenticated;
grant select on public.restaurant_settings to anon, authenticated;
grant select on public.menu_categories to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.restaurant_settings to authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant insert, update, delete on public.menu_items to authenticated;

drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_staff())
);

drop policy if exists "profiles_staff_manage" on public.profiles;
create policy "profiles_staff_manage"
on public.profiles
for all
to authenticated
using (
  (select private.is_admin())
)
with check (
  (select private.is_admin())
);

drop policy if exists "settings_public_read" on public.restaurant_settings;
create policy "settings_public_read"
on public.restaurant_settings
for select
to anon, authenticated
using (true);

drop policy if exists "settings_staff_manage" on public.restaurant_settings;
create policy "settings_staff_manage"
on public.restaurant_settings
for all
to authenticated
using (
  (select private.is_staff())
)
with check (
  (select private.is_staff())
);

drop policy if exists "categories_public_read_active" on public.menu_categories;
create policy "categories_public_read_active"
on public.menu_categories
for select
to anon, authenticated
using (
  (deleted_at is null and is_active = true)
  or (select private.is_staff())
);

drop policy if exists "categories_staff_manage" on public.menu_categories;
create policy "categories_staff_manage"
on public.menu_categories
for all
to authenticated
using (
  (select private.is_staff())
)
with check (
  (select private.is_staff())
);

drop policy if exists "items_public_read_available" on public.menu_items;
create policy "items_public_read_available"
on public.menu_items
for select
to anon, authenticated
using (
  (deleted_at is null and is_available = true)
  or (select private.is_staff())
);

drop policy if exists "items_staff_manage" on public.menu_items;
create policy "items_staff_manage"
on public.menu_items
for all
to authenticated
using (
  (select private.is_staff())
)
with check (
  (select private.is_staff())
);

drop trigger if exists set_restaurant_tables_updated_at on public.restaurant_tables;
create trigger set_restaurant_tables_updated_at
before update on public.restaurant_tables
for each row execute function public.set_updated_at();

drop trigger if exists set_cart_items_updated_at on public.cart_items;
create trigger set_cart_items_updated_at
before update on public.cart_items
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function private.guard_cart_ordering_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session_id uuid;
begin
  v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  if (select private.is_staff()) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not exists (
    select 1 from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = v_session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'ordering is closed for this table session';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_order_submission_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (select private.is_staff()) then return new; end if;
  if not exists (
    select 1 from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = new.session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'ordering is closed for this table session';
  end if;
  return new;
end;
$$;

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
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'paid order payment history cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_cart_ordering_open() from public, anon, authenticated;
revoke execute on function private.guard_order_submission_open() from public, anon, authenticated;
revoke execute on function private.protect_order_history() from public, anon, authenticated;

drop trigger if exists guard_cart_ordering_open on public.cart_items;
create trigger guard_cart_ordering_open
before insert or update or delete on public.cart_items
for each row execute function private.guard_cart_ordering_open();

drop trigger if exists guard_order_submission_open on public.orders;
create trigger guard_order_submission_open
before insert on public.orders
for each row execute function private.guard_order_submission_open();

drop trigger if exists protect_order_history on public.orders;
create trigger protect_order_history
before update or delete on public.orders
for each row execute function private.protect_order_history();

alter table public.restaurant_tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.table_session_participants enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

alter table public.table_sessions replica identity full;
alter table public.cart_items replica identity full;
alter table public.orders replica identity full;
alter table public.order_items replica identity full;

grant select, insert, update, delete on public.restaurant_tables to authenticated;
grant select, insert, update, delete on public.table_sessions to authenticated;
grant select, insert, update, delete on public.table_session_participants to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;

drop policy if exists "tables_staff_manage" on public.restaurant_tables;
create policy "tables_staff_manage"
on public.restaurant_tables
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "sessions_participant_read" on public.table_sessions;
create policy "sessions_participant_read"
on public.table_sessions
for select
to authenticated
using (
  (select private.is_staff())
  or exists (
    select 1
    from public.table_session_participants p
    where p.session_id = table_sessions.id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "sessions_staff_manage" on public.table_sessions;
create policy "sessions_staff_manage"
on public.table_sessions
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "participants_self_or_staff_read" on public.table_session_participants;
create policy "participants_self_or_staff_read"
on public.table_session_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_staff())
);

drop policy if exists "participants_staff_manage" on public.table_session_participants;
create policy "participants_staff_manage"
on public.table_session_participants
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "cart_participant_read" on public.cart_items;
create policy "cart_participant_read"
on public.cart_items
for select
to authenticated
using (
  (select private.is_staff())
  or exists (
    select 1
    from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = cart_items.session_id
      and s.status = 'active'
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "cart_staff_manage" on public.cart_items;
create policy "cart_staff_manage"
on public.cart_items
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "orders_participant_read" on public.orders;
create policy "orders_participant_read"
on public.orders
for select
to authenticated
using (
  (select private.is_staff())
  or (
    deleted_at is null
    and exists (
      select 1
      from public.table_session_participants p
      where p.session_id = orders.session_id
        and p.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "orders_staff_manage" on public.orders;
create policy "orders_staff_manage"
on public.orders
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "order_items_participant_read" on public.order_items;
create policy "order_items_participant_read"
on public.order_items
for select
to authenticated
using (
  (select private.is_staff())
  or exists (
    select 1
    from public.orders o
    join public.table_session_participants p on p.session_id = o.session_id
    where o.id = order_items.order_id
      and o.deleted_at is null
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "order_items_staff_manage" on public.order_items;
create policy "order_items_staff_manage"
on public.order_items
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

create or replace function public.join_table_session(p_qr_token text)
returns table(session_id uuid, table_id uuid, table_number int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table restaurant_tables%rowtype;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select *
  into v_table
  from restaurant_tables
  where qr_token = p_qr_token
    and is_active = true;

  if not found then
    raise exception 'table qr code is invalid or disabled';
  end if;

  select ts.id
  into v_session_id
  from table_sessions ts
  where ts.table_id = v_table.id
    and ts.status = 'active'
  limit 1;

  if v_session_id is null then
    begin
      insert into table_sessions (table_id, status)
      values (v_table.id, 'active')
      returning id into v_session_id;
    exception when unique_violation then
      select ts.id
      into v_session_id
      from table_sessions ts
      where ts.table_id = v_table.id
        and ts.status = 'active'
      limit 1;
    end;
  end if;

  insert into table_session_participants (session_id, user_id)
  values (v_session_id, v_user_id)
  on conflict on constraint table_session_participants_session_id_user_id_key do nothing;

  return query select v_session_id as session_id, v_table.id as table_id, v_table.table_number as table_number;
end;
$$;

create or replace function public.add_cart_item(
  p_session_id uuid,
  p_menu_item_id uuid,
  p_quantity int,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_price numeric(10, 2);
  v_cart_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if p_quantity > 99 then
    raise exception 'quantity cannot exceed 99';
  end if;

  if not exists (
    select 1
    from table_sessions s
    join table_session_participants tsp on tsp.session_id = s.id
    where s.id = p_session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and tsp.user_id = v_user_id
  ) then
    raise exception 'not a participant of this active table session';
  end if;

  select price
  into v_price
  from menu_items
  where id = p_menu_item_id
    and is_available = true;

  if v_price is null then
    raise exception 'menu item is unavailable';
  end if;

  insert into cart_items (session_id, menu_item_id, added_by, quantity, note, unit_price)
  values (p_session_id, p_menu_item_id, v_user_id, p_quantity, nullif(trim(coalesce(p_note, '')), ''), v_price)
  on conflict (session_id, menu_item_id, (coalesce(note, ''::text))) do update
    set quantity = cart_items.quantity + excluded.quantity,
        updated_at = now()
  returning id into v_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  return v_cart_item_id;
end;
$$;

create or replace function public.update_cart_item_quantity(p_cart_item_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if p_quantity > 99 then
    raise exception 'quantity cannot exceed 99';
  end if;

  select ci.session_id
  into v_session_id
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants tsp on tsp.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id;

  if v_session_id is null then
    raise exception 'cart item is not available for this user';
  end if;

  update cart_items
  set quantity = p_quantity
  where id = p_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = v_session_id;
end;
$$;

create or replace function public.remove_cart_item(p_cart_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select ci.session_id
  into v_session_id
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants tsp on tsp.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id;

  if v_session_id is null then
    raise exception 'cart item is not available for this user';
  end if;

  delete from cart_items where id = p_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = v_session_id;
end;
$$;

create or replace function public.update_cart_item_note(p_cart_item_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select ci.session_id
  into v_session_id
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants tsp on tsp.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id;

  if v_session_id is null then
    raise exception 'cart item is not available for this user';
  end if;

  update cart_items
  set note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_cart_item_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = v_session_id;
end;
$$;

create or replace function public.submit_order(p_session_id uuid, p_client_request_id uuid)
returns table(order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_existing_session_id uuid;
  v_existing_order_id uuid;
  v_existing_order_number bigint;
  v_total numeric(10, 2);
  v_order_id uuid;
  v_order_number bigint;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_client_request_id is null then
    raise exception 'client_request_id is required';
  end if;

  -- 幂等性检查：相同 client_request_id 直接返回已有订单
  select o.id, o.order_number, o.session_id
  into v_existing_order_id, v_existing_order_number, v_existing_session_id
  from orders o
  where o.client_request_id = p_client_request_id;

  if v_existing_order_id is not null then
    if v_existing_session_id <> p_session_id then
      raise exception 'client_request_id belongs to a different session';
    end if;
    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  join table_session_participants tsp on tsp.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and s.bill_request_status = 'none'
    and tsp.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'not a participant of this active table session';
  end if;

  -- 再次幂等性检查（防止并发竞态）
  select o.id, o.order_number, o.session_id
  into v_existing_order_id, v_existing_order_number, v_existing_session_id
  from orders o
  where o.client_request_id = p_client_request_id;

  if v_existing_order_id is not null then
    if v_existing_session_id <> p_session_id then
      raise exception 'client_request_id belongs to a different session';
    end if;
    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  perform 1
  from cart_items ci
  where ci.session_id = p_session_id
  for update;

  select coalesce(sum(ci.unit_price * ci.quantity), 0)
  into v_total
  from cart_items ci
  where ci.session_id = p_session_id;

  if v_total <= 0 then
    raise exception 'cart is empty';
  end if;

  -- 检查该 session 是否已有 pending 订单，有则合并而非新建
  select o.id, o.order_number
  into v_existing_order_id, v_existing_order_number
  from orders o
  where o.session_id = p_session_id
    and o.status = 'pending'
    and o.deleted_at is null
  order by o.created_at asc
  limit 1
  for update of o;

  if v_existing_order_id is not null then
    -- 合并：将购物车项追加到已有 pending 订单
    insert into order_items (
      order_id,
      menu_item_id,
      item_name_zh,
      item_name_en,
      item_name_el,
      quantity,
      note,
      unit_price,
      line_total
    )
    select
      v_existing_order_id,
      ci.menu_item_id,
      mi.name_zh,
      mi.name_en,
      mi.name_el,
      ci.quantity,
      ci.note,
      ci.unit_price,
      ci.unit_price * ci.quantity
    from cart_items ci
    join menu_items mi on mi.id = ci.menu_item_id
    where ci.session_id = p_session_id;

    -- 更新总价，重置打印标记以便厨房看到新菜品
    update orders
    set total_price = total_price + v_total,
        kitchen_printed_at = null
    where id = v_existing_order_id;

    -- 清空购物车
    delete from cart_items ci
    where ci.session_id = p_session_id;

    update table_sessions
    set cart_version = cart_version + 1,
        cart_updated_at = now()
    where id = p_session_id;

    return query select v_existing_order_id, v_existing_order_number;
    return;
  end if;

  -- 无 pending 订单，新建
  insert into orders (session_id, table_id, submitted_by, client_request_id, status, total_price)
  values (p_session_id, v_table_id, v_user_id, p_client_request_id, 'pending', v_total)
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into order_items (
    order_id,
    menu_item_id,
    item_name_zh,
    item_name_en,
    item_name_el,
    quantity,
    note,
    unit_price,
    line_total
  )
  select
    v_order_id,
    ci.menu_item_id,
    mi.name_zh,
    mi.name_en,
    mi.name_el,
    ci.quantity,
    ci.note,
    ci.unit_price,
    ci.unit_price * ci.quantity
  from cart_items ci
  join menu_items mi on mi.id = ci.menu_item_id
  where ci.session_id = p_session_id;

  delete from cart_items ci
  where ci.session_id = p_session_id;

  update table_sessions
  set cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  return query select v_order_id, v_order_number;
end;
$$;

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  select status into v_current_status from orders
  where id = p_order_id and deleted_at is null;

  if not found then
    raise exception 'order not found';
  end if;

  -- paid 订单不可修改
  if v_current_status = 'paid' then
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

  update orders set status = p_status
  where id = p_order_id and deleted_at is null;
end;
$$;

create or replace function public.close_table_session(p_session_id uuid)
returns table(open_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count int := 0;
  v_open_count int := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  perform 1
  from table_sessions s
  where s.id = p_session_id
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'active table session not found';
  end if;

  select count(*)::int
  into v_open_count
  from orders
  where session_id = p_session_id
    and deleted_at is null
    and status in ('pending', 'preparing', 'served');

  if v_open_count > 0 then
    raise exception 'finish or cancel open orders before clearing the table';
  end if;

  if exists (
    select 1 from table_sessions
    where id = p_session_id and bill_request_status = 'requested'
  ) then
    raise exception 'confirm the bill request before clearing the table';
  end if;

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set status = 'closed',
      closed_at = now(),
      cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  return query select v_open_count, v_deleted_count;
end;
$$;

create or replace function public.create_restaurant_table(p_table_number int, p_label text default null)
returns table(id uuid, table_number int, qr_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can create tables';
  end if;

  return query
  insert into restaurant_tables (table_number, label)
  values (p_table_number, p_label)
  returning restaurant_tables.id, restaurant_tables.table_number, restaurant_tables.qr_token;
end;
$$;

create or replace function public.regenerate_table_qr_token(p_table_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can regenerate QR tokens';
  end if;

  update restaurant_tables
  set qr_token = encode(gen_random_bytes(16), 'hex')
  where id = p_table_id
  returning qr_token into v_token;

  if v_token is null then
    raise exception 'table not found';
  end if;

  return v_token;
end;
$$;

revoke execute on function public.join_table_session(text) from public, anon, authenticated;
revoke execute on function public.add_cart_item(uuid, uuid, int, text) from public, anon;
revoke execute on function public.update_cart_item_quantity(uuid, int) from public, anon;
revoke execute on function public.remove_cart_item(uuid) from public, anon;
revoke execute on function public.update_cart_item_note(uuid, text) from public, anon;
revoke execute on function public.submit_order(uuid, uuid) from public, anon;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.close_table_session(uuid) from public, anon;
revoke execute on function public.create_restaurant_table(int, text) from public, anon;
revoke execute on function public.regenerate_table_qr_token(uuid) from public, anon;

grant execute on function public.add_cart_item(uuid, uuid, int, text) to authenticated;
grant execute on function public.update_cart_item_quantity(uuid, int) to authenticated;
grant execute on function public.remove_cart_item(uuid) to authenticated;
grant execute on function public.update_cart_item_note(uuid, text) to authenticated;
grant execute on function public.submit_order(uuid, uuid) to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.close_table_session(uuid) to authenticated;
grant execute on function public.create_restaurant_table(int, text) to authenticated;
grant execute on function public.regenerate_table_qr_token(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.table_sessions;
    exception when duplicate_object then
      null;
    end;
    begin
      alter publication supabase_realtime add table public.cart_items;
    exception when duplicate_object then
      null;
    end;
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then
      null;
    end;
    begin
      alter publication supabase_realtime add table public.order_items;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

-- Keep one current session ready for each table while requiring staff approval
-- before a device from a closed session can join it.

create table if not exists public.table_reentry_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  closed_session_id uuid not null references public.table_sessions(id) on delete restrict,
  target_session_id uuid not null references public.table_sessions(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  unique (target_session_id, requested_by)
);

create index if not exists idx_table_reentry_requests_status
  on public.table_reentry_requests (status, requested_at desc);

create index if not exists idx_table_reentry_requests_closed_session
  on public.table_reentry_requests (closed_session_id);

create index if not exists idx_table_reentry_requests_table
  on public.table_reentry_requests (table_id);

create index if not exists idx_table_reentry_requests_requested_by
  on public.table_reentry_requests (requested_by);

create index if not exists idx_table_reentry_requests_handled_by
  on public.table_reentry_requests (handled_by);

alter table public.table_reentry_requests enable row level security;
alter table public.table_reentry_requests replica identity full;

grant select on public.table_reentry_requests to authenticated;
revoke insert, update, delete on public.table_reentry_requests from authenticated, anon;

drop policy if exists "table_reentry_requester_or_staff_read" on public.table_reentry_requests;
create policy "table_reentry_requester_or_staff_read"
on public.table_reentry_requests
for select
to authenticated
using (
  requested_by = (select auth.uid())
  or (select private.is_staff())
);

create or replace function private.ensure_active_table_session(p_table_id uuid)
returns uuid
language plpgsql
set search_path = public, private
as $$
declare
  v_session_id uuid;
begin
  select s.id
  into v_session_id
  from public.table_sessions s
  where s.table_id = p_table_id
    and s.status = 'active'
  limit 1;

  if v_session_id is null then
    begin
      insert into public.table_sessions (table_id, status)
      values (p_table_id, 'active')
      returning id into v_session_id;
    exception when unique_violation then
      select s.id
      into v_session_id
      from public.table_sessions s
      where s.table_id = p_table_id
        and s.status = 'active'
      limit 1;
    end;
  end if;

  return v_session_id;
end;
$$;

create or replace function public.get_table_entry_state(p_qr_token text)
returns table(active_session_id uuid, table_id uuid, table_number int, participant_count int, unfinished_order_count int, is_occupied boolean)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_table restaurant_tables%rowtype;
  v_session_id uuid;
  v_participant_count int;
  v_order_count int;
begin
  if v_user_id is null then raise exception 'anonymous sign-in is required'; end if;
  select * into v_table from restaurant_tables where qr_token = p_qr_token and is_active = true;
  if not found then raise exception 'table qr code is invalid or disabled'; end if;
  select s.id into v_session_id from table_sessions s where s.table_id = v_table.id and s.status = 'active' limit 1;
  if v_session_id is null then
    begin
      insert into table_sessions (table_id, status) values (v_table.id, 'active') returning id into v_session_id;
    exception when unique_violation then
      select s.id into v_session_id from table_sessions s where s.table_id = v_table.id and s.status = 'active' limit 1;
    end;
  end if;
  select count(*)::int into v_participant_count from table_session_participants p where p.session_id = v_session_id;
  select count(*)::int into v_order_count from orders o where o.session_id = v_session_id and o.status in ('pending', 'preparing', 'served');
  return query select v_session_id, v_table.id, v_table.table_number, v_participant_count, v_order_count,
    (v_participant_count > 0 or v_order_count > 0);
end;
$$;

create or replace function public.enter_table_session(p_qr_token text, p_expected_session_id uuid, p_require_empty boolean default false)
returns table(session_id uuid, table_id uuid, table_number int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table restaurant_tables%rowtype;
  v_session_id uuid;
  v_participant_count int;
  v_order_count int;
begin
  if v_user_id is null then raise exception 'anonymous sign-in is required'; end if;
  select * into v_table from restaurant_tables where qr_token = p_qr_token and is_active = true for update;
  if not found then raise exception 'table qr code is invalid or disabled'; end if;
  select s.id into v_session_id from table_sessions s where s.table_id = v_table.id and s.status = 'active' limit 1;
  if v_session_id is null then
    insert into table_sessions (table_id, status) values (v_table.id, 'active') returning id into v_session_id;
  end if;
  if p_expected_session_id is null or v_session_id <> p_expected_session_id then
    raise exception 'table session changed; please try again';
  end if;
  select count(*)::int into v_participant_count from table_session_participants p where p.session_id = v_session_id;
  select count(*)::int into v_order_count from orders o where o.session_id = v_session_id and o.status in ('pending', 'preparing', 'served');
  if coalesce(p_require_empty, false) and (v_participant_count > 0 or v_order_count > 0) then
    raise exception 'table is currently in use';
  end if;
  insert into table_session_participants (session_id, user_id) values (v_session_id, v_user_id)
  on conflict on constraint table_session_participants_session_id_user_id_key do nothing;
  return query select v_session_id, v_table.id, v_table.table_number;
end;
$$;

revoke execute on function private.ensure_active_table_session(uuid) from public, anon, authenticated;

create or replace function public.create_restaurant_table(p_table_number int, p_label text default null)
returns table(id uuid, table_number int, qr_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table restaurant_tables%rowtype;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  insert into restaurant_tables (table_number, label)
  values (p_table_number, p_label)
  returning * into v_table;

  perform private.ensure_active_table_session(v_table.id);
  return query select v_table.id, v_table.table_number, v_table.qr_token;
end;
$$;

create or replace function public.close_table_session(p_session_id uuid)
returns table(open_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_deleted_count int := 0;
  v_open_count int := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  where s.id = p_session_id
    and s.status = 'active'
  for update;

  if v_table_id is null then
    raise exception 'active table session not found';
  end if;

  select count(*)::int
  into v_open_count
  from orders
  where session_id = p_session_id
    and deleted_at is null
    and status in ('pending', 'preparing', 'served');

  if v_open_count > 0 then
    raise exception 'finish or cancel open orders before clearing the table';
  end if;

  if exists (
    select 1 from table_sessions
    where id = p_session_id and bill_request_status = 'requested'
  ) then
    raise exception 'confirm the bill request before clearing the table';
  end if;

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set status = 'closed',
      closed_at = now(),
      cart_version = cart_version + 1,
      cart_updated_at = now()
  where id = p_session_id;

  perform private.ensure_active_table_session(v_table_id);
  return query select v_open_count, v_deleted_count;
end;
$$;

create or replace function public.confirm_bill_and_close_session(p_session_id uuid)
returns table(paid_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_status text;
  v_bill_status text;
  v_payment_method text;
  v_paid_count int := 0;
  v_deleted_count int := 0;
  v_now timestamptz := now();
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id, s.status, s.bill_request_status, s.bill_payment_method
  into v_table_id, v_status, v_bill_status, v_payment_method
  from table_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'table session not found';
  end if;

  if v_status <> 'active' then
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
  end if;

  if v_bill_status <> 'requested' or v_payment_method not in ('pos', 'cash') then
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
  end if;

  update orders
  set status = 'paid',
      payment_status = 'paid',
      payment_method = v_payment_method,
      paid_at = v_now,
      updated_at = v_now
  where session_id = p_session_id
    and status <> 'cancelled';
  get diagnostics v_paid_count = row_count;

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set bill_request_status = 'handled',
      bill_handled_at = v_now,
      status = 'closed',
      closed_at = v_now,
      cart_version = cart_version + 1,
      cart_updated_at = v_now
  where id = p_session_id;

  update bill_requests
  set status = 'handled', handled_at = v_now
  where session_id = p_session_id and status = 'pending';

  perform private.ensure_active_table_session(v_table_id);
  return query select v_paid_count, v_deleted_count;
end;
$$;

create or replace function public.request_table_reentry(p_closed_session_id uuid, p_qr_token text)
returns table(request_id uuid, request_status text, target_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_target_session_id uuid;
  v_request_id uuid;
  v_request_status text;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select s.table_id
  into v_table_id
  from table_sessions s
  join table_session_participants tsp on tsp.session_id = s.id
  join restaurant_tables t on t.id = s.table_id
  where s.id = p_closed_session_id
    and s.status = 'closed'
    and s.closed_at > now() - interval '24 hours'
    and tsp.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if v_table_id is null then
    raise exception 'closed table participant is required';
  end if;

  v_target_session_id := private.ensure_active_table_session(v_table_id);

  select r.id, r.status
  into v_request_id, v_request_status
  from table_reentry_requests r
  where r.target_session_id = v_target_session_id
    and r.requested_by = v_user_id;

  if v_request_id is null then
    insert into table_reentry_requests (
      table_id,
      closed_session_id,
      target_session_id,
      requested_by
    )
    values (
      v_table_id,
      p_closed_session_id,
      v_target_session_id,
      v_user_id
    )
    returning id, status into v_request_id, v_request_status;
  elsif v_request_status in ('rejected', 'expired') then
    update table_reentry_requests
    set closed_session_id = p_closed_session_id,
        status = 'pending',
        requested_at = now(),
        handled_at = null,
        handled_by = null
    where id = v_request_id
    returning status into v_request_status;
  end if;

  return query select v_request_id, v_request_status, v_target_session_id;
end;
$$;

create or replace function public.approve_table_reentry(p_request_id uuid)
returns table(request_status text, target_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request table_reentry_requests%rowtype;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select *
  into v_request
  from table_reentry_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'pending reentry request not found';
  end if;

  if not exists (
    select 1
    from table_sessions s
    where s.id = v_request.target_session_id
      and s.table_id = v_request.table_id
      and s.status = 'active'
  ) then
    update table_reentry_requests
    set status = 'expired',
        handled_at = now(),
        handled_by = auth.uid()
    where id = p_request_id;
    return query select 'expired'::text, v_request.target_session_id;
    return;
  end if;

  insert into table_session_participants (session_id, user_id)
  values (v_request.target_session_id, v_request.requested_by)
  on conflict on constraint table_session_participants_session_id_user_id_key do nothing;

  update table_reentry_requests
  set status = 'approved',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id;

  return query select 'approved'::text, v_request.target_session_id;
end;
$$;

create or replace function public.reject_table_reentry(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  update table_reentry_requests
  set status = 'rejected',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'pending reentry request not found';
  end if;
end;
$$;

insert into public.table_sessions (table_id, status)
select t.id, 'active'
from public.restaurant_tables t
where t.is_active = true
  and not exists (
    select 1
    from public.table_sessions s
    where s.table_id = t.id
      and s.status = 'active'
  )
on conflict do nothing;

revoke execute on function public.request_table_reentry(uuid, text) from public, anon;
revoke execute on function public.approve_table_reentry(uuid) from public, anon;
revoke execute on function public.reject_table_reentry(uuid) from public, anon;
grant execute on function public.request_table_reentry(uuid, text) to authenticated;
grant execute on function public.approve_table_reentry(uuid) to authenticated;
grant execute on function public.reject_table_reentry(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.table_session_participants;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.table_reentry_requests;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Customer bill requests, atomic payment/close handling, and kitchen printing.

alter table public.table_sessions
  add column if not exists bill_requested_at timestamptz,
  add column if not exists bill_request_status text not null default 'none',
  add column if not exists bill_payment_method text,
  add column if not exists bill_handled_at timestamptz;

alter table public.table_sessions
  drop constraint if exists table_sessions_bill_request_status_check,
  drop constraint if exists table_sessions_bill_payment_method_check;

alter table public.table_sessions
  add constraint table_sessions_bill_request_status_check
    check (bill_request_status in ('none', 'requested', 'handled')),
  add constraint table_sessions_bill_payment_method_check
    check (bill_payment_method is null or bill_payment_method in ('pos', 'cash'));

alter table public.orders
  add column if not exists kitchen_printed_at timestamptz,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_status_check,
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'paid')),
  add constraint orders_payment_method_check
    check (payment_method is null or payment_method in ('pos', 'cash'));

create table if not exists public.bill_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  table_number int not null,
  requested_by uuid references auth.users(id) on delete set null,
  payment_method text not null check (payment_method in ('pos', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'handled')),
  requested_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);

alter table public.bill_requests
  add column if not exists table_number int;

update public.bill_requests br
set table_number = rt.table_number
from public.restaurant_tables rt
where rt.id = br.table_id
  and br.table_number is null;

alter table public.bill_requests
  alter column table_number set not null;

alter table public.bill_requests
  drop constraint if exists bill_requests_payment_method_check;

update public.bill_requests
set payment_method = 'pos'
where payment_method = 'card';

alter table public.bill_requests
  add constraint bill_requests_payment_method_check
    check (payment_method in ('pos', 'cash'));

create unique index if not exists idx_bill_requests_one_pending_session
  on public.bill_requests (session_id)
  where status = 'pending';

create index if not exists idx_bill_requests_status_requested
  on public.bill_requests (status, requested_at desc);

create index if not exists idx_bill_requests_table
  on public.bill_requests (table_id);

create index if not exists idx_bill_requests_requested_by
  on public.bill_requests (requested_by);

create index if not exists idx_bill_requests_handled_by
  on public.bill_requests (handled_by);

alter table public.bill_requests enable row level security;
alter table public.bill_requests replica identity full;

grant select on public.bill_requests to authenticated;
revoke insert, update, delete on public.bill_requests from authenticated, anon;

drop policy if exists "bill_requests_participant_read" on public.bill_requests;
create policy "bill_requests_participant_read"
on public.bill_requests
for select
to authenticated
using (
  (select private.is_staff())
  or exists (
    select 1
    from public.table_session_participants p
    where p.session_id = bill_requests.session_id
      and p.user_id = (select auth.uid())
  )
);

create or replace function public.resume_table_session(p_session_id uuid, p_qr_token text)
returns table(
  session_id uuid,
  table_id uuid,
  table_number int,
  session_status text,
  closed_at timestamptz,
  bill_request_status text,
  bill_payment_method text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  return query
  select
    s.id,
    s.table_id,
    t.table_number,
    s.status,
    s.closed_at,
    s.bill_request_status,
    s.bill_payment_method
  from table_sessions s
  join restaurant_tables t on t.id = s.table_id
  join table_session_participants tsp on tsp.session_id = s.id
  where s.id = p_session_id
    and tsp.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if not found then
    raise exception 'saved table session is invalid for this QR code';
  end if;
end;
$$;

create or replace function public.request_bill(p_session_id uuid, p_payment_method text)
returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_id uuid;
  v_table_number int;
  v_request_id uuid;
  v_existing_method text;
  v_payment_enabled boolean;
begin
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  if p_payment_method not in ('pos', 'cash') then
    raise exception 'invalid payment method';
  end if;

  select case
    when p_payment_method = 'pos' then rs.accept_pos_payment
    else rs.accept_cash_payment
  end
  into v_payment_enabled
  from restaurant_settings rs
  order by rs.created_at
  limit 1;

  if coalesce(v_payment_enabled, false) = false then
    raise exception 'payment method is not enabled';
  end if;

  select s.table_id, t.table_number
  into v_table_id, v_table_number
  from table_sessions s
  join restaurant_tables t on t.id = s.table_id
  join table_session_participants tsp on tsp.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and tsp.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'active table participant is required';
  end if;

  if exists (select 1 from cart_items where session_id = p_session_id) then
    raise exception 'submit or remove cart items before requesting the bill';
  end if;

  if not exists (
    select 1
    from orders o
    where o.session_id = p_session_id
      and o.status <> 'cancelled'
      and o.deleted_at is null
  ) then
    raise exception 'at least one submitted order is required before requesting the bill';
  end if;

  select br.id, br.payment_method
  into v_request_id, v_existing_method
  from bill_requests br
  where br.session_id = p_session_id
    and br.status = 'pending'
  limit 1;

  if v_request_id is null then
    insert into bill_requests (session_id, table_id, table_number, requested_by, payment_method)
    values (p_session_id, v_table_id, v_table_number, v_user_id, p_payment_method)
    returning id into v_request_id;

    update table_sessions
    set bill_requested_at = now(),
        bill_request_status = 'requested',
        bill_payment_method = p_payment_method
    where id = p_session_id;
  else
    update bill_requests
    set payment_method = p_payment_method
    where id = v_request_id;

    update table_sessions
    set bill_request_status = 'requested',
        bill_payment_method = p_payment_method,
        bill_requested_at = coalesce(bill_requested_at, now())
    where id = p_session_id;
  end if;

  return query select v_request_id, 'requested'::text;
end;
$$;

create or replace function public.confirm_bill_and_close_session(p_session_id uuid)
returns table(paid_order_count int, deleted_cart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_status text;
  v_bill_status text;
  v_payment_method text;
  v_paid_count int := 0;
  v_deleted_count int := 0;
  v_now timestamptz := now();
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select s.table_id, s.status, s.bill_request_status, s.bill_payment_method
  into v_table_id, v_status, v_bill_status, v_payment_method
  from table_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'table session not found';
  end if;

  if v_status <> 'active' then
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
  end if;

  if v_bill_status <> 'requested' or v_payment_method not in ('pos', 'cash') then
    update bill_requests
    set status = 'handled', handled_at = v_now
    where session_id = p_session_id and status = 'pending';
    return query select 0, 0;
    return;
  end if;

  update orders
  set status = 'paid',
      payment_status = 'paid',
      payment_method = v_payment_method,
      paid_at = v_now,
      updated_at = v_now
  where session_id = p_session_id
    and status <> 'cancelled';
  get diagnostics v_paid_count = row_count;

  update bill_requests
  set status = 'handled',
      handled_at = v_now,
      handled_by = auth.uid()
  where session_id = p_session_id
    and status = 'pending';

  delete from cart_items
  where session_id = p_session_id;
  get diagnostics v_deleted_count = row_count;

  update table_sessions
  set bill_request_status = 'handled',
      bill_handled_at = v_now,
      status = 'closed',
      closed_at = v_now,
      cart_version = cart_version + 1,
      cart_updated_at = v_now
  where id = p_session_id;

  perform private.ensure_active_table_session(v_table_id);
  return query select v_paid_count, v_deleted_count;
end;
$$;

create or replace function public.handle_bill_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select br.session_id
  into v_session_id
  from bill_requests br
  where br.id = p_request_id
    and br.status = 'pending';

  if v_session_id is null then
    raise exception 'pending bill request not found';
  end if;

  perform * from public.confirm_bill_and_close_session(v_session_id);
end;
$$;

create or replace function public.mark_order_kitchen_printed(p_order_id uuid)
returns table(is_reprint boolean, printed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous timestamptz;
  v_printed_at timestamptz := now();
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select o.kitchen_printed_at
  into v_previous
  from orders o
  where o.id = p_order_id and o.deleted_at is null
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  update orders
  set kitchen_printed_at = v_printed_at
  where id = p_order_id;

  return query select v_previous is not null, v_printed_at;
end;
$$;

revoke execute on function public.resume_table_session(uuid, text) from public, anon;
revoke execute on function public.get_table_entry_state(text) from public, anon;
revoke execute on function public.enter_table_session(text, uuid, boolean) from public, anon;
revoke execute on function public.request_bill(uuid, text) from public, anon;
revoke execute on function public.confirm_bill_and_close_session(uuid) from public, anon;
revoke execute on function public.handle_bill_request(uuid) from public, anon;
revoke execute on function public.mark_order_kitchen_printed(uuid) from public, anon;
grant execute on function public.resume_table_session(uuid, text) to authenticated;
grant execute on function public.get_table_entry_state(text) to authenticated;
grant execute on function public.enter_table_session(text, uuid, boolean) to authenticated;
grant execute on function public.request_bill(uuid, text) to authenticated;
grant execute on function public.confirm_bill_and_close_session(uuid) to authenticated;
grant execute on function public.handle_bill_request(uuid) to authenticated;
grant execute on function public.mark_order_kitchen_printed(uuid) to authenticated;

-- Hard delete order with secondary password verification
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
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can permanently delete orders';
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
    raise exception '删除密码错误，无法删除订单';
  end if;

  perform set_config('app.allow_hard_delete', 'true', true);
  delete from orders where id = p_order_id;

  if not found then
    raise exception '订单不存在';
  end if;
end;
$$;

revoke execute on function public.admin_hard_delete_order(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_order(uuid, text) to authenticated;

-- Hard delete menu item with password verification
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

-- Hard delete menu category with password verification
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
  v_item_count int;
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
  select count(*) into v_item_count from menu_items where category_id = p_category_id and deleted_at is null;
  update menu_items set category_id = null where category_id = p_category_id;

  -- 硬删除分类（菜单项的 category_id 会通过 ON DELETE SET NULL 置空）
  delete from menu_categories where id = p_category_id;

  if not found then
    raise exception '分类不存在';
  end if;
end;
$$;

revoke execute on function public.admin_hard_delete_menu_category(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_menu_category(uuid, text) to authenticated;

-- Operational reliability: ordering pause, complete admin statistics, and session pagination.

alter table public.restaurant_settings
  add column if not exists ordering_enabled boolean not null default true,
  add column if not exists ordering_paused_at timestamptz;

alter table public.restaurant_settings
  add column if not exists delete_password text;

create index if not exists idx_orders_admin_history
  on public.orders (deleted_at, created_at desc, session_id, status, table_id);

create or replace function private.guard_cart_ordering_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session_id uuid := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  v_ordering_enabled boolean;
begin
  if (select private.is_staff()) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = v_session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'ordering is closed for this table session';
  end if;

  select coalesce(rs.ordering_enabled, true)
  into v_ordering_enabled
  from public.restaurant_settings rs
  order by rs.created_at
  limit 1;

  if coalesce(v_ordering_enabled, true) = false then
    if tg_op = 'INSERT' then
      raise exception 'restaurant ordering is temporarily paused';
    end if;
    if tg_op = 'UPDATE' and (
      new.quantity >= old.quantity
      or new.menu_item_id is distinct from old.menu_item_id
      or new.note is distinct from old.note
      or new.unit_price is distinct from old.unit_price
      or new.session_id is distinct from old.session_id
    ) then
      raise exception 'restaurant ordering is temporarily paused';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_order_submission_open()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (select private.is_staff()) then return new; end if;
  if not exists (
    select 1
    from public.table_sessions s
    join public.table_session_participants p on p.session_id = s.id
    where s.id = new.session_id
      and s.status = 'active'
      and s.bill_request_status = 'none'
      and p.user_id = (select auth.uid())
      and coalesce((
        select rs.ordering_enabled
        from public.restaurant_settings rs
        order by rs.created_at
        limit 1
      ), true)
  ) then
    raise exception 'ordering is closed or temporarily paused';
  end if;
  return new;
end;
$$;

create or replace function public.set_restaurant_ordering(p_enabled boolean)
returns table(ordering_enabled boolean, ordering_paused_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settings_id uuid;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select rs.id into v_settings_id
  from restaurant_settings rs
  order by rs.created_at
  limit 1
  for update;

  if v_settings_id is null then
    raise exception 'restaurant settings not found';
  end if;

  return query
  update restaurant_settings rs
  set ordering_enabled = p_enabled,
      ordering_paused_at = case when p_enabled then null else now() end
  where rs.id = v_settings_id
  returning rs.ordering_enabled, rs.ordering_paused_at;
end;
$$;

create or replace function public.admin_order_page(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_table_number int default null,
  p_status text default null,
  p_page int default 1,
  p_page_size int default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_page_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_result jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;
  if p_status is not null and p_status not in ('pending', 'preparing', 'served', 'paid', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  with filtered_orders as (
    select o.*
    from orders o
    join restaurant_tables t on t.id = o.table_id
    where o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at < p_date_to)
      and (p_table_number is null or t.table_number = p_table_number)
      and (p_status is null or o.status = p_status)
  ), ranked_sessions as (
    select fo.session_id, max(fo.created_at) as newest_at
    from filtered_orders fo
    group by fo.session_id
  ), page_sessions as (
    select rs.session_id, rs.newest_at
    from ranked_sessions rs
    order by rs.newest_at desc, rs.session_id
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ), page_orders as (
    select fo.*
    from filtered_orders fo
    join page_sessions ps on ps.session_id = fo.session_id
  )
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(
        to_jsonb(po)
        || jsonb_build_object(
          'restaurant_tables', jsonb_build_object('table_number', t.table_number, 'label', t.label),
          'order_items', coalesce((
            select jsonb_agg(to_jsonb(oi) order by oi.id)
            from order_items oi
            where oi.order_id = po.id
          ), '[]'::jsonb)
        )
        order by po.created_at desc, po.id
      )
      from page_orders po
      join restaurant_tables t on t.id = po.table_id
    ), '[]'::jsonb),
    'page', v_page,
    'page_size', v_page_size,
    'total_sessions', (select count(*) from ranked_sessions),
    'total_pages', greatest(ceil((select count(*) from ranked_sessions)::numeric / v_page_size)::int, 1)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_order_stats(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_table_number int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select jsonb_build_object(
    'total_orders', count(*),
    'pending', count(*) filter (where o.status = 'pending'),
    'preparing', count(*) filter (where o.status = 'preparing'),
    'served', count(*) filter (where o.status = 'served'),
    'paid', count(*) filter (where o.status = 'paid'),
    'cancelled', count(*) filter (where o.status = 'cancelled'),
    'paid_total', coalesce(sum(o.total_price) filter (where o.status = 'paid'), 0)
  ) into v_result
  from orders o
  join restaurant_tables t on t.id = o.table_id
  where o.deleted_at is null
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at < p_date_to)
    and (p_table_number is null or t.table_number = p_table_number);

  return v_result;
end;
$$;

create or replace function public.admin_dashboard_summary(
  p_today_from timestamptz,
  p_today_to timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  select jsonb_build_object(
    'today_order_count', (
      select count(*) from orders o
      where o.deleted_at is null and o.created_at >= p_today_from and o.created_at < p_today_to
    ),
    'today_revenue', (
      select coalesce(sum(o.total_price), 0) from orders o
      where o.deleted_at is null and o.status = 'paid'
        and o.created_at >= p_today_from and o.created_at < p_today_to
    ),
    'pending_count', (
      select count(*) from orders o where o.deleted_at is null and o.status = 'pending'
    ),
    'preparing_count', (
      select count(*) from orders o where o.deleted_at is null and o.status = 'preparing'
    ),
    'hot_items', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.quantity desc, h.total desc)
      from (
        select coalesce(nullif(oi.item_name_zh, ''), nullif(oi.item_name_en, ''), nullif(oi.item_name_el, ''), 'Unnamed item') as name,
               sum(oi.quantity)::int as quantity,
               sum(oi.line_total) as total
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.deleted_at is null and o.status <> 'cancelled'
          and o.created_at >= p_today_from and o.created_at < p_today_to
        group by 1
        order by quantity desc, total desc
        limit 8
      ) h
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.set_restaurant_ordering(boolean) from public, anon;
revoke execute on function public.admin_order_page(timestamptz, timestamptz, int, text, int, int) from public, anon;
revoke execute on function public.admin_order_stats(timestamptz, timestamptz, int) from public, anon;
revoke execute on function public.admin_dashboard_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.set_restaurant_ordering(boolean) to authenticated;
grant execute on function public.admin_order_page(timestamptz, timestamptz, int, text, int, int) to authenticated;
grant execute on function public.admin_order_stats(timestamptz, timestamptz, int) to authenticated;
grant execute on function public.admin_dashboard_summary(timestamptz, timestamptz) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'restaurant_settings'
     ) then
    alter publication supabase_realtime add table public.restaurant_settings;
  end if;
end;
$$;


do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bill_requests'
  ) then
    alter publication supabase_realtime add table public.bill_requests;
  end if;
end;
$$;
