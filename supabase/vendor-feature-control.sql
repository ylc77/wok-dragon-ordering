-- Vendor feature control for an existing pre-release/demo database.
-- New customer databases already receive these fields from client-init.sql.

alter table public.restaurant_settings
  add column if not exists plan_tier text not null default 'professional',
  add column if not exists feature_flags jsonb not null default '{"csv_import":true,"ai_menu":true,"ai_image":true,"data_backup":true,"print_agent":true}'::jsonb;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_plan_tier_check,
  add constraint restaurant_settings_plan_tier_check
    check (plan_tier in ('basic', 'standard', 'professional'));

revoke insert, update, delete on public.restaurant_settings from authenticated;
grant update (
  name_zh, name_en, name_el,
  logo_url, hero_image_url,
  intro_zh, intro_en, intro_el,
  phone, whatsapp_url, instagram_url,
  address_zh, address_en, address_el,
  map_url,
  opening_hours_zh, opening_hours_en, opening_hours_el,
  wolt_url, efood_url, box_url,
  accept_pos_payment, accept_cash_payment,
  ordering_enabled, ordering_paused_at,
  brand_color, favicon_url, meta_title,
  footer_text_zh, footer_text_en, footer_text_el
) on public.restaurant_settings to authenticated;

drop policy if exists "settings_staff_manage" on public.restaurant_settings;
create policy "settings_staff_manage"
on public.restaurant_settings
for update
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

comment on column public.restaurant_settings.plan_tier is
  'Commercial delivery preset: basic, standard, or professional.';

comment on column public.restaurant_settings.feature_flags is
  'Vendor-managed optional modules. Do not expose vendor credentials to the browser.';
