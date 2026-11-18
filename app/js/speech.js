// Read-aloud for lessons, using the device's built-in text-to-speech (Web Speech API).
// Works offline on iPhone, Android and desktop browsers. Text is spoken in short
// chunks because some engines cut off long utterances.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
export const supported = !!(synth && typeof SpeechSynthesisUtterance !== 'undefined');

// Elements that get read, in document order. Nested matches are skipped so text isn't read twice.
const READABLE = [
  '.lesson-head h2', '.lesson-head .subtitle',
  '.objectives h4', '.objectives li',
  '.prose h3', '.prose p', '.prose li', '.quote',
  '.callout h3', '.section-title', '.card h3',
  '.summary-list li', '.steps-list li', '.vocab', '.list .item',
].join(',');

let settings = { rate: 1, voice: '' };
let queue = [];          // [{ el, chunks: [string] }]
let pos = { i: 0, c: 0 };
let state = 'idle';      // idle | playing | paused
let token = 0;           // invalidates callbacks from cancelled utterances
let onEndCb = null;
let bar = null;

export function configure(s) {
  settings = { ...settings, ...s };
  if (state === 'playing') { speakCurrent(); }
}

export function englishVoices() {
  if (!supported) return [];
  return synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
}

function pickVoice() {
  const voices = englishVoices();
  if (!voices.length) return null;
  if (settings.voice) { const v = voices.find(x => x.voiceURI === settings.voice); if (v) return v; }
  const score = v => (/enhanced|premium|natural|neural/i.test(v.name) ? 4 : 0) + (/en[-_]US/i.test(v.lang) ? 2 : 0)
    + (/samantha|google us english|aria|jenny|ava|allison/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

export function onVoicesChanged(fn) {
  if (supported && 'onvoiceschanged' in synth) synth.addEventListener('voiceschanged', fn);
}

function textOf(el) {
  // Turn line breaks into sentence breaks so headings and list items are spoken with a pause.
  return (el.innerText || el.textContent || '')
    .split(/\n+/).map(s => s.trim()).filter(Boolean)
    .map(s => /[.!?:;”"’)]$/.test(s) ? s : s + '.')
    .join(' ')
    .replace(/[✦✓→←]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function chunk(text, max = 220) {
  const sentences = text.match(/[^.!?]+[.!?]+["”’)\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (s.length > max) {
      // Very long sentence: split on commas/semicolons, then hard-wrap on spaces.
      for (const part of s.split(/(?<=[,;—])\s+/)) {
        if ((cur + ' ' + part).length > max && cur) { out.push(cur.trim()); cur = ''; }
        cur += (cur ? ' ' : '') + part;
      }
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function collect(root) {
  const all = [...root.querySelectorAll(READABLE)];
  const set = new Set(all);
  return all
    .filter(el => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (set.has(p)) return false; return true; })
    .map(el => ({ el, chunks: chunk(textOf(el)) }))
    .filter(x => x.chunks.length);
}

function highlight() {
  document.querySelectorAll('.reading').forEach(e => e.classList.remove('reading'));
  const item = queue[pos.i];
  if (!item) return;
  item.el.classList.add('reading');
  const r = item.el.getBoundingClientRect();
  if (r.top < 120 || r.bottom > window.innerHeight - 110) item.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function speakCurrent() {
  const my = ++token;
  synth.cancel();
  const item = queue[pos.i];
  if (!item) { finish(); return; }
  const u = new SpeechSynthesisUtterance(item.chunks[pos.c]);
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
  u.rate = settings.rate || 1;
  u.onend = () => { if (my !== token || state !== 'playing') return; advance(); };
  u.onerror = e => { if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return; advance(); };
  highlight();
  render();
  synth.speak(u);
}

function advance() {
  const item = queue[pos.i];
  if (item && pos.c < item.chunks.length - 1) pos.c++;
  else { pos.i++; pos.c = 0; }
  if (pos.i >= queue.length) finish(); else speakCurrent();
}

function finish() {
  token++;
  synth.cancel();
  state = 'idle';
  document.querySelectorAll('.reading').forEach(e => e.classList.remove('reading'));
  const cb = onEndCb;
  render(true);
  if (cb) cb();
}

/* ---------- Public controls ---------- */
export function start(root, { onEnd = null, fromEl = null } = {}) {
  if (!supported) return;
  queue = collect(root);
  onEndCb = onEnd;
  pos = { i: 0, c: 0 };
  if (fromEl) { const k = queue.findIndex(q => q.el === fromEl || q.el.contains(fromEl)); if (k >= 0) pos.i = k; }
  state = 'playing';
  speakCurrent();
}
export function toggle() {
  if (state === 'playing') { state = 'paused'; token++; synth.cancel(); render(); }
  else if (state === 'paused') { state = 'playing'; speakCurrent(); }
}
export function skip(dir) {
  if (state === 'idle') return;
  pos = { i: Math.max(0, Math.min(queue.length - 1, pos.i + dir)), c: 0 };
  if (state === 'playing') speakCurrent(); else { highlight(); render(); }
}
export function jumpTo(el) {
  const k = queue.findIndex(q => q.el === el || q.el.contains(el));
  if (k < 0) return false;
  pos = { i: k, c: 0 }; state = 'playing'; speakCurrent();
  return true;
}
export function stop() {
  if (!supported) return;
  token++; synth.cancel(); state = 'idle'; queue = []; onEndCb = null;
  document.querySelectorAll('.reading').forEach(e => e.classList.remove('reading'));
  render();
}
export const isActive = () => state !== 'idle';
export function speakSample(text) {
  if (!supported) return;
  stop();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = settings.rate || 1;
  synth.speak(u);
}

/* ---------- Player bar ---------- */
let rateHandler = null, endAction = null;
export function setRateHandler(fn) { rateHandler = fn; }
export function setEndAction(action) { endAction = action; }   // { label, run } shown when reading finishes

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const RATES = [0.8, 1, 1.2, 1.4];

function render(ended = false) {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'player';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Read aloud');
    document.body.appendChild(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'toggle') toggle();
      else if (a === 'prev') skip(-1);
      else if (a === 'next') skip(1);
      else if (a === 'close') { endAction = null; stop(); }
      else if (a === 'rate') {
        const r = RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length] || 1;
        settings.rate = r; rateHandler?.(r); render(); if (state === 'playing') speakCurrent();
      } else if (a === 'end' && endAction) { const run = endAction.run; endAction = null; run(); }
    });
  }
  const showEnd = ended && endAction;
  const visible = state !== 'idle' || showEnd;
  bar.hidden = !visible;
  document.body.classList.toggle('listening', !!visible);
  if (!visible) return;
  if (showEnd) {
    bar.dataset.mode = 'end';
    bar.innerHTML = `<div class="player-label grow"><b>Finished reading</b><small>Keep listening?</small></div>
      <button class="btn primary" data-a="end">${endAction.label} ▶</button>
      <button class="icon-btn" data-a="close" aria-label="Close player">${ICON.close}</button>`;
    return;
  }
  if (bar.dataset.mode !== 'play') {
    bar.dataset.mode = 'play';
    bar.innerHTML = `<div class="player-label grow"><b></b><small></small><div class="player-progress"><i></i></div></div>
      <button class="icon-btn" data-a="prev" aria-label="Previous paragraph">${ICON.prev}</button>
      <button class="play-btn" data-a="toggle"></button>
      <button class="icon-btn" data-a="next" aria-label="Next paragraph">${ICON.next}</button>
      <button class="rate-btn" data-a="rate" aria-label="Reading speed"></button>
      <button class="icon-btn" data-a="close" aria-label="Stop reading">${ICON.close}</button>`;
  }
  // Update in place so buttons are never swapped out from under a tap.
  const total = queue.length, playing = state === 'playing';
  bar.querySelector('.player-label b').textContent = playing ? 'Reading aloud' : 'Paused';
  bar.querySelector('.player-label small').textContent = `${Math.min(pos.i + 1, total)} of ${total}`;
  bar.querySelector('.player-progress i').style.width = `${total ? ((pos.i + 1) / total) * 100 : 0}%`;
  const t = bar.querySelector('.play-btn');
  if (t.dataset.s !== state) { t.dataset.s = state; t.innerHTML = playing ? ICON.pause : ICON.play; t.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
  bar.querySelector('.rate-btn').textContent = `${settings.rate}×`;
}

// Some engines (notably Chrome) stall if the page is hidden mid-speech; pause cleanly instead.
if (supported) document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing' && !/iPhone|iPad|iPod/.test(navigator.userAgent)) toggle();
});
