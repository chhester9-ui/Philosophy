// Progress is stored on the device (localStorage). Nothing is sent anywhere.
const KEY = 'phil90:v1';
const PASS = 0.7; // quiz score needed to complete a lesson
const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // Leitner spaced-repetition intervals

const blank = () => ({
  completed: {},   // lessonId -> { date, score, best, attempts }
  journal: {},     // lessonId -> text
  steps: {},       // lessonId -> [visited step keys]
  cards: {},       // termKey -> { box, due }
  activity: [],    // ISO dates with any completed lesson
  settings: { theme: 'auto', textScale: 1 },
  startedAt: null,
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(fn => fn(state));
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const store = {
  PASS,
  get: () => state,
  onChange: fn => listeners.add(fn),
  isDone: id => !!state.completed[id],
  settings: () => state.settings,
  setSetting(k, v) { state.settings[k] = v; save(); },

  markStep(id, step) {
    const s = new Set(state.steps[id] || []);
    if (!s.has(step)) { s.add(step); state.steps[id] = [...s]; if (!state.startedAt) state.startedAt = today(); save(); }
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
    for (const v of vocab) {
      const k = termKey(v.term);
      if (!state.cards[k]) state.cards[k] = { box: 1, due: addDays(today(), 1) };
    }
    save();
    return { passed, firstPass: true };
  },

  saveJournal(id, text) { state.journal[id] = text; save(); },

  dueCards() { const t = today(); return Object.entries(state.cards).filter(([, c]) => c.due <= t).map(([k]) => k); },
  gradeCard(key, knewIt) {
    const c = state.cards[key] || { box: 1 };
    c.box = knewIt ? Math.min(c.box + 1, BOX_DAYS.length - 1) : 1;
    c.due = addDays(today(), knewIt ? BOX_DAYS[c.box] : 0);
    state.cards[key] = c; save();
  },

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
    state = { ...blank(), ...data }; save();
  },
  reset() { const settings = state.settings; state = blank(); state.settings = settings; save(); },
};

export const termKey = term => term.toLowerCase().replace(/\s+/g, ' ').trim();
