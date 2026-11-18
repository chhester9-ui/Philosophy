// End-to-end smoke test: serves the built app and walks through a lesson in a phone-sized browser.
// Usage: node scripts/build.mjs && node scripts/smoke-test.mjs [screenshotDir]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from './serve.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
const index = JSON.parse(readFileSync(join(root, 'app/content/index.json'), 'utf8'));
const first = index.units.flatMap(u => u.days).find(d => d.available);
if (!first) { console.log('No lessons built yet'); process.exit(1); }
const lesson = JSON.parse(readFileSync(join(root, 'app/content/lessons', `${first.id}.json`), 'utf8'));

await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
// Headless Chromium has no voices, so stand in a fake speech engine that records what is spoken.
await ctx.addInitScript(() => {
  window.__spoken = [];
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  let timer = null, current = null;
  Object.defineProperty(window, 'speechSynthesis', { value: {
    speak(u) { current = u; window.__spoken.push(u.text); timer = setTimeout(() => { current = null; u.onend && u.onend(); }, 15); },
    cancel() { clearTimeout(timer); if (current) { const u = current; current = null; u.onerror && u.onerror({ error: 'interrupted' }); } },
    getVoices: () => [{ name: 'Test Voice', lang: 'en-US', voiceURI: 'test', localService: true }],
    addEventListener() {}, onvoiceschanged: null,
  } });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const check = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`✓ ${msg}`); };
const snap = async name => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false }); };

try {
  await page.goto(base);
  await page.waitForSelector('.hero');
  check((await page.textContent('.hero h2')).includes(first.title), `Today shows ${first.id}`);
  await page.waitForSelector('#plan .num');
  await snap('01-today');

  await page.click('.hero .btn');
  await page.waitForSelector('.lesson-head h2');
  check((await page.locator('.prose h3').count()) === lesson.sections.length, 'lesson sections render');
  await snap('02-lesson');

  // Read aloud: play, pause, then let it run to the end of the Modern Lens step.
  await page.click('#listen');
  await page.waitForSelector('.player .play-btn');
  await page.waitForSelector('.reading');
  check((await page.evaluate(() => window.__spoken[0])).includes(lesson.title), 'read-aloud starts with the lesson title');
  await snap('02b-listening');
  await page.click('.player [data-a="toggle"]');
  check(/Paused/.test(await page.textContent('.player-label b')), 'read-aloud pauses');
  await page.click('.player [data-a="close"]');
  check(await page.locator('.player').isHidden(), 'player closes');
  await page.click('.steps button[data-step="modern"]');
  await page.waitForFunction(() => location.hash.endsWith('modern'));
  await page.click('#listen');
  await page.waitForSelector('.player [data-a="end"]', { timeout: 20000 });
  check((await page.textContent('.player [data-a="end"]')).includes('Vocabulary'), 'player offers to continue to the next step');
  await page.click('.player [data-a="end"]');
  await page.waitForFunction(() => location.hash.endsWith('words'));
  await page.waitForSelector('.vocab.reading');
  check(true, 'continuing auto-plays the next step');
  await page.click('.player [data-a="close"]');

  for (const step of ['modern', 'words', 'reflect']) {
    await page.click(`.steps button[data-step="${step}"]`);
    await page.waitForFunction(s => location.hash.endsWith(s), step);
  }
  await page.fill('#journal', 'My first reflection.');
  await page.waitForTimeout(600);
  await page.click('.steps button[data-step="words"]');
  await page.waitForSelector('.vocab');
  check((await page.locator('.vocab').count()) === lesson.vocabulary.length, 'vocabulary renders');
  await snap('03-vocab');

  await page.click('.steps button[data-step="quiz"]');
  for (let i = 0; i < lesson.quiz.length; i++) {
    const q = lesson.quiz[i];
    const v = q.type === 'tf' ? String(q.answer) : String(q.answer);
    // Answer the first question wrong to exercise feedback, the rest right.
    const pick = i === 0 && q.type === 'mc' ? String((q.answer + 1) % 4) : v;
    await page.click(`.option[data-v="${pick}"]`);
    if (i === 0) await snap('04-quiz-feedback');
    await page.click('#nextQ');
  }
  await page.waitForSelector('.result');
  check(/Well reasoned/.test(await page.textContent('.result h3')), 'quiz passes and completes lesson');
  await snap('05-quiz-result');

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('phil90:v1')));
  check(state.completed[first.id], 'completion saved');
  check(state.journal[first.id] === 'My first reflection.', 'journal saved');
  check(Object.keys(state.cards).length > 0, 'vocabulary added to flashcard deck');

  await page.goto(base + '#/course');
  await page.waitForSelector('.lesson-row.done');
  check(true, 'course map shows completed lesson');
  await snap('06-course');

  await page.goto(base + '#/practice/quiz');
  await page.waitForSelector('.question');
  check(true, 'practice quiz builds from completed lessons');

  await page.goto(base + `#/practice/cards/${first.id}`);
  await page.click('#fc');
  check(await page.locator('.flashcard.flipped').count() === 1, 'flashcard flips');
  await snap('07-flashcard');

  await page.goto(base + '#/glossary');
  await page.fill('#q', lesson.vocabulary[0].term.slice(0, 4));
  check((await page.locator('#gl .vocab').count()) > 0, 'glossary search works');

  await page.goto(base + '#/advanced');
  check((await page.locator('.track-card').count()) === 6, 'six deep-dive tracks listed');
  await snap('08-advanced');

  await page.goto(base + '#/settings');
  await page.click('#theme button[data-v="dark"]');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme applies');
  await page.goto(base);
  await page.waitForSelector('.hero');
  await snap('09-today-dark');

  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  check(sw, 'service worker registered (offline support)');
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log('\nSmoke test passed.');
} catch (e) {
  console.error(e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
