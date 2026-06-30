import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const posterHtml = resolve(root, 'marketing', 'athens-local-business-poster.html');
const outputDir = resolve(root, 'marketing', 'output');
const outputPng = resolve(outputDir, 'athens-local-business-poster.png');

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--window-size=1080,1920'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });

  await page.goto(pathToFileURL(posterHtml).toString(), { waitUntil: 'networkidle' });
  await page.locator('.poster').screenshot({ path: outputPng });
  console.log(`Poster exported: ${outputPng}`);
} finally {
  await browser.close();
}
