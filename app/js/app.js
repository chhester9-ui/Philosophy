import { store, termKey, today } from './store.js';
import { md, inline, esc } from './md.js';
import * as tts from './speech.js';

/* ---------- Data ---------- */
let INDEX = null;
const lessonCache = new Map();

async function loadIndex() {
  const res = await fetch('content/index.json');
  INDEX = await res.json();
  INDEX.allDays = INDEX.units.flatMap(u => u.days.map(d => ({ ...d, unit: u })));
  INDEX.byId = new Map();
  INDEX.allDays.forEach(d => INDEX.byId.set(d.id, d));
  INDEX.tracks.forEach(t => t.lessons.forEach(l => INDEX.byId.set(l.id, { ...l, track: t })));
  INDEX.glossaryByKey = new Map();
  INDEX.glossary.forEach(g => { const k = termKey(g.term); if (!INDEX.glossaryByKey.has(k)) INDEX.glossaryByKey.set(k, g); });
}

async function getLesson(id) {
  if (lessonCache.has(id)) return lessonCache.get(id);
  const meta = INDEX.byId.get(id);
  if (!meta) throw new Error('Unknown lesson');
  const res = await fetch(`content/${meta.track ? 'tracks' : 'lessons'}/${id}.json`);
  if (!res.ok) throw new Error('Lesson not available yet');
  const L = await res.json();
  lessonCache.set(id, L);
  return L;
}

const nextDay = () => INDEX.allDays.find(d => d.available && !store.isDone(d.id));
const doneCount = () => INDEX.allDays.filter(d => store.isDone(d.id)).length;

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const view = () => $('#view');
const words = s => (s || '').split(/\s+/).filter(Boolean).length;
const chev = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pct = x => `${Math.round(x * 100)}%`;
const label = meta => meta.track ? `${meta.track.title} · ${meta.order}` : `Day ${meta.day}`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function setChrome({ title = 'Philosophy in 90 Days', back = false, tab = null, immersive = false } = {}) {
  $('#topbarTitle').textContent = title;
  $('#backBtn').hidden = !back;
  document.body.classList.toggle('immersive', immersive);
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  document.title = title === 'Philosophy in 90 Days' ? title : `${title} · Philosophy in 90 Days`;
}

function stepMinutes(L) {
  const read = Math.max(5, Math.round((words(L.hook) + L.sections.reduce((n, s) => n + words(s.body), 0)) / 190));
  const modern = Math.max(2, Math.round(words(L.modernConnection.body) / 190));
  const quiz = Math.max(5, Math.round(L.quiz.length * 0.7));
  return { learn: read, modern, words: 5, reflect: 10, quiz, deeper: Math.max(3, Math.round(words(L.goDeeper.body) / 190)) };
}

const STEPS = [
  { key: 'learn', label: 'Read' },
  { key: 'modern', label: 'Modern Lens' },
  { key: 'words', label: 'Vocabulary' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'deeper', label: 'Go Deeper' },
];

/* ---------- Router ---------- */
const routes = [
  [/^$/, viewToday],
  [/^course$/, viewCourse],
  [/^lesson\/([\w-]+)(?:\/(\w+))?$/, viewLesson],
  [/^practice$/, viewPractice],
  [/^practice\/cards(?:\/([\w-]+))?$/, viewCards],
  [/^practice\/quiz$/, viewPracticeQuiz],
  [/^glossary$/, viewGlossary],
  [/^advanced$/, viewAdvanced],
  [/^advanced\/([\w-]+)$/, viewTrack],
  [/^more$/, viewMore],
  [/^journal$/, viewJournal],
  [/^settings$/, viewSettings],
  [/^about$/, viewAbout],
];

