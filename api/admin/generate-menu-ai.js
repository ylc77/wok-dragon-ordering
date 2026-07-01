import { createClient } from '@supabase/supabase-js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function sendJson(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body ? JSON.parse(body) : {}));
    request.on('error', reject);
  });
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeItem(item) {
  return {
    category_name: cleanText(item?.category_name),
    name_zh: cleanText(item?.name_zh),
    name_en: cleanText(item?.name_en),
    name_el: cleanText(item?.name_el),
    description_zh: cleanText(item?.description_zh),
    description_en: cleanText(item?.description_en),
    description_el: cleanText(item?.description_el),
    price: cleanText(item?.price),
  };
}

async function requireStaff(request, response) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    sendJson(response, 500, { error: 'Supabase server environment variables are missing.' });
    return null;
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    sendJson(response, 401, { error: 'Missing authorization token.' });
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    sendJson(response, 401, { error: 'Invalid authorization token.' });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !['admin', 'staff'].includes(profile?.role)) {
    sendJson(response, 403, { error: 'Admin or staff role is required.' });
    return null;
  }

  return supabase;
}

function safeJsonParse(content) {
  try {
    return JSON.parse(content || '{}');
  } catch {
    const match = String(content || '').match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    if (!(await requireStaff(request, response))) return;

    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) {
      sendJson(response, 500, { error: 'DEEPSEEK_API_KEY is not configured.' });
      return;
    }

    const body = await readBody(request);
    const item = normalizeItem(body.item);
    const displayName = item.name_zh || item.name_en || item.name_el;
    if (!displayName) {
      sendJson(response, 400, { error: 'Menu item name is required.' });
      return;
    }

    const deepseekResponse = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.35,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content:
              'You are a restaurant menu copywriter for a Chinese/Asian restaurant in Greece. Return strict JSON only. Do not invent allergens or health claims. Keep descriptions short, natural, and suitable for a customer menu.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              instruction:
                'Generate missing menu names and descriptions in Chinese, English, and Greek, and one English image-generation prompt. Preserve the meaning of existing names. The image prompt must describe a realistic restaurant menu photo, clean background, natural light, no text, no watermark. If the item is vague like Set A, use existing descriptions/category but avoid claiming exact ingredients that were not provided.',
              output_schema: {
                name_zh: 'Chinese menu name',
                name_en: 'English menu name',
                name_el: 'Greek menu name',
                description_zh: 'short Chinese description',
                description_en: 'short English description',
                description_el: 'short Greek description',
                image_prompt: 'English prompt for generating a realistic menu food photo',
              },
              item,
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
    const parsed = safeJsonParse(completion.choices?.[0]?.message?.content);

    sendJson(response, 200, {
      names: {
        name_zh: cleanText(parsed.name_zh),
        name_en: cleanText(parsed.name_en),
        name_el: cleanText(parsed.name_el),
      },
      descriptions: {
        description_zh: cleanText(parsed.description_zh),
        description_en: cleanText(parsed.description_en),
        description_el: cleanText(parsed.description_el),
      },
      image_prompt: cleanText(parsed.image_prompt),
    });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
