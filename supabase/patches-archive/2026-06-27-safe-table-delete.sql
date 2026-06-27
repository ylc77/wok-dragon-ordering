-- Safe table deletion RPC for existing customer databases.
-- Allows staff/admin to delete only empty tables. The RPC may remove an
-- automatically pre-created empty active session, but never deletes sessions
-- that have guests, carts, bill requests, or orders.

create or replace function public.admin_delete_restaurant_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history_count int := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'admin or staff role is required';
  end if;

  if exists (
    select 1
    from public.table_sessions s
    where s.table_id = p_table_id
      and s.status = 'active'
      and (
        s.bill_request_status <> 'none'
        or exists (select 1 from public.table_session_participants p where p.session_id = s.id)
        or exists (select 1 from public.cart_items ci where ci.session_id = s.id)
        or exists (select 1 from public.orders o where o.session_id = s.id)
      )
  ) then
    raise exception 'table has an active guest session; clear or close it before deleting';
  end if;

  select
    (select count(*) from public.table_sessions where table_id = p_table_id and status <> 'active') +
    (select count(*) from public.orders where table_id = p_table_id)
  into v_history_count;

  if v_history_count > 0 then
    raise exception 'table has historical sessions or orders; disable it instead of deleting';
  end if;

  delete from public.table_sessions
  where table_id = p_table_id
    and status = 'active'
    and bill_request_status = 'none'
    and not exists (select 1 from public.table_session_participants p where p.session_id = table_sessions.id)
    and not exists (select 1 from public.cart_items ci where ci.session_id = table_sessions.id)
    and not exists (select 1 from public.orders o where o.session_id = table_sessions.id);

  delete from public.restaurant_tables
  where id = p_table_id;

  if not found then
    raise exception 'table not found';
  end if;
end;
$$;

revoke execute on function public.admin_delete_restaurant_table(uuid) from public, anon;
grant execute on function public.admin_delete_restaurant_table(uuid) to authenticated;
