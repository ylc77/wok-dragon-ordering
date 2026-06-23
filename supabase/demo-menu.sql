-- ============================================================
-- 演示数据（可选执行，用于展示效果或新客户初始化）
-- 包含通用餐馆菜单 + 默认品牌设置
-- 新客户可在此基础上编辑或直接替换
-- ============================================================

-- 默认餐馆设置
insert into public.restaurant_settings (id, name_zh, name_en, name_el)
values (gen_random_uuid(), '我的餐馆', 'My Restaurant', 'Το Εστιατόριό Μου')
on conflict do nothing;

-- ============================================================

-- 分类
insert into public.menu_categories (id, name_zh, name_en, name_el, sort_order, is_active)
values
  ('cat_app', '前菜', 'Appetizers', 'Ορεκτικά', 1, true),
  ('cat_soup', '汤类', 'Soups', 'Σούπες', 2, true),
  ('cat_main', '主菜', 'Main Dishes', 'Κύρια Πιάτα', 3, true),
  ('cat_rice', '米饭面条', 'Rice & Noodles', 'Ρύζι & Noodles', 4, true),
  ('cat_salad', '沙拉', 'Salads', 'Σαλάτες', 5, true),
  ('cat_drink', '饮品', 'Drinks', 'Ποτά', 6, true)
on conflict (id) do nothing;

-- 菜品
insert into public.menu_items (category_id, name_zh, name_en, name_el, description_zh, description_en, description_el, price, sort_order, is_available)
values
  ('cat_app', '春卷', 'Spring Rolls', 'Ανοιξιάτικα Ρολά', '酥脆春卷配甜辣酱', 'Crispy spring rolls with sweet chili sauce', 'Τραγανά ρολά με γλυκιά σάλτσα τσίλι', 5.90, 1, true),
  ('cat_app', '煎饺', 'Fried Dumplings', 'Τηγανητά Ντάμπλινγκ', '猪肉煎饺配酱油', 'Pan-fried pork dumplings with soy sauce', 'Τηγανητά ντάμπλινγκ χοιρινού με σάλτσα σόγιας', 6.50, 2, true),
  ('cat_soup', '酸辣汤', 'Hot & Sour Soup', 'Γλυκόξινη Σούπα', '经典酸辣汤配豆腐和蘑菇', 'Classic hot & sour soup with tofu and mushrooms', 'Κλασική γλυκόξινη σούπα με tofu και μανιτάρια', 5.50, 1, true),
  ('cat_soup', '馄饨汤', 'Wonton Soup', 'Σούπα Wonton', '鲜虾馄饨汤配蔬菜', 'Shrimp wonton soup with vegetables', 'Σούπα wonton γαρίδας με λαχανικά', 6.00, 2, true),
  ('cat_main', '宫保鸡丁', 'Kung Pao Chicken', 'Κοτόπουλο Kung Pao', '鸡肉丁配花生和干辣椒', 'Diced chicken with peanuts and dried chili', 'Κοτόπουλο σε κύβους με φιστίκια και αποξηραμένο τσίλι', 11.90, 1, true),
  ('cat_main', '糖醋排骨', 'Sweet & Sour Ribs', 'Γλυκόξινα Παϊδάκια', '慢炖猪排配甜酸酱', 'Slow-cooked pork ribs in sweet & sour sauce', 'Σιγομαγειρεμένα χοιρινά παϊδάκια σε γλυκόξινη σάλτσα', 13.50, 2, true),
  ('cat_main', '麻婆豆腐', 'Mapo Tofu', 'Tofu Mapo', '麻辣豆腐配猪肉碎', 'Spicy tofu with minced pork in Sichuan sauce', 'Πικάντικο tofu με κιμά χοιρινού σε σάλτσα Σετσουάν', 10.50, 3, true),
  ('cat_rice', '蛋炒饭', 'Egg Fried Rice', 'Τηγανητό Ρύζι με Αυγό', '经典蛋炒饭配蔬菜', 'Classic egg fried rice with vegetables', 'Κλασικό τηγανητό ρύζι με αυγό και λαχανικά', 8.90, 1, true),
  ('cat_rice', '炒面', 'Chow Mein', 'Chow Mein', '蔬菜鸡肉炒面', 'Stir-fried noodles with chicken and vegetables', 'Τηγανητά noodles με κοτόπουλο και λαχανικά', 9.50, 2, true),
  ('cat_rice', '扬州炒饭', 'Yangzhou Fried Rice', 'Τηγανητό Ρύζι Yangzhou', '扬州特色炒饭配虾仁和叉烧', 'Yangzhou-style fried rice with shrimp and char siu', 'Τηγανητό ρύζι τύπου Yangzhou με γαρίδες και char siu', 10.90, 3, true),
  ('cat_salad', '蔬菜沙拉', 'Mixed Salad', 'Ανάμεικτη Σαλάτα', '新鲜时蔬沙拉配醋汁', 'Fresh seasonal salad with vinaigrette', 'Φρέσκια σαλάτα εποχής με βινεγκρέτ', 5.90, 1, true),
  ('cat_drink', '冰柠檬茶', 'Iced Lemon Tea', 'Παγωμένο Τσάι Λεμόνι', '自制冰柠檬茶', 'House-made iced lemon tea', 'Σπιτικό παγωμένο τσάι λεμόνι', 3.50, 1, true),
  ('cat_drink', '珍珠奶茶', 'Bubble Tea', 'Bubble Tea', '经典珍珠奶茶', 'Classic bubble milk tea with tapioca pearls', 'Κλασικό bubble milk tea με tapioca', 4.90, 2, true)
on conflict do nothing;
