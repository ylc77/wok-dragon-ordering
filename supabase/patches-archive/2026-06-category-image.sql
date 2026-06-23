-- 菜单分类增加封面图字段
alter table public.menu_categories add column if not exists image_url text;
