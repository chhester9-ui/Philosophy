// Validates every lesson JSON file against the course schema.
// Usage: node scripts/validate.mjs [file ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const syllabus = JSON.parse(readFileSync(join(root, 'content/syllabus.json'), 'utf8'));
const dayTitles = new Map(syllabus.units.flatMap(u => u.days).map(d => [d.day, d.title]));
const trackTitles = new Map(syllabus.tracks.flatMap(t => t.lessons.map(l => [`${t.id}-${l.order}`, l.title])));

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const words = s => (s || '').split(/\s+/).filter(Boolean).length;

function validate(file) {
  const errs = [], warns = [];
  let L;
  try { L = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { errs: [`invalid JSON: ${e.message}`], warns }; }
  const id = basename(file, '.json');
  const isTrack = file.includes(`${'tracks'}`);
  if (L.id !== id) errs.push(`id "${L.id}" should be "${id}"`);
  if (isTrack) {
    if (!trackTitles.has(id)) errs.push('not in syllabus tracks');
    else if (L.title !== trackTitles.get(id)) warns.push(`title differs from syllabus: "${trackTitles.get(id)}"`);
    if (!isStr(L.track) || !Number.isInteger(L.order)) errs.push('track/order missing');
  } else {
    if (!Number.isInteger(L.day) || !dayTitles.has(L.day)) errs.push('day missing/invalid');
    else if (`day-${String(L.day).padStart(2, '0')}` !== id) errs.push('day does not match filename');
    else if (L.title !== dayTitles.get(L.day)) warns.push(`title differs from syllabus: "${dayTitles.get(L.day)}"`);
  }
  for (const k of ['title', 'subtitle', 'era', 'hook']) if (!isStr(L[k])) errs.push(`${k} missing`);
  if (!Array.isArray(L.philosophers)) errs.push('philosophers must be an array');
  if (!(L.estimatedMinutes >= 30 && L.estimatedMinutes <= 60)) errs.push('estimatedMinutes must be 30-60');
  if (!Array.isArray(L.objectives) || L.objectives.length < 3 || !L.objectives.every(isStr)) errs.push('objectives: need 3+ strings');
  if (!Array.isArray(L.sections) || L.sections.length < 4) errs.push('sections: need 4+');
  else L.sections.forEach((s, i) => { if (!isStr(s.heading) || !isStr(s.body)) errs.push(`section ${i} missing heading/body`); });
  const readWords = words(L.hook) + (L.sections || []).reduce((n, s) => n + words(s.body), 0);
  const minWords = isTrack ? 1300 : 1600;
  if (readWords < minWords) errs.push(`main reading only ${readWords} words (min ${minWords})`);
  if (L.keyQuote && (!isStr(L.keyQuote.text) || !isStr(L.keyQuote.source))) errs.push('keyQuote needs text+source');
  if (!L.modernConnection || !isStr(L.modernConnection.title) || words(L.modernConnection.body) < 200) errs.push('modernConnection missing or < 200 words');
  if (!Array.isArray(L.vocabulary) || L.vocabulary.length < 6) errs.push('vocabulary: need 6+');
  else L.vocabulary.forEach((v, i) => { if (!isStr(v.term) || !isStr(v.definition) || !isStr(v.example)) errs.push(`vocab ${i} incomplete`); });
  const te = L.thinkingExercise;
  if (!te || !isStr(te.title) || !isStr(te.prompt) || !Array.isArray(te.steps) || te.steps.length < 3) errs.push('thinkingExercise incomplete');
  if (!Array.isArray(L.summary) || L.summary.length < 4) errs.push('summary: need 4+');
  const isReview = /^Review:/.test(L.title || '');
  const minQ = isTrack ? 8 : isReview ? 15 : 10;
  if (!Array.isArray(L.quiz) || L.quiz.length < minQ) errs.push(`quiz: need ${minQ}+ questions`);
  else {
    const pos = new Set();
    L.quiz.forEach((q, i) => {
      if (!isStr(q.question) || !isStr(q.explanation)) errs.push(`quiz ${i} missing question/explanation`);
      if (q.type === 'mc') {
        if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(isStr)) errs.push(`quiz ${i} needs 4 options`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errs.push(`quiz ${i} bad answer index`);
        pos.add(q.answer);
      } else if (q.type === 'tf') {
        if (typeof q.answer !== 'boolean') errs.push(`quiz ${i} tf answer must be boolean`);
      } else errs.push(`quiz ${i} unknown type ${q.type}`);
    });
    if (pos.size < 3) warns.push('correct answers are not well distributed across positions');
  }
  const gd = L.goDeeper;
  if (!gd || words(gd.body) < 150 || !Array.isArray(gd.readings) || gd.readings.length < 2 || !Array.isArray(gd.questions) || gd.questions.length < 2) errs.push('goDeeper incomplete');
  else gd.readings.forEach((r, i) => { if (!isStr(r.title) || !isStr(r.author)) errs.push(`reading ${i} incomplete`); });
  const all = JSON.stringify(L);
  if (/<[a-z][^>]*>/i.test(all)) errs.push('contains HTML tags');
  return { errs, warns, readWords };
}

let files = process.argv.slice(2);
if (!files.length) {
  for (const dir of ['content/lessons', 'content/tracks']) {
    const p = join(root, dir);
    if (existsSync(p)) files.push(...readdirSync(p).filter(f => f.endsWith('.json')).sort().map(f => join(p, f)));
  }
}
let bad = 0;
for (const f of files) {
  const { errs, warns, readWords } = validate(f);
  const name = basename(f);
  if (errs.length) { bad++; console.log(`✗ ${name}\n  - ${errs.join('\n  - ')}`); }
  else console.log(`✓ ${name} (${readWords} words)`);
  for (const w of warns) console.log(`  ! ${w}`);
}
const expected = dayTitles.size + trackTitles.size;
console.log(`\n${files.length - bad}/${files.length} valid (course expects ${expected} lessons)`);
process.exit(bad ? 1 : 0);
