import { createClient } from '@supabase/supabase-js';

function sendJson(response, status, payload) {
  response
    .status(status)
    .setHeader('Content-Type', 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.status(204).end();
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  const base = {
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks: {
      database: 'disconnected',
      config: 'unavailable',
      realtime: 'not checked (client-side)',
      deepseek: process.env.DEEPSEEK_API_KEY ? 'configured' : 'missing',
      openai_images: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    },
  };

  if (!supabaseUrl || !supabaseKey) {
    sendJson(response, 200, {
      ...base,
      status: 'error',
      error: 'Supabase environment variables are not configured.',
    });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('restaurant_settings')
      .select('id, ordering_enabled')
      .limit(1);

    if (error) throw error;

    sendJson(response, 200, {
      ...base,
      status: 'ok',
      checks: {
        database: 'connected',
        config: data && data.length > 0 ? 'readable' : 'empty',
        realtime: 'not checked (client-side)',
        deepseek: process.env.DEEPSEEK_API_KEY ? 'configured' : 'missing',
        openai_images: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      },
    });
  } catch (err) {
    sendJson(response, 200, {
      ...base,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      checks: {
        database: 'disconnected',
        config: 'unavailable',
        realtime: 'not checked (client-side)',
        deepseek: process.env.DEEPSEEK_API_KEY ? 'configured' : 'missing',
        openai_images: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      },
    });
  }
}
