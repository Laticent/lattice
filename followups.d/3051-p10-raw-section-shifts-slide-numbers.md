---
origin: 3051
priority: P10
recorded: 2026-11-06
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §12
deferred: off-path — pre-existing; #3051 closed choosing a slide number, not inserting a slide
source: https://github.com/Laticent/lattice/pull/3051
---

# A raw `</section><section>` in author HTML adds a slide and shifts every later slide's number

why now   — the #3051 red-team pass: an html_block `</section><section>` produces a top-level section that the engine wraps in form chrome and `applyFormDefaultToDom` numbers, so each later slide's `data-lattice-slide` moves up by one. #3051's rename stops an author choosing a slide's number; it does not stop an author adding a slide this way.
where     — the engine's section split (lib/engine/structural-split.js `splitTopLevelSections`) and raw-HTML handling (lib/core/reserved-attrs.mjs is the neighbor; `refuse a raw </section>` was the alternative 2923-p8 named).
done when — author raw HTML cannot open or close a top-level section, and the cross-token repro yields the deck's own slide count.
evidence  — a unit arm with the repro; the split golden unchanged.
verify    — tier 1 checker; a shared kernel.
