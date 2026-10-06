---
origin: 2504
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2504
---

# Ink inline icons on sketch slides, as sparks are

why now   — on a `mode: sketch` slide the rough-ink pass redraws a spark's tile and lines by hand
            (lib/core/rough-ink.js `spark`, lib/base/base.sketch.css), but an icon's tile stays crisp
            beside it, so the two siblings read as two hands (HARD RULE #25 inversion lens, phase 1).
where     — lib/core/rough-ink.js (a `section.sketch .lat-icon` entry, kind `spark` or its own),
            lib/base/base.sketch.css (the handover), lib/plugins/icons/icons.styles.css (`--rough-ink-stroke`).
done when — a framed icon on a sketch slide gets an inked tile edge, its lines stay crisp or inked by
            the same rule as a spark's, and a non-sketch slide renders byte-identically.
evidence  — examples/inline-icons.md rendered with `mode: sketch`, light and dark.
verify    — tier 1 checker.
