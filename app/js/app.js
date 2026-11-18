import { store, termKey, today } from './store.js';
import { md, inline, esc } from './md.js';
import * as tts from './speech.js';
import * as tutor from './tutor.js';
import { computeGame, newlyEarned, RANKS } from './game.js';

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
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const shortEra = e => (e || '').replace(/\s*\(.*\)\s*$/, '');
const gameOn = () => store.settings().game !== false;
const game = () => computeGame(store.get(), INDEX);
// Record milestones as seen without celebrating (used when the game layer is off or on first load).
const markSeen = g => { const seen = { ...store.get().game.seen }; let ch = false; for (const m of newlyEarned(g, seen)) { seen[m.id] = today(); ch = true; } if (ch) store.setGame('seen', seen); if (g.longest > (store.get().game.longest || 0)) store.setGame('longest', g.longest); };
const icon = (name) => ({
  cards: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 3h11a3 3 0 0 1 3 3v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.3-.9.7-.9 1.3M12 16.3v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 19V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11h7M9 15h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  laurel: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 21.2C7.2 20 4.4 16.6 4.4 11.6c0-2.6.8-4.9 2.2-6.6M13 21.2c3.8-1.2 6.6-4.6 6.6-9.6 0-2.6-.8-4.9-2.2-6.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g fill="currentColor"><ellipse cx="5.4" cy="15.6" rx="1.25" ry="2.3" transform="rotate(-50 5.4 15.6)"/><ellipse cx="18.6" cy="15.6" rx="1.25" ry="2.3" transform="rotate(50 18.6 15.6)"/><ellipse cx="4.5" cy="12.2" rx="1.25" ry="2.3" transform="rotate(-25 4.5 12.2)"/><ellipse cx="19.5" cy="12.2" rx="1.25" ry="2.3" transform="rotate(25 19.5 12.2)"/><ellipse cx="4.6" cy="8.7" rx="1.25" ry="2.3" transform="rotate(0 4.6 8.7)"/><ellipse cx="19.4" cy="8.7" rx="1.25" ry="2.3" transform="rotate(0 19.4 8.7)"/><ellipse cx="5.8" cy="5.6" rx="1.25" ry="2.3" transform="rotate(25 5.8 5.6)"/><ellipse cx="18.2" cy="5.6" rx="1.25" ry="2.3" transform="rotate(-25 18.2 5.6)"/><ellipse cx="8.2" cy="18.4" rx="1.25" ry="2.3" transform="rotate(-70 8.2 18.4)"/><ellipse cx="15.8" cy="18.4" rx="1.25" ry="2.3" transform="rotate(70 15.8 18.4)"/></g></svg>',
  flame: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.3 2.3-5.2 3.6-7.4.3 1.6 1.2 2.6 2.1 3.1C11.4 7.2 12.7 4.6 15 3c-.2 2.6.9 4.4 2.2 6 1 1.3 1.3 2.6 1.3 4 0 4.6-2.7 8-6.5 8z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
})[name];
const tile = (name, cls = '') => `<span class="tile ${cls}">${icon(name)}</span>`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

let askContext = undefined; // lesson context for the tutor button, or null for general questions
function setChrome({ title = 'Philosophy in 90 Days', back = false, tab = null, immersive = false, ask = undefined } = {}) {
  askContext = ask;
  $('#askBtn').hidden = ask === undefined;
  $('#topbarSpacer').hidden = ask !== undefined;
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
  [/^ask$/, () => { viewMore(); tutor.open(null); history.replaceState(null, '', '#/more'); }],
  [/^journal$/, viewJournal],
  [/^settings$/, viewSettings],
  [/^settings\/tutor$/, viewTutorSettings],
  [/^journey$/, viewJourney],
  [/^about$/, viewAbout],
];

// iOS-style chrome: large titles collapse into the nav bar on scroll; screens slide in.
function afterRender() {
  document.body.classList.toggle('large-title', !!view().querySelector('.page-title'));
  updateTopbar();
  const v = view();
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
}
function updateTopbar() {
  const t = view().querySelector('.page-title');
  const threshold = t ? t.offsetTop + t.offsetHeight - 50 : 4;
  $('#topbar').classList.toggle('scrolled', window.scrollY > threshold);
  // Thin reading-progress line under the nav bar while reading a lesson.
  const prose = view().querySelector('article.prose');
  const bar = $('#readProgress');
  if (prose) {
    const r = prose.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / r.height));
    bar.hidden = false; bar.style.transform = `scaleX(${p})`;
  } else bar.hidden = true;
}

