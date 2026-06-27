import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';

type DemoEnv = {
  baseUrl: string;
  tableUrl: string;
  adminEmail: string;
  adminPassword: string;
  outputDir: string;
  debugDir: string;
  allowSubmitOrder: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const env = readEnv();
const viewport = { width: 1920, height: 1080 };

await fs.mkdir(env.outputDir, { recursive: true });
await fs.mkdir(env.debugDir, { recursive: true });

const sceneResults: string[] = [];

const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1920,1080'],
});
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: env.outputDir,
    size: viewport,
  },
});
const page = await context.newPage();
page.setDefaultTimeout(8000);

try {
  await runScene(page, '首页', homeSceneSafe);
  await runScene(page, '公开菜单', publicMenuScene);
  await runScene(page, '扫码点餐', tableOrderSceneSafe);
  await runScene(page, '后台和 POS', adminSceneSafe);
  await runScene(page, '结束画面', endSceneSafe);
} finally {
  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const tempPath = await video.path();
    const finalPath = path.join(env.outputDir, `wok-dragon-demo-${timestamp()}.webm`);
    await fs.rename(tempPath, finalPath);
    console.log(`录屏已保存：${finalPath}`);
  }
  console.log(`场景结果：\n${sceneResults.join('\n')}`);
}

function readEnv(): DemoEnv {
  const baseUrl = stripTrailingSlash(process.env.BASE_URL || '');
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const tableUrl = resolveDemoTableUrl(baseUrl);
  const outputDir = process.env.DEMO_OUTPUT_DIR || path.join(projectRoot, 'demo-videos');
  const debugDir = path.join(outputDir, 'debug');
  const allowSubmitOrder = process.env.DEMO_ALLOW_ORDER_SUBMIT === 'true';

  const missing: string[] = [];
  if (!baseUrl) missing.push('BASE_URL');
  if (!adminEmail) missing.push('ADMIN_EMAIL');
  if (!adminPassword) missing.push('ADMIN_PASSWORD');
  if (!tableUrl) missing.push('DEMO_TABLE_URL 或 DEMO_QR_TOKEN');

  if (missing.length > 0) {
    console.error(`缺少必要环境变量：${missing.join(', ')}`);
    console.error('示例：');
    console.error('$env:BASE_URL="http://127.0.0.1:5173"');
    console.error('$env:DEMO_QR_TOKEN="your-test-table-token"');
    console.error('$env:ADMIN_EMAIL="demo@example.com"');
    console.error('$env:ADMIN_PASSWORD="your-demo-password"');
    console.error('$env:DEMO_ALLOW_ORDER_SUBMIT="true"');
    process.exit(1);
  }

  return { baseUrl, tableUrl, adminEmail, adminPassword, outputDir, debugDir, allowSubmitOrder };
}

