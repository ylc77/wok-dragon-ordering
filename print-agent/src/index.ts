import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, '..');
const envPath = resolve(rootDir, '.env');
const logPath = resolve(rootDir, 'logs', 'print-agent.log');

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

  const config = await loadConfig();

  if (args.has('--test-print')) {
    const sample = buildSampleTicket(config.paperWidth);
    await printText(sample, config.printerName);
    await log('Test ticket printed.');
    return;
  }

  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await signIn(client, config);
  const settings = await fetchRestaurantSettings(client);
  await log(`Print agent started. autoPrint=${config.autoPrint}, printer=${config.printerName || 'Windows default'}, paper=${config.paperWidth}mm`);

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
  const fileEnv = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const env = { ...fileEnv, ...process.env };

  const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const;
  const missing = required.filter((key) => !String(env[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`Missing config: ${missing.join(', ')}. Copy print-agent/.env.example to print-agent/.env and fill it.`);
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
  if (error) throw new Error(`Admin login failed: ${error.message}`);
  await log(`Signed in as ${config.adminEmail}`);
}

async function fetchRestaurantSettings(client: SupabaseClient): Promise<RestaurantSettings> {
  const { data, error } = await client
    .from('restaurant_settings')
    .select('name_zh,name_en,name_el')
    .limit(1)
    .maybeSingle();
  if (error) {
    await logError('Failed to load restaurant settings; continuing with default name', error);
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
      await log(`AUTO_PRINT=false; pending order ${label} found but not printed.`);
      continue;
    }

    try {
      const ticket = buildKitchenTicket(order, settings, config.paperWidth);
      await printText(ticket, config.printerName);
      await markPrinted(client, order.id);
      await log(`Printed order ${label}.`);
    } catch (error) {
      await logError(`Failed to print order ${label}; it will be retried`, error);
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
  if (error) throw new Error(`Failed to fetch pending orders: ${error.message}`);
  return (data ?? []) as Order[];
}

async function markPrinted(client: SupabaseClient, orderId: string) {
  const { error } = await client.rpc('mark_order_kitchen_printed', { p_order_id: orderId });
  if (error) throw new Error(`Printed, but failed to mark order as printed: ${error.message}`);
}

function buildKitchenTicket(order: Order, settings: RestaurantSettings, paperWidth: PaperWidth) {
  const width = paperWidth === '58' ? 32 : 42;
  const restaurantName = settings.name_zh || settings.name_en || settings.name_el || 'Restaurant';
  const tableLabel = getTableLabel(order);
  const createdAt = new Date(order.created_at).toLocaleString('zh-CN');
  const lines: string[] = [];

  lines.push(center(restaurantName, width));
  lines.push(repeat('=', width));
  lines.push(center(`厨房小票 #${order.order_number}`, width));
  lines.push(repeat('-', width));
  lines.push(`桌台: ${tableLabel}`);
  lines.push(`下单: ${createdAt}`);
  lines.push(repeat('-', width));

  for (const item of order.order_items ?? []) {
    const name = item.item_name_zh || item.item_name_en || item.item_name_el || '未命名菜品';
    lines.push(`${item.quantity} x ${name}`);
    const options = formatOptions(item.selected_options);
    if (options) lines.push(indent(`选项: ${options}`, 2));
    if (item.note) lines.push(indent(`备注: ${item.note}`, 2));
    lines.push('');
  }

  lines.push(repeat('-', width));
  lines.push(right(`合计 ${formatPrice(Number(order.total_price))}`, width));
  lines.push(repeat('=', width));
  lines.push(center('厨房点菜单 非正式税务收据', width));
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
        item_name_zh: '套餐 A',
        item_name_en: 'Set A',
        item_name_el: null,
        quantity: 1,
        note: '不要葱',
        selected_options: [{ choice_name_zh: '微辣' }],
        unit_price: 18.9,
        line_total: 18.9,
      },
      {
        id: 'sample-2',
        item_name_zh: '酸辣汤',
        item_name_en: 'Hot and sour soup',
        item_name_el: null,
        quantity: 1,
        note: null,
        selected_options: [],
        unit_price: 4.9,
        line_total: 4.9,
      },
    ],
  }, { name_zh: 'Wok Dragon Express' }, paperWidth);
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
  const command = "Get-Printer | Select-Object Name,Default,PrinterStatus | Format-Table -AutoSize";
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 15000,
  });
  console.log(stdout.trim() || 'No printers found.');
}

function getTableLabel(order: Order) {
  if (order.order_type === 'takeaway') return '外带';
  const tableNumber = order.restaurant_tables?.table_number;
  if (tableNumber) return `${tableNumber}号桌`;
  return '堂食';
}

function formatOptions(options?: SelectedOption[] | null) {
  return (options ?? [])
    .map((option) => option.choice_name_zh || option.choice_name_en || option.choice_name_el)
    .filter(Boolean)
    .join('、');
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
  console.log(`Wok Dragon local print agent

Usage:
  pnpm print-agent
  pnpm print-agent -- --once
  pnpm print-agent -- --test-print
  pnpm print-agent -- --list-printers

Config:
  Copy print-agent/.env.example to print-agent/.env and fill it.
`);
}

main().catch(async (error) => {
  await logError('Fatal error', error);
  process.exitCode = 1;
});
