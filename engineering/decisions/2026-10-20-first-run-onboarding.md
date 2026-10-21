---
status: shipped
summary: A first-time Studio visitor gets a narrated two-minute tour in a Gemini voice that leans left or right toward whatever the cursor points at, behind a start card that tests sound and ends on a fork into the lessons. Built on Vetrina; replaces driver.js on the Playground.
---

# First-run onboarding — a spoken tour that leans toward what it shows (2026-10-20)

**Builds on:** `2026-07-05-vetrina-walkthrough-library.md`, `2026-10-05-studio-lessons.md` §Voice,
`2026-07-12-suono-audio-library.md`.

## The ask

The first thing a visitor meets should be a paced, spoken walk through the important controls,
with the choice to go further at the end. It should tell them it is best with sound on and let
them test it. The audio should be stereo in the useful sense: the voice leans toward what the
cursor points at, without ever sitting in one ear.

## What we found

- The old tour engine is **driver.js**, not intro.js. `guided-tour.js` says it was picked over
  intro.js. Only the Playground still used it; the Studio already ran on Vetrina.
- The Studio's one tour (`first-look`) was silent and started only from a menu.
- Nothing in Suono, Vetrina or Cadenza panned. Suono wired `source → fade gain → destination`.
- Lessons already speak from clips recorded ahead of time (`tools/record-lesson-voice.mjs`), in
  Kokoro, with no key or model download for the reader.

## What shipped

| Piece | Where | What it does |
|---|---|---|
| Stereo placement | `suono/stage.ts` | `play(clip, {pan})` and `handle.setPan(pan, glideMs)` through a `StereoPannerNode`. An engine without one plays centered. A call tap gets the unpanned signal. |
| Voice follows the hand | `vetrina/storyboard.ts`, `stage.ts` (`panOf`), `narrate.ts` (`setPan`) | Before each spoken line the storyboard asks where the beat's `point` sits across the viewport (target center, -1…1) and hands it to the narrator. A beat with no target speaks from the center. |
| Lean strength | `lessons/lesson-voice.ts` | `clipNarrator` scales the pan by 0.5 (a lean you hear on headphones; never one ear). Lessons get the same lean. |
| The tour | `studio/tours/welcome.ts`, `lines.ts` | 15 spoken lines (plus the test sentence), about two minutes on a desktop and shorter on a phone, which has one pane at a time. It touches nothing the visitor owns: no new deck, no typing. Light/dark flips once and flips back. |
| The voice | `tools/record-lesson-voice.mjs` | Folder `tour`, recorded in Gemini `Schedar` through OpenRouter. Opt-in spend (`OPENROUTER_ALLOW_SPEND=1`), plan printed first, `--limit`. Sanctioned under HARD RULE #24. |
| Start card | `WelcomeCard.tsx`, `tour-voice.ts` | "Best with sound on." A Test button plays one sentence hard left, then hard right, so the visitor hears that sound works and what the stereo does. "Start without sound" runs the same tour on captions. |
| First-run trigger | `welcome-state.ts` | Opens once, on the production site only (`data-tours="on"`), never under test automation, never for a visitor who turned tours off. `?welcome=1` forces it anywhere. |
| The fork | `WelcomeCard.tsx` | When the tour finishes on its own: "Go further: the lessons" starts the first lesson the visitor has not done; "Start building" just closes. |

## Decisions the owner made

- **Voice: Gemini `Schedar`**, picked from nine featured voices. Lessons stay on Kokoro, so the tour
  and the lessons are two voices. Re-voicing the lessons is a follow-up, not part of this.
- **Length:** the owner picked "about three minutes, 8 to 10 beats". The tour has 15 spoken beats and runs
  about two minutes (126 s measured on a 1440 px desktop), because padding it to three would make it
  slower, not better. The card says two minutes.
- **Pan strength:** gentle, max about 0.5.
- **Scope:** Studio and Playground drop driver.js.

## Measured

Real Chromium at 1440×900 against the dev server, with the Web Audio graph instrumented:

- **Sound test:** one clip starts at pan -1 and `setTargetAtTime(1)` fires 2.8 s later.
- **Tour:** 15 clips played; each started at its own pan. Editor lines lean left (-0.27, -0.37,
  -0.32), the preview and rail lean right (+0.23, +0.27), Share leans furthest right (+0.40), and
  the opening and closing lines sit at 0.
- **Mode flourish:** `data-mode` went `light → dark → light` between 90 and 96 s.
- **Total:** 126 s from the click on Start to the end card.

## Not verified

Listening. No sound device exists here, so "the voice sounds right and the lean is pleasant" is
unverified by ear. The pan values above are what the audio graph received.

## Open

