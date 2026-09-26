---
origin: 2378
priority: P3
recorded: 2026-09-25
---

# Show an author-mode marker on the slides holding a scaled deck below its requested size

why now   — STEP and LEVEL (lib/core/scale-fit.js) never clip, so the live preview shows no ring when a deck renders below its requested scale; the only channels are the export's `↓ SCALE` line, `lint:deck`'s `capacity-scale` and the `data-lattice-scale-step` / `data-lattice-scale-fit` attributes. An author in the Studio cannot see that slide 4 is what holds a `venue: conference` deck at 1x (amended 2026-09-26: the whole deck now renders at one size, so the marker belongs on the binding slides, the ones carrying `data-lattice-scale-fit`).
where     — lib/core/fit-berth.js (a new berth), lib/runtime/index.js `check()`, the emulator's embedded watcher, base.modifiers.css for the tab.
done when — at the `author` marker level a binding slide shows a small tab naming the rung it fits (e.g. "Holds the deck at 1.15x"), the `reader` and `off` levels show nothing, and both watchers fill it from one kernel.
evidence  — a Studio screenshot of a stepped slide with the tab, and one of the same slide at `reader` without it.
verify    — tier 2: real Studio (`npm run dev`) plus the unit test for the berth.
