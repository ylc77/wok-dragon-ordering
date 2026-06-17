-- Safe cleanup for mixed menu translation fields.
-- Purpose: prevent English frontend views from showing Greek text when Wolt-derived
-- seed data placed Greek fragments into name_en / description_en.
--
-- This script is intentionally conservative:
-- - It does not change menu IDs, prices, availability, orders, carts, sessions, QR tokens, or RLS.
-- - It only clears English fields that visibly contain Greek characters.
-- - After this cleanup, the frontend falls back from English to Chinese instead of Greek.
-- - Stage 2 automatic translation can later fill the missing English fields with reviewed text.
--
-- Review before running in Supabase SQL Editor.

begin;

update public.menu_items
set name_en = null
where name_en ~ '[Α-ωΆ-ώ]'
  and is_available is not null;

update public.menu_items
set description_en = null
where description_en ~ '[Α-ωΆ-ώ]'
  and is_available is not null;

-- Optional inspection after running:
-- select count(*) as mixed_english_names
-- from public.menu_items
-- where name_en ~ '[Α-ωΆ-ώ]';
--
-- select count(*) as mixed_english_descriptions
-- from public.menu_items
-- where description_en ~ '[Α-ωΆ-ώ]';

commit;
