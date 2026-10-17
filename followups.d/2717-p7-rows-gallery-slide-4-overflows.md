---
origin: 2717
priority: P7
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md
---

# the rows gallery's fourth slide, a `stress-slide`, overflows its frame; decide whether the render tier should count stress slides

why now   — the render tier could not see it until 2026-10-17: a layout consumes its own class, so `rows` was credited zero slides (decision note section 13.8). Nightly run 118 lists `rows  overflow on 1 slide(s)`; `CONFORMANCE_RENDER=1 CONF_ONLY=rows node --test test/integration/components/component-conformance.test.js` reproduces it, and `.scratch/conformance-render/report.json` names slide 4.
where     — lib/components/layout/rows/rows.gallery.md line 60, marked `<!-- stress-slide -->`; the marker is read by lib/core/auto-split.js, lib/core/split-panels.js and lib/authoring/lint-core.js
done when — one of two outcomes is written down: the slide fits (the shared overflow probe reads `over: false`), or the harness skips or labels `stress-slide` slides on purpose because overflowing is what they test, with that rule in tools/conformance-render.js and the decision note; either way the nightly line for `rows` is explained
evidence  — the probe line from the CONF_ONLY=rows run before and after; for a fit, the rendered slide via SendUserFile
verify    — tier 0 gates, because it is one gallery slide or one harness rule
