---
origin: 2339
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2339
---

# Build LTT step 4: Vetrina's actions layer and the tour recorder

why now   — makes tours seekable (and so exportable to video), and removes the voiced
            word-cue drift by anchoring actions to words; blocked on P1.
where     — engineering/decisions/2026-09-24-lattice-timing-track.md §4.6, §4.7 and §8
            step 4; `docs/src/lib/vetrina/narrate.ts` (`Narrator.plan`, `findCueWord`),
            `docs/src/lib/vetrina/stage.ts` (`leadMs`), `docs/src/lib/vetrina-narration/`.
done when — Vetrina's boundary gate admits `@laticent/ltt`; actions are defined in `ltt`
            with `{cue, word, match}`; `validateLtt` fails when `match` no longer names the
            word; `Narrator.plan()` returns the core's cue and word shape; the recorder
            writes a seekable LTT carrying `viewport`, `motion` and `stagePace`.
evidence  — a recorded tour replayed from its LTT at 1440, 820 and 390 px via
            tools/screenshot.js, showing the click lands on its word at the recorded
            viewport and the lead is recomputed at the others.
verify    — tier 1 checker, because it changes a library's public port (`Narrator.plan`).
