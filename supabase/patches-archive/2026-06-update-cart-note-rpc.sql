-- Allow table-session participants to edit notes in the shared cart.

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
  join table_session_participants p on p.session_id = s.id
  where ci.id = p_cart_item_id
    and s.status = 'active'
    and p.user_id = v_user_id;

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

revoke execute on function public.update_cart_item_note(uuid, text) from public, anon;
grant execute on function public.update_cart_item_note(uuid, text) to authenticated;
