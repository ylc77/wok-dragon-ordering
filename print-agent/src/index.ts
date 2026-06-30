import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const processWithPkg = process as NodeJS.Process & { pkg?: unknown };
const rootDir = processWithPkg.pkg
  ? dirname(process.execPath)
  : basename(import.meta.dirname) === 'src'
  ? resolve(import.meta.dirname, '..')
  : import.meta.dirname;
const programDataRoot = process.env.PROGRAMDATA ? resolve(process.env.PROGRAMDATA, 'YANLCPrintAgent') : rootDir;
const installedModeMarkerPath = resolve(rootDir, 'install-mode.json');
const configPath = isInstalledPackage() ? resolve(programDataRoot, 'config.json') : resolve(rootDir, 'config.json');
const envPath = resolve(rootDir, '.env');
const logPath = resolve(isInstalledPackage() ? programDataRoot : rootDir, 'logs', 'print-agent.log');

type PaperWidth = '58' | '80';

type Config = {
  supabaseUrl: string;
  supabaseKey: string;
  adminEmail: string;
  adminPassword: string;
  printerName: string | null;
  paperWidth: PaperWidth;
  pollIntervalMs: number;
  autoPrint: boolean;
  maxOrdersPerPoll: number;
};

type SelectedOption = {
  choice_name_zh?: string | null;
  choice_name_en?: string | null;
  choice_name_el?: string | null;
};

type OrderItem = {
  id: string;
  item_name_zh: string | null;
  item_name_en: string | null;
  item_name_el: string | null;
  quantity: number;
  note: string | null;
  selected_options?: SelectedOption[] | null;
  unit_price: number | string;
  line_total: number | string;
};

type Order = {
  id: string;
  order_number: number;
  status: string;
  order_type?: string | null;
  total_price: number | string;
  created_at: string;
  kitchen_printed_at?: string | null;
  restaurant_tables?: { table_number?: number | null; label?: string | null } | null;
  order_items?: OrderItem[] | null;
};

type RestaurantSettings = {
  name_zh?: string | null;
  name_en?: string | null;
  name_el?: string | null;
};

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    printHelp();
    return;
  }

  if (args.has('--list-printers')) {
    await listPrinters();
    return;
  }

  if (args.has('--setup')) {
    await runSetup();
    return;
  }

  if (args.has('--setup-ui') || args.has('--setup-gui')) {
    await runSetupUi();
    return;
  }

  if (args.has('--install-startup')) {
    await installStartup();
    return;
  }

  if (args.has('--uninstall-startup')) {
    await uninstallStartup();
    return;
  }

  const config = await loadConfig();

  if (args.has('--test-print')) {
    const sample = buildSampleTicket(config.paperWidth);
    await printText(sample, config.printerName);
    await log('Test ticket has been sent to the printer.');
    return;
  }

  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await signIn(client, config);
  const settings = await fetchRestaurantSettings(client);
  await log(
    `Print agent started. autoPrint=${config.autoPrint}, printer=${config.printerName || 'Windows default printer'}, paperWidth=${config.paperWidth}mm`,
  );

  if (args.has('--once')) {
    await pollOnce(client, config, settings);
    return;
  }

  while (true) {
    await pollOnce(client, config, settings).catch((error) => logError('Polling failed', error));
    await sleep(config.pollIntervalMs);
  }
}

