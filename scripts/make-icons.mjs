// Renders app/icons/icon.svg to the PNG sizes phones need. Requires Playwright.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const [name, size, radius] of [['icon-192.png', 192, true], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, false]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // Full-bleed square for maskable/apple icons (the OS rounds corners itself).
  const art = radius ? svg : svg.replace('rx="112"', 'rx="0"');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${art}`);
  await page.screenshot({ path: join(dir, name), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
