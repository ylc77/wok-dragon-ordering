import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

const widths = [320, 375, 768, 1024];
const routes = ['/', '/menu', '/admin'];
const debugDir = path.resolve('artifacts', 'smoke-debug');
const providedBaseUrl = stripTrailingSlash(process.env.BASE_URL || '');
const baseUrl = providedBaseUrl || 'http://127.0.0.1:5181';
const adminEmail = process.env.ADMIN_EMAIL || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const results: CheckResult[] = [];
let viteServer: ViteDevServer | null = null;

await fs.mkdir(debugDir, { recursive: true });

try {
  if (!providedBaseUrl) {
    console.log(`Starting local Vite server at ${baseUrl}...`);
    viteServer = await createServer({
      server: { host: '127.0.0.1', port: 5181, strictPort: true },
      logLevel: 'error',
    });
    await viteServer.listen();
    await waitForServer(baseUrl);
    console.log('Local Vite server is ready.');
  }

  await runBrowserChecks();
  await runSourceTextCheck();
} finally {
  if (viteServer) await viteServer.close();
}

printSummary();

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of widths) {
      console.log(`Checking viewport ${width}px...`);
      const page = await browser.newPage({
        viewport: { width, height: width < 700 ? 760 : 900 },
        deviceScaleFactor: 1,
      });
      page.setDefaultTimeout(5_000);

      for (const route of routes) {
        await checkPageWidth(page, route, width);
      }

      await page.close();
    }

    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    adminPage.setDefaultTimeout(5_000);
    await checkAdminLoginAndTabs(adminPage);
    await adminPage.close();
  } finally {
    await browser.close();
  }
}

async function checkPageWidth(page: Page, route: string, width: number) {
  const name = `${route} @ ${width}px`;
  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForTimeout(700);
    const data = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 180),
      title: document.title,
    }));
    const overflow = data.scrollWidth > data.clientWidth + 2;
    const hasText = data.text.length > 0;
    record(name, !overflow && hasText, overflow
      ? `horizontal overflow: ${data.scrollWidth} > ${data.clientWidth}`
      : `loaded: ${data.title || data.text.slice(0, 40)}`);
    if (overflow || !hasText) await screenshot(page, `${routeName(route)}-${width}`);
  } catch (error) {
    record(name, false, formatError(error));
    await screenshot(page, `${routeName(route)}-${width}-error`);
  }
}

async function checkAdminLoginAndTabs(page: Page) {
  try {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForTimeout(700);
    const loginVisible = await page.getByText(/后台登录|邮箱|密码|登录/i).first().isVisible().catch(() => false);
    record('/admin login page', loginVisible, loginVisible ? 'login form visible' : 'login form not found');

    if (!adminEmail || !adminPassword) {
      record('/admin tabs', true, 'skipped: ADMIN_EMAIL / ADMIN_PASSWORD not configured');
      return;
    }

    await page.locator('input[type="email"], input[name="email"]').first().fill(adminEmail);
    await page.locator('input[type="password"], input[name="password"]').first().fill(adminPassword);
    await page.getByRole('button', { name: /登录|Sign in|Login/i }).first().click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForTimeout(1500);

    const loggedIn = await page.getByText(/后台管理|前台点单|订单管理|菜品管理|POS/i).first().isVisible().catch(() => false);
    const authDetails = loggedIn ? 'admin shell visible' : await getAdminAuthFailureDetails(page);
    record('/admin authenticated shell', loggedIn, authDetails);
    if (!loggedIn) {
      await screenshot(page, 'admin-login-failed');
      return;
    }

    const tabChecks = [
      { name: 'POS 入口', re: /前台点单|POS/i, expect: /当前点单|购物车为空|堂食|外带/i },
      { name: '订单管理', re: /订单管理|订单/i, expect: /订单|收款|状态|刷新/i },
      { name: '桌台二维码', re: /桌台|二维码/i, expect: /桌台|二维码|新增桌台|清桌/i },
      { name: '菜品管理', re: /菜品管理|菜品/i, expect: /菜品|新增|导入|分类/i },
      { name: '菜单分类', re: /菜单分类|分类/i, expect: /菜单分类|新增分类|分类总数/i },
      { name: '系统设置', re: /系统设置|系统/i, expect: /系统|导出|备份|实时/i },
    ];

    for (const tab of tabChecks) {
      await clickTab(page, tab.re);
      await page.waitForTimeout(600);
      const visible = await page.getByText(tab.expect).first().isVisible().catch(() => false);
      record(`/admin ${tab.name}`, visible, visible ? 'visible' : 'expected content not found');
      if (!visible) await screenshot(page, `admin-tab-${tab.name}`);
    }

    await checkAdminMobileDrawer(page);
  } catch (error) {
    record('/admin tabs', false, formatError(error));
    await screenshot(page, 'admin-tabs-error');
  }
}

