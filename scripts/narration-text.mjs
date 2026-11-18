// Extracts the main-reading text of every lesson exactly as the app shows it, one entry per
// paragraph, so recorded narration lines up with on-screen highlighting.
// Usage: node scripts/build.mjs && node scripts/narration-text.mjs [outDir]   (needs Playwright)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'build', 'narration');
mkdirSync(out, { recursive: true });
const index = JSON.parse(readFileSync(join(root, 'app/content/index.json'), 'utf8'));
const ids = [...index.units.flatMap(u => u.days), ...index.tracks.flatMap(t => t.lessons)].filter(l => l.available).map(l => l.id);

await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => localStorage.setItem('phil90:v1', JSON.stringify({ settings: { narrator: 'device' } })));
for (const id of ids) {
  await page.goto(`${base}#/lesson/${id}/learn`);
  await page.waitForSelector('.prose h3');
  const segs = await page.evaluate(() => window.__narration());
  writeFileSync(join(out, `${id}.json`), JSON.stringify(segs, null, 1));
}
await browser.close();
server.close();
console.log(`Wrote narration text for ${ids.length} lessons to ${out}`);
