---
origin: 2685
priority: P3
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/decisions/2026-07-05-specimen-book-playground.md §4a
deferred: off-path — #2685 moved the curated decks to on-demand fetch; the label comes from loadGalleries, which it did not change
source: https://github.com/Laticent/lattice/pull/2685#issuecomment-6167335489
---

# The Galleries sheet counts a curated deck's slides by its `---` lines, so Jargon reads 60 and renders 58

why now   — the sheet's "N slides" label for the 16 curated decks comes from `slideCount` in
            `docs/src/playground/galleries.mjs`, which counts `---` lines. The example decks (385 today)
            already use the engine's count (`sync-playground-assets.mjs` passes an
            `engine.render` section count to `loadExampleDecks`). Re-measured on `84bb080`:
            15 of 16 curated labels match the engine, and `jargon` reads 60 against 58 rendered.
where     — `docs/scripts/sync-playground-assets.mjs` (stage the curated counts from the
            engine, as it does for `exampleDecks`); `docs/src/pages/playground.astro`, which
            reads `slides` from `loadGalleries(repoRoot)` today.
done when — every curated deck's label equals its rendered section count, Jargon included,
            and a test pins the two counts together for all 16 decks.
evidence  — the sheet's label beside the "Rendered N slides." status line for all 16 decks,
            before and after.
verify    — tier 0 gates, plus `tools/screenshot.js` of the sheet at 1440, 820 and 390 px.