async function route() {
  const path = location.hash.replace(/^#\/?/, '');
  tts.stop();
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); }
      catch (e) { console.error(e); view().innerHTML = `<div class="empty"><div class="big">🏛️</div><p>${esc(e.message || 'Something went wrong.')}</p><a class="btn" href="#/course">Back to course</a></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

/* ---------- Today ---------- */
function viewToday() {
  setChrome({ tab: 'today' });
  const n = nextDay();
  const done = doneCount();
  const total = INDEX.allDays.length;
  const streak = store.streak();
  const deck = Object.keys(store.get().cards).length;
  const due = store.dueCards().length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  let hero;
  if (!n) {
    const allDone = done === total;
    hero = `<section class="card hero">
      <div class="eyebrow">${allDone ? 'Course complete' : 'More lessons coming'}</div>
      <h2>${allDone ? 'You finished all 90 days.' : 'You are all caught up.'}</h2>
      <p>${allDone ? 'From Thales to today. Keep going with the Deep Dive tracks.' : 'New lessons will appear here when they are added.'}</p>
      <a class="btn" href="#/advanced">Explore Deep Dives</a></section>`;
  } else {
    const started = store.stepsVisited(n.id).size > 0;
    hero = `<section class="card hero">
      <div class="eyebrow">${store.doneToday() ? 'Up next · keep going?' : "Today's lesson"} · Day ${n.day} of ${total}</div>
      <h2>${esc(n.title)}</h2>
      <p>${esc(n.subtitle || '')}</p>
      <div class="meta"><span>⏱ ~${n.minutes} min</span><span>${esc(n.unit.title)}</span>${n.era ? `<span>${esc(n.era)}</span>` : ''}</div>
      <div class="progress" style="margin-bottom:16px" aria-label="Course progress"><i style="width:${(done / total) * 100}%"></i></div>
      <a class="btn block" href="#/lesson/${n.id}">${started ? 'Continue lesson' : 'Start lesson'}</a></section>`;
  }

  const doneNote = store.doneToday() && n
    ? `<div class="card flat" style="background:var(--good-soft);border-color:transparent"><b>Today's lesson is done.</b> <span class="muted">Nice work. Rest and let it sink in, or keep going if you're curious.</span></div>` : '';

  view().innerHTML = `<div class="stack">
    <div><div class="muted small">${greet}</div><h1 class="page-title" style="margin-top:2px">Philosophy in 90 Days</h1></div>
    ${doneNote}
    ${hero}
    <div class="stats">
      <div class="stat"><b>${streak}</b><span>day streak</span></div>
      <div class="stat"><b>${done}<small class="muted" style="font-size:.9rem">/${total}</small></b><span>lessons done</span></div>
      <div class="stat"><b>${deck}</b><span>words learned</span></div>
    </div>
    ${due ? `<a class="card row" style="text-decoration:none;color:inherit" href="#/practice/cards"><div style="font-size:1.6rem">🗂️</div><div class="grow"><b>${due} flashcard${due > 1 ? 's' : ''} ready</b><div class="muted small">A quick review keeps vocabulary from fading.</div></div>${chev}</a>` : ''}
    ${n ? `<section class="card"><h3>How today works</h3><p class="muted small" style="margin:0 0 4px">Work through each step in order. Pass the quiz (${pct(store.PASS)}+) to complete the day.</p><ul class="plan" id="plan"><li class="muted small">Loading plan…</li></ul></section>` : ''}
  </div>`;

  if (n) getLesson(n.id).then(L => {
    const m = stepMinutes(L);
    const rows = [
      ['Read', `${L.sections.length} short sections`, m.learn],
      ['Modern Lens', esc(L.modernConnection.title), m.modern],
      ['Vocabulary', `${L.vocabulary.length} key terms`, m.words],
      ['Reflect', esc(L.thinkingExercise.title), m.reflect],
      ['Quiz', `${L.quiz.length} questions`, m.quiz],
    ];
    const plan = $('#plan');
    if (plan) plan.innerHTML = rows.map((r, i) => `<li><span class="num">${i + 1}</span><div class="grow"><b>${r[0]}</b><div class="muted small">${r[1]}</div></div><span class="mins">${r[2]} min</span></li>`).join('')
      + `<li><span class="num">+</span><div class="grow"><b>Go Deeper</b><div class="muted small">Optional advanced reading</div></div><span class="mins">${m.deeper}+ min</span></li>`;
  }).catch(() => {});
}

/* ---------- Course ---------- */
function viewCourse() {
  setChrome({ title: 'Course', tab: 'course' });
  const n = nextDay();
  const openUnit = n ? n.unit.id : INDEX.units[0].id;
  view().innerHTML = `<h1 class="page-title">The 90-Day Course</h1>
    <p class="muted">From the first Greek philosophers to the questions of today, in ${INDEX.units.length} units.</p>
    <div class="progress"><i style="width:${(doneCount() / INDEX.allDays.length) * 100}%"></i></div>
    ${INDEX.units.map(u => {
      const d = u.days.filter(x => store.isDone(x.id)).length;
      return `<details class="unit" ${u.id === openUnit ? 'open' : ''}>
        <summary class="card flat" style="padding:14px 16px"><span class="unit-num">${u.id}</span><div class="grow"><h3>${esc(u.title)}</h3><div class="muted small">Days ${u.days[0].day}–${u.days.at(-1).day} · ${d}/${u.days.length} done</div></div><span class="chev">${chev}</span></summary>
        <div class="card flat" style="margin-top:8px">${u.days.map(x => lessonRow(x, n)).join('')}</div>
      </details>`;
    }).join('')}`;
  // border fix: first row has no top border
  view().querySelectorAll('.unit .card:not(summary)').forEach(c => { const f = c.querySelector('.lesson-row'); if (f) f.style.borderTop = '0'; });
}

function lessonRow(x, next) {
  const c = store.get().completed[x.id];
  const cls = ['lesson-row', c ? 'done' : '', next && next.id === x.id ? 'current' : '', x.available ? '' : 'unavailable'].join(' ');
  const badge = c ? '✓' : (x.day ?? x.order);
  const tag = x.review ? '<span class="pill review">Review</span> ' : '';
  const score = c ? `<span class="pill good">${pct(c.best)}</span>` : '';
  const inner = `<span class="badge">${badge}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${tag}${x.available ? `~${x.minutes} min` : 'Coming soon'}</div></div>${score}`;
  return x.available ? `<a class="${cls}" href="#/lesson/${x.id}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
}