async function checkAdminMobileDrawer(page: Page) {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
  await page.waitForTimeout(700);
  if (adminEmail && adminPassword) {
    const menuButton = page.locator('.admin-mobile-menu-btn').first();
    const exists = await menuButton.isVisible().catch(() => false);
    record('/admin mobile drawer button', exists, exists ? 'visible' : 'not visible');
    if (exists) {
      await menuButton.click();
      const drawerVisible = await page.locator('.admin-mobile-drawer.open').isVisible().catch(() => false);
      record('/admin mobile drawer opens', drawerVisible, drawerVisible ? 'opened' : 'not opened');
    }
  }
}

async function getAdminAuthFailureDetails(page: Page) {
  const visibleMessages = await page
    .locator('.error-text, .admin-message, [role="alert"]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()).filter(Boolean))
    .catch(() => []);
  if (visibleMessages.length > 0) {
    return `login failed: ${visibleMessages.join(' | ')}`;
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const compact = bodyText.replace(/\s+/g, ' ').trim();
  if (compact.includes('后台登录')) return 'login failed: still on login page, no error message shown';
  return 'login failed: admin shell not visible';
}

async function runSourceTextCheck() {
  const files = [
    'src/pages/AdminPage.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/MenuPage.tsx',
    'src/pages/TableOrderPage.tsx',
    'src/i18n.ts',
    'docs/deploy-client-zh.md',
    'README_CLIENT_DATABASE.md',
  ];
  const suspicious: string[] = [];
  const mojibakePattern = /�|鍚|鑿|妗|鐐|椁|绠|涓|彴|闂|煎|槸|笉|骞|瀹|绯|犲|惧|悗|殑|湪/;

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (mojibakePattern.test(line)) suspicious.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
    });
  }

  if (suspicious.length > 0) {
    const out = path.join(debugDir, 'suspected-mojibake.txt');
    await fs.writeFile(out, suspicious.join('\n'), 'utf8');
    record('后台中文/文档乱码静态检查', false, `${suspicious.length} suspected lines, see ${out}`);
  } else {
    record('后台中文/文档乱码静态检查', true, 'no common mojibake patterns found');
  }
}

async function clickTab(page: Page, re: RegExp) {
  const candidates = [
    page.getByRole('button', { name: re }).first(),
    page.getByText(re).first(),
  ];
  for (const locator of candidates) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
  throw new Error(`tab not found: ${re}`);
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = formatError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Vite server did not start: ${lastError}`);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(debugDir, `${Date.now()}-${name.replace(/[^\w.-]+/g, '-')}.png`),
    fullPage: true,
  }).catch(() => undefined);
}

function record(name: string, ok: boolean, details?: string) {
  results.push({ name, ok, details });
}

function printSummary() {
  const okCount = results.filter((result) => result.ok).length;
  console.log(`\nSmoke test summary: ${okCount}/${results.length} passed\n`);
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
  }
}

function routeName(route: string) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
