-- Delivery links found from public Wolt, efood, and BOX pages for Wok Dragon Express Athens.
-- Wolt image URLs already present in supabase/seed.sql are public delivery-platform references.
-- Before formal commercial use, confirm image/link authorization or replace dish photos with restaurant-owned assets.

update public.restaurant_settings
set
  wolt_url = 'https://wolt.com/en/grc/athens/restaurant/wok-dragon-express',
  efood_url = 'https://www.e-food.gr/delivery/athina/wok-dragon-express',
  box_url = 'https://box.gr/delivery/syntagma/wok-dragon-express-syntagma'
where id = (
  select id
  from public.restaurant_settings
  order by created_at asc
  limit 1
);
