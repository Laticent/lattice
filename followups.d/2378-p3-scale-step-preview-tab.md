---
origin: 2378
priority: P3
recorded: 2026-09-25
---

# Show an author-mode marker on a slide STEP rendered smaller

why now   — STEP (lib/core/scale-fit.js) never clips, so the live preview shows no ring on a stepped slide; the only channels are the export's `↓ SCALE` line, `lint:deck`'s `capacity-scale` and the `data-lattice-scale-step` attribute. An author in the Studio cannot see that slide 4 renders at 1x in a scale-xl deck.
where     — lib/core/fit-berth.js (a new berth), lib/runtime/index.js `check()`, the emulator's embedded watcher, base.modifiers.css for the tab.
done when — at the `author` marker level a stepped slide shows a small tab naming the rung (e.g. "Scale 1.15x"), the `reader` and `off` levels show nothing, and both watchers fill it from one kernel.
evidence  — a Studio screenshot of a stepped slide with the tab, and one of the same slide at `reader` without it.
verify    — tier 2: real Studio (`npm run dev`) plus the unit test for the berth.
