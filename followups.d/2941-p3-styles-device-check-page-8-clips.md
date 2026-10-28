---
origin: 2941
priority: P3
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
source: https://github.com/Laticent/lattice/pull/2941
---

# examples/styles-device-check.md page 8 clips

why now   — the export sweep reports it as a regression against the saved baseline; the cause is not the panes footer (the panes fix did not clear it).
where     — `examples/styles-device-check.md` page 8.
done when — the page renders clean, or its clipping is recorded in the baseline with a reason.
evidence  — `node tools/check-overflow-corpus.js examples/styles-device-check.md` reports page 8.
verify    — the same command, and look at the slide.
