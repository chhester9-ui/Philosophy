# Philosophy in 90 Days

A mobile app that teaches philosophy to complete beginners: a 90-day guided course from the first Greek philosophers (Thales, c. 585 BCE) to today's debates about mind, justice and artificial intelligence, plus six advanced **Deep Dive** tracks to go further.

It's an installable web app (PWA). Open it in your phone's browser and add it to your home screen. After that it works offline like a native app, and your progress stays on your device.

## What each day includes (30–60 minutes)

| Step | What you do |
|---|---|
| **Read** | 1,800–2,500 words of plain-language explanation: the thinkers, their world and their arguments, with learning objectives and key takeaways |
| **Modern Lens** | A specific comparison that ties the old idea to today, e.g. Plato's Cave and social media filter bubbles, or Stoicism and CBT |
| **Vocabulary** | 6–8 key terms with definitions and examples, plus a flashcard drill |
| **Reflect** | A guided thinking exercise with a private notebook |
| **Quiz** | 10 questions (15 on review days), each with an explanation. Score 70% to complete the day |
| **Go Deeper** | Optional advanced material, discussion questions and real books to read next |

There are also review days at the end of each era, a spaced-repetition flashcard deck that grows as you finish lessons, a mixed practice quiz drawn from the lessons you've finished, a searchable glossary, streaks, dark mode, adjustable text size, and backup export/import.

## Course map

1. **Beginnings** (Days 1–8): myth to reason, the Presocratics, the Sophists
2. **Socrates and Plato** (9–15)
3. **Aristotle** (16–22)
4. **Hellenistic and Roman** (23–29): Cynics, Epicureans, Stoics, Skeptics, Plotinus
5. **Medieval** (30–37): Augustine, Boethius, the Islamic Golden Age, Maimonides, Aquinas, Ockham
6. **Renaissance** (38–42): humanism, Machiavelli, Montaigne, Bacon, Hobbes
7. **Rationalists** (43–46): Descartes, Spinoza, Leibniz
8. **Empiricists** (47–51): Locke, Berkeley, Hume
9. **Enlightenment and Kant** (52–58)
10. **19th century** (59–68): Hegel, Schopenhauer, Mill, Marx, Kierkegaard, Nietzsche, the pragmatists
11. **Analytic tradition** (69–74): Frege, Russell, Wittgenstein, Popper, Kuhn, Quine
12. **Continental tradition** (75–81): Husserl, Heidegger, Sartre, Beauvoir, Camus, Arendt, Foucault
13. **Contemporary** (82–90): Rawls, Singer, philosophy of mind, care ethics, global philosophy, environment, AI, final synthesis

**Deep Dive tracks** (5 lessons each): Logic and Critical Thinking · Ethics and Metaethics · Mind, Self and Free Will · Political and Social Philosophy · Philosophy Beyond the West · Knowledge, Science and Reality.

The full syllabus is in [`content/syllabus.json`](content/syllabus.json).

## Get it on your phone

1. Publish the app with GitHub Pages: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds and deploys the app whenever `main` changes (you can also run it by hand from the **Actions** tab).
2. Open the Pages URL on your phone.
   - **iPhone (Safari):** Share → **Add to Home Screen**
   - **Android (Chrome):** ⋮ menu → **Install app**

The app is plain static files, so any static host (Netlify, Cloudflare Pages, etc.) also works. Run `node scripts/build.mjs`, then publish the `app/` folder.

## Run it locally

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
npm start           # builds the content bundle and serves http://localhost:8080
npm run validate    # checks every lesson file against the content rules
npm test            # validate + build + browser smoke test (needs Playwright)
```

## Project layout

```
content/
  syllabus.json        Course structure: units, days, tracks
  CONTENT_GUIDE.md     Writing rules and lesson JSON schema
  lessons/day-NN.json  The 90 daily lessons
  tracks/<id>-N.json   Deep Dive lessons
app/                   The mobile web app (HTML/CSS/JS, no framework)
  js/app.js            Screens and navigation
  js/store.js          On-device progress, streaks, spaced repetition
  js/md.js             Lesson text formatting
scripts/
  validate.mjs         Lesson validator
  build.mjs            Copies content into app/content, builds the index, glossary and offline cache
  serve.mjs            Local static server
  smoke-test.mjs       End-to-end browser test
  make-icons.mjs       Regenerates PNG icons from icons/icon.svg
```

## Editing or adding lessons

Lessons are plain JSON, so you can fix a sentence, add a quiz question or write a new Deep Dive without touching the app code. Follow `content/CONTENT_GUIDE.md`, then run `npm run validate`. To add a track, add it to `syllabus.json` and drop its lesson files in `content/tracks/`.
