-- Operational reliability: ordering pause, complete admin statistics, and session pagination.

alter table public.restaurant_settings
  add column if not exists ordering_enabled boolean not null default true,
  add column if not exists ordering_paused_at timestamptz;

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
