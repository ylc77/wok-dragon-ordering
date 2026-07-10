import { createClient } from '@supabase/supabase-js';

const attempts = new Map();

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function clientAddress(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(address) {
  const now = Date.now();
  const entry = attempts.get(address);
  if (!entry || now - entry.startedAt > 10 * 60 * 1000) { attempts.delete(address); return false; }
  return entry.count >= 12;
}

function registerAttempt(address) {
  const now = Date.now();
  const entry = attempts.get(address);
  attempts.set(address, !entry || now - entry.startedAt > 10 * 60 * 1000 ? { count: 1, startedAt: now } : { ...entry, count: entry.count + 1 });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') { sendJson(response, 405, { error: 'Method not allowed.' }); return; }
  const address = clientAddress(request);
  if (isRateLimited(address)) { sendJson(response, 429, { error: 'Too many attempts. Please try again later.' }); return; }
  registerAttempt(address);

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { sendJson(response, 503, { error: 'Reservation service is not configured.' }); return; }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = request.body && typeof request.body === 'object' ? request.body : {};

  try {
    const { data, error } = await supabase.rpc('create_reservation', {
      p_date: String(body.date || ''), p_time: String(body.time || ''), p_party_size: Number(body.partySize),
      p_guest_name: String(body.guestName || ''), p_phone: String(body.phone || ''), p_note: typeof body.note === 'string' ? body.note : null,
    });
    if (error) { sendJson(response, 400, { error: error.message }); return; }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) { sendJson(response, 500, { error: 'Reservation was not returned.' }); return; }
    attempts.delete(address);
    sendJson(response, 201, result);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Reservation could not be created.' });
  }
}