function resolveDemoTableUrl(baseUrl: string) {
  const fullTableUrl = process.env.DEMO_TABLE_URL?.trim();
  if (fullTableUrl) return fullTableUrl;

  const qrToken = process.env.DEMO_QR_TOKEN?.trim();
  if (!qrToken) return '';
  if (/^https?:\/\//i.test(qrToken)) return qrToken;
  return baseUrl ? `${baseUrl}/table/${encodeURIComponent(qrToken)}` : '';
}

async function runScene(page: Page, name: string, scene: (page: Page) => Promise<void>) {
  try {
    await scene(page);
    sceneResults.push(`✅ ${name}`);
  } catch (error) {
    await debugScreenshot(page, `scene-${name}`);
    sceneResults.push(`⚠️ ${name} 跳过：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function homeSceneSafe(page: Page) {
  await goto(page, env.baseUrl);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await wait(700);
  await caption(page, '餐馆官网与点餐系统', 3600);
  await highlightFirst(page, [
    page.getByTestId('home-view-menu'),
    page.locator('[data-testid="home-view-menu"]').first(),
    page.getByRole('link', { name: /查看菜单|菜单|View menu|Menu|Δείτε το μενού|Μενού/i }),
    page.getByRole('button', { name: /查看菜单|菜单|View menu|Menu|Δείτε το μενού|Μενού/i }),
  ], 'home-view-menu-highlight');
  await caption(page, '品牌形象一眼清楚', 3200);
  await slowScroll(page, 360);
  await caption(page, '营业信息和推荐菜', 3200);
  await slowScroll(page, 420);
  await wait(1200);
  await openHomeMenu(page);
}

async function homeScene(page: Page) {
  await goto(page, env.baseUrl);
  await caption(page, '餐馆官网、扫码点餐、后台管理和 POS 点单，一套系统完成。', 2200);
  await openHomeMenu(page);
  await caption(page, '首页展示品牌、营业信息和查看菜单入口，客户一打开就能看懂。', 2400);
  await page.mouse.wheel(0, 520);
  await wait(1600);
}

async function openHomeMenu(page: Page) {
  const clicked = await clickOptional(page, [
    page.getByTestId('home-view-menu'),
    page.locator('[data-testid="home-view-menu"]').first(),
    page.getByRole('link', { name: /查看菜单|菜单/i }),
    page.getByRole('button', { name: /查看菜单|菜单/i }),
    page.getByRole('link', { name: /View menu|Menu/i }),
    page.getByRole('button', { name: /View menu|Menu/i }),
    page.getByRole('link', { name: /Δείτε το μενού|Μενού/i }),
    page.getByRole('button', { name: /Δείτε το μενού|Μενού/i }),
    page.getByText(/查看菜单|View menu|Δείτε το μενού|菜单|Menu|Μενού/i).first(),
  ], 'home-view-menu');

  if (!clicked) {
    await page.goto(`${env.baseUrl}/menu`, { waitUntil: 'networkidle' });
    await wait(900);
  }
}

async function publicMenuScene(page: Page) {
  await goto(page, `${env.baseUrl}/menu`);
  await caption(page, '公开菜单可直接分享', 3200);
  await slowScroll(page, 640);
  await clickOptional(page, [
    page.getByRole('button', { name: /Ελληνικά|Greek|EL/i }),
    page.getByRole('link', { name: /Ελληνικά|Greek|EL/i }),
    page.getByText(/Ελληνικά|Greek|EL/i).first(),
  ], 'menu-language-switch');
  await caption(page, '支持英文和希腊语', 3200);
}

async function tableOrderSceneSafe(page: Page) {
  await goto(page, env.tableUrl);
  await caption(page, '顾客扫码进入桌台', 3200);
  const entered = await enterTableOrderIfNeeded(page);
  if (!entered) return;
  await waitForTableMenu(page);
  await showcaseTableOrderMenu(page);

  await slowScroll(page, 420);
  await caption(page, '查看菜单并选择菜品', 3000);

  const addedItem = await addFirstAvailableTableItemSafe(page);
  if (!addedItem) {
    await debugScreenshot(page, 'table-no-available-item');
    console.warn('扫码点餐加菜失败，跳过提交订单');
    await caption(page, '顾客可以查看菜单、选择菜品，并在底部购物车确认订单。', 2600);
    return;
  }

  await wait(1000);
  await handleOptionsDialog(page);
  await caption(page, '支持口味和特殊要求', 3000);

  const cartOpened = await openTableCart(page);
  await caption(page, '购物车按桌台会话隔离，同桌多人点餐也能保持一致。', 2200);
  if (!cartOpened) {
    await debugScreenshot(page, 'table-open-cart');
    await caption(page, '底部购物车确认订单', 3000);
    return;
  }

  if (!env.allowSubmitOrder) {
    await caption(page, '确认后即可提交订单', 3000);
    return;
  }

  const submitted = await submitTableOrderIfPossible(page);

  if (submitted) {
    await caption(page, '后台实时收到订单', 3200);
  } else {
    await caption(page, '确认后即可提交订单', 3000);
  }
}

async function waitForTableMenu(page: Page) {
  await Promise.race([
    page.locator('[data-testid*="menu"], [data-testid*="cart"], .menu-group, .order-menu, .order-list, .order-category-tabs, .cart-bar, .cart-drawer, article, button').first().waitFor({ state: 'visible', timeout: 12000 }),
    page.waitForLoadState('networkidle'),
  ]).catch(() => undefined);
  await wait(1200);
}

async function showcaseTableOrderMenu(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => undefined);
  await wait(700);
  await caption(page, '顾客扫码进入桌台，直接看到菜单分类、菜品和加菜入口。', 2400);
  await slowScroll(page, 360);
  await caption(page, '查看菜单并选择菜品，支持口味和特殊要求。', 2400);
  await slowScroll(page, 300);
}

async function enterTableOrderIfNeeded(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await wait(800);

  if (await isWaitingForStaffApproval(page)) {
    await debugScreenshot(page, 'table-waiting-for-approval');
    await caption(page, '当前桌台需要服务员批准加入，本段跳过点餐提交，继续展示后台和 POS。', 2600);
    return false;
  }

  const alreadyInMenu = await hasTableMenuContent(page);
  if (alreadyInMenu) return true;

  const clicked = await clickOptional(page, [
    page.getByTestId('table-enter-session'),
    page.locator('[data-testid="table-enter-session"], [data-testid*="start-order"], [data-testid*="join-table"]').first(),
    page.getByRole('button', { name: /开始点餐|加入当前桌|加入当前桌台|申请加入|Start order|Start ordering|Join table|Join current table|Έναρξη παραγγελίας|Παραγγελία|Συμμετοχή/i }).first(),
    page.getByRole('link', { name: /开始点餐|加入当前桌|加入当前桌台|申请加入|Start order|Start ordering|Join table|Join current table|Έναρξη παραγγελίας|Παραγγελία|Συμμετοχή/i }).first(),
    page.locator('button').filter({ hasText: /开始点餐|加入当前桌|加入当前桌台|申请加入|Start order|Start ordering|Join table|Join current table|Έναρξη παραγγελίας|Παραγγελία|Συμμετοχή/i }).first(),
  ], 'table-enter-session');

  if (clicked) {
    await Promise.race([
      waitForTableMenu(page),
      page.waitForLoadState('networkidle'),
    ]).catch(() => undefined);
  }

  if (await isWaitingForStaffApproval(page)) {
    await debugScreenshot(page, 'table-waiting-for-approval');
    await caption(page, '当前桌台需要服务员批准加入，本段跳过点餐提交，继续展示后台和 POS。', 2600);
    return false;
  }

  if (await hasTableMenuContent(page)) return true;

  await debugScreenshot(page, 'table-entry-not-menu');
  await caption(page, '桌码入口未进入菜单，已跳过点餐提交，继续展示后台和 POS。', 2600);
  return false;
}

async function hasTableMenuContent(page: Page) {
  return page.evaluate(() => {
    return Boolean(document.querySelector(
      '[data-testid*="menu"], [data-testid*="cart"], .menu-group, .order-menu-groups, .order-list, .order-category-tabs, .cart-bar, .cart-drawer',
    ));
  }).catch(() => false);
}

async function isWaitingForStaffApproval(page: Page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /等待|批准|审核|服务员|approval|approve|waiting|staff|pending|αναμονή|έγκριση|προσωπικό/i.test(text);
  }).catch(() => false);
}

async function addFirstAvailableTableItemSafe(page: Page) {
  await closeCartNoteBackdrop(page);
  const addLocators = [
    page.locator('.dish-add-button:visible:not([disabled])').first(),
    page.getByTestId('table-add-first-item'),
    page.locator('[data-testid="table-add-first-item"]').first(),
    page.locator('[data-testid*="add"][data-testid*="item"]').first(),
    page.locator('button[aria-label*="Add" i], button[aria-label*="加入"], button[aria-label*="Προσθήκη" i]').first(),
    page.getByRole('button', { name: /\+|加入|添加|Add|Add to cart|Προσθήκη/i }).first(),
    page.locator('button').filter({ hasText: /\+|加入|添加|Add|Add to cart|Προσθήκη/i }).first(),
    page.locator('.qty-button:not([disabled]), .quantity-button:not([disabled]), .add-button:not([disabled]), .order-add:not([disabled])').first(),
  ];

  for (const locator of addLocators) {
    if (await safeClickAddButton(page, locator, 'table-add-first-item')) return true;
  }

  const clickedByDom = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const visibleEnabled = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const label = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`.trim();
      const className = button.className?.toString() ?? '';
      return !button.disabled
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && (
          /(\+|加入|添加|Add|Add to cart|Προσθήκη)/i.test(label)
          || /(dish-add-button|add|qty|quantity|plus)/i.test(className)
        );
    });
    const target = visibleEnabled[0];
    if (!target) return false;
    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.setAttribute('data-demo-add-target', 'true');
    return true;
  }).catch(() => false);

  if (clickedByDom) {
    const target = page.locator('[data-demo-add-target="true"]').first();
    const clicked = await safeClickAddButton(page, target, 'table-add-first-item-dom');
    await page.evaluate(() => document.querySelector('[data-demo-add-target="true"]')?.removeAttribute('data-demo-add-target')).catch(() => undefined);
    return clicked;
  }

  return false;
}

