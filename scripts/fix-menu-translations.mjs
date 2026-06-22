// 菜单多语言修复脚本
// 用法:
//   node scripts/fix-menu-translations.mjs --dry-run   (预览)
//   node scripts/fix-menu-translations.mjs --apply      (执行修复)
// 环境变量:
//   DEEPSEEK_API_KEY            翻译 API 密钥
//   VITE_SUPABASE_URL           Supabase URL
//   VITE_SUPABASE_PUBLISHABLE_KEY   Supabase anon key (需 admin 权限)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// 加载 .env.local
function loadEnv() {
  try {
    const content = readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

loadEnv();

const API_KEY = process.env.DEEPSEEK_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 判断文本主要语言
function detectLang(text) {
  if (!text) return 'empty';
  const hasGreek = /[α-ωΑ-Ω]/g;
  const hasChinese = /[一-鿿]/g;
  const gCount = (text.match(hasGreek) || []).length;
  const cCount = (text.match(hasChinese) || []).length;
  const total = text.replace(/\s/g, '').length;
  if (total === 0) return 'empty';
  if (gCount / total > 0.3) return 'el';
  if (cCount / total > 0.2) return 'zh';
  return 'en';
}

// 判断字段是否有"混语言"问题
function isMixed(text, targetLang) {
  if (!text) return false;
  const detected = detectLang(text);
  if (detected === 'empty') return false;
  // targetLang=zh 但里面明显是英文或希腊语
  if (targetLang === 'zh' && detected !== 'zh') return true;
  if (targetLang === 'en' && detected !== 'en') return true;
  if (targetLang === 'el' && detected !== 'el') return true;
  return false;
}

// 调用 DeepSeek 翻译
async function translate(text, fromLang, toLang, context = '') {
  if (!API_KEY) throw new Error('DEEPSEEK_API_KEY not set');
  const langNames = { zh: 'Chinese', en: 'English', el: 'Greek' };
  const prompt = `Translate this restaurant menu ${context} from ${langNames[fromLang]} to ${langNames[toLang]}. Return ONLY the translation, no explanation.

${text}`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'API error');
  return data.choices[0].message.content.trim();
}

// 等待
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(DRY_RUN ? '*** DRY RUN MODE ***' : APPLY ? '*** APPLY MODE ***' : '*** 请指定 --dry-run 或 --apply ***');
  if (!DRY_RUN && !APPLY) process.exit(0);

  // 读取分类
  const { data: categories } = await supabase.from('menu_categories').select('*').is('deleted_at', null);
  console.log(`读取到 ${categories.length} 个分类`);

  // 读取菜品
  const { data: items } = await supabase.from('menu_items').select('*').is('deleted_at', null).order('sort_order');
  console.log(`读取到 ${items.length} 个菜品`);

  const fixes = [];

  // ---- 检查分类 ----
  for (const cat of categories) {
    // name_el 中混英文 → 翻译
    if (isMixed(cat.name_el, 'el')) {
      fixes.push({
        table: 'menu_categories', id: cat.id,
        field: 'name_el', old: cat.name_el,
        action: `从 name_en 翻译为希腊语: "${cat.name_en}"`,
        new: null,
      });
    }
    // name_el 尾部空格
    if (cat.name_el && cat.name_el !== cat.name_el.trim()) {
      fixes.push({
        table: 'menu_categories', id: cat.id,
        field: 'name_el', old: cat.name_el,
        action: 'trim 尾部空格',
        new: cat.name_el.trim(),
      });
    }
  }

  // ---- 检查菜品 ----
  for (const item of items) {
    // name_zh 混语言
    if (isMixed(item.name_zh, 'zh')) {
      fixes.push({
        table: 'menu_items', id: item.id,
        field: 'name_zh', old: item.name_zh,
        action: `从 name_en "${item.name_en}" 翻译为中文`,
        new: null,
      });
    }
    // description_el 为空 → 从 name_en 翻译
    if (!item.description_el?.trim()) {
      fixes.push({
        table: 'menu_items', id: item.id,
        field: 'description_el', old: item.description_el,
        action: `从 name_en "${item.name_en}" 生成希腊语描述`,
        new: null,
      });
    }
    // description_en 混希腊语
    if (isMixed(item.description_en, 'en')) {
      fixes.push({
        table: 'menu_items', id: item.id,
        field: 'description_en', old: item.description_en,
        action: `从 name_en "${item.name_en}" 重新生成英文描述`,
        new: null,
      });
    }
    // description_zh 混希腊语或为空
    if (isMixed(item.description_zh, 'zh')) {
      fixes.push({
        table: 'menu_items', id: item.id,
        field: 'description_zh', old: item.description_zh,
        action: `从 name_zh "${item.name_zh}" 重新生成中文描述`,
        new: null,
      });
    }
  }

  console.log(`\n共 ${fixes.length} 处需要修复:`);
  const catFixes = fixes.filter((f) => f.table === 'menu_categories');
  const itemFixes = fixes.filter((f) => f.table === 'menu_items');
  console.log(`  分类: ${catFixes.length} 处`);
  console.log(`  菜品: ${itemFixes.length} 处`);

  if (DRY_RUN) {
    console.log('\n--- 预览前 20 条 ---');
    for (const f of fixes.slice(0, 20)) {
      console.log(`[${f.table}] ${f.field}: "${(f.old || '').slice(0, 50)}..." → ${f.action}`);
    }
    return;
  }

  // ---- APPLY ----
  if (!API_KEY) {
    console.error('\n请设置 DEEPSEEK_API_KEY 环境变量');
    process.exit(1);
  }

  let applied = 0;
  for (const f of fixes) {
    try {
      let newVal = f.new;
      if (newVal === null) {
        // 需要翻译
        if (f.field === 'name_el') {
          const cat = categories.find((c) => c.id === f.id);
          const src = cat?.name_en || cat?.name_zh || '';
          newVal = await translate(src, 'en', 'el', 'category name');
        } else if (f.field === 'name_zh') {
          const item = items.find((i) => i.id === f.id);
          const src = item?.name_en || '';
          newVal = await translate(src, 'en', 'zh', 'dish name');
        } else if (f.field === 'description_el') {
          const item = items.find((i) => i.id === f.id);
          newVal = await translate(item?.name_en || '', 'en', 'el', 'dish description');
        } else if (f.field === 'description_en') {
          const item = items.find((i) => i.id === f.id);
          newVal = await translate(item?.name_en || item?.name_zh || '', 'en', 'en', 'dish description - rewrite in clean English');
        } else if (f.field === 'description_zh') {
          const item = items.find((i) => i.id === f.id);
          newVal = await translate(item?.name_zh || item?.name_en || '', 'zh', 'zh', 'dish description');
        }
        await sleep(200); // API rate limit
      }

      const update = {};
      update[f.field] = newVal;
      const { error } = await supabase.from(f.table).update(update).eq('id', f.id);
      if (error) throw error;
      applied++;
      console.log(`✓ [${applied}/${fixes.length}] ${f.table} ${f.field}`);
    } catch (err) {
      console.error(`✗ ${f.table} ${f.id} ${f.field}: ${err.message}`);
    }
  }
  console.log(`\n完成: ${applied}/${fixes.length} 处修复`);
}

main().catch((err) => { console.error(err); process.exit(1); });
