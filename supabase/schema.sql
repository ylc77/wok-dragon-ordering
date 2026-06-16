-- Wok Dragon Express / 龙城酒楼 schema.
-- Run this before supabase/seed.sql.

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
  add column if not exists phone text,
  add column if not exists address_zh text,
  add column if not exists address_en text,
  add column if not exists address_el text,
  add column if not exists map_url text,
  add column if not exists opening_hours_zh text,
  add column if not exists opening_hours_en text,
  add column if not exists opening_hours_el text,
  add column if not exists wolt_url text,
  add column if not exists efood_url text,
  add column if not exists box_url text;

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  name_el text,
  sort_order int not null default 0,
  is_active boolean not null default true,
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
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_categories_active_sort
  on public.menu_categories (is_active, sort_order);

create index if not exists idx_menu_items_category_available_sort
  on public.menu_items (category_id, is_available, sort_order);

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
  total_price numeric(10, 2) not null check (total_price >= 0),
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
  is_active = true
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
  is_available = true
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
  or exists (
    select 1
    from public.table_session_participants p
    where p.session_id = orders.session_id
      and p.user_id = (select auth.uid())
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

  if not exists (
    select 1
    from table_sessions s
    join table_session_participants p on p.session_id = s.id
    where s.id = p_session_id
      and s.status = 'active'
      and p.user_id = v_user_id
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

  select ci.session_id
  into v_session_id
  from cart_items ci
  join table_sessions s on s.id = ci.session_id
  join table_session_participants p on p.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and p.user_id = v_user_id;

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
  join table_session_participants p on p.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and p.user_id = v_user_id;

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
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and p.user_id = v_user_id
  for update of s;

  if v_table_id is null then
    raise exception 'not a participant of this active table session';
  end if;

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
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if p_status not in ('pending', 'preparing', 'served', 'paid', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  update orders
  set status = p_status
  where id = p_order_id;
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
    and status in ('pending', 'preparing', 'served');

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
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
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
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
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

revoke execute on function public.join_table_session(text) from public, anon;
revoke execute on function public.add_cart_item(uuid, uuid, int, text) from public, anon;
revoke execute on function public.update_cart_item_quantity(uuid, int) from public, anon;
revoke execute on function public.remove_cart_item(uuid) from public, anon;
revoke execute on function public.submit_order(uuid, uuid) from public, anon;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.close_table_session(uuid) from public, anon;
revoke execute on function public.create_restaurant_table(int, text) from public, anon;
revoke execute on function public.regenerate_table_qr_token(uuid) from public, anon;

grant execute on function public.join_table_session(text) to authenticated;
grant execute on function public.add_cart_item(uuid, uuid, int, text) to authenticated;
grant execute on function public.update_cart_item_quantity(uuid, int) to authenticated;
grant execute on function public.remove_cart_item(uuid) to authenticated;
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
