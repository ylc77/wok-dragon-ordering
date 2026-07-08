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

    const publicMobilePage = await browser.newPage({ viewport: { width: 320, height: 760 } });
    publicMobilePage.setDefaultTimeout(7_000);
    await checkPublicMobileNavigation(publicMobilePage);
    await publicMobilePage.close();

    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    adminPage.setDefaultTimeout(5_000);
    await checkAdminLoginAndTabs(adminPage);
    await adminPage.close();
  } finally {
    await browser.close();
  }
}

async function checkPublicMobileNavigation(page: Page) {
  try {
    await page.goto(`${baseUrl}/menu`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForSelector('.mobile-nav-toggle', { state: 'visible' });
    await page.locator('.mobile-nav-toggle').click();

    const drawer = page.locator('.nav-links.is-open');
    const backdrop = page.locator('.mobile-nav-backdrop');
    const drawerVisible = await drawer.isVisible().catch(() => false);
    const backdropVisible = await backdrop.isVisible().catch(() => false);
    const drawerBox = await drawer.boundingBox();
    const drawerFits = Boolean(drawerBox && drawerBox.x >= 0 && drawerBox.x + drawerBox.width <= 321);
    record(
      '/menu mobile top navigation',
      drawerVisible && backdropVisible && drawerFits,
      drawerVisible && backdropVisible && drawerFits ? 'drawer and backdrop visible' : 'drawer/backdrop layout invalid',
    );

    if (backdropVisible) await backdrop.click({ position: { x: 4, y: 4 } });
    const closed = await page.locator('.nav-links.is-open').count() === 0;
    record('/menu mobile top navigation closes', closed, closed ? 'closed from backdrop' : 'drawer remained open');

    await page.waitForSelector('.menu-mobile-root', { state: 'visible', timeout: 10_000 });
    const menuLayout = await page.evaluate(() => {
      const root = document.querySelector('.menu-mobile-root');
      const rect = root?.getBoundingClientRect();
      return {
        groups: document.querySelectorAll('.mobile-main .menu-group').length,
        rootBottom: rect?.bottom ?? 0,
        viewportHeight: window.innerHeight,
      };
    });
    const menuFits = menuLayout.groups > 0 && menuLayout.rootBottom <= menuLayout.viewportHeight + 1;
    record('/menu mobile viewport layout', menuFits, menuFits ? `${menuLayout.groups} groups fit viewport` : JSON.stringify(menuLayout));
  } catch (error) {
    record('/menu mobile navigation/layout', false, formatError(error));
    await screenshot(page, 'menu-mobile-navigation-error');
  }
}

async function checkPageWidth(page: Page, route: string, width: number) {
  const name = `${route} @ ${width}px`;
  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForFunction(() => document.body.innerText.replace(/\s+/g, ' ').trim().length > 0, null, { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
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

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const loginVisible = await emailInput.isVisible().catch(() => false)
      && await passwordInput.isVisible().catch(() => false);
    const configNoticeVisible = await page.locator('.admin-empty').first().isVisible().catch(() => false);

    record(
      '/admin login/config page',
      loginVisible || configNoticeVisible,
      loginVisible ? 'login form visible' : configNoticeVisible ? 'Supabase config notice visible' : 'login form or config notice not found',
    );

    if (!adminEmail || !adminPassword) {
      record('/admin tabs', true, 'skipped: ADMIN_EMAIL / ADMIN_PASSWORD not configured');
      return;
    }

    if (!loginVisible) {
      record('/admin authenticated shell', false, configNoticeVisible ? 'Supabase env not configured' : 'login form not visible');
      await screenshot(page, 'admin-login-unavailable');
      return;
    }

    await emailInput.fill(adminEmail);
    await passwordInput.fill(adminPassword);
    await page.locator('button[type="submit"], .admin-login button').first().click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForTimeout(1500);

    const loggedIn = await page.locator('.admin-sidebar, .admin-mobile-topbar').first().isVisible().catch(() => false);
    const authDetails = loggedIn ? 'admin shell visible' : await getAdminAuthFailureDetails(page);
    record('/admin authenticated shell', loggedIn, authDetails);
    if (!loggedIn) {
      await screenshot(page, 'admin-login-failed');
      return;
    }

    const tabChecks = [
      { name: 'POS entry', re: /\u524d\u53f0\u70b9\u5355|POS/i, expect: /\u5f53\u524d\u70b9\u5355|\u8d2d\u7269\u8f66\u4e3a\u7a7a|\u5802\u98df|\u5916\u5e26/i },
      { name: 'orders', re: /\u8ba2\u5355\u7ba1\u7406|\u8ba2\u5355/i, expect: /\u8ba2\u5355|\u6536\u6b3e|\u72b6\u6001|\u5237\u65b0/i },
      { name: 'tables', re: /\u684c\u53f0|\u4e8c\u7ef4\u7801/i, expect: /\u684c\u53f0|\u4e8c\u7ef4\u7801|\u65b0\u589e\u684c\u53f0|\u6e05\u684c/i },
      { name: 'items', re: /\u83dc\u54c1\u7ba1\u7406|\u83dc\u54c1/i, expect: /\u83dc\u54c1|\u65b0\u589e|\u5bfc\u5165|\u5206\u7c7b/i },
      { name: 'categories', re: /\u83dc\u5355\u5206\u7c7b|\u5206\u7c7b/i, expect: /\u83dc\u5355\u5206\u7c7b|\u65b0\u589e\u5206\u7c7b|\u5206\u7c7b\u603b\u6570/i },
      { name: 'system', re: /\u7cfb\u7edf\u8bbe\u7f6e|\u7cfb\u7edf/i, expect: /\u7cfb\u7edf|\u5bfc\u51fa|\u5907\u4efd|\u5b9e\u65f6/i },
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

  const stillOnLogin = await page.locator('.admin-login input[type="email"], .admin-login input[type="password"]').first().isVisible().catch(() => false);
  if (stillOnLogin) return 'login failed: still on login page, no error message shown';

  const configNoticeVisible = await page.locator('.admin-empty').first().isVisible().catch(() => false);
  if (configNoticeVisible) return 'admin unavailable: Supabase env not configured';

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
