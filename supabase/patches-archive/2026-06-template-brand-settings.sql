-- Extend the existing restaurant settings record for reusable restaurant branding.

alter table public.restaurant_settings
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists intro_zh text,
  add column if not exists intro_en text,
  add column if not exists intro_el text,
  add column if not exists whatsapp_url text,
  add column if not exists instagram_url text,
  add column if not exists accept_pos_payment boolean not null default true,
  add column if not exists accept_cash_payment boolean not null default true;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_payment_method_check,
  add constraint restaurant_settings_payment_method_check
    check (accept_pos_payment or accept_cash_payment);

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
  join table_session_participants p on p.session_id = s.id
  where s.id = p_session_id
    and s.status = 'active'
    and p.user_id = v_user_id
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
    update table_sessions
    set bill_request_status = 'requested',
        bill_payment_method = v_existing_method,
        bill_requested_at = coalesce(bill_requested_at, now())
    where id = p_session_id;
  end if;

  return query select v_request_id, 'requested'::text;
end;
$$;
