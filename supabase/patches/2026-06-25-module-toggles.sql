-- 模块开关：控制 POS / 外卖 / 扫码点餐的启用
alter table public.restaurant_settings
  add column if not exists enable_pos boolean not null default true,
  add column if not exists enable_qr_ordering boolean not null default true;