async function route() {
  const path = location.hash.replace(/^#\/?/, '');
  tts.stop();
  tutor.close();
  document.body.classList.remove('quiz-mode', 'fb-open');
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); afterRender(); }
      catch (e) { console.error(e); view().innerHTML = `<div class="empty"><div class="big">🏛️</div><p>${esc(e.message || 'Something went wrong.')}</p><a class="btn" href="#/course">Back to course</a></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

/* ---------- Today ---------- */
function viewToday() {
  setChrome({ title: 'Today', tab: 'today' });
  const n = nextDay();
  const done = doneCount();
  const total = INDEX.allDays.length;
  const due = store.dueCards().length;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const g = game();
  if (!gameOn()) markSeen(g);

  let hero;
  if (!n) {
    const allDone = done === total;
    hero = `<section class="hero">
      <div class="eyebrow">${allDone ? 'Course complete' : 'All caught up'}</div>
      <h2>${allDone ? 'You finished all 90 days.' : 'New lessons are on the way.'}</h2>
      <p>${allDone ? 'From Thales to today. Keep going with a Deep Dive.' : 'They will appear here when they are added.'}</p>
      <a class="btn block" href="#/advanced">Explore Deep Dives</a></section>`;
  } else {
    const started = store.stepsVisited(n.id).size > 0;
    hero = `<section class="hero">
      <div class="eyebrow">${store.doneToday() ? 'Up next' : "Today's lesson"} · Day ${n.day}</div>
      <h2>${esc(n.title)}</h2>
      <p class="hero-sub">${esc(n.subtitle || '')}</p>
      <div class="hero-meta">${n.minutes} min · Unit ${n.unit.id}: ${esc(n.unit.title.split(':')[0])}</div>
      <a class="btn block" href="#/lesson/${n.id}">${started ? 'Continue lesson' : 'Start lesson'}</a></section>`;
  }

  const doneNote = store.doneToday() && n ? `<div class="note good"><b>Today's lesson is done.</b> Rest and let it sink in, or keep going if you're curious.</div>` : '';
  const intro = gameOn() && !store.get().game.introDone && done >= 1
    ? `<div class="card intro-card"><div class="row"><span class="tile">${icon('laurel')}</span><div class="grow"><b>Track Wisdom &amp; milestones?</b><div class="muted small">Earn points, ranks and badges as you learn. Purely optional, and nothing is locked behind it.</div></div></div>
       <div class="btn-row" style="margin-top:14px"><button class="btn" data-intro="off">No thanks</button><button class="btn primary" data-intro="on">Keep it</button></div></div>` : '';
  const flash = due ? `<div class="list"><a href="#/practice/cards">${tile('cards')}<div class="grow"><b>${plural(due, 'flashcard')} ready</b></div><span class="trail">Review</span>${chev}</a></div>` : '';

  let strip;
  if (gameOn()) {
    const span = g.nextRank ? g.nextRank.min - g.rank.min : 1;
    const into = g.nextRank ? (g.wisdom - g.rank.min) / span : 1;
    const ring = g.goal !== 'off' ? `<svg class="goal-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--fill)" stroke-width="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--good)" stroke-width="3" stroke-linecap="round" stroke-dasharray="97.4" stroke-dashoffset="${97.4 * (1 - g.goalProgress)}" transform="rotate(-90 18 18)"/></svg>` : '';
    strip = `<a class="list game-strip" href="#/journey"><div class="item">
      <div class="grow"><div class="rank-name">${esc(g.rank.name)}</div>
        <div class="progress thin"><i style="width:${into * 100}%"></i></div>
        <small>${g.wisdom.toLocaleString()} wisdom${g.nextRank ? ` · ${(g.nextRank.min - g.wisdom).toLocaleString()} to ${esc(g.nextRank.name)}` : ''}</small></div>
      <div class="streak ${g.streak ? '' : 'zero'}">${ring}<span class="flame">${icon('flame')}</span><b>${g.streak}</b></div>${chev}</div></a>`;
  } else {
    strip = `<div class="list"><div class="item"><div class="grow"><b>Day ${Math.min(done + 1, total)} of ${total}</b><small>${plural(done, 'lesson')} done</small>
      <div class="progress thin" style="margin-top:8px"><i style="width:${(done / total) * 100}%"></i></div></div></div></div>`;
  }

  const showPlan = n && done < 3;
  view().innerHTML = `<h1 class="page-title">${greet}</h1>
    <div class="stack">
      ${intro}${doneNote}${hero}${flash}${strip}
      ${n ? `<details class="plan-box" ${showPlan ? 'open' : ''}><summary>${showPlan ? 'How each day works' : "What's in a lesson"}${chev}</summary><ul class="plan" id="plan"><li class="muted small">Loading…</li></ul>
        <p class="footnote" style="margin:8px 0 0">Pass the quiz (${pct(store.PASS)}+) to complete the day.</p></details>` : ''}
    </div>`;

  view().querySelectorAll('[data-intro]').forEach(b => b.onclick = () => {
    store.setGame('introDone', true);
    if (b.dataset.intro === 'off') { store.setSetting('game', false); toast('Game layer off. Turn it on any time in Settings.'); }
    viewToday(); afterRender();
  });
  if (n) getLesson(n.id).then(L => {
    const m = stepMinutes(L);
    const rows = [['Read', m.learn], ['Modern Lens', m.modern], ['Vocabulary', m.words], ['Reflect', m.reflect], ['Quiz', m.quiz], ['Go Deeper (optional)', m.deeper]];
    const plan = $('#plan');
    if (plan) plan.innerHTML = rows.map((r, i) => `<li><span class="num">${i < 5 ? i + 1 : '+'}</span><span class="grow">${r[0]}</span><span class="mins">${r[1]} min</span></li>`).join('');
  }).catch(() => {});
}

/* ---------- Journey (game layer) ---------- */
function viewJourney() {
  if (!gameOn()) { location.hash = '#/'; return; }
  setChrome({ title: 'Your Journey', back: true, tab: 'today' });
  const g = game();
  markSeen(g);
  const span = g.nextRank ? g.nextRank.min - g.rank.min : 1;
  const into = g.nextRank ? (g.wisdom - g.rank.min) / span : 1;
  const cur = nextDay()?.unit.id;
  const eras = ['c. 600–400 BCE', '470–347 BCE', '384–322 BCE', '300 BCE–270 CE', '354–1347', '1400–1650', '1596–1716', '1632–1776', '1689–1804', '1807–1900', '1879–1960', '1900–1990', '1970–today'];
  view().innerHTML = `<h1 class="page-title">Your Journey</h1>
    <section class="rank-card">
      <div class="laurel">${icon('laurel')}</div>
      <div class="eyebrow">Rank ${g.rankIndex + 1} of ${RANKS.length}</div>
      <h2>${esc(g.rank.name)}</h2>
      <div class="progress"><i style="width:${into * 100}%"></i></div>
      <p class="muted small">${g.wisdom.toLocaleString()} wisdom${g.nextRank ? ` · ${(g.nextRank.min - g.wisdom).toLocaleString()} more to become <b>${esc(g.nextRank.name)}</b>` : ' · the highest rank'}</p>
    </section>
    <div class="list stats-list">
      <div class="item"><div class="grow">Current streak</div><span class="trail">${plural(g.streak, 'day')}</span></div>
      <div class="item"><div class="grow">Longest streak</div><span class="trail">${plural(g.longest, 'day')}</span></div>
      <div class="item"><div class="grow">Rest days saved<small>Earned every 7 study days; they cover missed days automatically</small></div><span class="trail">${g.restDays}</span></div>
    </div>
    <h2 class="group-title">The Long Conversation</h2>
    <ol class="timeline">${INDEX.units.map((u, i) => {
      const d = u.days.filter(x => store.isDone(x.id)).length;
      const state = d === u.days.length ? 'done' : u.id === cur ? 'current' : 'future';
      return `<li class="${state}"><a href="#/course"><span class="node">${state === 'done' ? icon('laurel') : ''}</span><div class="grow"><small>${eras[i] || ''}</small><b>${esc(u.title)}</b><small>${d}/${u.days.length} days</small></div></a></li>`;
    }).join('')}</ol>
    <h2 class="group-title">Milestones <span class="muted small">${g.milestones.filter(m => m.earned).length} of ${g.milestones.length}</span></h2>
    <div class="medals">${g.milestones.map(m => `<div class="medal ${m.earned ? 'earned' : ''}" title="${esc(m.desc)}"><span class="disc">${icon('laurel')}</span><b>${esc(m.title)}</b><small>${esc(m.desc)}</small></div>`).join('')}</div>
    <p class="footnote">Wisdom comes from completing lessons (more for higher quiz scores), Deep Dives, reflections of 40+ words, mastered flashcards and practice quizzes. It never goes down. You can turn this off in Settings.</p>`;
}

/* ---------- Course ---------- */
function viewCourse() {
  setChrome({ title: 'Course', tab: 'course' });
  const n = nextDay();
  const openUnit = n ? n.unit.id : INDEX.units[0].id;
  const done = doneCount();
  const laurels = gameOn();
  view().innerHTML = `<h1 class="page-title">Course</h1>
    <div class="course-progress"><span>${done} of ${INDEX.allDays.length} days · Unit ${openUnit} of ${INDEX.units.length}</span><div class="progress thin"><i style="width:${(done / INDEX.allDays.length) * 100}%"></i></div></div>
    ${INDEX.units.map(u => {
      const d = u.days.filter(x => store.isDone(x.id)).length;
      const complete = d === u.days.length;
      return `<details class="unit" ${u.id === openUnit ? 'open' : ''}>
        <summary><span class="unit-num ${complete ? 'complete' : ''}">${complete && laurels ? icon('laurel') : u.id}</span><div class="grow"><h3>${esc(u.title)}</h3></div><span class="trail">${d}/${u.days.length}</span><span class="chev">${chev}</span></summary>
        <div class="unit-body">${u.days.map(x => lessonRow(x, n)).join('')}</div>
      </details>`;
    }).join('')}`;
}

function lessonRow(x, next) {
  const c = store.get().completed[x.id];
  const cls = ['lesson-row', c ? 'done' : '', next && next.id === x.id ? 'current' : '', x.available ? '' : 'unavailable'].join(' ');
  const badge = c ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : (x.day ?? x.order);
  const sub = x.review ? '<div class="s"><span class="pill review">Review</span></div>' : !x.available ? '<div class="s">Coming soon</div>' : '';
  const score = c && c.best < 1 ? `<span class="score">${pct(c.best)}</span>` : '';
  const inner = `<span class="badge">${badge}</span><div class="grow"><div class="t">${esc(x.title)}</div>${sub}</div>${score}`;
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
  setChrome({ title: label(meta), back: true, immersive: true, ask: { id, lesson: L, meta, label: label(meta) } });
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
  document.body.classList.toggle('quiz-mode', step === 'quiz');

  const tabs = step === 'quiz' ? '' : `<nav class="steps" aria-label="Lesson steps">${STEPS.map(s => {
    const tick = (s.key === 'quiz' ? done : visited.has(s.key) && s.key !== step) ? '<span class="tick">✓</span>' : '';
    return `<button data-step="${s.key}" class="${s.key === step ? 'active' : ''}">${tick}${s.label}</button>`;
  }).join('')}</nav>`;

  const listenable = (tts.supported || rec) && (step === 'learn' || step === 'modern');
  const listen = listenable
    ? `<button class="listen-btn" id="listen"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${rec ? `Listen to narration · ${Math.round(rec.duration / 60)} min` : step === 'learn' ? `Listen · ~${Math.round(mins.learn * 1.15)} min` : 'Listen'}</button>` : '';

  const metaLine = [`${L.estimatedMinutes} min`, shortEra(L.era), L.philosophers.slice(0, 2).join(', ')].filter(Boolean).join(' · ') + (done ? ' · <span class="done-mark">✓ Completed</span>' : '');
  const head = `<header class="lesson-head">
    <div class="eyebrow">${meta.track ? esc(meta.track.title) + ' · Lesson ' + meta.order : `Day ${meta.day} · ${esc(meta.unit.title.split(':')[0])}`}</div>
    <h2>${esc(L.title)}</h2>
    <p class="subtitle">${esc(L.subtitle)}</p>
    <div class="lesson-meta">${metaLine.replace(/&(?!lt;|gt;|amp;|quot;)/g, '&amp;')}</div>
    ${listen}
  </header>`;

  let body = '';
  if (step === 'learn') {
    const N = L.sections.length;
    body = `${head}
      <details class="objectives"><summary>What you'll learn · ${L.objectives.length}${chev}</summary><ul>${L.objectives.map(o => `<li>${inline(o)}</li>`).join('')}</ul></details>
      <article class="prose"><div class="hook">${md(L.hook)}</div>
      ${L.sections.map((s, i) => `<div class="part">Part ${i + 1} of ${N}</div><h3>${esc(s.heading)}</h3>${md(s.body)}${i === Math.floor(N / 2) - 1 && L.keyQuote ? quoteBlock(L.keyQuote) : ''}`).join('')}
      </article>
      <section class="takeaways"><h3>Key takeaways</h3><ul class="summary-list">${L.summary.map(s => `<li>${inline(s)}</li>`).join('')}</ul></section>`;
  } else if (step === 'modern') {
    body = `<header class="lesson-head"><div class="eyebrow modern">Modern Lens · ${mins.modern} min</div><h2>${esc(L.modernConnection.title)}</h2>${listen}</header>
      <article class="prose">${md(L.modernConnection.body)}</article>`;
  } else if (step === 'words') {
    body = `<header class="lesson-head"><div class="eyebrow">Vocabulary · ${L.vocabulary.length} terms</div><h2>Key words</h2><p class="footnote" style="margin:0">Tap a term to see an example. They join your flashcards when you pass the quiz.</p></header>
      <div class="list vocab-list">${L.vocabulary.map(v => `<details class="vocab"><summary><div class="grow"><dt>${esc(v.term)}</dt><dd>${inline(v.definition)}</dd></div>${chev}</summary><div class="ex">“${inline(v.example)}”</div></details>`).join('')}</div>
      <a class="btn block" style="margin-top:20px" href="#/practice/cards/${id}">Drill these as flashcards</a>`;
  } else if (step === 'reflect') {
    const te = L.thinkingExercise;
    body = `<header class="lesson-head"><div class="eyebrow">Reflect · about 10 min</div><h2>${esc(te.title)}</h2></header>
      <div class="prose">${md(te.prompt)}</div>
      <ol class="steps-list">${te.steps.map(s => `<li>${inline(s)}</li>`).join('')}</ol>
      <label class="group-label" for="journal">Your notebook</label>
      <textarea class="journal" id="journal" placeholder="Write your thoughts here. They're saved on this device automatically.">${esc(store.get().journal[id] || '')}</textarea>
      <div class="footnote" id="saved">&nbsp;</div>`;
  } else if (step === 'quiz') {
    body = `<div class="quiz-head"><div class="eyebrow">${esc(label(meta))} · Quiz</div><p class="footnote" style="margin:2px 0 0">${L.quiz.length} questions · ${pct(store.PASS)} to pass${done ? ` · best ${pct(store.get().completed[id].best)}` : ''}</p></div>
      <div id="quiz"></div>`;
  } else if (step === 'deeper') {
    const g = L.goDeeper;
    body = `<header class="lesson-head"><div class="eyebrow">Go Deeper · optional</div><h2>Beyond the essentials</h2></header>
      <article class="prose">${md(g.body)}</article>
      <h3 class="group-title">Discuss or journal</h3><ul class="summary-list">${g.questions.map(q => `<li>${inline(q)}</li>`).join('')}</ul>
      <h3 class="group-title">Further reading</h3><div class="list">${g.readings.map(r => `<div class="item"><div class="grow"><b>${inline(r.title)}</b><small>${esc(r.author)}${r.note ? ' — ' + inline(r.note) : ''}</small></div></div>`).join('')}</div>`;
  }

  const nav = `<div class="step-nav">${prev ? `<a class="btn ghost back-step" href="#/lesson/${id}/${prev.key}" aria-label="Back to ${prev.label}">←</a>` : ''}${next ? `<a class="btn primary" href="#/lesson/${id}/${next.key}">${next.label} →</a>` : `<a class="btn primary" href="${nextAfter(meta)}">${meta.track ? 'Back to track' : 'Done for today'}</a>`}</div>`;
  view().innerHTML = tabs + body + (step === 'quiz' ? '' : nav);

  view().querySelectorAll('.steps button').forEach(b => b.addEventListener('click', () => { location.hash = `#/lesson/${id}/${b.dataset.step}`; window.scrollTo(0, 0); }));
  const active = view().querySelector('.steps button.active');
  active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  window.scrollTo(0, 0);

  if (listen) {
    const play = () => {
      // Keep listening into the next step only if it can be read aloud; otherwise just go there.
      tts.setEndAction(next ? (next.key === 'modern'
        ? { label: `Listen: ${next.label}`, run: () => { autoplay = true; location.hash = `#/lesson/${id}/${next.key}`; } }
        : { label: next.key === 'quiz' ? 'Take the quiz' : `Go to ${next.label}`, run: () => { location.hash = `#/lesson/${id}/${next.key}`; } }) : null);
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
        const before = game();
        const r = store.recordQuiz(id, score, L.vocabulary);
        let extra = '';
        if (r.firstPass) {
          const after = game();
          if (gameOn()) extra = celebration(before, after, meta);
          else { markSeen(after); toast(`${label(meta)} complete. ${plural(L.vocabulary.length, 'word')} added to your flashcards.`); }
        }
        return { passed: r.passed, extra, actions: r.passed
          ? `<a class="btn primary" href="${nextAfter(meta)}">Done</a><a class="btn" href="#/lesson/${id}/deeper">Go Deeper</a>`
          : `<a class="btn primary" href="#/lesson/${id}/learn">Review the lesson</a>` };
      },
    });
  }
}