/* ---------- Lesson ---------- */
let autoplay = false; // set when the player continues into the next lesson step
async function viewLesson(id, step) {
  const meta = INDEX.byId.get(id);
  if (!meta) throw new Error('Lesson not found');
  step = STEPS.some(s => s.key === step) ? step : 'learn';
  setChrome({ title: label(meta), back: true, immersive: true });
  if (!lessonCache.has(id)) view().innerHTML = '<div class="loading">Loading lesson…</div>';
  const L = await getLesson(id);
  store.markStep(id, step);
  const visited = store.stepsVisited(id);
  const done = store.isDone(id);
  const mins = stepMinutes(L);
  // Recorded narration for the main reading, if available and the narrator setting allows it.
  let rec = null;
  if (step === 'learn' && meta.audio && store.settings().narrator !== 'device') {
    try { rec = await (await fetch(`audio/${id}.json`)).json(); } catch { rec = null; }
  }
  const idx = STEPS.findIndex(s => s.key === step);
  const prev = STEPS[idx - 1], next = STEPS[idx + 1];

  const tabs = `<nav class="steps" aria-label="Lesson steps">${STEPS.map(s => {
    const tick = (s.key === 'quiz' ? done : visited.has(s.key) && s.key !== step) ? '<span class="tick">✓</span>' : '';
    return `<button data-step="${s.key}" class="${s.key === step ? 'active' : ''}">${tick}${s.label}</button>`;
  }).join('')}</nav>`;

  const head = `<header class="lesson-head">
    <div class="eyebrow">${meta.track ? esc(meta.track.title) + ' · Lesson ' + meta.order : `Day ${meta.day} · ${esc(meta.unit.title)}`}</div>
    <h2>${esc(L.title)}</h2>
    <p class="subtitle">${esc(L.subtitle)}</p>
    <div class="meta-row"><span class="pill">⏱ ~${L.estimatedMinutes} min</span>${L.era ? `<span class="pill">${esc(L.era)}</span>` : ''}${L.philosophers.slice(0, 4).map(p => `<span class="pill">${esc(p)}</span>`).join('')}${done ? '<span class="pill good">Completed</span>' : ''}</div>
  </header>`;

  let body = '';
  if (step === 'learn') {
    body = `${head}
      <div class="objectives"><h4>What you'll learn</h4><ul>${L.objectives.map(o => `<li>${inline(o)}</li>`).join('')}</ul></div>
      <article class="prose"><div class="hook">${md(L.hook)}</div>
      ${L.sections.map((s, i) => `<h3>${esc(s.heading)}</h3>${md(s.body)}${i === Math.floor(L.sections.length / 2) - 1 && L.keyQuote ? quoteBlock(L.keyQuote) : ''}`).join('')}
      </article>
      <section class="card flat" style="margin-top:24px"><h3>Key takeaways</h3><ul class="summary-list">${L.summary.map(s => `<li>${inline(s)}</li>`).join('')}</ul></section>`;
  } else if (step === 'modern') {
    body = `<div class="callout" style="margin-top:12px"><div class="eyebrow">Modern Lens · ~${mins.modern} min</div><h3>${esc(L.modernConnection.title)}</h3><div class="prose">${md(L.modernConnection.body)}</div></div>`;
  } else if (step === 'words') {
    body = `<h2 class="section-title">Key vocabulary</h2>
      <p class="muted">Learn these terms before the quiz. Completing the lesson adds them to your flashcard deck for spaced review.</p>
      <dl class="vocab-list">${L.vocabulary.map(v => `<div class="card flat vocab"><dt>${esc(v.term)}</dt><dd>${inline(v.definition)}</dd><div class="ex">“${inline(v.example)}”</div></div>`).join('')}</dl>
      <a class="btn block" style="margin-top:16px" href="#/practice/cards/${id}">🗂️ Drill these as flashcards</a>`;
  } else if (step === 'reflect') {
    const te = L.thinkingExercise;
    body = `<h2 class="section-title">${esc(te.title)}</h2>
      <div class="prose">${md(te.prompt)}</div>
      <ol class="steps-list">${te.steps.map(s => `<li>${inline(s)}</li>`).join('')}</ol>
      <label class="eyebrow" for="journal" style="display:block;margin:20px 0 8px">Your notebook</label>
      <textarea class="journal" id="journal" placeholder="Write your thoughts here. They are saved on this device automatically.">${esc(store.get().journal[id] || '')}</textarea>
      <div class="muted small" id="saved" style="margin-top:6px">&nbsp;</div>`;
  } else if (step === 'quiz') {
    body = `<h2 class="section-title">Check your understanding</h2>
      <p class="muted">${L.quiz.length} questions. Score ${pct(store.PASS)} or more to complete this lesson.${done ? ` Your best so far: <b>${pct(store.get().completed[id].best)}</b>.` : ''}</p>
      <div id="quiz"></div>`;
  } else if (step === 'deeper') {
    const g = L.goDeeper;
    body = `<h2 class="section-title">Go deeper</h2><p class="muted small">Optional. For when you want more than the essentials.</p>
      <div class="prose">${md(g.body)}</div>
      <h3 class="section-title">Discuss or journal</h3><ul class="summary-list">${g.questions.map(q => `<li>${inline(q)}</li>`).join('')}</ul>
      <h3 class="section-title">Further reading</h3><div class="list">${g.readings.map(r => `<div class="item"><div class="grow"><b>${inline(r.title)}</b><small>${esc(r.author)}${r.note ? ' — ' + inline(r.note) : ''}</small></div></div>`).join('')}</div>`;
  }

  const listen = (tts.supported || rec) && step !== 'quiz'
    ? `<button class="btn listen-btn" id="listen"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${rec ? 'Listen to narration' : 'Listen'}${step === 'learn' ? ` · ${rec ? Math.round(rec.duration / 60) : '~' + Math.round(mins.learn * 1.15)} min` : ''}</button>` : '';
  const nav = `<div class="step-nav">${prev ? `<a class="btn" href="#/lesson/${id}/${prev.key}">← ${prev.label}</a>` : ''}${next ? `<a class="btn primary" href="#/lesson/${id}/${next.key}">${next.label} →</a>` : `<a class="btn primary" href="${nextAfter(meta)}">${meta.track ? 'Back to track' : 'Back to today'}</a>`}</div>`;
  view().innerHTML = tabs + listen + body + (step === 'quiz' ? '' : nav);

  view().querySelectorAll('.steps button').forEach(b => b.addEventListener('click', () => { location.hash = `#/lesson/${id}/${b.dataset.step}`; window.scrollTo(0, 0); }));
  const active = view().querySelector('.steps button.active');
  active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  window.scrollTo(0, 0);

  if (listen) {
    const play = () => {
      tts.setEndAction(next ? (next.key === 'quiz'
        ? { label: 'Take the quiz', run: () => { location.hash = `#/lesson/${id}/quiz`; } }
        : { label: `Listen: ${next.label}`, run: () => { autoplay = true; location.hash = `#/lesson/${id}/${next.key}`; } }) : null);
      if (rec) {
        const ok = tts.startRecording(view(), {
          src: `audio/${id}.mp3`, meta: rec, title: L.title, album: label(meta),
          onError: at => tts.startFrom(view(), at),
        });
        if (ok) return;
      }
      tts.start(view());
    };
    $('#listen').addEventListener('click', play);
    if (autoplay) { autoplay = false; play(); }
  }
  autoplay = false;

  if (step === 'reflect') {
    const ta = $('#journal');
    let t;
    ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.saveJournal(id, ta.value); $('#saved').textContent = 'Saved'; }, 400); });
  }
  if (step === 'quiz') {
    runQuiz($('#quiz'), L.quiz, {
      onFinish(score) {
        const r = store.recordQuiz(id, score, L.vocabulary);
        if (r.firstPass) toast(`${label(meta)} complete! ${L.vocabulary.length} words added to your deck.`);
        return { passed: r.passed, actions: r.passed
          ? `<a class="btn primary" href="#/lesson/${id}/deeper">Go Deeper →</a><a class="btn" href="${nextAfter(meta)}">Done</a>`
          : `<a class="btn" href="#/lesson/${id}/learn">Review the lesson</a>` };
      },
    });
  }
}

