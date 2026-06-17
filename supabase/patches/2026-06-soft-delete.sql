-- Soft delete support for admin cleanup.
-- Orders keep order_items snapshots; menu items keep historical order references.

alter table public.orders
  add column if not exists deleted_at timestamptz;

alter table public.menu_items
  add column if not exists deleted_at timestamptz;

alter table public.menu_categories
  add column if not exists deleted_at timestamptz;

create index if not exists idx_orders_deleted_created
  on public.orders (deleted_at, created_at desc);

create index if not exists idx_menu_items_deleted_category_sort
  on public.menu_items (deleted_at, category_id, sort_order);

create index if not exists idx_menu_categories_deleted_sort
  on public.menu_categories (deleted_at, sort_order);

drop policy if exists "categories_public_read_active" on public.menu_categories;
create policy "categories_public_read_active"
on public.menu_categories
for select
to anon, authenticated
using (
  (deleted_at is null and is_active = true)
  or (select private.is_staff())
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