async function loadConfig(): Promise<Config> {
  const env = existsSync(configPath)
    ? normalizeJsonConfig(JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>)
    : { ...(existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {}), ...process.env };

  const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const;
  const missing = required.filter((key) => !String(env[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing config: ${missing.join(', ')}. ${getSetupHint()}`,
    );
  }

  const paperWidth = String(env.PAPER_WIDTH || '80') === '58' ? '58' : '80';
  const pollIntervalMs = Number(env.POLL_INTERVAL_MS || 3000);
  const maxOrdersPerPoll = Number(env.MAX_ORDERS_PER_POLL || 10);

  return {
    supabaseUrl: String(env.SUPABASE_URL).trim(),
    supabaseKey: String(env.SUPABASE_KEY).trim(),
    adminEmail: String(env.ADMIN_EMAIL).trim(),
    adminPassword: String(env.ADMIN_PASSWORD),
    printerName: String(env.PRINTER_NAME || '').trim() || null,
    paperWidth,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs >= 1000 ? pollIntervalMs : 3000,
    autoPrint: String(env.AUTO_PRINT ?? 'true').toLowerCase() !== 'false',
    maxOrdersPerPoll: Number.isFinite(maxOrdersPerPoll) && maxOrdersPerPoll > 0 ? maxOrdersPerPoll : 10,
  };
}

async function readConfigForUi() {
  if (!existsSync(configPath)) {
    return {
      supabaseUrl: '',
      supabaseKey: '',
      adminEmail: '',
      adminPassword: '',
      printerName: '',
      paperWidth: '80',
      pollIntervalMs: 3000,
      autoPrint: true,
      maxOrdersPerPoll: 10,
      configPath,
      logPath,
    };
  }

  const existing = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  return {
    supabaseUrl: stringValue(existing.supabaseUrl),
    supabaseKey: stringValue(existing.supabaseKey),
    adminEmail: stringValue(existing.adminEmail),
    adminPassword: stringValue(existing.adminPassword),
    printerName: stringValue(existing.printerName),
    paperWidth: stringValue(existing.paperWidth) || '80',
    pollIntervalMs: numberValue(existing.pollIntervalMs, 3000),
    autoPrint: existing.autoPrint !== false,
    maxOrdersPerPoll: numberValue(existing.maxOrdersPerPoll, 10),
    configPath,
    logPath,
  };
}

async function runSetupUi() {
  const server = createServer((request, response) => {
    handleSetupUiRequest(request, response).catch((error) => sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  await new Promise<void>((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;
  await openBrowser(url);
  console.log(`YANLC Print Agent settings UI: ${url}`);
  console.log('Keep this window open while editing settings. Press Ctrl+C to close.');
}

async function handleSetupUiRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/') {
    sendHtml(response, buildSetupHtml());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/config') {
    sendJson(response, 200, { ok: true, config: await readConfigForUi() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/printers') {
    sendJson(response, 200, { ok: true, printers: await getPrinters() });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/config') {
    const config = normalizeUiConfig(await readJsonBody(request));
    validateUiConfig(config);
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    sendJson(response, 200, { ok: true, configPath });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/test-print') {
    const config = normalizeUiConfig(await readJsonBody(request));
    await printText(buildSampleTicket(config.paperWidth), config.printerName || null);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/install-startup') {
    await installStartup();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/uninstall-startup') {
    await uninstallStartup();
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { ok: false, error: 'Not found' });
}

function normalizeJsonConfig(inputConfig: Record<string, unknown>) {
  return {
    SUPABASE_URL: inputConfig.supabaseUrl ?? inputConfig.SUPABASE_URL,
    SUPABASE_KEY: inputConfig.supabaseKey ?? inputConfig.SUPABASE_KEY,
    ADMIN_EMAIL: inputConfig.adminEmail ?? inputConfig.ADMIN_EMAIL,
    ADMIN_PASSWORD: inputConfig.adminPassword ?? inputConfig.ADMIN_PASSWORD,
    PRINTER_NAME: inputConfig.printerName ?? inputConfig.PRINTER_NAME,
    PAPER_WIDTH: inputConfig.paperWidth ?? inputConfig.PAPER_WIDTH,
    POLL_INTERVAL_MS: inputConfig.pollIntervalMs ?? inputConfig.POLL_INTERVAL_MS,
    AUTO_PRINT: inputConfig.autoPrint ?? inputConfig.AUTO_PRINT,
    MAX_ORDERS_PER_POLL: inputConfig.maxOrdersPerPoll ?? inputConfig.MAX_ORDERS_PER_POLL,
  };
}

async function runSetup() {
  console.log('Wok Dragon local print agent setup');
  console.log('----------------------------------');
  console.log('Windows printers:');
  await listPrinters();
  console.log('');

  const existing = existsSync(configPath)
    ? (JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>)
    : {};
  const rl = createInterface({ input, output });

  try {
    const supabaseUrl = await askRequired(rl, 'Supabase URL', stringValue(existing.supabaseUrl));
    const supabaseKey = await askRequired(rl, 'Supabase publishable key', stringValue(existing.supabaseKey));
    const adminEmail = await askRequired(rl, 'Admin email', stringValue(existing.adminEmail));
    const adminPassword = await askRequired(rl, 'Admin password', stringValue(existing.adminPassword));
    const printerName = await askOptional(rl, 'Printer name (leave empty for Windows default printer)', stringValue(existing.printerName));
    const paperWidthInput = await askOptional(rl, 'Paper width, 58 or 80', stringValue(existing.paperWidth) || '80');
    const autoPrintInput = await askOptional(rl, 'Auto print, true or false', existing.autoPrint === false ? 'false' : 'true');

    const config = {
      supabaseUrl,
      supabaseKey,
      adminEmail,
      adminPassword,
      printerName: printerName || '',
      paperWidth: paperWidthInput === '58' ? '58' : '80',
      pollIntervalMs: numberValue(existing.pollIntervalMs, 3000),
      autoPrint: autoPrintInput.trim().toLowerCase() !== 'false',
      maxOrdersPerPoll: numberValue(existing.maxOrdersPerPoll, 10),
    };

    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log('');
    console.log(`Config saved: ${configPath}`);
    console.log(`Next time, ${isPortablePackage() ? 'double-click start.cmd' : 'double-click print-agent/start-print-agent.cmd or run "pnpm print-agent"'}.`);
  } finally {
    rl.close();
  }
}

type UiConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  adminEmail: string;
  adminPassword: string;
  printerName: string;
  paperWidth: PaperWidth;
  pollIntervalMs: number;
  autoPrint: boolean;
  maxOrdersPerPoll: number;
};

function normalizeUiConfig(inputConfig: Record<string, unknown>): UiConfig {
  return {
    supabaseUrl: String(inputConfig.supabaseUrl || '').trim(),
    supabaseKey: String(inputConfig.supabaseKey || '').trim(),
    adminEmail: String(inputConfig.adminEmail || '').trim(),
    adminPassword: String(inputConfig.adminPassword || ''),
    printerName: String(inputConfig.printerName || '').trim(),
    paperWidth: String(inputConfig.paperWidth || '80') === '58' ? '58' : '80',
    pollIntervalMs: numberValue(inputConfig.pollIntervalMs, 3000),
    autoPrint: inputConfig.autoPrint !== false,
    maxOrdersPerPoll: numberValue(inputConfig.maxOrdersPerPoll, 10),
  };
}

function validateUiConfig(config: UiConfig) {
  const missing = [
    ['Supabase URL', config.supabaseUrl],
    ['Supabase publishable key', config.supabaseKey],
    ['Admin email', config.adminEmail],
    ['Admin password', config.adminPassword],
  ].filter(([, value]) => !String(value).trim());

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.map(([label]) => label).join(', ')}`);
  }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(html);
}

async function openBrowser(url: string) {
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${escapePowerShellSingleQuoted(url)}'`], {
    windowsHide: true,
    timeout: 15000,
  });
}