const nextAfter = meta => meta.track ? `#/advanced/${meta.track.id}` : '#/';

function quoteBlock(q) {
  return `<figure class="quote"><p>“${esc(q.text)}”</p><cite>— ${esc(q.source)}</cite></figure>`;
}

/* ---------- Quiz engine ---------- */
function runQuiz(root, questions, { onFinish }) {
  let i = 0, results = [];
  const letters = ['A', 'B', 'C', 'D'];
  function render() {
    const q = questions[i];
    const bar = `<div class="q-progress">${questions.map((_, k) => `<i class="${k < results.length ? (results[k] ? 'right' : 'wrong') : k === i ? 'now' : ''}"></i>`).join('')}</div>`;
    const opts = q.type === 'tf'
      ? [['True', true], ['False', false]].map(([t, v], k) => `<button class="option" data-v="${v}"><span class="letter">${t[0]}</span><span>${t}</span></button>`).join('')
      : q.options.map((o, k) => `<button class="option" data-v="${k}"><span class="letter">${letters[k]}</span><span>${inline(o)}</span></button>`).join('');
    root.innerHTML = `${bar}<div class="eyebrow">Question ${i + 1} of ${questions.length}${q.source ? ' · ' + esc(q.source) : ''}</div>
      <p class="question">${inline(q.question)}</p><div class="options">${opts}</div><div id="fb"></div>`;
    root.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => answer(b)));
  }
  function answer(btn) {
    const q = questions[i];
    const given = q.type === 'tf' ? btn.dataset.v === 'true' : Number(btn.dataset.v);
    const right = given === q.answer;
    results.push(right);
    root.querySelectorAll('.option').forEach(b => {
      b.disabled = true;
      const v = q.type === 'tf' ? b.dataset.v === 'true' : Number(b.dataset.v);
      if (v === q.answer) b.classList.add('correct');
      else if (b === btn) b.classList.add('incorrect');
    });
    const last = i === questions.length - 1;
    $('#fb', root).innerHTML = `<div class="feedback ${right ? 'right' : 'wrong'}"><b>${right ? 'Correct' : 'Not quite'}</b>${inline(q.explanation)}</div>
      <button class="btn primary block" style="margin-top:14px" id="nextQ">${last ? 'See results' : 'Next question'}</button>`;
    $('#nextQ', root).addEventListener('click', () => { if (last) finish(); else { i++; render(); root.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); } });
    $('#nextQ', root).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function finish() {
    const score = results.filter(Boolean).length / questions.length;
    const { passed, actions } = onFinish(score, results);
    const r = 60, c = 2 * Math.PI * r;
    const missed = questions.map((q, k) => [q, k]).filter(([, k]) => !results[k]);
    root.innerHTML = `<div class="result">
      <svg class="score-ring" viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
        <circle cx="70" cy="70" r="${r}" fill="none" stroke="${passed ? 'var(--good)' : 'var(--accent)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - score)}" transform="rotate(-90 70 70)"/>
        <text x="70" y="78" text-anchor="middle" font-size="28" font-weight="700" fill="var(--ink)" font-family="Georgia, serif">${pct(score)}</text></svg>
      <h3>${passed === null ? 'Practice complete' : passed ? 'Well reasoned!' : 'Almost there'}</h3>
      <p class="muted">${results.filter(Boolean).length} of ${questions.length} correct.${passed === false ? ` You need ${pct(store.PASS)} to complete the lesson. Review and try again; the explanations are the best teacher.` : ''}</p>
      <div class="btn-row result-actions" style="margin:16px 0">${actions || ''}<button class="btn" id="retake">Retake quiz</button></div></div>
      ${missed.length ? `<h3 class="section-title">Review what you missed</h3>${missed.map(([q]) => `<div class="card flat" style="margin-bottom:10px"><p style="margin:0 0 8px"><b>${inline(q.question)}</b></p><p class="small" style="margin:0 0 6px;color:var(--good)"><b>Answer:</b> ${q.type === 'tf' ? (q.answer ? 'True' : 'False') : inline(q.options[q.answer])}</p><p class="small muted" style="margin:0">${inline(q.explanation)}</p></div>`).join('')}` : ''}`;
    $('#retake', root).addEventListener('click', () => { i = 0; results = []; render(); window.scrollTo(0, 0); });
    window.scrollTo(0, 0);
  }
  render();
}

