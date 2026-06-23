-- Require an explicit customer action before joining a table session, while
-- keeping recently closed sessions behind staff approval for 24 hours.

create or replace function public.get_table_entry_state(p_qr_token text)
returns table(
  active_session_id uuid,
  table_id uuid,
  table_number int,
  participant_count int,
  unfinished_order_count int,
  is_occupied boolean
)
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
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select * into v_table
  from restaurant_tables
  where qr_token = p_qr_token
    and is_active = true;

  if not found then
    raise exception 'table qr code is invalid or disabled';
  end if;

  v_session_id := private.ensure_active_table_session(v_table.id);

  select count(*)::int into v_participant_count
  from table_session_participants p
  where p.session_id = v_session_id;

  select count(*)::int into v_order_count
  from orders o
  where o.session_id = v_session_id
    and o.status in ('pending', 'preparing', 'served');

  return query select
    v_session_id,
    v_table.id,
    v_table.table_number,
    v_participant_count,
    v_order_count,
    (v_participant_count > 0 or v_order_count > 0);
end;
$$;

create or replace function public.enter_table_session(
  p_qr_token text,
  p_expected_session_id uuid,
  p_require_empty boolean default false
)
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
  if v_user_id is null then
    raise exception 'anonymous sign-in is required';
  end if;

  select * into v_table
  from restaurant_tables
  where qr_token = p_qr_token
    and is_active = true
  for update;

  if not found then
    raise exception 'table qr code is invalid or disabled';
  end if;

  select s.id into v_session_id
  from table_sessions s
  where s.table_id = v_table.id
    and s.status = 'active'
  limit 1;

  if v_session_id is null then
    v_session_id := private.ensure_active_table_session(v_table.id);
  end if;

  if p_expected_session_id is null or v_session_id <> p_expected_session_id then
    raise exception 'table session changed; please try again';
  end if;

  select count(*)::int into v_participant_count
  from table_session_participants p
  where p.session_id = v_session_id;

  select count(*)::int into v_order_count
  from orders o
  where o.session_id = v_session_id
    and o.status in ('pending', 'preparing', 'served');

  if coalesce(p_require_empty, false)
     and (v_participant_count > 0 or v_order_count > 0) then
    raise exception 'table is currently in use';
  end if;

  insert into table_session_participants (session_id, user_id)
  values (v_session_id, v_user_id)
  on conflict on constraint table_session_participants_session_id_user_id_key do nothing;

  return query select v_session_id, v_table.id, v_table.table_number;
end;
$$;

drop function if exists public.resume_table_session(uuid, text);
create function public.resume_table_session(p_session_id uuid, p_qr_token text)
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
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and p.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if not found then
    raise exception 'saved table session is invalid for this QR code';
  end if;
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

  select s.table_id into v_table_id
  from table_sessions s
  join table_session_participants p on p.session_id = s.id
  join restaurant_tables t on t.id = s.table_id
  where s.id = p_closed_session_id
    and s.status = 'closed'
    and s.closed_at > now() - interval '24 hours'
    and p.user_id = v_user_id
    and t.qr_token = p_qr_token
    and t.is_active = true;

  if v_table_id is null then
    raise exception 'recent closed table participant is required';
  end if;

  v_target_session_id := private.ensure_active_table_session(v_table_id);

  select r.id, r.status into v_request_id, v_request_status
  from table_reentry_requests r
  where r.target_session_id = v_target_session_id
    and r.requested_by = v_user_id;

  if v_request_id is null then
    insert into table_reentry_requests (table_id, closed_session_id, target_session_id, requested_by)
    values (v_table_id, p_closed_session_id, v_target_session_id, v_user_id)
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

revoke execute on function public.get_table_entry_state(text) from public, anon;
revoke execute on function public.enter_table_session(text, uuid, boolean) from public, anon;
revoke execute on function public.resume_table_session(uuid, text) from public, anon;
grant execute on function public.get_table_entry_state(text) to authenticated;
grant execute on function public.enter_table_session(text, uuid, boolean) to authenticated;
grant execute on function public.resume_table_session(uuid, text) to authenticated;
