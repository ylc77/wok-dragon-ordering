import { mkdir, writeFile } from 'node:fs/promises';

const WOLT_URL = 'https://wolt.com/en/grc/athens/restaurant/wok-dragon-express';
const EFOOD_URL = 'https://www.e-food.gr/delivery/athina/wok-dragon-express';
const MAP_URL =
  'https://www.google.com/maps/place/Wok+Dragon+EXPRESS+%E9%BE%99%E5%9F%8E%E9%85%92%E6%A5%BC/@37.9759663,23.7252156,17z/data=!3m1!4b1!4m6!3m5!1s0x14a1bd2d5db29b63:0xfdd04aeb588d0ebe!8m2!3d37.9759663!4d23.7277905!16s%2Fg%2F11gmfjf3t7';

// Keep this source file ASCII-only. Unicode text is represented with escapes so
// seed generation is stable across Windows console encodings.
const ZH = {
  restaurant: '\u9f99\u57ce\u9152\u697c',
  specialMenu: '\u7cbe\u9009\u5957\u9910',
  setMenu: '\u591a\u4eba\u5957\u9910',
  soups: '\u6c64\u7c7b',
  salads: '\u6c99\u62c9',
  appetizers: '\u524d\u83dc',
  noodleSoups: '\u6c64\u9762',
  friedNoodles: '\u7092\u9762',
  friedRiceNoodles: '\u7092\u7c73\u7c89',
  friedRice: '\u7092\u996d',
  duck: '\u9e2d\u8089',
  beef: '\u725b\u8089',
  chicken: '\u9e21\u8089',
  pork: '\u732a\u8089',
  seafood: '\u6d77\u9c9c',
  clayPot: '\u7802\u9505\u83dc',
  ricePlates: '\u84b8\u996d\u76d6\u996d',
  vegetarian: '\u7d20\u98df',
  kids: '\u513f\u7ae5\u9910',
  desserts: '\u751c\u54c1',
  softDrinks: '\u8f6f\u996e',
  beers: '\u5564\u9152\u548c\u996e\u54c1',
  wines: '\u8461\u8404\u9152',
  dips: '\u8638\u9171',
  cutlery: '\u9910\u5177',
};

const CATEGORY_TRANSLATIONS_BY_ORDER = [
  [ZH.specialMenu, 'Special Menu'],
  [ZH.setMenu, 'Set Menu'],
  [ZH.soups, 'Soups'],
  [ZH.salads, 'Salads'],
  [ZH.appetizers, 'Appetizers'],
  [ZH.noodleSoups, 'Noodle Soups'],
  [ZH.friedNoodles, 'Fried Noodles'],
  [ZH.friedRiceNoodles, 'Fried Rice Noodles'],
  [ZH.friedRice, 'Fried Rice'],
  [ZH.duck, 'Duck'],
  [ZH.beef, 'Beef'],
  [ZH.chicken, 'Chicken'],
  [ZH.pork, 'Pork'],
  [ZH.seafood, 'Seafood'],
  [ZH.clayPot, 'Clay Pot Dishes'],
  [ZH.ricePlates, 'Rice Plates'],
  [ZH.vegetarian, 'Vegetarian'],
  [ZH.kids, 'Kids Menu'],
  [ZH.desserts, 'Desserts'],
  [ZH.softDrinks, 'Soft Drinks'],
  [ZH.beers, 'Beers and Drinks'],
  [ZH.wines, 'Wines'],
  [ZH.dips, 'Dips'],
  [ZH.cutlery, 'Cutlery'],
];

