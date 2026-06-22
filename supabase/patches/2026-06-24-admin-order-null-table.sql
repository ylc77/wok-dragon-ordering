-- 修复 admin_order_page：支持 table_id/session_id 为 null 的 POS 订单

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
    left join restaurant_tables t on t.id = o.table_id
    where o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at < p_date_to)
      and (p_table_number is null or (t.table_number = p_table_number))
      and (p_status is null or o.status = p_status)
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

-- 同样修复 admin_order_stats
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
  left join restaurant_tables t on t.id = o.table_id
  where o.deleted_at is null
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at < p_date_to)
    and (p_table_number is null or t.table_number = p_table_number);

  return v_result;
end;
$$;
