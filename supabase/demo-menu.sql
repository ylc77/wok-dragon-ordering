-- ============================================================
-- Optional fictional demo data for a fresh customer presentation.
--
-- This script intentionally NEVER updates or deletes orders/order_items.
-- Paid order history is immutable in production databases and must remain so.
-- Existing menu rows are archived, active table sessions are closed, and a
-- new editable restaurant identity/menu is inserted inside one transaction.
-- ============================================================

begin;

-- End open dining sessions so the demo QR codes start from a clean table state.
-- Historical orders and their item snapshots remain untouched.
update public.table_sessions
set status = 'closed',
    closed_at = coalesce(closed_at, now()),
    bill_request_status = case
      when bill_request_status = 'requested' then 'handled'
      else bill_request_status
    end,
    bill_handled_at = case
      when bill_request_status = 'requested' then now()
      else bill_handled_at
    end,
    cart_version = cart_version + 1,
    cart_updated_at = now()
where status = 'active';

-- Archive the currently visible menu without breaking historical order links.
update public.menu_items
set deleted_at = now(),
    is_available = false,
    updated_at = now()
where deleted_at is null;

update public.menu_categories
set deleted_at = now(),
    is_active = false,
    updated_at = now()
where deleted_at is null;

-- Keep one editable fictional restaurant profile.
delete from public.restaurant_settings;

insert into public.restaurant_settings (
  name_zh, name_en, name_el,
  intro_zh, intro_en, intro_el,
  phone, address_zh, address_en, address_el,
  opening_hours_zh, opening_hours_en, opening_hours_el,
  accept_pos_payment, accept_cash_payment,
  ordering_enabled, brand_color, meta_title,
  footer_text_zh, footer_text_en, footer_text_el,
  enable_pos, enable_qr_ordering, feature_flags
) values (
  '炽火小馆', 'EMBER WOK KITCHEN', 'EMBER WOK ΚΟΥΖΙΝΑ',
  '热锅现炒、轻松分享的现代亚洲餐桌。',
  'Modern Asian wok cooking, made fresh for easy sharing.',
  'Σύγχρονη ασιατική κουζίνα wok, φρεσκομαγειρεμένη για την παρέα.',
  '+30 210 000 0000',
  '雅典市中心示例街 18 号',
  '18 Example Street, Central Athens',
  'Οδός Παραδείγματος 18, Κέντρο Αθήνας',
  '每日 12:00–23:00',
  'Daily 12:00–23:00',
  'Καθημερινά 12:00–23:00',
  true, true,
  true, '#b91c1c', 'EMBER WOK KITCHEN',
  '热锅现炒，欢迎到店。',
  'Fresh from the wok. See you at the table.',
  'Φρέσκο από το wok. Σας περιμένουμε.',
  true, true,
  '{"csv_import":true,"ai_menu":true,"ai_image":true,"data_backup":true,"print_agent":true,"reservations":true}'::jsonb
);

-- Reuse table numbers where possible; deactivate any extra old tables.
update public.restaurant_tables
set is_active = false,
    updated_at = now();

insert into public.restaurant_tables (table_number, label, qr_token, is_active)
values
  (1, 'Table 1', 'ember-demo-table-01', true),
  (2, 'Table 2', 'ember-demo-table-02', true),
  (3, 'Table 3', 'ember-demo-table-03', true),
  (4, 'Table 4', 'ember-demo-table-04', true),
  (5, 'Table 5', 'ember-demo-table-05', true),
  (6, 'Table 6', 'ember-demo-table-06', true)
on conflict (table_number) do update
set label = excluded.label,
    qr_token = excluded.qr_token,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.menu_categories (id, name_zh, name_en, name_el, sort_order, is_active)
values
  ('a1000000-0000-4000-8000-000000000001', '小食前菜', 'Small Plates', 'Μικρά Πιάτα', 1, true),
  ('a1000000-0000-4000-8000-000000000002', '招牌饭碗', 'Signature Bowls', 'Signature Bowls', 2, true),
  ('a1000000-0000-4000-8000-000000000003', '热炒主菜', 'Wok Favourites', 'Wok Αγαπημένα', 3, true),
  ('a1000000-0000-4000-8000-000000000004', '炒面炒饭', 'Noodles & Rice', 'Noodles & Ρύζι', 4, true),
  ('a1000000-0000-4000-8000-000000000005', '蔬食选择', 'Plant Forward', 'Λαχανικά', 5, true),
  ('a1000000-0000-4000-8000-000000000006', '饮品甜点', 'Drinks & Sweet', 'Ποτά & Γλυκά', 6, true)
on conflict (id) do update
set name_zh = excluded.name_zh,
    name_en = excluded.name_en,
    name_el = excluded.name_el,
    sort_order = excluded.sort_order,
    is_active = true,
    deleted_at = null,
    updated_at = now();