/* ---------- Practice ---------- */
function viewPractice() {
  setChrome({ title: 'Practice', tab: 'practice' });
  const due = store.dueCards().length;
  const deck = Object.keys(store.get().cards).length;
  const completed = Object.keys(store.get().completed).length;
  view().innerHTML = `<h1 class="page-title">Practice</h1><p class="muted">Short, regular review is how ideas stick.</p>
    <div class="stack">
      <a class="card track-card" href="#/practice/cards"><div class="eyebrow">Spaced repetition</div><h3>Vocabulary flashcards</h3>
        <p class="muted" style="margin:0">${deck ? `${due} due today · ${deck} words in your deck` : 'Complete a lesson to start your deck.'}</p></a>
      <a class="card track-card" href="#/practice/quiz"><div class="eyebrow">Mixed review</div><h3>Practice quiz</h3>
        <p class="muted" style="margin:0">${completed ? `10 random questions from the ${completed} lesson${completed > 1 ? 's' : ''} you've completed.` : 'Complete a lesson to unlock mixed practice.'}</p></a>
      <a class="card track-card" href="#/glossary"><div class="eyebrow">Reference</div><h3>Glossary</h3>
        <p class="muted" style="margin:0">Every key term in the course (${INDEX.glossary.length}), searchable.</p></a>
    </div>`;
}

async function viewCards(lessonId) {
  let deck, drill = false, title = 'Flashcards';
  if (lessonId) {
    const L = await getLesson(lessonId);
    deck = L.vocabulary.map(v => ({ ...v, key: termKey(v.term) }));
    drill = true; title = 'Drill';
  } else {
    deck = store.dueCards().map(k => ({ ...INDEX.glossaryByKey.get(k), key: k })).filter(c => c.term);
    deck.sort(() => Math.random() - 0.5);
  }
  setChrome({ title, back: true, immersive: true });
  if (!deck.length) {
    const any = Object.keys(store.get().cards).length;
    view().innerHTML = `<div class="empty"><div class="big">${any ? '🌿' : '🗂️'}</div><h2>${any ? 'All caught up' : 'No cards yet'}</h2>
      <p>${any ? 'No flashcards are due right now. Come back tomorrow.' : 'Finish a lesson and its vocabulary joins your deck.'}</p><a class="btn" href="#/practice">Back</a></div>`;
    return;
  }
  let i = 0, known = 0;
  const render = () => {
    if (i >= deck.length) {
      view().innerHTML = `<div class="empty"><div class="big">✨</div><h2>Session complete</h2><p>${drill ? `You went through all ${deck.length} terms.` : `${known} of ${deck.length} remembered. Missed cards will come back sooner.`}</p>
        <div class="btn-row">${drill ? `<a class="btn primary" href="#/lesson/${lessonId}/words">Back to lesson</a>` : '<a class="btn primary" href="#/">Done</a>'}</div></div>`;
      return;
    }
    const c = deck[i];
    view().innerHTML = `<p class="muted small" style="text-align:center">${i + 1} / ${deck.length}</p>
      <div class="flashcard" id="fc" role="button" tabindex="0" aria-label="Flip card">
        <div class="flashcard-inner">
          <div class="flashcard-face"><div class="term">${esc(c.term)}</div><div class="hint">Tap to reveal</div></div>
          <div class="flashcard-face back"><div class="eyebrow" style="margin-bottom:8px">${esc(c.term)}</div><div class="def">${inline(c.definition)}</div><div class="ex">“${inline(c.example)}”</div></div>
        </div></div>
      <div class="btn-row" style="margin-top:18px">${drill ? '<button class="btn primary" id="next">Next →</button>'
        : '<button class="btn" id="again">Still learning</button><button class="btn primary" id="got">I knew it</button>'}</div>`;
    const fc = $('#fc');
    const flip = () => fc.classList.toggle('flipped');
    fc.addEventListener('click', flip);
    fc.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    if (drill) $('#next').onclick = () => { i++; render(); };
    else {
      $('#got').onclick = () => { store.gradeCard(c.key, true); known++; i++; render(); };
      $('#again').onclick = () => { store.gradeCard(c.key, false); i++; render(); };
    }
  };
  render();
}

async function viewPracticeQuiz() {
  setChrome({ title: 'Practice quiz', back: true, immersive: true });
  const ids = Object.keys(store.get().completed);
  if (!ids.length) {
    view().innerHTML = `<div class="empty"><div class="big">📝</div><h2>Nothing to practice yet</h2><p>Complete your first lesson to unlock mixed review.</p><a class="btn" href="#/">Go to today's lesson</a></div>`;
    return;
  }
  view().innerHTML = '<div class="loading">Building your quiz…</div>';
  const lessons = await Promise.all(ids.map(id => getLesson(id).catch(() => null)));
  const pool = lessons.filter(Boolean).flatMap(L => L.quiz.map(q => ({ ...q, source: L.day ? `Day ${L.day}` : L.title })));
  pool.sort(() => Math.random() - 0.5);
  const qs = pool.slice(0, 10);
  view().innerHTML = `<h1 class="page-title">Mixed review</h1><p class="muted">${qs.length} questions drawn from your completed lessons.</p><div id="quiz"></div>`;
  runQuiz($('#quiz'), qs, { onFinish: () => ({ passed: null, actions: '<a class="btn primary" href="#/practice">Done</a>' }) });
}