async function closeCartNoteBackdrop(page: Page) {
  const backdropSelector = '.cart-note-backdrop, .modal-backdrop, .drawer-backdrop, .dialog-backdrop, [data-backdrop], [class*="backdrop"], [class*="overlay"]';
  const hasBackdrop = await page.locator(backdropSelector).first().isVisible({ timeout: 500 }).catch(() => false);
  if (!hasBackdrop) return;

  await page.keyboard.press('Escape').catch(() => undefined);
  await wait(700);

  const stillVisible = await page.locator(backdropSelector).first().isVisible({ timeout: 500 }).catch(() => false);
  if (!stillVisible) return;

  await clickOptional(page, [
    page.getByRole('button', { name: /Close|关闭|取消|Άκυρο|×|X/i }).first(),
    page.locator(`${backdropSelector} button`).filter({ hasText: /Close|关闭|取消|Άκυρο|×|X/i }).first(),
    page.locator(`${backdropSelector} button`).last(),
  ], 'close-cart-note-backdrop');

  const afterButton = await page.locator(backdropSelector).first().isVisible({ timeout: 500 }).catch(() => false);
  if (!afterButton) return;

  await page.mouse.click(12, 12).catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.locator(backdropSelector).first().waitFor({ state: 'hidden', timeout: 2500 }).catch(() => undefined);
}