async function getPrinters() {
  const command = 'Get-Printer | Select-Object Name,Default,PrinterStatus | ConvertTo-Json -Compress';
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 15000,
  });
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as Record<string, unknown> | Record<string, unknown>[];
  return (Array.isArray(parsed) ? parsed : [parsed]).map((printer) => ({
    name: String(printer.Name || ''),
    default: Boolean(printer.Default),
    status: String(printer.PrinterStatus || ''),
  })).filter((printer) => printer.name);
}

function buildSetupHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>YANLC 打印助手设置</title>
  <style>
    :root { color-scheme: light; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f2ed; color: #161616; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { margin: 0; color: #655f58; line-height: 1.7; }
    .badge { padding: 8px 12px; border-radius: 999px; background: #fff; border: 1px solid #e4ded6; color: #9b1c24; font-weight: 700; white-space: nowrap; }
    form { display: grid; gap: 18px; }
    section { background: #fff; border: 1px solid #e4ded6; border-radius: 14px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.04); }
    h2 { margin: 0 0 16px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 7px; font-weight: 700; color: #28231f; font-size: 14px; }
    input, select { width: 100%; min-height: 44px; border: 1px solid #d8d0c7; border-radius: 10px; padding: 10px 12px; font-size: 16px; background: #fff; }
    input:focus, select:focus { outline: 2px solid rgba(185, 28, 35, .22); border-color: #b91c23; }
    .hint { color: #766f67; font-size: 13px; font-weight: 400; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    button { border: 0; border-radius: 10px; padding: 12px 16px; font-size: 15px; font-weight: 800; cursor: pointer; }
    .primary { background: #b91c23; color: white; }
    .secondary { background: #f1ece5; color: #2c2823; border: 1px solid #ded6ce; }
    .ghost { background: transparent; color: #b91c23; border: 1px solid #e4c1c4; }
    .status { min-height: 24px; margin-top: 10px; font-weight: 700; }
    .ok { color: #15803d; }
    .err { color: #b91c23; }
    .paths { display: grid; gap: 6px; font-size: 13px; color: #655f58; word-break: break-all; }
    .switch { display: flex; gap: 10px; align-items: center; min-height: 44px; }
    .switch input { width: 20px; min-height: 20px; }
    @media (max-width: 720px) {
      main { padding: 24px 14px 36px; }
      header { display: grid; }
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>YANLC 打印助手设置</h1>
        <p>填写一次配置后，前台电脑就可以监听新订单并自动打印厨房小票。</p>
      </div>
      <div class="badge">本机配置</div>
    </header>

    <form id="configForm">
      <section>
        <h2>Supabase 和后台账号</h2>
        <div class="grid">
          <label>Supabase URL
            <input name="supabaseUrl" placeholder="https://your-project.supabase.co" required />
          </label>
          <label>Supabase publishable key
            <input name="supabaseKey" placeholder="your-supabase-publishable-key" required />
          </label>
          <label>后台邮箱
            <input name="adminEmail" type="email" placeholder="admin@example.com" required />
          </label>
          <label>后台密码
            <input name="adminPassword" type="password" placeholder="后台登录密码" required />
          </label>
        </div>
      </section>

      <section>
        <h2>打印设置</h2>
        <div class="grid">
          <label>打印机
            <select name="printerName">
              <option value="">Windows 默认打印机</option>
            </select>
            <span class="hint">如果不确定，先选择 Windows 默认打印机。</span>
          </label>
          <label>小票纸宽
            <select name="paperWidth">
              <option value="80">80mm</option>
              <option value="58">58mm</option>
            </select>
          </label>
          <label>轮询间隔毫秒
            <input name="pollIntervalMs" type="number" min="1000" step="500" />
          </label>
          <label>每轮最多处理订单
            <input name="maxOrdersPerPoll" type="number" min="1" step="1" />
          </label>
        </div>
        <label class="switch">
          <input name="autoPrint" type="checkbox" />
          自动打印新订单
        </label>
      </section>

      <section>
        <h2>操作</h2>
        <div class="actions">
          <button class="primary" type="submit">保存配置</button>
          <button class="secondary" type="button" id="testPrint">测试打印</button>
          <button class="secondary" type="button" id="installStartup">设置开机自启</button>
          <button class="ghost" type="button" id="uninstallStartup">取消开机自启</button>
        </div>
        <div id="status" class="status"></div>
      </section>

      <section>
        <h2>文件位置</h2>
        <div class="paths">
          <div>配置文件：<span id="configPath">加载中...</span></div>
          <div>日志文件：<span id="logPath">加载中...</span></div>
        </div>
      </section>
    </form>
  </main>
  <script>
    const form = document.querySelector('#configForm');
    const statusEl = document.querySelector('#status');
    const printerSelect = form.elements.printerName;

    function setStatus(message, ok = true) {
      statusEl.textContent = message;
      statusEl.className = 'status ' + (ok ? 'ok' : 'err');
    }

    function readForm() {
      return {
        supabaseUrl: form.elements.supabaseUrl.value.trim(),
        supabaseKey: form.elements.supabaseKey.value.trim(),
        adminEmail: form.elements.adminEmail.value.trim(),
        adminPassword: form.elements.adminPassword.value,
        printerName: form.elements.printerName.value,
        paperWidth: form.elements.paperWidth.value,
        pollIntervalMs: Number(form.elements.pollIntervalMs.value || 3000),
        autoPrint: form.elements.autoPrint.checked,
        maxOrdersPerPoll: Number(form.elements.maxOrdersPerPoll.value || 10),
      };
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || '操作失败');
      return data;
    }

    async function loadPrinters(selected) {
      const data = await api('/api/printers');
      for (const printer of data.printers) {
        const option = document.createElement('option');
        option.value = printer.name;
        option.textContent = printer.name + (printer.default ? '（默认）' : '');
        printerSelect.appendChild(option);
      }
      printerSelect.value = selected || '';
    }

    async function loadConfig() {
      const data = await api('/api/config');
      const config = data.config;
      await loadPrinters(config.printerName);
      form.elements.supabaseUrl.value = config.supabaseUrl || '';
      form.elements.supabaseKey.value = config.supabaseKey || '';
      form.elements.adminEmail.value = config.adminEmail || '';
      form.elements.adminPassword.value = config.adminPassword || '';
      form.elements.paperWidth.value = config.paperWidth || '80';
      form.elements.pollIntervalMs.value = config.pollIntervalMs || 3000;
      form.elements.autoPrint.checked = config.autoPrint !== false;
      form.elements.maxOrdersPerPoll.value = config.maxOrdersPerPoll || 10;
      document.querySelector('#configPath').textContent = config.configPath;
      document.querySelector('#logPath').textContent = config.logPath;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/config', { method: 'POST', body: JSON.stringify(readForm()) });
        setStatus('配置已保存。');
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    document.querySelector('#testPrint').addEventListener('click', async () => {
      try {
        await api('/api/test-print', { method: 'POST', body: JSON.stringify(readForm()) });
        setStatus('测试小票已发送到打印机。');
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    document.querySelector('#installStartup').addEventListener('click', async () => {
      try {
        await api('/api/install-startup', { method: 'POST', body: '{}' });
        setStatus('开机自启已设置。');
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    document.querySelector('#uninstallStartup').addEventListener('click', async () => {
      try {
        await api('/api/uninstall-startup', { method: 'POST', body: '{}' });
        setStatus('开机自启已取消。');
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    loadConfig().catch((error) => setStatus(error.message, false));
  </script>
</body>
</html>`;
}

async function askRequired(rl: Interface, label: string, defaultValue = '') {
  while (true) {
    const answer = await askOptional(rl, label, defaultValue);
    if (answer.trim()) return answer.trim();
    console.log(`${label} cannot be empty.`);
  }
}

async function askOptional(rl: Interface, label: string, defaultValue = '') {
  const prompt = defaultValue ? `${label} [${defaultValue}]: ` : `${label}: `;
  const answer = await rl.question(prompt);
  return answer.trim() || defaultValue;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseEnv(input: string) {
  const result: Record<string, string> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function signIn(client: SupabaseClient, config: Config) {
  const { error } = await client.auth.signInWithPassword({
    email: config.adminEmail,
    password: config.adminPassword,
  });
  if (error) throw new Error(`Admin sign-in failed: ${error.message}`);
  await log(`Signed in as ${config.adminEmail}`);
}

async function fetchRestaurantSettings(client: SupabaseClient): Promise<RestaurantSettings> {
  const { data, error } = await client
    .from('restaurant_settings')
    .select('name_zh,name_en,name_el')
    .limit(1)
    .maybeSingle();
  if (error) {
    await logError('Could not read restaurant settings. Default name will be used', error);
    return {};
  }
  return data ?? {};
}

async function pollOnce(client: SupabaseClient, config: Config, settings: RestaurantSettings) {
  const orders = await fetchPendingUnprintedOrders(client, config.maxOrdersPerPoll);
  if (orders.length === 0) {
    await log('No pending unprinted orders.');
    return;
  }

  for (const order of orders) {
    const label = `#${order.order_number}`;
    if (!config.autoPrint) {
      await log(`AUTO_PRINT=false. Found pending order ${label}, but automatic printing is disabled.`);
      continue;
    }

    try {
      const ticket = buildKitchenTicket(order, settings, config.paperWidth);
      await printText(ticket, config.printerName);
      await markPrinted(client, order.id);
      await log(`Order ${label} printed.`);
    } catch (error) {
      await logError(`Order ${label} print failed. It will be retried next poll`, error);
    }
  }
}

async function fetchPendingUnprintedOrders(client: SupabaseClient, limit: number): Promise<Order[]> {
  const { data, error } = await client
    .from('orders')
    .select('*, restaurant_tables(table_number,label), order_items(*)')
    .eq('status', 'pending')
    .is('kitchen_printed_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not read pending orders: ${error.message}`);
  return (data ?? []) as Order[];
}

async function markPrinted(client: SupabaseClient, orderId: string) {
  const { error } = await client.rpc('mark_order_kitchen_printed', { p_order_id: orderId });
  if (error) throw new Error(`Ticket was sent, but marking it as printed failed: ${error.message}`);
}

function buildKitchenTicket(order: Order, settings: RestaurantSettings, paperWidth: PaperWidth) {
  const width = paperWidth === '58' ? 32 : 42;
  const restaurantName = settings.name_zh || settings.name_en || settings.name_el || 'Restaurant';
  const tableLabel = getTableLabel(order);
  const createdAt = new Date(order.created_at).toLocaleString('zh-CN');
  const lines: string[] = [];

  lines.push(center(restaurantName, width));
  lines.push(repeat('=', width));
  lines.push(center(`Kitchen ticket #${order.order_number}`, width));
  lines.push(repeat('-', width));
  lines.push(`Table: ${tableLabel}`);
  lines.push(`Time: ${createdAt}`);
  lines.push(repeat('-', width));

  for (const item of order.order_items ?? []) {
    const name = item.item_name_zh || item.item_name_en || item.item_name_el || 'Unnamed item';
    lines.push(`${item.quantity} x ${name}`);
    const options = formatOptions(item.selected_options);
    if (options) lines.push(indent(`Options: ${options}`, 2));
    if (item.note) lines.push(indent(`Note: ${item.note}`, 2));
    lines.push('');
  }

  lines.push(repeat('-', width));
  lines.push(right(`Total ${formatPrice(Number(order.total_price))}`, width));
  lines.push(repeat('=', width));
  lines.push(center('Kitchen order - not fiscal receipt', width));
  lines.push('');
  lines.push('');
  return lines.join('\r\n');
}

function buildSampleTicket(paperWidth: PaperWidth) {
  return buildKitchenTicket({
    id: 'sample',
    order_number: 1001,
    status: 'pending',
    order_type: 'dine_in',
    total_price: 23.8,
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 1 },
    order_items: [
      {
        id: 'sample-1',
        item_name_zh: 'Set A',
        item_name_en: 'Set A',
        item_name_el: null,
        quantity: 1,
        note: 'No onion',
        selected_options: [{ choice_name_en: 'Mild' }],
        unit_price: 18.9,
        line_total: 18.9,
      },
      {
        id: 'sample-2',
        item_name_zh: 'Hot and sour soup',
        item_name_en: 'Hot and sour soup',
        item_name_el: null,
        quantity: 1,
        note: null,
        selected_options: [],
        unit_price: 4.9,
        line_total: 4.9,
      },
    ],
  }, { name_en: 'Wok Dragon Express' }, paperWidth);
}

async function printText(content: string, printerName: string | null) {
  const file = resolve(tmpdir(), `wok-dragon-ticket-${Date.now()}.txt`);
  await writeFile(file, content, 'utf16le');
  const escapedFile = escapePowerShellSingleQuoted(file);
  const command = printerName
    ? `Get-Content -LiteralPath '${escapedFile}' -Raw | Out-Printer -Name '${escapePowerShellSingleQuoted(printerName)}'`
    : `Get-Content -LiteralPath '${escapedFile}' -Raw | Out-Printer`;

  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    timeout: 30000,
  });
}

async function listPrinters() {
  const command = 'Get-Printer | Select-Object Name,Default,PrinterStatus | Format-Table -AutoSize';
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 15000,
  });
  console.log(stdout.trim() || 'No printers found.');
}

async function installStartup() {
  const shortcutName = 'YANLC Print Agent.lnk';
  const startupCommand = [
    "$startup=[Environment]::GetFolderPath('Startup')",
    `$shortcut=Join-Path $startup '${escapePowerShellSingleQuoted(shortcutName)}'`,
    '$shell=New-Object -ComObject WScript.Shell',
    '$s=$shell.CreateShortcut($shortcut)',
    `$s.TargetPath='${escapePowerShellSingleQuoted(getStartupTargetPath())}'`,
    `$s.Arguments='${escapePowerShellSingleQuoted(getStartupArguments())}'`,
    `$s.WorkingDirectory='${escapePowerShellSingleQuoted(dirname(getStartupTargetPath()))}'`,
    '$s.WindowStyle=7',
    "$s.Description='YANLC Print Agent'",
    '$s.Save()',
    'Write-Output $shortcut',
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', startupCommand], {
    windowsHide: true,
    timeout: 15000,
  });
  console.log(`Startup shortcut installed: ${stdout.trim()}`);
}

async function uninstallStartup() {
  const shortcutName = 'YANLC Print Agent.lnk';
  const removeCommand = [
    "$startup=[Environment]::GetFolderPath('Startup')",
    `$shortcut=Join-Path $startup '${escapePowerShellSingleQuoted(shortcutName)}'`,
    'if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force; Write-Output $shortcut }',
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', removeCommand], {
    windowsHide: true,
    timeout: 15000,
  });
  console.log(stdout.trim() ? `Startup shortcut removed: ${stdout.trim()}` : 'Startup shortcut was not found.');
}

function getTableLabel(order: Order) {
  if (order.order_type === 'takeaway') return 'Takeaway';
  const tableNumber = order.restaurant_tables?.table_number;
  if (tableNumber) return `Table ${tableNumber}`;
  return 'Dine-in';
}

function formatOptions(options?: SelectedOption[] | null) {
  return (options ?? [])
    .map((option) => option.choice_name_zh || option.choice_name_en || option.choice_name_el)
    .filter(Boolean)
    .join(', ');
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function repeat(char: string, width: number) {
  return char.repeat(width);
}

function center(value: string, width: number) {
  const pad = Math.max(0, width - displayWidth(value));
  const left = Math.floor(pad / 2);
  return `${' '.repeat(left)}${value}`;
}

function right(value: string, width: number) {
  return `${' '.repeat(Math.max(0, width - displayWidth(value)))}${value}`;
}

function indent(value: string, spaces: number) {
  return `${' '.repeat(spaces)}${value}`;
}

function displayWidth(value: string) {
  return Array.from(value).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapePowerShellSingleQuoted(value: string) {
  return value.replace(/'/g, "''");
}

function getStartupTargetPath() {
  const installedExe = resolve(rootDir, 'YANLCPrintAgent.exe');
  if (isInstalledPackage() && existsSync(installedExe)) return installedExe;
  const portableStart = resolve(rootDir, 'start.cmd');
  if (existsSync(portableStart)) return portableStart;
  return resolve(rootDir, 'start-print-agent.cmd');
}

function getStartupArguments() {
  return '';
}

function isInstalledPackage() {
  return existsSync(installedModeMarkerPath);
}

function isPortablePackage() {
  return existsSync(resolve(rootDir, 'YANLCPrintAgent.exe')) || existsSync(resolve(rootDir, 'start.cmd'));
}

function getSetupHint() {
  if (isPortablePackage()) {
    return 'Double-click setup.cmd to open the settings page and create config.json.';
  }
  return 'Run "pnpm print-agent -- --setup-ui" to open the settings page, or run "pnpm print-agent -- --setup" for terminal setup.';
}

async function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${line}\n`, 'utf8');
}

async function logError(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  await log(`${message}: ${detail}`);
}

function printHelp() {
  if (isPortablePackage()) {
    console.log(`YANLC Print Agent portable package

Usage:
  start.cmd                       Start automatic printing
  setup.cmd                       Open local settings page
  test-print.cmd                  Print one sample ticket
  list-printers.cmd               Show Windows printers
  install-startup.cmd             Install Windows startup shortcut
  uninstall-startup.cmd           Remove Windows startup shortcut
  YANLCPrintAgent.exe --once       Poll once and exit
  YANLCPrintAgent.exe --setup-ui   Open local settings page
  YANLCPrintAgent.exe --setup      Terminal setup fallback

Configuration:
  Double-click setup.cmd to open the settings page and create config.json.
  config.json has priority over .env when both files exist.`);
    return;
  }

  console.log(`Wok Dragon local print agent

Usage:
  pnpm print-agent
  pnpm print-agent -- --once
  pnpm print-agent -- --test-print
  pnpm print-agent -- --list-printers
  pnpm print-agent -- --setup-ui
  pnpm print-agent -- --setup
  pnpm print-agent -- --install-startup
  pnpm print-agent -- --uninstall-startup

Configuration:
  Recommended: run "pnpm print-agent -- --setup-ui" to open the local settings page.
  Terminal fallback: run "pnpm print-agent -- --setup" to create print-agent/config.json.
  Advanced: copy print-agent/.env.example to print-agent/.env and fill it in.
  config.json has priority over .env when both files exist.`);
}

main().catch(async (error) => {
  await logError('Fatal error', error);
  process.exitCode = 1;
});
