# Lesson Authoring Guide

Every lesson is one JSON file. Daily lessons: `content/lessons/day-NN.json` (two-digit, e.g. `day-07.json`).
Advanced track lessons: `content/tracks/<trackId>-<order>.json` (e.g. `logic-3.json`).
The topic list lives in `content/syllabus.json`. Run `node scripts/validate.mjs` after editing.

## Audience and voice
- A curious adult who is a **complete beginner**. No prior philosophy assumed.
- Warm, clear and vivid, like a great lecturer. Short paragraphs. Define every technical term the first time you use it.
- Use concrete examples and everyday analogies. Tell the human story (the life, the setting, the controversy).
- Be **historically accurate**. Use dates carefully ("c." when approximate). Don't invent anecdotes. Flag legends as legends.
- **Quotations:** use only famous, well-attested lines (and say where they come from). If you aren't sure of a wording, paraphrase without quotation marks.
- Be balanced: give the strongest objections and say where scholars disagree.
- Link back to earlier days ("Remember Heraclitus on Day 4?") and point ahead when useful.

## Time budget (30–60 minutes per lesson)
- Main reading (`hook` + `sections`): **1,800–2,500 words** (about 12–18 minutes of careful reading).
- Modern connection: 300–450 words.
- Thinking exercise: 10–15 minutes of reflection or writing.
- Vocabulary review + quiz: 10–15 minutes.
- Go Deeper: optional extra reading for the ambitious.
- Set `estimatedMinutes` between 30 and 60, honestly.

## Text formatting (inside any `body` string)
A small Markdown subset only:
- Paragraphs separated by a blank line (`\n\n`).
- `**bold**` for key terms on first use (bold the vocabulary terms), `*italic*` for titles and emphasis.
- Bullet lists: lines starting with `- `. Numbered lists: lines starting with `1. `, `2. `.
- Block quotes: lines starting with `> `.
- No headings inside bodies, no links, no HTML, no tables.

## Schema
```json
{
  "id": "day-04",                 // or "logic-3" for tracks
  "day": 4,                       // daily lessons only
  "track": "logic", "order": 3,   // track lessons only (instead of "day")
  "title": "Heraclitus: Flux and Logos",   // match the syllabus title
  "subtitle": "One short evocative line",
  "philosophers": ["Heraclitus"], // main thinkers covered (can be empty for thematic days)
  "era": "c. 535–475 BCE",        // or a date range / century
  "estimatedMinutes": 45,
  "objectives": ["By the end you will be able to ...", "..."],      // 3–5
  "hook": "One or two paragraphs that open with a puzzle, scene or question.",
  "sections": [ { "heading": "...", "body": "..." } ],             // 4–7 sections
  "keyQuote": { "text": "...", "source": "Heraclitus, Fragment B12" }, // optional; only if certain
  "modernConnection": { "title": "...", "body": "..." },          // relate the idea to today (tech, politics, psychology, science, everyday life)
  "vocabulary": [ { "term": "...", "definition": "...", "example": "a sentence using or illustrating the term" } ], // 6–8
  "thinkingExercise": { "title": "...", "prompt": "...", "steps": ["...", "..."] }, // 3–5 steps
  "summary": ["Key takeaway", "..."],                              // 4–6 bullets
  "quiz": [
    { "type": "mc", "question": "...", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "Why C is right (and why the others aren't)." },
    { "type": "tf", "question": "A statement...", "answer": false, "explanation": "..." }
  ],
  "goDeeper": {
    "body": "200–350 words taking the idea to a more advanced level (a scholarly debate, a technical refinement, a surprising connection).",
    "readings": [ { "title": "...", "author": "...", "note": "Why read it / which part" } ],   // 2–4, real books/texts only
    "questions": ["Open discussion question", "..."]                                        // 2–3
  }
}
```

## Quiz rules
- Regular lessons: **10 questions** (about 7 `mc` + 3 `tf`). Review days: **15 questions**, cumulative across the range reviewed. Track lessons: 8–10.
- `answer` for `mc` is the zero-based index of the correct option. **Vary the position of the correct answer** across questions (don't always use 0 or 1).
- Test understanding, not trivia: include application questions ("Which modern situation best illustrates...") and vocabulary questions, not only dates.
- Plausible distractors. No "all of the above". Every question has a 1–2 sentence explanation.

## Review days
Review days (titles starting "Review:") still follow the schema: sections recap and compare thinkers (e.g. "How they answered the same question"), the thinking exercise is a synthesis task, vocabulary revisits the 8 most important terms from the range, and the quiz is cumulative (15 questions).

## Modern connections
Every lesson needs one strong, specific bridge to the present: e.g. Heraclitus ↔ personal identity in a world of constant change and cells replacing themselves; Stoicism ↔ cognitive behavioral therapy; Plato's Cave ↔ social media filter bubbles; Hobbes ↔ failed states and online moderation. Make the comparison illuminating and honest about where it breaks down.
