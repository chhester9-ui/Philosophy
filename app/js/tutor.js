// "Ask the tutor": an in-app philosophy chatbot powered by Google's Gemini API (free tier).
// The learner supplies their own API key, which is stored only on their device. Requests go
// straight from the phone to Google; nothing passes through any other server.

import { md, esc } from './md.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const MAX_TURNS = 20; // messages of history sent with each question

let deps = null;   // { store, getLesson, index }
let ctx = null;    // { id, lesson, meta, label } or null for general questions
let sheet = null;
let scrim = null;
let busy = false;
let abort = null;

export function init(d) { deps = d; }
const settings = () => deps.store.settings();
const hasKey = () => !!(settings().geminiKey || '').trim();

/* ---------- Model choice ---------- */
// Pick the newest general-purpose "flash" model the key can use, so the app keeps working as
// Google releases new models. Cached in settings; refreshed if a request says it's gone.
async function chooseModel(key, force = false) {
  const s = settings();
  if (s.geminiModel && !force) return s.geminiModel;
  try {
    const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error();
    const { models = [] } = await r.json();
    const ok = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /^gemini-[\d.]+-flash$/.test(n) || /^gemini-[\d.]+-flash-latest$/.test(n) || n === 'gemini-flash-latest');
    const ver = n => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
    ok.sort((a, b) => ver(b) - ver(a) || a.length - b.length);
    const pick = ok.find(n => n !== 'gemini-flash-latest') || ok[0] || FALLBACK_MODEL;
    deps.store.setSetting('geminiModel', pick);
    return pick;
  } catch {
    return FALLBACK_MODEL;
  }
}

/* ---------- Prompt ---------- */
function systemPrompt() {
  const done = Object.keys(deps.store.get().completed).filter(k => k.startsWith('day-')).length;
  const outline = deps.index.units.map(u => `Unit ${u.id} ${u.title}: ` + u.days.map(d => `Day ${d.day} ${d.title}`).join('; ')).join('\n');
  let s = `You are a warm, patient philosophy tutor inside "Philosophy in 90 Days", a course for complete beginners that runs from the earliest Greek philosophers to the present day.

How to answer:
- Explain clearly in plain language, defining any technical term you use. Use a concrete everyday example or analogy when it helps.
- Keep answers focused: usually 80–250 words, unless the learner asks for more depth. Use short paragraphs or a short bullet list; no headings.
- Be accurate. Distinguish what a philosopher actually said from later interpretation, flag legends as legends, and say so when scholars disagree or when you're unsure. Never invent quotations; paraphrase instead.
- Relate ideas to the current lesson and, where useful, to other days of the course (refer to them as "Day N").
- Be even-handed on contested moral, political and religious questions: present the strongest versions of the main positions rather than your own verdict.
- If asked about something unrelated to philosophy or learning, answer briefly and kindly steer back.
- End with a short question or suggestion to deepen understanding only when it fits naturally.

The learner has completed ${done} of 90 days.

Course outline:
${outline}`;
  if (ctx?.lesson) {
    const L = ctx.lesson;
    const text = [L.hook, ...L.sections.map(x => `${x.heading}\n${x.body}`)].join('\n\n');
    s += `\n\nThe learner is currently studying ${ctx.label}: "${L.title}" (${L.subtitle}). Era: ${L.era}. Thinkers: ${L.philosophers.join(', ') || 'various'}.
Key vocabulary: ${L.vocabulary.map(v => `${v.term} (${v.definition})`).join('; ')}.
Modern connection: ${L.modernConnection.title}.

Lesson text:
"""
${text}
"""`;
  }
  return s;
}

/* ---------- API call (streaming) ---------- */
async function ask(history, onText) {
  const key = settings().geminiKey.trim();
  let model = await chooseModel(key);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: history.slice(-MAX_TURNS).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  });
  abort = new AbortController();
  const call = m => fetch(`${API}/models/${m}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: abort.signal,
  });
  let res = await call(model);
  if (res.status === 404) { model = await chooseModel(key, true); res = await call(model); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* ignore */ }
    const e = new Error(msg); e.status = res.status; throw e;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', blocked = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const j = JSON.parse(line.slice(5));
        const c = j.candidates?.[0];
        const part = (c?.content?.parts || []).map(p => p.text || '').join('');
        if (part) { text += part; onText(text); }
        if (c?.finishReason === 'SAFETY' || j.promptFeedback?.blockReason) blocked = 'safety';
      } catch { /* partial line */ }
    }
  }
  if (!text && blocked) throw Object.assign(new Error('blocked'), { status: 'blocked' });
  return text;
}

function friendlyError(e) {
  if (e.name === 'AbortError') return null;
  if (e.status === 400 && /api key/i.test(e.message)) return 'Your Gemini API key was not accepted. Check it in **More → Settings → Philosophy tutor**.';
  if (e.status === 403) return 'Google refused the request (403). Make sure the key is a Gemini API key from Google AI Studio and that the Generative Language API is enabled for it.';
  if (e.status === 429) return "You've hit the free tier's rate limit. Wait a minute (or until tomorrow if it's the daily limit) and try again.";
  if (e.status === 'blocked') return 'Google declined to answer that one. Try rephrasing the question.';
  if (!navigator.onLine || e instanceof TypeError) return "Couldn't reach Google. The tutor needs an internet connection.";
  return `Something went wrong${e.status ? ` (${e.status})` : ''}. ${e.message ? esc(e.message) : 'Please try again.'}`;
}

/* ---------- Chat sheet UI ---------- */
// Gemini writes Markdown; turn headings into bold lines so our small renderer handles them.
const render = t => md(t.replace(/^#{1,6}\s*(.+)$/gm, '**$1**'));
const chatKey = () => ctx ? ctx.id : 'general';

export function open(context, prefill = '') {
  ctx = context;
  if (!sheet) build();
  sheet.querySelector('.sheet-sub').textContent = ctx ? `${ctx.label}: ${ctx.lesson.title}` : 'General questions';
  sheet.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('sheet-open');
  draw();
  const input = sheet.querySelector('textarea');
  if (prefill) input.value = prefill;
  autoGrow(input);
  if (hasKey()) setTimeout(() => input.focus(), 50);
}

export function close() {
  if (!sheet) return;
  abort?.abort();
  sheet.hidden = true;
  scrim.hidden = true;
  document.body.classList.remove('sheet-open');
}

function suggestions() {
  if (!ctx) return ['What is philosophy actually for?', 'How should I read a difficult philosophy book?', 'Which philosopher should I read first?'];
  const L = ctx.lesson;
  const p = L.philosophers[0];
  return [
    'Explain the main idea more simply',
    p ? `What would ${p} say about life today?` : 'Give me a modern example',
    'What are the strongest objections to this?',
    `How does this connect to earlier days?`,
    L.vocabulary.length ? `I'm confused about "${L.vocabulary[1 + Math.floor(Math.random() * (L.vocabulary.length - 1))]?.term || L.vocabulary[0].term}"` : 'Quiz me on this lesson',
  ];
}

