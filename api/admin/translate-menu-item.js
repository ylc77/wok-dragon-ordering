import { createClient } from '@supabase/supabase-js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MAX_ITEMS = 5;

function sendJson(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 128) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body ? JSON.parse(body) : {}));
    request.on('error', reject);
  });
}

function normalizeItem(item) {
  return {
    name_zh: String(item?.name_zh ?? '').trim(),
    description_zh: String(item?.description_zh ?? '').trim(),
    name_en: String(item?.name_en ?? '').trim(),
    description_en: String(item?.description_en ?? '').trim(),
    name_el: String(item?.name_el ?? '').trim(),
    description_el: String(item?.description_el ?? '').trim(),
  };
}

function onlyMissing(existing, translated) {
  // 希腊文兜底：如果 DeepSeek 没返回希腊文，至少用英文填充（避免空字段）
  return {
    name_en: existing.name_en || translated.name_en || '',
    description_en: existing.description_en || translated.description_en || '',
    name_el: existing.name_el || translated.name_el || translated.name_en || '',
    description_el: existing.description_el || translated.description_el || translated.description_en || '',
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      sendJson(response, 500, { error: 'Supabase server environment variables are missing.' });
      return;
    }

    if (!deepseekKey) {
      sendJson(response, 500, { error: 'DEEPSEEK_API_KEY is not configured.' });
      return;
    }

    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      sendJson(response, 401, { error: 'Missing authorization token.' });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      sendJson(response, 401, { error: 'Invalid authorization token.' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError || !['admin', 'staff'].includes(profile?.role)) {
      sendJson(response, 403, { error: 'Admin or staff role is required.' });
      return;
    }

    const body = await readBody(request);
    const rawItems = Array.isArray(body.items) ? body.items.map(normalizeItem).slice(0, MAX_ITEMS) : [];
    if (rawItems.length === 0) {
      sendJson(response, 400, { error: 'No menu items were provided.' });
      return;
    }
    // 给每个 item 加唯一标记，防止 LLM 返回顺序错乱
    const items = rawItems.map((item, i) => ({ _idx: i, ...item }));

    const deepseekResponse = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          {
            role: 'system',
            content:
              'You are a restaurant menu translator. Translate each item from Chinese to English AND Greek. You MUST provide name_en, description_en, name_el, description_el for EVERY item — never skip Greek even if the name seems untranslatable (use phonetic transliteration if needed). Keep the _idx field unchanged in each translation. Return strict json only. Do not add explanations.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              instruction:
                'Return json with a translations array. Each translation must include _idx, name_en, description_en, name_el, description_el. Preserve existing non-empty fields and only fill missing fields. The _idx field must match the input item.',
              example: {
                translations: [
                  {
                    _idx: 0,
                    name_en: 'Sweet and Sour Chicken',
                    description_en: 'Crispy chicken with sweet and sour sauce.',
                    name_el: 'Γλυκόξινο Κοτόπουλο',
                    description_el: 'Τραγανό κοτόπουλο με γλυκόξινη σάλτσα.',
                  },
                ],
              },
              items,
            }),
          },
        ],
      }),
    });

    if (!deepseekResponse.ok) {
      sendJson(response, 502, { error: `DeepSeek request failed: ${deepseekResponse.status}` });
      return;
    }

    const completion = await deepseekResponse.json();
    const content = completion.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');
    const rawTranslations = Array.isArray(parsed.translations) ? parsed.translations : [];
    // 按 _idx 匹配，不再依赖数组顺序
    const translationByIndex = new Map<number, Record<string, string>>();
    rawTranslations.forEach((t: any) => {
      const idx = Number(t._idx);
      if (!Number.isNaN(idx)) translationByIndex.set(idx, t);
    });

    sendJson(response, 200, {
      translations: items.map((item) => onlyMissing(item, translationByIndex.get(item._idx) ?? {})),
    });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
