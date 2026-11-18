// "The Long Conversation": the optional game layer. Everything here is computed from progress
// the app already stores, so it can be switched off and back on without losing anything.
import { today, addDays } from './store.js';

export const RANKS = [
  ['Curious Mind', 0], ['Presocratic', 300], ['Gadfly', 800], ['Academic', 1500], ['Peripatetic', 2400],
  ['Stoic', 3500], ['Scholastic', 4800], ['Humanist', 6300], ['Rationalist', 8000], ['Empiricist', 10000],
  ['Critical Philosopher', 12500], ['Sage', 15500],
].map(([name, min]) => ({ name, min }));

const UNIT_MILESTONES = [
  'Survived the Presocratics', 'Left the Cave', 'The Golden Mean', 'Inner Citadel', 'Faith Seeking Understanding',
  'Born Again', 'Cogito', 'Blank Slate', 'Dare to Know', 'Beyond Good and Evil', 'Language Games',
  'Existence Precedes Essence', 'Behind the Veil',
];

const words = s => (s || '').split(/\s+/).filter(Boolean).length;
const isStudyDay = d => d && ((d.lessons || 0) >= 1 || (d.cards || 0) >= 10 || (d.steps || 0) >= 1 || (d.practice || 0) >= 1);

// Streak with automatic rest days: every 7 study days earns a rest day (max 3 held), which
// silently covers a missed day. A gap never produces a warning; the streak just restarts.
function streakInfo(days) {
  const dates = Object.keys(days).filter(d => isStudyDay(days[d])).sort();
  if (!dates.length) return { streak: 0, rest: 0, longest: 0, studied: 0, gapReturn: false };
  let streak = 0, rest = 0, earned = 0, longest = 0, studied = 0, gapReturn = false, gap = 0;
  const t = today();
  for (let d = dates[0]; d <= t; d = addDays(d, 1)) {
    if (isStudyDay(days[d])) {
      if (gap >= 7) gapReturn = true;
      gap = 0; streak++; studied++; earned++;
      if (earned === 7) { earned = 0; rest = Math.min(3, rest + 1); }
      longest = Math.max(longest, streak);
    } else if (d !== t) {
      gap++;
      if (rest > 0) rest--; else { streak = 0; earned = 0; }
    }
  }
  return { streak, rest, longest, studied, gapReturn };
}

export function computeGame(state, INDEX) {
  const done = state.completed || {};
  const ids = Object.keys(done);
  const isTrack = id => !id.startsWith('day-');
  let wisdom = 0;
  for (const id of ids) {
    const best = done[id].best ?? done[id].score ?? 0;
    wisdom += 100 + Math.round(best * 50) + (best >= 1 ? 25 : 0) + (isTrack(id) ? 50 : 0);
  }
  const reflections = Object.values(state.journal || {}).filter(t => words(t) >= 40).length;
  const mastered = Object.values(state.cards || {}).filter(c => c.box >= 4).length;
  const practice = (state.practice || []).length;
  wisdom += reflections * 20 + mastered * 5 + practice * 10;

  let r = 0; while (r + 1 < RANKS.length && wisdom >= RANKS[r + 1].min) r++;
  const rank = RANKS[r], nextRank = RANKS[r + 1] || null;

  const s = streakInfo(state.days || {});
  const longest = Math.max(s.longest, state.game?.longest || 0);
  const perfect = ids.filter(id => (done[id].best ?? 0) >= 1).length;
  const tracksDone = INDEX.tracks.filter(t => t.lessons.every(l => done[l.id])).length;

  const milestones = [
    { id: 'first', title: 'First Step', desc: 'Complete your first lesson', earned: ids.length >= 1 },
    ...INDEX.units.map((u, i) => ({ id: `unit-${u.id}`, title: UNIT_MILESTONES[i] || `Unit ${u.id}`, desc: `Complete Unit ${u.id}: ${u.title}`, earned: u.days.every(d => done[d.id]), unit: u.id })),
    { id: 'flawless', title: 'Flawless', desc: 'Score 100% on a quiz', earned: perfect >= 1 },
    { id: 'flawless5', title: 'Five Flawless', desc: 'Score 100% on five quizzes', earned: perfect >= 5 },
    { id: 'lexicon50', title: 'Lexicon', desc: 'Master 50 vocabulary cards', earned: mastered >= 50 },
    { id: 'lexicon200', title: 'Living Dictionary', desc: 'Master 200 vocabulary cards', earned: mastered >= 200 },
    { id: 'examined', title: 'Examined Life', desc: 'Write 10 reflections', earned: reflections >= 10 },
    { id: 'week', title: 'Week of Study', desc: 'Study 7 days in a row', earned: longest >= 7 },
    { id: 'month', title: 'Month of Study', desc: 'Study 30 days in a row', earned: longest >= 30 },
    { id: 'explorer', title: 'Explorer', desc: 'Complete a Deep Dive lesson', earned: ids.some(isTrack) },
    { id: 'deepdiver', title: 'Deep Diver', desc: 'Finish a whole Deep Dive track', earned: tracksDone >= 1 },
    { id: 'back', title: 'Back Again', desc: 'Return to studying after a week away', earned: s.gapReturn },
  ];

  const t = (state.days || {})[today()] || {};
  const goal = state.settings?.dailyGoal || 'off';
  const goalMet = goal === 'lesson' ? (t.lessons || 0) >= 1 : goal === 'light' ? ((t.cards || 0) >= 10 || (t.steps || 0) >= 1 || (t.lessons || 0) >= 1) : false;
  const goalProgress = goal === 'lesson' ? Math.min(1, t.lessons || 0) : goal === 'light' ? Math.min(1, Math.max((t.cards || 0) / 10, (t.steps || 0) >= 1 ? 1 : 0, t.lessons ? 1 : 0)) : 0;

  return { wisdom, rank, rankIndex: r, nextRank, milestones, streak: s.streak, restDays: s.rest, longest, goal, goalMet, goalProgress, mastered, reflections };
}

// Milestones earned but not yet celebrated.
export const newlyEarned = (g, seen) => g.milestones.filter(m => m.earned && !seen[m.id]);