const RULES = [
  ['\u03a3\u03bf\u03cd\u03c0\u03b1', 'Soup', '\u6c64'],
  ['\u03a3\u03bf\u03cd\u03c0\u03b5\u03c2', 'Soups', '\u6c64'],
  ['\u039a\u03b1\u03c5\u03c4\u03b5\u03c1\u03ae \u03ba\u03b1\u03b9 \u039e\u03b9\u03bd\u03ae', 'Hot and Sour', '\u9178\u8fa3'],
  ['\u039a\u03bf\u03c4\u03cc\u03c0\u03bf\u03c5\u03bb\u03bf', 'Chicken', '\u9e21\u8089'],
  ['\u039a\u03bf\u03c4\u03cc\u03c0\u03bf\u03c5\u03bb\u03bf\u03c5', 'Chicken', '\u9e21\u8089'],
  ['\u039a\u03b1\u03bb\u03b1\u03bc\u03c0\u03cc\u03ba\u03b9', 'Corn', '\u7389\u7c73'],
  ['\u039c\u03bf\u03c3\u03c7\u03ac\u03c1\u03b9', 'Beef', '\u725b\u8089'],
  ['\u039b\u03b1\u03c7\u03b1\u03bd\u03b9\u03ba\u03ac', 'Vegetables', '\u852c\u83dc'],
  ['\u039b\u03b1\u03c7\u03b1\u03bd\u03b9\u03ba\u03ce\u03bd', 'Vegetable', '\u852c\u83dc'],
  ['\u03a0\u03ac\u03c0\u03b9\u03b1', 'Duck', '\u9e2d\u8089'],
  ['\u03a0\u03ac\u03c0\u03b9\u03b1\u03c2', 'Duck', '\u9e2d\u8089'],
  ['\u03a7\u03bf\u03b9\u03c1\u03b9\u03bd\u03cc', 'Pork', '\u732a\u8089'],
  ['\u03a7\u03bf\u03b9\u03c1\u03b9\u03bd\u03ac', 'Pork', '\u732a\u8089'],
  ['\u0398\u03b1\u03bb\u03b1\u03c3\u03c3\u03b9\u03bd\u03ac', 'Seafood', '\u6d77\u9c9c'],
  ['\u0393\u03b1\u03c1\u03af\u03b4\u03b5\u03c2', 'Shrimp', '\u867e'],
  ['\u0393\u03b1\u03c1\u03af\u03b4\u03b1\u03c2', 'Shrimp', '\u867e'],
  ['\u0391\u03c5\u03b3\u03cc', 'Egg', '\u9e21\u86cb'],
  ['\u0391\u03c5\u03b3\u03ac', 'Eggs', '\u9e21\u86cb'],
  ['\u03a4\u03b7\u03b3\u03b1\u03bd\u03b7\u03c4\u03ac', 'Fried', '\u7092/\u70b8'],
  ['\u03a4\u03b7\u03b3\u03b1\u03bd\u03b7\u03c4\u03cc', 'Fried', '\u7092/\u70b8'],
  ['\u03a1\u03cd\u03b6\u03b9', 'Rice', '\u7c73\u996d'],
  ['\u03a1\u03c5\u03b6\u03b9\u03bf\u03cd', 'Rice', '\u7c73\u996d'],
  ['\u03a8\u03b7\u03c4\u03ae', 'Roasted', '\u70e4'],
  ['\u03a8\u03b7\u03c4\u03cc', 'Roasted', '\u70e4'],
  ['\u03a3\u03ac\u03bb\u03c4\u03c3\u03b1', 'Sauce', '\u9171'],
  ['\u03a3\u03c9\u03c2', 'Sauce', '\u9171'],
  ['\u0393\u03bb\u03c5\u03ba\u03cc\u03be\u03b9\u03bd\u03b7', 'Sweet and Sour', '\u7cd6\u918b'],
  ['\u0393\u03bb\u03c5\u03ba\u03cc\u03be\u03b9\u03bd\u03bf', 'Sweet and Sour', '\u7cd6\u918b'],
  ['\u039a\u03b9\u03bd\u03ad\u03b6\u03b9\u03ba\u03b7', 'Chinese', '\u4e2d\u5f0f'],
  ['\u0391\u03bd\u03bf\u03b9\u03be\u03b9\u03ac\u03c4\u03b9\u03ba\u03b1 \u03a1\u03bf\u03bb\u03ac', 'Spring Rolls', '\u6625\u5377'],
  ['\u03a1\u03bf\u03bb\u03ac', 'Rolls', '\u5377'],
  ['\u03a6\u03c4\u03b5\u03c1\u03bf\u03cd\u03b3\u03b5\u03c2', 'Wings', '\u9e21\u7fc5'],
  ['\u03a3\u03b1\u03bb\u03ac\u03c4\u03b1', 'Salad', '\u6c99\u62c9'],
  ['\u039d\u03c4\u03bf\u03bc\u03ac\u03c4\u03b1', 'Tomato', '\u756a\u8304'],
  ['\u03a6\u03b1\u03c3\u03cc\u03bb\u03b9\u03b1', 'Beans', '\u8c46\u7c7b'],
  ['\u039c\u03b1\u03bd\u03b9\u03c4\u03ac\u03c1\u03b9\u03b1', 'Mushrooms', '\u8611\u83c7'],
  ['\u039a\u03ac\u03c3\u03b9\u03bf\u03c5\u03c2', 'Cashews', '\u8170\u679c'],
  ['\u039a\u03ac\u03c1\u03c5', 'Curry', '\u5496\u55b1'],
  ['\u03a3\u03ba\u03cc\u03c1\u03b4\u03bf', 'Garlic', '\u849c'],
  ['\u03a4\u03c3\u03af\u03bb\u03b9', 'Chili', '\u8fa3\u6912'],
  ['\u03bc\u03b5', 'with', '\u914d'],
  ['\u03ba\u03b1\u03b9', 'and', '\u548c'],
];

