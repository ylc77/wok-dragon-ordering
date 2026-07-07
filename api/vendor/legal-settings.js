import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const failedAttempts = new Map();
const EDITABLE_FIELDS = [
  'project_type', 'business_name', 'legal_name', 'business_address', 'vat_number', 'gemi_number',
  'country', 'phone', 'contact_email', 'data_controller_name', 'data_controller_address',
  'privacy_request_email', 'privacy_request_instructions', 'service_flags', 'other_service_notes',
  'essential_cookie_note', 'analytics_cookies_enabled', 'error_monitoring_enabled',
  'advertising_cookies_enabled', 'cookie_last_updated', 'order_terms', 'cancellation_policy',
  'payment_terms', 'allergen_disclaimer', 'kitchen_receipt_disclaimer', 'official_receipt_disclaimer',
  'shipping_policy', 'return_policy', 'refund_policy', 'withdrawal_right', 'return_address',
  'return_shipping_responsibility', 'excluded_return_items', 'data_retention', 'last_updated', 'confirmations',
];

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

function sanitizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, source[field]]).filter(([, value]) => value !== undefined));
}

function validateForPublish(settings) {
  const required = [
    ['business_name', '商家展示名称'],
    ['legal_name', '法律主体名称'],
    ['business_address', '营业地址'],
    ['vat_number', 'VAT / AFM 税号'],
    ['phone', '联系电话'],
    ['contact_email', '联系邮箱'],
    ['last_updated', '最后更新时间'],
  ];
  const missing = required.filter(([key]) => !String(settings[key] || '').trim()).map(([, label]) => label);
  if (!settings.confirmations || !Object.values(settings.confirmations).every(Boolean)) missing.push('客户最终确认');
  return missing;
}

async function readDraft(supabase) {
  const { data, error } = await supabase.from('legal_settings').select('*').order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveDraft(supabase, input) {
  const current = await readDraft(supabase);
  const payload = { ...sanitizeSettings(input), status: 'draft' };
  const query = current
    ? supabase.from('legal_settings').update(payload).eq('id', current.id)
    : supabase.from('legal_settings').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

async function listVersions(supabase) {
  const { data, error } = await supabase
    .from('legal_settings_versions')
    .select('id,version_no,settings_id,snapshot,is_current,published_at,published_by,last_updated')
    .order('published_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function publishSettings(supabase, input) {
  const missing = validateForPublish(input || {});
  if (missing.length > 0) {
    const error = new Error(`法律信息未完成：${missing.join('、')}`);
    error.statusCode = 400;
    throw error;
  }

  const saved = await saveDraft(supabase, input);
  const { count, error: countError } = await supabase.from('legal_settings_versions').select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  const versionNo = `v${(count || 0) + 1}`;
  const snapshot = { ...saved, status: 'published', current_version: versionNo };

  const { error: clearError } = await supabase.from('legal_settings_versions').update({ is_current: false }).eq('is_current', true);
  if (clearError) throw clearError;
  const { data: version, error: versionError } = await supabase
    .from('legal_settings_versions')
    .insert({
      settings_id: saved.id,
      version_no: versionNo,
      snapshot,
      is_current: true,
      published_by: null,
      last_updated: saved.last_updated,
    })
    .select('id,version_no,settings_id,snapshot,is_current,published_at,published_by,last_updated')
    .single();
  if (versionError) throw versionError;

  const { error: updateError } = await supabase.from('legal_settings').update({
    status: 'published',
    current_version: versionNo,
    last_published_at: version.published_at,
  }).eq('id', saved.id);
  if (updateError) throw updateError;
  return version;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });

  const address = getClientAddress(request);
  if (isRateLimited(address)) return sendJson(response, 429, { error: '尝试次数过多，请稍后再试。' });

  const vendorPassword = process.env.VENDOR_SETTINGS_PASSWORD;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!vendorPassword || !supabaseUrl || !serviceRoleKey) {
    return sendJson(response, 503, { error: '供应商设置环境变量尚未配置。' });
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (!passwordsMatch(body.password, vendorPassword)) {
    registerFailure(address);
    return sendJson(response, 401, { error: '维护密码不正确。' });
  }
  failedAttempts.delete(address);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (body.action === 'read') return sendJson(response, 200, { settings: await readDraft(supabase) });
    if (body.action === 'versions') return sendJson(response, 200, { versions: await listVersions(supabase) });
    if (body.action === 'save') return sendJson(response, 200, { settings: await saveDraft(supabase, body.settings) });
    if (body.action === 'publish') return sendJson(response, 200, { version: await publishSettings(supabase, body.settings) });
    return sendJson(response, 400, { error: 'Unsupported action.' });
  } catch (error) {
    return sendJson(response, error?.statusCode || 500, { error: error instanceof Error ? error.message : '法律设置操作失败。' });
  }
}