// Shown on the quiz results screen the first time a lesson is passed (game layer on).
function celebration(before, after, meta) {
  const gained = after.wisdom - before.wisdom;
  const fresh = newlyEarned(after, store.get().game.seen);
  markSeen(after);
  const unit = fresh.find(m => m.unit);
  const rankUp = after.rankIndex > before.rankIndex;
  const confetti = Array.from({ length: 24 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 60}ms;--c:${['var(--accent)', 'var(--accent-2)', 'var(--good)', '#e3b341'][i % 4]};--r:${(i * 53) % 360}deg"></i>`).join('');
  return `<div class="celebrate">
    <div class="confetti" aria-hidden="true">${confetti}</div>
    ${unit ? `<div class="unit-done"><span class="disc">${icon('laurel')}</span><div class="eyebrow">Unit ${unit.unit} complete</div><h3>${esc(unit.title)}</h3></div>` : ''}
    <div class="wisdom-gain">+<span data-count="${gained}">${gained}</span> wisdom</div>
    <div class="rank-line"><span>${esc(after.rank.name)}</span>${rankUp ? '<span class="pill good">New rank!</span>' : ''}</div>
    <div class="progress thin"><i style="width:${after.nextRank ? ((after.wisdom - after.rank.min) / (after.nextRank.min - after.rank.min)) * 100 : 100}%"></i></div>
    ${fresh.filter(m => !m.unit).map(m => `<span class="medal-chip">${icon('laurel')} ${esc(m.title)}</span>`).join('')}
  </div>`;
}

const nextAfter = meta => meta.track ? `#/advanced/${meta.track.id}` : '#/';

function quoteBlock(q) {
  return `<figure class="quote"><p>“${esc(q.text)}”</p><cite>— ${esc(q.source)}</cite></figure>`;
}

/* ---------- Quiz engine ---------- */
function runQuiz(root, questions, { onFinish }) {
  let i = 0, results = [];
  const letters = ['A', 'B', 'C', 'D'];
  const closeBar = () => { document.querySelector('.feedback-bar')?.remove(); document.body.classList.remove('fb-open'); };
  function render() {
    closeBar();
    const q = questions[i];
    const bar = `<div class="q-progress">${questions.map((_, k) => `<i class="${k < results.length ? (results[k] ? 'right' : 'wrong') : k === i ? 'now' : ''}"></i>`).join('')}</div>`;
    const opts = q.type === 'tf'
      ? [['True', true], ['False', false]].map(([t, v]) => `<button class="option" data-v="${v}"><span class="letter">${t[0]}</span><span>${t}</span></button>`).join('')
      : q.options.map((o, k) => `<button class="option" data-v="${k}"><span class="letter">${letters[k]}</span><span>${inline(o)}</span></button>`).join('');
    root.innerHTML = `${bar}<div class="q-count">Question ${i + 1} of ${questions.length}${q.source ? ' · ' + esc(q.source) : ''}</div>
      <p class="question">${inline(q.question)}</p><div class="options">${opts}</div>`;
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
    root.querySelectorAll('.q-progress i')[i].className = right ? 'right' : 'wrong';
    const last = i === questions.length - 1;
    const fb = document.createElement('div');
    fb.className = `feedback-bar ${right ? 'right' : 'wrong'}`;
    fb.setAttribute('role', 'status');
    fb.innerHTML = `<b>${right ? 'Correct' : 'Not quite'}</b><div class="fb-text">${inline(q.explanation)}</div><button class="fb-more" hidden>More</button>
      <button class="btn primary block" id="nextQ">${last ? 'See results' : 'Next question'}</button>`;
    root.appendChild(fb);
    document.body.classList.add('fb-open');
    const text = fb.querySelector('.fb-text'), more = fb.querySelector('.fb-more');
    if (text.scrollHeight > text.clientHeight + 2) { more.hidden = false; more.onclick = () => { text.classList.add('open'); more.hidden = true; }; }
    $('#nextQ', root).addEventListener('click', () => { if (last) finish(); else { i++; render(); window.scrollTo(0, 0); } });
  }
  function finish() {
    closeBar();
    const score = results.filter(Boolean).length / questions.length;
    const { passed, actions, extra = '' } = onFinish(score, results);
    const r = 54, c = 2 * Math.PI * r;
    const missed = questions.map((q, k) => [q, k]).filter(([, k]) => !results[k]);
    root.innerHTML = `<div class="result">
      <svg class="score-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--fill)" stroke-width="10"/>
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="${passed !== false ? 'var(--good)' : 'var(--accent)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - score)}" transform="rotate(-90 60 60)"/>
        <text x="60" y="68" text-anchor="middle" font-size="24" font-weight="700" fill="var(--ink)" font-family="-apple-system, system-ui, sans-serif">${pct(score)}</text></svg>
      <h3>${passed === null ? 'Practice complete' : passed ? 'Well reasoned!' : 'Almost there'}</h3>
      <p class="muted">${results.filter(Boolean).length} of ${questions.length} correct.${passed === false ? ` You need ${pct(store.PASS)} to complete the lesson. The explanations below are the best teacher.` : ''}</p>
      ${extra}
      <div class="btn-row result-actions">${actions || ''}<button class="btn ghost" id="retake">Retake quiz</button></div></div>
      ${missed.length ? `<details class="missed" ${passed === false ? 'open' : ''}><summary>Review what you missed · ${missed.length}${chev}</summary>${missed.map(([q]) => `<div class="missed-item"><p><b>${inline(q.question)}</b></p><p class="small" style="color:var(--good)"><b>Answer:</b> ${q.type === 'tf' ? (q.answer ? 'True' : 'False') : inline(q.options[q.answer])}</p><p class="small muted">${inline(q.explanation)}</p></div>`).join('')}</details>` : ''}`;
    $('#retake', root).addEventListener('click', () => { i = 0; results = []; render(); window.scrollTo(0, 0); });
    const n = root.querySelector('[data-count]');
    if (n && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const to = Number(n.dataset.count), t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 600); n.textContent = Math.round(to * k); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
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
  view().innerHTML = `<h1 class="page-title">Practice</h1>
    <div class="list">
      <a href="#/practice/cards">${tile('cards')}<div class="grow"><b>Flashcards</b><small>${deck ? `${plural(deck, 'word')} in your deck` : 'Finish a lesson to start your deck'}</small></div><span class="trail ${due ? 'hot' : ''}">${due ? `${due} due` : ''}</span>${chev}</a>
      <a href="#/practice/quiz">${tile('quiz')}<div class="grow"><b>Mixed review</b><small>${completed ? `From ${plural(completed, 'completed lesson')}` : 'Unlocks after your first lesson'}</small></div><span class="trail">10 Qs</span>${chev}</a>
      <a href="#/glossary">${tile('book')}<div class="grow"><b>Glossary</b><small>Every key term, searchable</small></div><span class="trail">${INDEX.glossary.length}</span>${chev}</a>
    </div>
    <p class="footnote">Short, regular review is how ideas stick. Flashcards come back at growing intervals: 1, 3, 7, 14 and 30 days.</p>`;
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
  view().innerHTML = `<div class="quiz-head"><div class="eyebrow">Mixed review</div><p class="footnote" style="margin:2px 0 0">${qs.length} questions from your completed lessons</p></div><div id="quiz"></div>`;
  runQuiz($('#quiz'), qs, { onFinish: score => { store.logPractice(score, qs.length); return { passed: null, actions: '<a class="btn primary" href="#/practice">Done</a>' }; } });
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
  const dc = doneCount();
  const tracks = [...INDEX.tracks].sort((a, b) => (dc >= b.recommendedAfterDay) - (dc >= a.recommendedAfterDay) || a.recommendedAfterDay - b.recommendedAfterDay);
  view().innerHTML = `<h1 class="page-title">Deep Dives</h1>
    <p class="lede">Five-lesson tracks that go beyond the course. Start any time.</p>
    <div class="stack">${tracks.map(t => {
      const d = t.lessons.filter(l => store.isDone(l.id)).length;
      const ready = dc >= t.recommendedAfterDay;
      return `<a class="track-card" href="#/advanced/${t.id}"><div class="row"><div class="grow"><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p></div>${chev}</div>
        ${d ? `<div class="row" style="margin-top:12px"><div class="progress thin grow"><i style="width:${(d / t.lessons.length) * 100}%"></i></div><span class="trail">${d}/${t.lessons.length}</span></div>`
          : `<div class="track-tag ${ready ? 'ready' : ''}">${ready ? 'Ready for you' : `Best after Day ${t.recommendedAfterDay}`} · 5 lessons</div>`}</a>`;
    }).join('')}</div>`;
}

function viewTrack(trackId) {
  const t = INDEX.tracks.find(x => x.id === trackId);
  if (!t) throw new Error('Track not found');
  setChrome({ title: t.title, back: true, tab: 'advanced' });
  const next = t.lessons.find(l => l.available && !store.isDone(l.id));
  view().innerHTML = `<h1 class="page-title">${esc(t.title)}</h1>
    <p class="lede">${esc(t.description)} Best after Day ${t.recommendedAfterDay}.</p>
    <div class="unit-body solo">${t.lessons.map(l => lessonRow(l, next)).join('')}</div>`;
}

/* ---------- More ---------- */
function viewMore() {
  setChrome({ title: 'More', tab: 'more' });
  const n = Object.values(store.get().journal).filter(t => t && t.trim()).length;
  const g = gameOn() ? game() : null;
  view().innerHTML = `<h1 class="page-title">More</h1>
    ${g ? `<div class="list"><a href="#/journey">${tile('laurel', 'gold')}<div class="grow"><b>Your Journey</b></div><span class="trail">${esc(g.rank.name)}</span>${chev}</a></div>` : ''}
    <div class="list">
      <a href="#/ask">${tile('chat')}<div class="grow"><b>Ask the tutor</b></div>${chev}</a>
      <a href="#/journal">${tile('note')}<div class="grow"><b>Notebook</b></div><span class="trail">${n || ''}</span>${chev}</a>
      <a href="#/glossary">${tile('book')}<div class="grow"><b>Glossary</b></div><span class="trail">${INDEX.glossary.length}</span>${chev}</a>
    </div>
    <div class="list">
      <a href="#/settings">${tile('gear', 'gray')}<div class="grow"><b>Settings</b></div>${chev}</a>
      <a href="#/about">${tile('info', 'gray')}<div class="grow"><b>About &amp; install</b></div>${chev}</a>
    </div>`;
}

function viewJournal() {
  setChrome({ title: 'Notebook', back: true, tab: 'more' });
  const entries = Object.entries(store.get().journal).filter(([, t]) => t && t.trim()).map(([id, t]) => [INDEX.byId.get(id), id, t]).filter(([m]) => m);
  entries.sort((a, b) => (a[0].day ?? 1000) - (b[0].day ?? 1000));
  view().innerHTML = `<h1 class="page-title">Notebook</h1><p class="lede">Your reflections from each lesson.</p>
    ${entries.length ? `<div class="stack">${entries.map(([m, id, t]) => `<a class="note-card" href="#/lesson/${id}/reflect"><div class="eyebrow">${esc(label(m))} · ${esc(m.title)}</div><div class="prose">${md(t)}</div></a>`).join('')}</div>`
      : '<div class="empty"><p>Nothing written yet. Each lesson has a Reflect step with a notebook.</p></div>'}`;
}

const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;

function viewSettings() {
  setChrome({ title: 'Settings', back: true, tab: 'more' });
  const s = store.settings();
  const segHtml = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  view().innerHTML = `<h1 class="page-title">Settings</h1>
    <h2 class="group-label">Motivation</h2>
    <div class="list">
      <div class="item"><div class="grow"><b>Wisdom &amp; milestones</b></div>${sw('gameToggle', s.game !== false)}</div>
      ${s.game !== false ? `<div class="item"><div class="grow"><b>Daily goal</b></div>${segHtml('goal', [['off', 'Off'], ['light', 'Light'], ['lesson', 'Lesson']], s.dailyGoal || 'off')}</div>` : ''}
    </div>
    <p class="footnote">Points, ranks, milestones and streaks are optional extras. Turning them off hides them everywhere; nothing in the course depends on them. Light goal: one lesson step or 10 flashcards.</p>
    <h2 class="group-label">Appearance</h2>
    <div class="list">
      <div class="item"><div class="grow"><b>Theme</b></div>${segHtml('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}</div>
      <div class="item"><div class="grow"><b>Text size</b></div>${segHtml('scale', [[0.9, 'S'], [1, 'M'], [1.12, 'L'], [1.25, 'XL']], s.textScale)}</div>
    </div>
    <h2 class="group-label">Read aloud</h2>
    <div class="list">
      <div class="item"><div class="grow"><b>Main reading</b></div>${segHtml('narrator', [['recorded', 'Narrator'], ['device', 'Device']], s.narrator || 'recorded')}</div>
      <div class="item"><div class="grow"><b>Speed</b></div>${segHtml('rate', [[0.8, '0.8'], [1, '1'], [1.1, '1.1'], [1.2, '1.2'], [1.4, '1.4']], s.ttsRate || 1)}</div>
      ${tts.supported ? `<div class="item"><div class="grow"><b>Device voice</b></div><select id="voice" class="select"></select></div>
      <a href="#" id="testVoice"><div class="grow accent">Play a sample</div></a>` : ''}
    </div>
    <p class="footnote">"Narrator" plays the recorded voice (Lewis) where available. For better device voices on iPhone: Settings → Accessibility → Spoken Content → Voices → English.</p>
    <h2 class="group-label">Philosophy tutor</h2>
    <div class="list"><a href="#/settings/tutor"><div class="grow"><b>Gemini API key</b></div><span class="trail">${s.geminiKey ? 'Saved' : 'Not set'}</span>${chev}</a></div>
    <h2 class="group-label">Your progress</h2>
    <div class="list">
      <a href="#" id="export"><div class="grow accent">Export backup</div>${icon('share')}</a>
      <a href="#" id="import"><div class="grow accent">Import backup</div></a>
    </div>
    <p class="footnote">Progress is saved privately on this device. Export a backup to move it to another phone or browser.</p>
    <div class="list" style="margin-top:28px"><a href="#" id="reset"><div class="grow danger-text">Reset all progress</div></a></div>
    <input type="file" id="file" accept="application/json,.json" hidden>`;
  const seg = (id, key, parse) => $(id)?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    store.setSetting(key, parse(b.dataset.v)); applySettings();
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  seg('#theme', 'theme', String); seg('#scale', 'textScale', Number); seg('#narrator', 'narrator', String); seg('#rate', 'ttsRate', Number); seg('#goal', 'dailyGoal', String);
  $('#gameToggle').onchange = e => {
    store.setSetting('game', e.target.checked); store.setGame('introDone', true);
    if (!e.target.checked) markSeen(game());
    const y = window.scrollY; viewSettings(); afterRender(); window.scrollTo(0, y);
  };
  if (tts.supported) {
    const fill = () => {
      const voices = tts.englishVoices();
      $('#voice').innerHTML = `<option value="">Automatic</option>` + voices.map(v => `<option value="${esc(v.voiceURI)}" ${s.ttsVoice === v.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    };
    fill(); tts.onVoicesChanged(() => { if ($('#voice')) fill(); });
    $('#voice').onchange = e => { store.setSetting('ttsVoice', e.target.value); applySettings(); };
    $('#testVoice').onclick = e => { e.preventDefault(); tts.speakSample('The unexamined life is not worth living. Welcome to Philosophy in 90 Days.'); };
  }
  $('#export').onclick = e => {
    e.preventDefault();
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `philosophy90-backup-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import').onclick = e => { e.preventDefault(); $('#file').click(); };
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); applySettings(); toast('Progress restored'); } catch { toast('That file is not a valid backup'); }
  };
  $('#reset').onclick = e => { e.preventDefault(); if (confirm('Erase all progress, flashcards and notebook entries? This cannot be undone.')) { store.reset(); toast('Progress reset'); } };
}

function viewTutorSettings() {
  setChrome({ title: 'Tutor', back: true, tab: 'more' });
  const s = store.settings();
  view().innerHTML = `<h1 class="page-title">Tutor</h1>
    <p class="lede">The tutor (the button at the top right of every lesson) uses Google's Gemini AI with your own free API key.</p>
    <div class="list"><div class="item"><input class="search" id="gkey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Gemini API key" value="${esc(s.geminiKey || '')}"></div>
      <a href="#" id="gsave"><div class="grow accent">Save &amp; test key</div></a>
      ${s.geminiKey ? '<a href="#" id="gremove"><div class="grow danger-text">Remove key</div></a>' : ''}</div>
    <p class="footnote" id="gstatus">${s.geminiKey ? `Key saved${s.geminiModel ? ` · model ${esc(s.geminiModel)}` : ''}` : 'No key yet.'}</p>
    <h2 class="group-label">Get a free key</h2>
    <div class="list"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener"><div class="grow accent">aistudio.google.com/apikey</div>${chev}</a></div>
    <p class="footnote">Sign in with a Google account and tap Create API key. The key is stored only on this device, and questions go directly to Google. On the free tier, Google may use conversations to improve its products, so don't share anything private.</p>`;
  $('#gsave').onclick = async e => {
    e.preventDefault();
    const key = $('#gkey').value.trim();
    if (!key) { $('#gstatus').textContent = 'Paste a key first.'; return; }
    store.setSetting('geminiKey', key); store.setSetting('geminiModel', '');
    $('#gstatus').textContent = 'Testing…';
    try {
      const r = await tutor.testKey(key);
      $('#gstatus').textContent = r.ok ? `✓ Key works · model ${store.settings().geminiModel}` : `✗ Google rejected the key (${r.status})${r.message ? ': ' + r.message : ''}`;
    } catch { $('#gstatus').textContent = "Saved, but couldn't reach Google to test it (are you offline?)."; }
  };
  if ($('#gremove')) $('#gremove').onclick = e => { e.preventDefault(); store.setSetting('geminiKey', ''); store.setSetting('geminiModel', ''); viewTutorSettings(); toast('Key removed'); };
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
  $('#askBtn').addEventListener('click', () => {
    // If the learner has highlighted some lesson text, start the question with it.
    const sel = (window.getSelection()?.toString() || '').trim().slice(0, 600);
    tutor.open(askContext, sel ? `About this passage: "${sel}"\n\n` : '');
  });
  let navs = 0;
  $('#backBtn').addEventListener('click', () => { if (navs > 0) history.back(); else location.hash = '#/'; });
  tts.setRateHandler(r => store.setSetting('ttsRate', r));
  // While listening, tap any paragraph to jump the reader there.
  view().addEventListener('click', e => {
    if (!tts.isActive() || e.target.closest('a, button, textarea, input, select')) return;
    tts.jumpTo(e.target);
  });
  window.addEventListener('scroll', updateTopbar, { passive: true });
  window.addEventListener('hashchange', () => { navs++; route(); });
  try { await loadIndex(); tutor.init({ store, index: INDEX }); }
  catch { view().innerHTML = '<div class="empty"><div class="big">🏛️</div><p>Could not load the course. Check your connection and reload.</p></div>'; return; }
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