function viewGlossary() {
  setChrome({ title: 'Glossary', back: true, tab: 'practice' });
  const learned = new Set(Object.keys(store.get().cards));
  const sorted = [...INDEX.glossary].sort((a, b) => a.term.localeCompare(b.term));
  view().innerHTML = `<h1 class="page-title">Glossary</h1>
    <input class="search" id="q" type="search" placeholder="Search ${sorted.length} terms…" autocomplete="off">
    <div class="row" style="margin:12px 0"><div class="seg" id="filter"><button class="on" data-f="all">All</button><button data-f="learned">Learned (${learned.size})</button></div></div>
    <div class="vocab-list" id="gl"></div>`;
  let filter = 'all';
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const items = sorted.filter(g => (filter === 'all' || learned.has(termKey(g.term))) && (!q || g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)));
    $('#gl').innerHTML = items.slice(0, 200).map(g => {
      const m = INDEX.byId.get(g.lessonId);
      return `<div class="card flat vocab"><dt>${esc(g.term)}</dt><dd>${inline(g.definition)}</dd><div class="ex">“${inline(g.example)}”</div>${m ? `<a class="from" href="#/lesson/${g.lessonId}/words">${esc(label(m))}: ${esc(m.title)}</a>` : ''}</div>`;
    }).join('') || '<div class="empty">No matching terms.</div>';
  };
  $('#q').addEventListener('input', draw);
  $('#filter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.f; $('#filter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw();
  });
  draw();
}

