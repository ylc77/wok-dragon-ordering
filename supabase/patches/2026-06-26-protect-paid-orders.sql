-- 已付款订单保护：禁止修改 payment_status='paid' 的订单关键字段

create or replace function private.protect_paid_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.payment_status = 'paid' then
    if new.status <> old.status
      or new.payment_status <> old.payment_status
      or coalesce(new.payment_method, '') <> coalesce(old.payment_method, '')
      or new.paid_at <> old.paid_at
      or new.total_price <> old.total_price
      or new.deleted_at is distinct from old.deleted_at
    then
      raise exception 'paid orders cannot be modified';
    end if;
  end if;
  return new;
end;
$$;

-- 如果 trigger 已存在则删除再建
drop trigger if exists trg_protect_paid_order on public.orders;
create trigger trg_protect_paid_order
  before update on public.orders
  for each row
  execute function private.protect_paid_order();
