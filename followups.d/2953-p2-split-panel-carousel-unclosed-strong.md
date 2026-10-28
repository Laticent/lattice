---
origin: 2953
priority: P2
recorded: 2026-10-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §4
---

# The split-panel carousel can emit an unclosed <strong> that swallows every later slide

why now   — found by the fit harness's checker: a split-panel point list whose item reads `- **6** again` is emitted at a non-wide box as `<span class="split-pt-t"><strong>6</span>`. Chromium then reparents every later section inside that `<strong>` (52 of 62 in the diagram gallery batch at story), so they render bold and the export's own `deckSlideSections` sees 10 slides instead of 62: its overflow report silently skips the rest. A real deck needs only an author's bold number followed by text to hit it.
where     — lib/core/carousel.js, the split-panel points path (around readPoints and the `split-pt-t` row builder, ~lines 150 and 240); the exact line is not pinned yet.
done when — a unit test feeds the points builder an item `<strong>6</strong> again` and the emitted HTML is balanced; `node tools/fit-harness.js --only diagram/diagram.gallery --sizes story --venues laptop` reports no rejected batch.
evidence  — the harness run before and after (the "rejected … broken markup" line gone), and the split golden (`npm run split:golden:check`) unchanged or re-blessed with the reason.
verify    — npm run build:check; node --test test/unit/core/carousel*.test.js