async function safeClickAddButton(page: Page, locator: Locator, label: string) {
  try {
    if (!(await locator.isVisible({ timeout: 1500 }))) return false;
    if (!(await locator.isEnabled({ timeout: 1500 }))) return false;
    await closeCartNoteBackdrop(page);
    await locator.scrollIntoViewIfNeeded();
    await wait(850);
    await locator.click({ timeout: 3200 });
    await wait(1900);
    return true;
  } catch {
    await closeCartNoteBackdrop(page);
    try {
      await locator.scrollIntoViewIfNeeded();
      await wait(850);
      await locator.click({ timeout: 2400, force: true });
      await wait(1900);
      return true;
    } catch {
      await debugScreenshot(page, `${label}-click-failed`);
      return false;
    }
  }
}

async function addFirstAvailableTableItem(page: Page) {
  const direct = await clickOptional(page, [
    page.getByTestId('table-add-first-item'),
    page.locator('[data-testid="table-add-first-item"]').first(),
    page.locator('[data-testid*="add"][data-testid*="item"]').first(),
    page.getByRole('button', { name: /\+|加入|添加|Add|Add to cart|Προσθήκη/i }).first(),
    page.locator('button').filter({ hasText: /\+|加入|添加|Add|Add to cart|Προσθήκη/i }).first(),
  ], 'table-add-first-item');
  if (direct) return true;

  const clickedByDom = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const visibleEnabled = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const label = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`.trim();
      return !button.disabled
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && /(\+|加入|添加|Add|Add to cart|Προσθήκη)/i.test(label);
    });
    const target = visibleEnabled[0];
    if (!target) return false;
    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.click();
    return true;
  }).catch(() => false);

  if (clickedByDom) {
    await wait(1100);
    return true;
  }

  return false;
}

async function handleOptionsDialog(page: Page) {
  await closeCartNoteBackdrop(page);
  await clickOptional(page, [
    page.locator('[role="dialog"] input:not(:disabled)').first(),
    page.locator('[role="dialog"] button:not(:disabled)').filter({ hasText: /辣|温度|特殊|option|spicy|hot|cold|mild|yes|no|Προσθήκη/i }).first(),
    page.locator('.modal input:not(:disabled), .dialog input:not(:disabled), .cart-note-backdrop input:not(:disabled)').first(),
  ], 'table-select-option');

  await clickOptional(page, [
    page.getByRole('button', { name: /加入购物车|加入|确定|完成|Add to cart|Add|Confirm|Done|Προσθήκη/i }).first(),
    page.locator('[role="dialog"] button:not(:disabled)').filter({ hasText: /加入|确定|Add|Confirm|Done|Προσθήκη/i }).first(),
  ], 'table-add-cart-confirm');
  await closeCartNoteBackdrop(page);
}

async function openTableCart(page: Page) {
  await closeCartNoteBackdrop(page);
  const opened = await clickOptional(page, [
    page.getByTestId('table-open-cart'),
    page.locator('[data-testid*="cart"]').first(),
    page.getByRole('button', { name: /购物车|Cart|Καλάθι|结算|Checkout|总价|Total/i }).first(),
    page.locator('button').filter({ hasText: /购物车|Cart|Καλάθι|结算|Checkout|总价|Total/i }).first(),
    page.locator('.cart-bar button, .cart-bar, .bottom-cart, .floating-cart, .cart-summary, .order-cart-bar').first(),
    page.getByText(/购物车|Cart|Καλάθι|结算|Checkout|总价|Total/i).first(),
  ], 'table-open-cart');
  if (opened) return true;

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })).catch(() => undefined);
  await wait(900);
  return clickOptional(page, [
    page.getByRole('button', { name: /购物车|Cart|Καλάθι|结算|Checkout|总价|Total/i }).first(),
    page.locator('.cart-bar button, .cart-bar, .bottom-cart, .floating-cart, .cart-summary, .order-cart-bar').first(),
    page.getByText(/购物车|Cart|Καλάθι|结算|Checkout|总价|Total/i).first(),
  ], 'table-open-cart-bottom');
}

async function submitTableOrderIfPossible(page: Page) {
  const hasItems = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /购物车|Cart|Καλάθι|€|\d+\s*(件|items?)/i.test(text);
  }).catch(() => false);
  if (!hasItems) {
    await debugScreenshot(page, 'table-submit-no-cart-items');
    return false;
  }

  const submitted = await clickOptional(page, [
    page.getByRole('button', { name: /提交订单|确认点餐|Submit order|Confirm order|Παραγγελία|Επιβεβαίωση/i }).first(),
    page.locator('button').filter({ hasText: /提交订单|确认点餐|Submit order|Confirm order|Παραγγελία|Επιβεβαίωση/i }).first(),
  ], 'table-submit-order');
  if (!submitted) await debugScreenshot(page, 'table-submit-order-not-found');
  return submitted;
}

async function tableOrderScene(page: Page) {
  await goto(page, env.tableUrl);
  await caption(page, '顾客扫桌码进入点餐页，系统识别当前桌台和用餐会话。', 2500);
  await clickOptional(page, [
    page.getByRole('button', { name: /开始点餐|加入当前桌台|加入此桌|Join current table|Join this table|Start ordering/i }),
    page.getByRole('link', { name: /开始点餐|加入当前桌台|Join current table|Start ordering/i }),
  ], 'table-enter-session');
  await wait(1200);

  await slowScroll(page, 420);
  await caption(page, '顾客按分类浏览菜品，选择后可以加入购物车。', 2200);

  await clickRequired(page, [
    page.getByRole('button', { name: /加|Add|\+/i }).first(),
    page.locator('button').filter({ hasText: /加|Add|\+/i }).first(),
  ], 'table-add-first-item');

  await wait(1000);
  await clickOptional(page, [
    page.getByRole('button', { name: /辣|温度|特殊|选项|option|spicy|hot|cold/i }).first(),
    page.locator('label').filter({ hasText: /辣|温度|特殊|option|spicy|hot|cold/i }).first(),
  ], 'table-select-option');
  await caption(page, '如果菜品有口味选项，可以选择辣度、温度或特殊要求。', 2200);

  await clickOptional(page, [
    page.getByRole('button', { name: /加入购物车|加入|Add to cart|Add/i }).first(),
    page.getByRole('button', { name: /确定|Confirm/i }).first(),
  ], 'table-add-cart-confirm');

  await clickOptional(page, [
    page.getByRole('button', { name: /购物车|Cart|结算|Checkout/i }).first(),
    page.getByText(/购物车|Cart|结算|Checkout/i).first(),
  ], 'table-open-cart');
  await caption(page, '购物车按桌台会话隔离，同桌多人点餐也能保持一致。', 2200);

  await clickRequired(page, [
    page.getByRole('button', { name: /提交订单|提交|Send order|Submit order|Place order/i }).first(),
    page.locator('button').filter({ hasText: /提交订单|提交|Send order|Submit/i }).first(),
  ], 'table-submit-order');
  await caption(page, '顾客提交订单后，后台可以实时看到新订单。', 2400);
}

async function adminSceneSafe(page: Page) {
  await goto(page, `${env.baseUrl}/admin`);
  await caption(page, '员工后台集中管理', 3200);
  await loginAdmin(page);

  await clickOptional(page, [
    page.getByRole('button', { name: /订单管理|订单/i }),
    page.getByText(/订单管理/i).first(),
  ], 'admin-orders-tab');
  await caption(page, '订单状态一目了然', 3200);
  await slowScroll(page, 420);
  await caption(page, '收款和清桌更清楚', 3200);

  await clickOptional(page, [
    page.getByRole('button', { name: /桌台|二维码/i }),
    page.getByText(/桌台管理|桌台/i).first(),
  ], 'admin-tables-tab');
  await caption(page, '桌台二维码可管理', 3200);

  await clickOptional(page, [
    page.getByRole('button', { name: /菜品|菜单/i }),
    page.getByText(/菜品管理|菜单管理|菜品/i).first(),
  ], 'admin-items-tab');
  await caption(page, '菜单内容灵活维护', 3200);
  await clickOptional(page, [
    page.getByRole('button', { name: /编辑|展开|修改/i }).first(),
    page.locator('button').filter({ hasText: /编辑|修改/i }).first(),
  ], 'admin-edit-menu-item');
  await wait(1800);
  await slowScroll(page, 520);
  await caption(page, '多语言和口味选项', 3200);

  await clickOptional(page, [
    page.getByRole('button', { name: /前台点单/i }),
    page.getByText(/前台点单/i).first(),
  ], 'admin-pos-tab');
  await caption(page, 'POS 支持人工点单', 3200);
}

async function endSceneSafe(page: Page) {
  await caption(page, '扫码点餐 · 后台管理', 3200);
  await caption(page, 'POS 点单 · 多语言菜单', 3200);
}

async function adminScene(page: Page) {
  await goto(page, `${env.baseUrl}/admin`);
  await caption(page, '后台由员工账号登录，订单、菜单、桌台和 POS 集中管理。', 2200);
  await loginAdmin(page);

  await clickOptional(page, [
    page.getByRole('button', { name: /订单管理|订单/i }),
    page.getByText(/订单管理/i).first(),
  ], 'admin-orders-tab');
  await caption(page, '订单列表集中展示桌号、状态、明细和收款情况。', 2400);
  await page.mouse.wheel(0, 420);
  await wait(1200);
  await caption(page, '确认收款和清桌入口清楚可见，演示时不需要点击危险操作。', 2400);

  await clickOptional(page, [
    page.getByRole('button', { name: /桌台|二维码/i }),
    page.getByText(/桌台管理|桌台/i).first(),
  ], 'admin-tables-tab');
  await caption(page, '桌台二维码可以下载、打印和重生成，旧二维码会失效。', 2400);

  await clickOptional(page, [
    page.getByRole('button', { name: /菜品|菜单/i }),
    page.getByText(/菜品管理|菜单管理|菜品/i).first(),
  ], 'admin-items-tab');
  await caption(page, '菜单管理支持图片上传、多语言内容、售罄、下架和口味选项。', 2600);
  await clickOptional(page, [
    page.getByRole('button', { name: /编辑|展开|修改/i }).first(),
    page.locator('button').filter({ hasText: /编辑|修改/i }).first(),
  ], 'admin-edit-menu-item');
  await wait(1400);
  await slowScroll(page, 520);
  await caption(page, '菜品编辑区可以维护中文、英文、希腊语和 options 口味配置。', 2600);

  await clickOptional(page, [
    page.getByRole('button', { name: /前台点单/i }),
    page.getByText(/前台点单/i).first(),
  ], 'admin-pos-tab');
  await caption(page, 'POS 前台点单适合员工人工下单，可选择付款方式并打印小票。', 2800);
}

async function endScene(page: Page) {
  await caption(page, '扫码点餐 · 后台管理 · POS 点单 · 多语言菜单', 3600);
}

async function loginAdmin(page: Page) {
  const email = page.locator('input[type="email"], input[name="email"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.fill(env.adminEmail);
  await password.fill(env.adminPassword);
  await clickRequired(page, [
    page.getByRole('button', { name: /登录|Login|Sign in/i }),
    page.locator('button[type="submit"]').first(),
  ], 'admin-login-submit');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await wait(2200);
}

async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await wait(900);
}

async function caption(page: Page, text: string, duration = 3000) {
  await page.evaluate((value) => {
    let el = document.querySelector<HTMLElement>('[data-demo-caption]');
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-demo-caption', 'true');
      Object.assign(el.style, {
        position: 'fixed',
        left: '50%',
        bottom: '72px',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        width: '72vw',
        maxWidth: '1120px',
        padding: '13px 22px',
        borderRadius: '14px',
        background: 'rgba(17, 24, 39, .78)',
        color: '#fff',
        fontFamily: 'Microsoft YaHei, PingFang SC, system-ui, sans-serif',
        fontSize: '30px',
        fontWeight: '700',
        lineHeight: '1.35',
        textAlign: 'center',
        boxShadow: '0 14px 38px rgba(0,0,0,.22)',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }
    el.textContent = value;
  }, text);
  await wait(duration);
}

async function highlightFirst(page: Page, locators: Locator[], label: string) {
  const locator = await firstVisible(locators);
  if (!locator) {
    await debugScreenshot(page, label);
    return false;
  }
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => {
    const node = el as HTMLElement;
    node.style.outline = '4px solid rgba(220, 38, 38, .75)';
    node.style.outlineOffset = '4px';
  });
  await wait(1300);
  return true;
}

async function clickRequired(page: Page, locators: Locator[], label: string) {
  const locator = await firstVisible(locators);
  if (!locator) {
    await debugScreenshot(page, label);
    throw new Error(`找不到必要元素：${label}。已保存 debug 截图。`);
  }
  await locator.scrollIntoViewIfNeeded();
  await wait(700);
  await locator.click();
  await wait(1800);
}

async function clickOptional(page: Page, locators: Locator[], label: string) {
  const locator = await firstVisible(locators);
  if (!locator) {
    await debugScreenshot(page, label);
    return false;
  }
  await locator.scrollIntoViewIfNeeded();
  await wait(700);
  await locator.click();
  await wait(1800);
  return true;
}

async function firstVisible(locators: Locator[]) {
  for (const locator of locators) {
    try {
      if (await locator.isVisible({ timeout: 900 })) return locator;
    } catch {
      // Try next selector.
    }
  }
  return null;
}

async function debugScreenshot(page: Page, label: string) {
  const file = path.join(env.debugDir, `${timestamp()}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  console.warn(`未找到元素：${label}，已保存截图：${file}`);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function slowScroll(page: Page, distance: number) {
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await wait(420);
  }
  await wait(1400);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
