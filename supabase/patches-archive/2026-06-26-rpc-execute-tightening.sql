-- Explicitly restrict the current five-argument add_cart_item RPC.
-- The older four-argument function already had explicit grants; this covers the menu-options version.

do $$
begin
  if to_regprocedure('public.add_cart_item(uuid, uuid, int, text, jsonb)') is not null then
    revoke execute on function public.add_cart_item(uuid, uuid, int, text, jsonb) from public, anon;
    grant execute on function public.add_cart_item(uuid, uuid, int, text, jsonb) to authenticated;
  else
    raise notice 'Skipped: public.add_cart_item(uuid, uuid, int, text, jsonb) does not exist on this database.';
  end if;
end;
$$;