- Real-device pass on iOS Safari (audio unlock inside the Start click) and on headphones.
- Lessons are in Kokoro; the tour is in Gemini. Whether to re-voice them is the owner's call.

## The Playground

The Playground tour moved to Vetrina in the same change, and `driver.js` left the docs dependencies.

- `guided-tour.js` keeps what a tour needs that is not the tour: the Tour button, the first-visit
  timer, the global on/off and the production-only rule. It draws nothing now; it asks the page for
  the start card (`pg-tour-offer`). The island may not have hydrated when the timer fires, so the ask
  is also left on `window.__pgTourOffer` for the card to find when it mounts.
- `playground-tour.js` holds the 10 steps, spoken from `PLAYGROUND_LINES` (folder `playground-tour`,
  same Gemini voice). A step whose Explore/Edit mode differs from where the tour is gets a silent
  switch beat first, and a visitor who stops mid-tour is put back in the view they started in.
- `?tour=1` forces the offer on any host, as `?welcome=1` does in the Studio.
- **A latent bug fell out:** the old tour's "Try any palette" step pointed at `#palette`, which does
  not exist. driver.js dropped steps with no element, so it was skipped without a sound, and the
  reachability test exempted it as "outside the component". The step now points at
  `button[aria-label="Theme"]`.
- Measured at 1440×900 and 390×844 against the dev server: 10 clips played; pans -0.46 (mode toggle),
  -0.35 (picker), 0 (the walk bar, centered), -0.21, -0.27 (editor), +0.45 (Galleries), +0.37
  (Deck settings), +0.34 (Theme). About 95 seconds. The phone tour switched to the editor pane on its own.

## The course (added the same day, on the owner's review)

The owner tried the welcome tour and asked for four things, all shipped in the same PR.

**1. The layout is saved and restored.** Every tour now takes a snapshot of the screen (stop, open
panels, which pane is folded, the slide, quiet mode), resets to the layout it is written against
(its own stop, no panel or sheet open, both panes showing, the first slide), and puts the visitor's
back when it ends, however it ends: finished, Exit, or a click that takes over. `layout.snapshot /
reset / restore` live in `StudioShell.tsx` beside the setters they drive; `use-studio-demo.ts` calls
them around every run. The editor's own mode (Markdown or Compose) is deliberately not reset: every
tour works in either, and a tour that types follows whichever is mounted (the mobile Compose-tail
spec guards it). A tour that builds a deck (`first-look`) keeps the new deck and so does not restore the slide.

**2. One voice, everywhere.** The 94 lesson lines were re-recorded in `Schedar`, and the recorder no
longer has a Kokoro path. Lessons and tours share one folder format, and `TOUR_FOLDERS` in
`tours/lines.ts` is the one table the recorder and the tests walk.

**3. The course.** Welcome → Read → Craft → Present → Share, each ending on the go-further card for the
next, the last offering the lessons. `first-look` stands apart (it builds a deck) but is spoken too.
All six are in the Show me menu; Read and Craft need the desktop chrome and are hidden on a phone or tablet.

| Tour | Spoken lines | Measured on a 1440×900 desktop |
|---|---|---|
| Welcome | 15 | 121 s |
| Read | 8 | 76 s |
| Craft (every panel) | 11 | about 120 s |
| Present | 10 | 76 s |
| Share | 11 | 76 s |

Craft opens each panel by pressing the real bar button: Coach, Chat, Live, Library, Views, Slide and
Deck settings, Version history, Setup. Present opens the real overlay and walks its controls, and
Share opens the real sheet and points at each row, top to bottom, without pressing one.

**4. Pace.** A beat that opens something uses a word cue (`at`), so the cursor arrives and the click
lands on the word that names it; the panel opens as it is said instead of two seconds after. The
sound-test card is first-run only; a tour started from the menu or from "Go further" starts at once,
inside that click, so audio is unlocked.

**Why the start card may not show.** It opens by itself only for a first-time visitor on the
production site, once (`lattice-studio-welcomed`), and never on a PR preview, a dev server or under
test automation. `/studio/?welcome=1` forces it anywhere. Show me → Welcome tour runs the tour
without the card.

Measured pans (the voice follows the target): Craft's bar buttons -0.48, Present's top row +0.2…0.46,
Share's rows +0.35, Read's article and Edit buttons -0.36…-0.45.

## Not verified (additions)

- Listening, still.
- The phone versions of Present and Share are short (about 30 s and 77 s); Read and Craft are
  desktop-only by design.
- The mobile Compose-tail spec (`demo-mobile.spec.ts`) failed once in four runs under load, with the same
  code that passed the other three. It samples frames while typing, so it is timing-sensitive.
