-- Legal Settings module for existing demo/client databases.
-- Run manually in Supabase SQL Editor after backing up the database.
-- New customers do not need this file if they already run supabase/client-init.sql.

create table if not exists public.legal_settings (
  id uuid primary key default gen_random_uuid(),
  project_type text not null default 'restaurant' check (project_type in ('restaurant', 'retail')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  current_version text,
  last_published_at timestamptz,
  business_name text not null default '',
  legal_name text not null default '',
  business_address text not null default '',
  vat_number text not null default '',
  gemi_number text not null default '',
  country text not null default 'Greece',
  phone text not null default '',
  contact_email text not null default '',
  data_controller_name text not null default '',
  data_controller_address text not null default '',
  privacy_request_email text not null default '',
  privacy_request_instructions text not null default '',
  service_flags jsonb not null default '{"supabase":true,"vercel":true,"stripe":false,"viva":false,"cash":true,"pos":true,"posthog":false,"sentry":false,"openai":false,"deepseek":false}'::jsonb,
  other_service_notes text not null default '',
  essential_cookie_note text not null default 'Essential storage is used for language choice, cookie preferences, login, cart and ordering security.',
  analytics_cookies_enabled boolean not null default false,
  error_monitoring_enabled boolean not null default false,
  advertising_cookies_enabled boolean not null default false,
  cookie_last_updated date not null default current_date,
  order_terms text not null default '',
  cancellation_policy text not null default '',
  payment_terms text not null default '',
  allergen_disclaimer text not null default '',
  kitchen_receipt_disclaimer text not null default 'Kitchen tickets are operational order slips and are not official tax receipts.',
  official_receipt_disclaimer text not null default 'Official fiscal receipts are issued by the restaurant cash register, fiscal POS or accounting process.',
  shipping_policy text not null default '',
  return_policy text not null default '',
  refund_policy text not null default '',
  withdrawal_right text not null default '',
  return_address text not null default '',
  return_shipping_responsibility text not null default '',
  excluded_return_items text not null default '',
  data_retention text not null default 'Operational records are kept only for as long as reasonably needed for service, accounting, support and security.',
  last_updated date not null default current_date,
  confirmations jsonb not null default '{"identity_confirmed":false,"payment_wording_confirmed":false,"policy_wording_confirmed":false,"third_party_services_confirmed":false,"template_notice_confirmed":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_settings_versions (
  id uuid primary key default gen_random_uuid(),
  settings_id uuid references public.legal_settings(id) on delete set null,
  version_no text not null,
  snapshot jsonb not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  published_by uuid,
  last_updated date not null default current_date,
  created_at timestamptz not null default now()
);

create unique index if not exists legal_settings_versions_current_one
on public.legal_settings_versions (is_current)
where is_current;

drop trigger if exists set_legal_settings_updated_at on public.legal_settings;
create trigger set_legal_settings_updated_at
before update on public.legal_settings
for each row execute function public.set_updated_at();

alter table public.legal_settings enable row level security;
alter table public.legal_settings_versions enable row level security;

grant select on public.legal_settings_versions to anon, authenticated;
grant select, insert, update on public.legal_settings to authenticated;
grant select, insert, update on public.legal_settings_versions to authenticated;

drop policy if exists "legal_settings_staff_read" on public.legal_settings;
create policy "legal_settings_staff_read"
on public.legal_settings
for select
to authenticated
using ((select private.is_staff()));

drop policy if exists "legal_settings_staff_write" on public.legal_settings;
create policy "legal_settings_staff_write"
on public.legal_settings
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists "legal_versions_public_current_read" on public.legal_settings_versions;
create policy "legal_versions_public_current_read"
on public.legal_settings_versions
for select
to anon, authenticated
using (is_current = true);

drop policy if exists "legal_versions_staff_read" on public.legal_settings_versions;
create policy "legal_versions_staff_read"
on public.legal_settings_versions
for select
to authenticated
using ((select private.is_staff()));

drop policy if exists "legal_versions_staff_write" on public.legal_settings_versions;
create policy "legal_versions_staff_write"
on public.legal_settings_versions
for all
to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

insert into public.legal_settings (business_name, legal_name, business_address, phone, contact_email)
select
  coalesce(nullif(name_en, ''), nullif(name_zh, ''), nullif(name_el, ''), ''),
  '',
  coalesce(nullif(address_en, ''), nullif(address_zh, ''), nullif(address_el, ''), ''),
  coalesce(phone, ''),
  ''
from public.restaurant_settings
where not exists (select 1 from public.legal_settings)
limit 1;

alter table public.orders
  add column if not exists legal_terms_version text,
  add column if not exists privacy_policy_version text,
  add column if not exists legal_accepted_at timestamptz;

create or replace function public.current_legal_version()
returns text
language sql
stable
as $$
  select version_no
  from public.legal_settings_versions
  where is_current = true
  order by published_at desc
  limit 1
$$;

create or replace function public.set_order_legal_acceptance()
returns trigger
language plpgsql
as $$
declare
  v_version text;
begin
  v_version := public.current_legal_version();
  if v_version is not null then
    new.legal_terms_version := coalesce(new.legal_terms_version, v_version);
    new.privacy_policy_version := coalesce(new.privacy_policy_version, v_version);
    new.legal_accepted_at := coalesce(new.legal_accepted_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_legal_acceptance on public.orders;
create trigger set_order_legal_acceptance
before insert on public.orders
for each row execute function public.set_order_legal_acceptance();