function translate(text, target) {
  if (!text) return '';
  let value = text.replace(/^(\d+)\.\s*/g, '$1. ');
  for (const [source, en, zh] of RULES) {
    value = value.replaceAll(source, target === 'zh' ? zh : en);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function imageUrl(item) {
  const first = item.images?.[0];
  return first?.url || first?.source_url || first?.image_url || null;
}

function priceToEuro(price) {
  return Number((Number(price || 0) / 100).toFixed(2));
}

function sql(value) {
  if (value === null || value === undefined || value === '') return 'null';
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function csv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function fetchWoltData() {
  const response = await fetch(WOLT_URL);
  if (!response.ok) throw new Error(`Wolt request failed: ${response.status}`);
  const html = new TextDecoder('utf-8').decode(await response.arrayBuffer());
  const match = html.match(/<script type="application\/json" class="query-state">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find Wolt query-state JSON.');

  const state = JSON.parse(match[1]);
  const query = state.queries.find(
    (candidate) =>
      JSON.stringify(candidate.queryKey || []).includes('category-listing') &&
      candidate.state?.data?.categories &&
      candidate.state?.data?.items,
  );
  if (!query) throw new Error('Could not find Wolt category-listing data.');
  return query.state.data;
}

async function main() {
  const data = await fetchWoltData();
  const itemMap = new Map(data.items.map((item) => [item.id, item]));

  const categories = data.categories
    .filter((category) => category.name !== 'Most ordered')
    .map((category, index) => {
      const [name_zh, name_en] = CATEGORY_TRANSLATIONS_BY_ORDER[index] ?? [
        translate(category.name, 'zh'),
        translate(category.name, 'en'),
      ];
      return {
        key: `cat_${index + 1}`,
        sort_order: index + 1,
        name_el: category.name,
        name_en,
        name_zh,
        item_ids: category.item_ids,
      };
    });

  const menuRows = [];
  for (const category of categories) {
    category.item_ids.forEach((itemId, index) => {
      const item = itemMap.get(itemId);
      if (!item) return;
      menuRows.push({
        category_key: category.key,
        name_el: item.name,
        name_en: translate(item.name, 'en') || item.name,
        name_zh: translate(item.name, 'zh') || item.name,
        description_el: item.description || '',
        description_en: translate(item.description || '', 'en'),
        description_zh: translate(item.description || '', 'zh'),
        price: priceToEuro(item.price),
        image_url: imageUrl(item),
        is_available: true,
        sort_order: category.sort_order * 1000 + index + 1,
      });
    });
  }

  await mkdir('supabase', { recursive: true });

  const categoryValues = categories
    .map(
      (category) =>
        `    (${sql(category.key)}, ${sql(category.name_zh)}, ${sql(category.name_en)}, ${sql(category.name_el)}, ${category.sort_order}, true)`,
    )
    .join(',\n');

  const itemValues = menuRows
    .map(
      (item) =>
        `    (${sql(item.category_key)}, ${sql(item.name_zh)}, ${sql(item.name_en)}, ${sql(item.name_el)}, ${sql(item.description_zh)}, ${sql(item.description_en)}, ${sql(item.description_el)}, ${sql(item.price)}, ${sql(item.image_url)}, true, ${item.sort_order})`,
    )
    .join(',\n');

  const seedSql = `-- Seed data for Wok Dragon Express / ${ZH.restaurant}.
-- Menu source: ${WOLT_URL}
-- Google Maps source: ${MAP_URL}
-- efood source checked but not machine-readable in this environment: ${EFOOD_URL}
-- Prices come from the public Wolt delivery platform and may differ from dine-in prices.
-- Review and edit final prices in the Chinese admin panel before production use.

begin;

truncate table public.menu_items restart identity cascade;
truncate table public.menu_categories restart identity cascade;
truncate table public.restaurant_settings restart identity cascade;

insert into public.restaurant_settings (
  name_zh,
  name_en,
  name_el,
  phone,
  address_zh,
  address_en,
  address_el,
  map_url,
  opening_hours_zh,
  opening_hours_en,
  opening_hours_el,
  wolt_url,
  efood_url,
  box_url
) values (
  ${sql(ZH.restaurant)},
  'Wok Dragon Express',
  'Wok Dragon Express',
  null,
  'Mitropoleos 51, Monastiraki, 10556 Athens, Greece',
  'Mitropoleos 51, Monastiraki, 10556 Athens, Greece',
  'Mitropoleos 51, Monastiraki, 10556 Athens, Greece',
  ${sql(MAP_URL)},
  '12:00-23:00',
  '12:00-23:00',
  '12:00-23:00',
  null,
  null,
  null
);

with source_categories(source_key, name_zh, name_en, name_el, sort_order, is_active) as (
  values
${categoryValues}
),
inserted_categories as (
  insert into public.menu_categories (name_zh, name_en, name_el, sort_order, is_active)
  select name_zh, name_en, name_el, sort_order, is_active
  from source_categories
  returning id, sort_order
)
insert into public.menu_items (
  category_id,
  name_zh,
  name_en,
  name_el,
  description_zh,
  description_en,
  description_el,
  price,
  image_url,
  is_available,
  sort_order
)
select
  c.id,
  v.name_zh,
  v.name_en,
  v.name_el,
  v.description_zh,
  v.description_en,
  v.description_el,
  v.price,
  v.image_url,
  v.is_available,
  v.sort_order
from (
  values
${itemValues}
) as v(category_key, name_zh, name_en, name_el, description_zh, description_en, description_el, price, image_url, is_available, sort_order)
join source_categories sc on sc.source_key = v.category_key
join inserted_categories c on c.sort_order = sc.sort_order;

commit;
`;

  const templateCsv =
    'category_zh,category_en,category_el,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,sort_order\n';
  const dataCsv = [
    templateCsv.trim(),
    ...menuRows.map((row) => {
      const category = categories.find((candidate) => candidate.key === row.category_key);
      return [
        category?.name_zh,
        category?.name_en,
        category?.name_el,
        row.name_zh,
        row.name_en,
        row.name_el,
        row.description_zh,
        row.description_en,
        row.description_el,
        row.price,
        row.image_url,
        row.is_available,
        row.sort_order,
      ]
        .map(csv)
        .join(',');
    }),
  ].join('\n');

  await writeFile('supabase/seed.sql', seedSql, 'utf8');
  await writeFile('supabase/menu-import-template.csv', templateCsv, 'utf8');
  await writeFile('supabase/menu-data-from-wolt.csv', `${dataCsv}\n`, 'utf8');

  console.log(`Extracted ${categories.length} categories and ${menuRows.length} menu items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