/* ---------- Advanced ---------- */
function viewAdvanced() {
  setChrome({ title: 'Deep Dives', tab: 'advanced' });
  view().innerHTML = `<h1 class="page-title">Deep Dives</h1>
    <p class="muted">Advanced tracks that go beyond the 90-day course. Each is five lessons in the same format. Start whenever you like; each one suggests a point in the course after which it will make the most sense.</p>
    <div class="stack">${INDEX.tracks.map(t => {
      const d = t.lessons.filter(l => store.isDone(l.id)).length;
      const ready = doneCount() >= t.recommendedAfterDay;
      return `<a class="card track-card" href="#/advanced/${t.id}"><div class="row"><div class="grow"><div class="eyebrow">${ready ? 'Ready for you' : `Best after Day ${t.recommendedAfterDay}`}</div><h3>${esc(t.title)}</h3></div>${chev}</div>
        <p class="muted" style="margin:0 0 10px">${esc(t.description)}</p><div class="progress"><i style="width:${(d / t.lessons.length) * 100}%"></i></div><div class="muted small" style="margin-top:6px">${d}/${t.lessons.length} lessons</div></a>`;
    }).join('')}</div>`;
}

function viewTrack(trackId) {
  const t = INDEX.tracks.find(x => x.id === trackId);
  if (!t) throw new Error('Track not found');
  setChrome({ title: t.title, back: true, tab: 'advanced' });
  const next = t.lessons.find(l => l.available && !store.isDone(l.id));
  view().innerHTML = `<div class="eyebrow" style="margin-top:12px">Deep Dive · best after Day ${t.recommendedAfterDay}</div><h1 class="page-title">${esc(t.title)}</h1>
    <p class="muted">${esc(t.description)}</p><div class="card flat" style="padding:0;overflow:hidden">${t.lessons.map(l => lessonRow(l, next)).join('')}</div>`;
  const f = view().querySelector('.lesson-row'); if (f) f.style.borderTop = '0';
}

/* ---------- More ---------- */
function viewMore() {
  setChrome({ title: 'More', tab: 'more' });
  const n = Object.values(store.get().journal).filter(t => t && t.trim()).length;
  view().innerHTML = `<h1 class="page-title">More</h1><div class="list">
    <a href="#/journal"><span style="font-size:1.3rem">📓</span><div class="grow"><b>Notebook</b><small class="muted" style="display:block">${n} reflection${n === 1 ? '' : 's'} written</small></div>${chev}</a>
    <a href="#/glossary"><span style="font-size:1.3rem">📖</span><div class="grow"><b>Glossary</b><small class="muted" style="display:block">${INDEX.glossary.length} terms</small></div>${chev}</a>
    <a href="#/settings"><span style="font-size:1.3rem">⚙️</span><div class="grow"><b>Settings</b><small class="muted" style="display:block">Appearance, backup and reset</small></div>${chev}</a>
    <a href="#/about"><span style="font-size:1.3rem">🏛️</span><div class="grow"><b>About & install</b><small class="muted" style="display:block">How the course works; add to your home screen</small></div>${chev}</a>
  </div>`;
}

function viewJournal() {
  setChrome({ title: 'Notebook', back: true, tab: 'more' });
  const entries = Object.entries(store.get().journal).filter(([, t]) => t && t.trim()).map(([id, t]) => [INDEX.byId.get(id), id, t]).filter(([m]) => m);
  entries.sort((a, b) => (a[0].day ?? 1000) - (b[0].day ?? 1000));
  view().innerHTML = `<h1 class="page-title">Notebook</h1><p class="muted">Your reflections from each lesson's thinking exercise.</p>
    ${entries.length ? entries.map(([m, id, t]) => `<div class="card flat" style="margin-bottom:12px"><a class="eyebrow" style="text-decoration:none" href="#/lesson/${id}/reflect">${esc(label(m))} · ${esc(m.title)}</a><div class="prose" style="font-size:1rem;margin-top:8px">${md(t)}</div></div>`).join('')
      : '<div class="empty"><div class="big">📓</div><p>Nothing written yet. Each lesson has a Reflect step with a notebook.</p></div>'}`;
}