insert into public.menu_items (
  category_id, name_zh, name_en, name_el,
  description_zh, description_en, description_el,
  price, sort_order, is_available, is_sold_out, image_url, options
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    '焦香鸡肉饺子', 'Crispy Chicken Dumplings', 'Τραγανά Dumplings Κοτόπουλου',
    '六只煎饺，搭配自制蘸酱。',
    'Six pan-seared dumplings with house dipping sauce.',
    'Έξι τραγανά dumplings με σπιτική σάλτσα.',
    6.90, 1, true, false, null,
    '[{"id":"soy","name_zh":"酱油","name_en":"Dipping sauce","name_el":"Σάλτσα","type":"single","required":false,"choices":[{"id":"soy","name_zh":"酱油","name_en":"Soy","name_el":"Σόγια"},{"id":"chilli","name_zh":"辣油","name_en":"Chilli oil","name_el":"Λάδι τσίλι"}]}]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    '香脆蔬菜春卷', 'Garden Spring Rolls', 'Ανοιξιάτικα Ρολά Λαχανικών',
    '四只香脆春卷，内含时蔬和米粉。',
    'Four crisp rolls filled with vegetables and rice noodles.',
    'Τέσσερα τραγανά ρολά με λαχανικά και noodles ρυζιού.',
    5.90, 2, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '烟火照烧鸡饭', 'Ember Teriyaki Chicken Bowl', 'Bowl Κοτόπουλο Teriyaki',
    '照烧鸡、时蔬和香米。',
    'Glazed chicken, seasonal vegetables, and fragrant rice.',
    'Κοτόπουλο teriyaki, λαχανικά εποχής και αρωματικό ρύζι.',
    12.90, 1, true, false, null,
    '[{"id":"spice","name_zh":"辣度","name_en":"Spice level","name_el":"Επίπεδο καυτερού","type":"single","required":true,"choices":[{"id":"none","name_zh":"不辣","name_en":"No spice","name_el":"Χωρίς καυτερό"},{"id":"medium","name_zh":"中辣","name_en":"Medium","name_el":"Μέτριο"},{"id":"hot","name_zh":"重辣","name_en":"Hot","name_el":"Πολύ καυτερό"}]}]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '黑椒牛肉饭', 'Black Pepper Beef Bowl', 'Bowl Μοσχάρι με Μαύρο Πιπέρι',
    '黑椒牛肉、甜椒和香米。',
    'Black pepper beef, peppers, and fragrant rice.',
    'Μοσχάρι με μαύρο πιπέρι, πιπεριές και αρωματικό ρύζι.',
    13.90, 2, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    '宫保鸡丁', 'Kung Pao Chicken', 'Κοτόπουλο Kung Pao',
    '花生、彩椒和微辣宫保酱。',
    'Chicken, peanuts, peppers, and a gently spicy Kung Pao sauce.',
    'Κοτόπουλο, φιστίκια, πιπεριές και ελαφρώς πικάντικη σάλτσα Kung Pao.',
    12.50, 1, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    '蒜香大虾', 'Garlic Ginger Prawns', 'Γαρίδες με Σκόρδο και Τζίντζερ',
    '大虾、蒜香、姜和青葱。',
    'Prawns with garlic, ginger, and greens.',
    'Γαρίδες με σκόρδο, τζίντζερ και φρέσκα λαχανικά.',
    15.50, 2, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    '炭火鸡肉炒面', 'Charred Chicken Noodles', 'Noodles Κοτόπουλο Wok',
    '鸡肉、卷心菜、胡萝卜和招牌酱汁。',
    'Chicken, cabbage, carrot, and our signature wok sauce.',
    'Κοτόπουλο, λάχανο, καρότο και σάλτσα wok.',
    11.90, 1, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    '蒜香蔬菜炒饭', 'Garlic Vegetable Fried Rice', 'Τηγανητό Ρύζι με Λαχανικά',
    '时蔬、蒜香和香米。',
    'Seasonal vegetables, garlic, and fragrant rice.',
    'Λαχανικά εποχής, σκόρδο και αρωματικό ρύζι.',
    9.90, 2, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    '麻辣豆腐', 'Sichuan Tofu', 'Tofu Sichuan',
    '豆腐、蘑菇和微辣花椒酱。',
    'Tofu, mushrooms, and a gently spicy Sichuan pepper sauce.',
    'Tofu, μανιτάρια και ελαφρώς πικάντικη σάλτσα Sichuan.',
    10.90, 1, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    '芝麻彩蔬', 'Sesame Market Greens', 'Λαχανικά με Σουσάμι',
    '时蔬、芝麻和清爽酱汁。',
    'Market vegetables with sesame and a light savoury sauce.',
    'Λαχανικά αγοράς με σουσάμι και ελαφριά αλμυρή σάλτσα.',
    8.90, 2, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000006',
    '蜂蜜柠檬冰茶', 'Honey Lemon Iced Tea', 'Κρύο Τσάι Μέλι και Λεμόνι',
    '清爽柠檬和蜂蜜风味冰茶。',
    'Refreshing lemon and honey iced tea.',
    'Δροσερό κρύο τσάι με λεμόνι και μέλι.',
    3.90, 1, true, false, null, '[]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000006',
    '焦糖香蕉卷', 'Caramel Banana Roll', 'Ρολό Μπανάνας με Καραμέλα',
    '香脆香蕉卷，淋上焦糖酱。',
    'Crisp banana roll finished with caramel sauce.',
    'Τραγανό ρολό μπανάνας με σάλτσα καραμέλας.',
    5.50, 2, true, false, null, '[]'::jsonb
  );

commit;
