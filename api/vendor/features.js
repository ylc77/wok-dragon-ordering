import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const FEATURE_KEYS = ['csv_import', 'ai_menu', 'ai_image', 'data_backup', 'print_agent'];
const PLAN_TIERS = new Set(['basic', 'standard', 'professional']);
const failedAttempts = new Map();

function sendJson(response, status, payload) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.status(status).end(JSON.stringify(payload));
}

function passwordsMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function getClientAddress(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(address) {
  const now = Date.now();
  const entry = failedAttempts.get(address);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) {
    failedAttempts.delete(address);
    return false;
  }
  return entry.count >= 8;
}

function registerFailure(address) {
  const now = Date.now();
  const entry = failedAttempts.get(address);
  failedAttempts.set(address, !entry || now - entry.startedAt > 15 * 60 * 1000
    ? { count: 1, startedAt: now }
    : { ...entry, count: entry.count + 1 });
}

function sanitizeFeatures(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, input[key] !== false]));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  const address = getClientAddress(request);
  if (isRateLimited(address)) {
    sendJson(response, 429, { error: '尝试次数过多，请稍后再试。' });
    return;
  }

  const vendorPassword = process.env.VENDOR_SETTINGS_PASSWORD;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!vendorPassword || !supabaseUrl || !serviceRoleKey) {
    sendJson(response, 503, { error: '维护控制环境变量尚未配置。' });
    return;
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (!passwordsMatch(body.password, vendorPassword)) {
    registerFailure(address);
    sendJson(response, 401, { error: '维护密码不正确。' });
    return;
  }
  failedAttempts.delete(address);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: current, error: readError } = await supabase
      .from('restaurant_settings')
      .select('id,name_zh,name_en,name_el,plan_tier,enable_pos,enable_qr_ordering,feature_flags')
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) {
      sendJson(response, 404, { error: '未找到餐馆设置记录。' });
      return;
    }

    if (body.action === 'read') {
      sendJson(response, 200, { settings: { ...current, feature_flags: sanitizeFeatures(current.feature_flags) } });
      return;
    }

    if (body.action !== 'update') {
      sendJson(response, 400, { error: 'Unsupported action.' });
      return;
    }

    const planTier = String(body.settings?.plan_tier || 'professional');
    if (!PLAN_TIERS.has(planTier)) {
      sendJson(response, 400, { error: '无效的套餐版本。' });
      return;
    }

    const payload = {
      plan_tier: planTier,
      enable_pos: body.settings?.enable_pos !== false,
      enable_qr_ordering: body.settings?.enable_qr_ordering !== false,
      feature_flags: sanitizeFeatures(body.settings?.feature_flags),
    };
    const { data: updated, error: updateError } = await supabase
      .from('restaurant_settings')
      .update(payload)
      .eq('id', current.id)
      .select('id,name_zh,name_en,name_el,plan_tier,enable_pos,enable_qr_ordering,feature_flags')
      .single();
    if (updateError) throw updateError;

    sendJson(response, 200, { settings: updated });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : '保存失败。' });
  }
}
