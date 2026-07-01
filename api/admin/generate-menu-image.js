import { createClient } from '@supabase/supabase-js';

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

async function requireStaff(request, response) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    sendJson(response, 500, { error: 'Supabase server environment variables are missing.' });
    return false;
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    sendJson(response, 401, { error: 'Missing authorization token.' });
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    sendJson(response, 401, { error: 'Invalid authorization token.' });
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !['admin', 'staff'].includes(profile?.role)) {
    sendJson(response, 403, { error: 'Admin or staff role is required.' });
    return false;
  }

  return true;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    if (!(await requireStaff(request, response))) return;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      sendJson(response, 501, {
        error: 'OPENAI_API_KEY is not configured. The image generation button is ready; add the key later to enable it.',
      });
      return;
    }

    const body = await readBody(request);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      sendJson(response, 400, { error: 'Image prompt is required.' });
      return;
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
        output_format: 'png',
      }),
    });

    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      sendJson(response, 502, { error: payload.error?.message || `OpenAI image request failed: ${openaiResponse.status}` });
      return;
    }

    const image = payload.data?.[0]?.b64_json;
    if (!image) {
      sendJson(response, 502, { error: 'OpenAI did not return image data.' });
      return;
    }

    sendJson(response, 200, { b64_json: image, mime_type: 'image/png' });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
