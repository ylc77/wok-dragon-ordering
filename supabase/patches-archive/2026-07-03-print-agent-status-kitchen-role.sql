-- 2026-07-03: Print agent status heartbeat + kitchen read-only role.
-- For existing customer databases. Back up the database before running.
-- New customers get this from supabase/client-init.sql.

create schema if not exists private;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check check (role in ('admin', 'staff', 'kitchen'));

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

create or replace function private.is_order_viewer()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'staff', 'kitchen')
  );
$$;

grant execute on function private.is_staff() to anon, authenticated;
grant execute on function private.is_order_viewer() to authenticated;

create table if not exists public.print_agent_status (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null default 'YANLCPrintAgent',
  status text not null default 'offline' check (status in ('online', 'offline', 'error')),
  last_seen_at timestamptz not null default now(),
  last_printed_at timestamptz,
  last_error text,
  printer_name text,
  version text,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_print_agent_status_agent_name
  on public.print_agent_status (agent_name);

alter table public.print_agent_status enable row level security;
grant select, insert, update on public.print_agent_status to authenticated;

drop policy if exists "print_agent_status_staff_read" on public.print_agent_status;
create policy "print_agent_status_staff_read"
on public.print_agent_status
for select
to authenticated
using ((select private.is_order_viewer()));

drop policy if exists "print_agent_status_staff_write" on public.print_agent_status;
create policy "print_agent_status_staff_write"
on public.print_agent_status
for insert
to authenticated
with check ((select private.is_staff()));

drop policy if exists "print_agent_status_staff_update" on public.print_agent_status;
create policy "print_agent_status_staff_update"
on public.print_agent_status
for update
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "tables_kitchen_read" on public.restaurant_tables;
create policy "tables_kitchen_read"
on public.restaurant_tables
for select
to authenticated
using ((select private.is_order_viewer()));

drop policy if exists "orders_kitchen_read" on public.orders;
create policy "orders_kitchen_read"
on public.orders
for select
to authenticated
using (
  deleted_at is null
  and (select private.is_order_viewer())
);

drop policy if exists "order_items_kitchen_read" on public.order_items;
create policy "order_items_kitchen_read"
on public.order_items
for select
to authenticated
using (
  (select private.is_order_viewer())
  and exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.deleted_at is null
  )
);

create or replace function public.report_print_agent_status(
  p_agent_name text default 'YANLCPrintAgent',
  p_status text default 'online',
  p_printer_name text default null,
  p_version text default null,
  p_last_printed_at timestamptz default null,
  p_last_error text default null
)
returns public.print_agent_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.print_agent_status%rowtype;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if coalesce(p_status, 'online') not in ('online', 'offline', 'error') then
    raise exception 'invalid print agent status';
  end if;

  insert into public.print_agent_status (
    agent_name,
    status,
    last_seen_at,
    last_printed_at,
    last_error,
    printer_name,
    version,
    updated_at
  )
  values (
    coalesce(nullif(trim(p_agent_name), ''), 'YANLCPrintAgent'),
    coalesce(p_status, 'online'),
    now(),
    p_last_printed_at,
    p_last_error,
    p_printer_name,
    p_version,
    now()
  )
  on conflict (agent_name)
  do update set
    status = excluded.status,
    last_seen_at = excluded.last_seen_at,
    last_printed_at = coalesce(excluded.last_printed_at, public.print_agent_status.last_printed_at),
    last_error = excluded.last_error,
    printer_name = excluded.printer_name,
    version = excluded.version,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.report_print_agent_status(text, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.report_print_agent_status(text, text, text, text, timestamptz, text) to authenticated;

-- Allow kitchen read-only accounts to use order list and stats RPCs.
-- These functions are repeated here so old customers get the same permission boundary.
-- If your project has customized these functions, review before running this section.

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
  if not (select private.is_order_viewer()) then
    raise exception 'admin, staff or kitchen role is required';
  end if;
  if p_status is not null and p_status not in ('pending', 'preparing', 'served', 'paid', 'cancelled') then
    raise exception 'invalid order status';
  end if;

  with filtered_orders as (
    select o.*
    from orders o
    left join restaurant_tables t on t.id = o.table_id
    where o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at < p_date_to)
      and (p_table_number is null or (t.table_number = p_table_number))
      and (
        p_status is null
        or (p_status = 'paid' and o.payment_status = 'paid')
        or (p_status <> 'paid' and o.status = p_status and o.payment_status <> 'paid')
      )
  ), ranked_sessions as (
    select coalesce(fo.session_id::text, fo.id::text) as session_key,
           max(fo.created_at) as newest_at
    from filtered_orders fo
    group by coalesce(fo.session_id::text, fo.id::text)
  ), page_sessions as (
    select rs.session_key, rs.newest_at
    from ranked_sessions rs
    order by rs.newest_at desc, rs.session_key
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ), page_orders as (
    select fo.*
    from filtered_orders fo
    join page_sessions ps on coalesce(fo.session_id::text, fo.id::text) = ps.session_key
  )
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(
        to_jsonb(po)
        || jsonb_build_object(
          'restaurant_tables', case when po.table_id is not null
            then jsonb_build_object('table_number', t.table_number, 'label', t.label)
            else null end,
          'order_items', coalesce((
            select jsonb_agg(to_jsonb(oi) order by oi.id)
            from order_items oi
            where oi.order_id = po.id
          ), '[]'::jsonb)
        )
        order by po.created_at desc, po.id
      )
      from page_orders po
      left join restaurant_tables t on t.id = po.table_id
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
  if not (select private.is_order_viewer()) then
    raise exception 'admin, staff or kitchen role is required';
  end if;

  select jsonb_build_object(
    'total_orders', count(*),
    'pending', count(*) filter (where o.status = 'pending' and o.payment_status <> 'paid'),
    'preparing', count(*) filter (where o.status = 'preparing' and o.payment_status <> 'paid'),
    'served', count(*) filter (where o.status = 'served' and o.payment_status <> 'paid'),
    'paid', count(*) filter (where o.payment_status = 'paid'),
    'cancelled', count(*) filter (where o.status = 'cancelled'),
    'paid_total', coalesce(sum(o.total_price) filter (where o.payment_status = 'paid'), 0)
  ) into v_result
  from orders o
  left join restaurant_tables t on t.id = o.table_id
  where o.deleted_at is null
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at < p_date_to)
    and (p_table_number is null or t.table_number = p_table_number);

  return v_result;
end;
$$;

revoke execute on function public.admin_order_page(timestamptz, timestamptz, int, text, int, int) from public, anon;
revoke execute on function public.admin_order_stats(timestamptz, timestamptz, int) from public, anon;
grant execute on function public.admin_order_page(timestamptz, timestamptz, int, text, int, int) to authenticated;
grant execute on function public.admin_order_stats(timestamptz, timestamptz, int) to authenticated;