function build() {
  sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Ask the tutor');
  sheet.innerHTML = `
    <header class="sheet-head">
      <div class="grow"><b>Ask the tutor</b><small class="sheet-sub"></small></div>
      <button class="icon-btn" data-a="clear" aria-label="Clear conversation" title="Clear conversation"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="icon-btn" data-a="close" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </header>
    <div class="chat" aria-live="polite"></div>
    <form class="composer">
      <textarea rows="1" placeholder="Ask about this lesson…" aria-label="Your question"></textarea>
      <button class="send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7-8-1z" fill="currentColor"/></svg></button>
    </form>`;
  scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.hidden = true;
  scrim.addEventListener('click', close);
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
  const input = sheet.querySelector('textarea');
  input.addEventListener('input', () => autoGrow(input));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); send(); } });
  sheet.querySelector('form').addEventListener('submit', e => { e.preventDefault(); send(); });
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-a], [data-q]'); if (!b) return;
    if (b.dataset.q) { input.value = b.dataset.q; send(); return; }
    if (b.dataset.a === 'close') close();
    if (b.dataset.a === 'clear' && confirm('Clear this conversation?')) { abort?.abort(); deps.store.saveChat(chatKey(), []); draw(); }
    if (b.dataset.a === 'settings') { close(); location.hash = '#/settings'; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }

function draw(streaming = null) {
  const chat = sheet.querySelector('.chat');
  const msgs = deps.store.getChat(chatKey());
  const composer = sheet.querySelector('form');
  if (!hasKey()) {
    composer.hidden = true;
    chat.innerHTML = `<div class="chat-empty">
      <div class="big"><svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.7-.9 1.3M12 14.6v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
      <h3>Set up your tutor</h3>
      <p>The tutor uses Google's Gemini AI. It's free, but you need your own key (about two minutes, no payment needed):</p>
      <ol><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with a Google account.</li><li>Tap <b>Create API key</b> and copy it.</li><li>Paste it in <b>Settings → Philosophy tutor</b>.</li></ol>
      <button class="btn primary block" data-a="settings">Go to Settings</button></div>`;
    return;
  }
  composer.hidden = false;
  const bubbles = msgs.map(m => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text).replace(/\n/g, '<br>') : render(m.text)}</div>`).join('');
  const live = streaming !== null ? `<div class="msg model">${streaming ? render(streaming) : '<span class="typing"><i></i><i></i><i></i></span>'}</div>` : '';
  const chips = !msgs.length && streaming === null
    ? `<div class="chat-empty small"><p>Ask anything about ${ctx ? 'this lesson' : 'philosophy'}: a confusing idea, a term, an objection, or how it applies to your life.</p></div><div class="chips">${suggestions().map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
  chat.innerHTML = chips + bubbles + live;
  chat.scrollTop = chat.scrollHeight;
}

async function send() {
  const input = sheet.querySelector('textarea');
  const q = input.value.trim();
  if (!q || busy) return;
  input.value = ''; autoGrow(input);
  const key = chatKey();
  const msgs = [...deps.store.getChat(key), { role: 'user', text: q }];
  deps.store.saveChat(key, msgs);
  busy = true;
  sheet.querySelector('.send').disabled = true;
  draw('');
  try {
    const answer = await ask(msgs, t => draw(t));
    deps.store.saveChat(key, [...msgs, { role: 'model', text: answer }]);
    draw();
  } catch (e) {
    // Drop the unanswered question from history and put it back in the box so they can retry.
    const msg = friendlyError(e);
    deps.store.saveChat(key, msgs.slice(0, -1));
    draw();
    if (msg) {
      sheet.querySelector('.chat').insertAdjacentHTML('beforeend', `<div class="msg error">${md(msg)}</div>`);
      input.value = q; autoGrow(input);
    }
  } finally {
    busy = false;
    sheet.querySelector('.send').disabled = false;
  }
}

/* ---------- Settings helper ---------- */
export async function testKey(key) {
  const r = await fetch(`${API}/models?pageSize=1&key=${encodeURIComponent(key)}`);
  if (r.ok) { deps.store.setSetting('geminiModel', ''); await chooseModel(key, true); return { ok: true, model: settings().geminiModel }; }
  let msg = ''; try { msg = (await r.json()).error?.message || ''; } catch { /* ignore */ }
  return { ok: false, status: r.status, message: msg };
}
