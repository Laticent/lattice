---
origin: 2831
recorded: 2026-10-20
area: engine
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2831
priority: P5
severity: low
---

# A pill inside a verdict-grid or pricing badge renders as literal text

An author writing "[x] Signal-intake {LIVE, c3} connectors" in a verdict-grid or pricing item gets the braces printed. The badge transform builds its label before inline code is decoded.

why now   — found while injecting pills into every gallery list item; not caused by inline-run.
where     — lib/integrations/markdown-it/plugins.js (verdictGridBadges) and the runtime mirror in lib/runtime/index.js.
done when — a pill inside a badge label renders as a pill, or the linter says it will not and names the form that works.
evidence  — a render of both forms before and after.
verify    — tier 1: shared transform on both render paths.
