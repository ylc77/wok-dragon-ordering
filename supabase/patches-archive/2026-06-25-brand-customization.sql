-- 品牌自定义：颜色、favicon、标题
alter table public.restaurant_settings
  add column if not exists brand_color text,
  add column if not exists favicon_url text,
  add column if not exists meta_title text,
  add column if not exists footer_text_zh text,
  add column if not exists footer_text_en text,
  add column if not exists footer_text_el text;
