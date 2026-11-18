// Progress is stored on the device (localStorage). Nothing is sent anywhere.
const KEY = 'phil90:v1';
const PASS = 0.7; // quiz score needed to complete a lesson
const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // Leitner spaced-repetition intervals

const blank = () => ({
  completed: {},   // lessonId -> { date, score, best, attempts }
  journal: {},     // lessonId -> text
  steps: {},       // lessonId -> [visited step keys]
  cards: {},       // termKey -> { box, due }
  activity: [],    // dates with a completed lesson
  days: {},        // 'YYYY-MM-DD' -> { steps, cards, lessons }  (any study activity)
  practice: [],    // { date, score, n } mixed-review sessions
  chats: {},       // lessonId (or 'general') -> [{ role: 'user'|'model', text }]
  game: { seen: {}, introDone: false, longest: 0 }, // optional game layer bookkeeping
  settings: { theme: 'auto', textScale: 1, game: true, dailyGoal: 'off' },
  startedAt: null,
});

let state = load();
const listeners = new Set();

function migrate(s) {
  const b = blank();
  s.settings = { ...b.settings, ...(s.settings || {}) };
  s.game = { ...b.game, ...(s.game || {}) };
  s.days = s.days || {};
  if (!Object.keys(s.days).length) for (const d of s.activity || []) s.days[d] = { lessons: 1 };
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...blank(), ...JSON.parse(raw) });
  } catch { /* storage unavailable */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(fn => fn(state));
}

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => fmt(new Date());
// Local-time date arithmetic (toISOString would shift the date in far-east time zones).
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return fmt(d); };

function bump(kind, n = 1) {
  const t = today();
  const d = state.days[t] || (state.days[t] = {});
  d[kind] = (d[kind] || 0) + n;
}

export const store = {
  PASS,
  get: () => state,
  onChange: fn => listeners.add(fn),
  isDone: id => !!state.completed[id],
  settings: () => state.settings,
  setSetting(k, v) { state.settings[k] = v; save(); },
  setGame(k, v) { state.game[k] = v; save(); },

  markStep(id, step) {
    const s = new Set(state.steps[id] || []);
    if (!s.has(step)) { s.add(step); state.steps[id] = [...s]; if (!state.startedAt) state.startedAt = today(); bump('steps'); save(); }
  },
  stepsVisited: id => new Set(state.steps[id] || []),

  recordQuiz(id, score, vocab = []) {
    const prev = state.completed[id];
    const passed = score >= PASS;
    if (prev) {
      prev.best = Math.max(prev.best, score); prev.attempts = (prev.attempts || 1) + 1; save();
      return { passed, firstPass: false };
    }
    if (!passed) { state.quizFails = { ...(state.quizFails || {}), [id]: ((state.quizFails || {})[id] || 0) + 1 }; save(); return { passed, firstPass: false }; }
    state.completed[id] = { date: today(), score, best: score, attempts: 1 + ((state.quizFails || {})[id] || 0) };
    if (!state.activity.includes(today())) state.activity.push(today());
    bump('lessons');
    for (const v of vocab) {
      const k = termKey(v.term);
      if (!state.cards[k]) state.cards[k] = { box: 1, due: addDays(today(), 1) };
    }
    save();
    return { passed, firstPass: true };
  },

  logPractice(score, n) { state.practice = [...(state.practice || []), { date: today(), score, n }].slice(-200); bump('practice'); save(); },

  saveJournal(id, text) { state.journal[id] = text; save(); },

  getChat: id => (state.chats || {})[id] || [],
  saveChat(id, msgs) { state.chats = { ...(state.chats || {}), [id]: msgs.slice(-60) }; save(); },

  dueCards() { const t = today(); return Object.entries(state.cards).filter(([, c]) => c.due <= t).map(([k]) => k); },
  gradeCard(key, knewIt) {
    const c = state.cards[key] || { box: 1 };
    c.box = knewIt ? Math.min(c.box + 1, BOX_DAYS.length - 1) : 1;
    c.due = addDays(today(), knewIt ? BOX_DAYS[c.box] : 0);
    state.cards[key] = c; bump('cards'); save();
  },

  // Plain streak: consecutive days with a completed lesson (used when the game layer is off).
  streak() {
    const days = new Set(state.activity);
    let n = 0, d = today();
    if (!days.has(d)) d = addDays(d, -1); // today not done yet: streak still alive from yesterday
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  },
  doneToday: () => state.activity.includes(today()),

  exportJSON: () => JSON.stringify(state, null, 2),
  importJSON(text) {
    const data = JSON.parse(text);
    if (typeof data !== 'object' || !data.completed) throw new Error('Not a progress file');
    state = migrate({ ...blank(), ...data }); save();
  },
  reset() { const settings = state.settings; state = blank(); state.settings = settings; save(); },
};

export const termKey = term => term.toLowerCase().replace(/\s+/g, ' ').trim();
