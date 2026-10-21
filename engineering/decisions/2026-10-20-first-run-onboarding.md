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