function viewSettings() {
  setChrome({ title: 'Settings', back: true, tab: 'more' });
  const s = store.settings();
  view().innerHTML = `<h1 class="page-title">Settings</h1>
    <h3 class="section-title">Appearance</h3>
    <div class="list">
      <div class="item"><div class="grow"><b>Theme</b></div><div class="seg" id="theme">${['auto', 'light', 'dark'].map(t => `<button data-v="${t}" class="${s.theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
      <div class="item"><div class="grow"><b>Text size</b></div><div class="seg" id="scale">${[[0.9, 'S'], [1, 'M'], [1.12, 'L'], [1.25, 'XL']].map(([v, l]) => `<button data-v="${v}" class="${s.textScale === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    </div>
    <h3 class="section-title">Read aloud</h3>
    <div class="list">
      <div class="item"><div class="grow"><b>Main reading</b><small>Recorded narrator (Lewis) or your device's voice</small></div><div class="seg" id="narrator">${[['recorded', 'Narrator'], ['device', 'Device']].map(([v, l]) => `<button data-v="${v}" class="${(s.narrator || 'recorded') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    </div>
    ${tts.supported ? `<div class="list" style="margin-top:10px">
      <div class="item"><div class="grow"><b>Voice</b><small>Uses your device's built-in voices</small></div><select id="voice" class="select"></select></div>
      <div class="item"><div class="grow"><b>Speed</b></div><div class="seg" id="rate">${[0.8, 1, 1.2, 1.4].map(v => `<button data-v="${v}" class="${(s.ttsRate || 1) === v ? 'on' : ''}">${v}×</button>`).join('')}</div></div>
    </div>
    <button class="btn block" style="margin-top:10px" id="testVoice">Play a sample</button>
    <p class="muted small">On iPhone you can download higher-quality voices in Settings → Accessibility → Spoken Content → Voices → English.</p>` : ''}
    <h3 class="section-title">Your progress</h3>
    <p class="muted small">Progress is saved privately on this device. Export a backup to move it to another phone or browser.</p>
    <div class="btn-row"><button class="btn" id="export">Export backup</button><button class="btn" id="import">Import backup</button></div>
    <input type="file" id="file" accept="application/json,.json" hidden>
    <button class="btn block danger" style="margin-top:12px" id="reset">Reset all progress</button>`;
  const seg = (id, key, parse) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    store.setSetting(key, parse(b.dataset.v)); applySettings();
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  seg('#theme', 'theme', String); seg('#scale', 'textScale', Number); seg('#narrator', 'narrator', String);
  if (tts.supported) {
    seg('#rate', 'ttsRate', Number);
    const fill = () => {
      const voices = tts.englishVoices();
      $('#voice').innerHTML = `<option value="">Automatic</option>` + voices.map(v => `<option value="${esc(v.voiceURI)}" ${s.ttsVoice === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    };
    fill(); tts.onVoicesChanged(() => { if ($('#voice')) fill(); });
    $('#voice').onchange = e => { store.setSetting('ttsVoice', e.target.value); applySettings(); };
    $('#testVoice').onclick = () => tts.speakSample('The unexamined life is not worth living. Welcome to Philosophy in 90 Days.');
  }
  $('#export').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `philosophy90-backup-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); applySettings(); toast('Progress restored'); } catch { toast('That file is not a valid backup'); }
  };
  $('#reset').onclick = () => { if (confirm('Erase all progress, flashcards and notebook entries? This cannot be undone.')) { store.reset(); toast('Progress reset'); } };
}

function viewAbout() {
  setChrome({ title: 'About', back: true, tab: 'more' });
  const words = INDEX.glossary.length;
  view().innerHTML = `<h1 class="page-title">About this course</h1>
    <div class="prose" style="font-size:1.05rem">
      <p><b>Philosophy in 90 Days</b> is a guided tour of the great conversation, from Thales in the 6th century BCE to debates about artificial intelligence today. It assumes no background at all.</p>
      <p>Each day takes about 30–60 minutes:</p>
      <ul><li><b>Read:</b> the ideas, the people and the arguments, in plain language.</li><li><b>Modern Lens:</b> how an old idea shows up in today's world.</li><li><b>Vocabulary:</b> ${words} key terms across the course, reviewed with spaced-repetition flashcards.</li><li><b>Reflect:</b> a thinking exercise with your own private notebook.</li><li><b>Quiz:</b> check your comprehension. Score ${pct(store.PASS)} to complete the day.</li><li><b>Go Deeper:</b> optional advanced material and real books to read next.</li></ul>
      <p>Review days consolidate each era. After the course, six <b>Deep Dive</b> tracks continue into logic, ethics, the mind, politics, world philosophy and the philosophy of science.</p>
    </div>
    <h3 class="section-title">Install on your phone</h3>
    <div class="card flat"><p style="margin-top:0"><b>iPhone / iPad (Safari):</b> tap the Share button, then <i>Add to Home Screen</i>.</p><p style="margin-bottom:0"><b>Android (Chrome):</b> tap the ⋮ menu, then <i>Install app</i> or <i>Add to Home screen</i>.</p></div>
    <p class="muted small" style="margin-top:16px">Once installed it works offline. Your progress stays on your device.</p>`;
}

/* ---------- Boot ---------- */
function applySettings() {
  const s = store.settings();
  if (s.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = s.theme;
  document.documentElement.style.setProperty('--text-scale', s.textScale || 1);
  tts.configure({ rate: s.ttsRate || 1, voice: s.ttsVoice || '' });
}

async function boot() {
  applySettings();
  let navs = 0;
  $('#backBtn').addEventListener('click', () => { if (navs > 0) history.back(); else location.hash = '#/'; });
  tts.setRateHandler(r => store.setSetting('ttsRate', r));
  // While listening, tap any paragraph to jump the reader there.
  view().addEventListener('click', e => {
    if (!tts.isActive() || e.target.closest('a, button, textarea, input, select')) return;
    tts.jumpTo(e.target);
  });
  window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });
  window.addEventListener('hashchange', () => { navs++; route(); });
  try { await loadIndex(); }
  catch { view().innerHTML = '<div class="empty"><div class="big">🏛️</div><p>Could not load the course. Check your connection and reload.</p></div>'; return; }
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
