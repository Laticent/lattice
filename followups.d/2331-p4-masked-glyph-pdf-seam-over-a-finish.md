---
origin: 2331
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2331
---

# A masked glyph over a finish shows its box as a faint seam in the PDF

```text
why now   — #2331 put finishes on split covers, where the `→` lead-in (`.split-cover-lead::after`, a CSS mask) now sits over a texture; at 200 dpi in poppler its box shows as a seam and the texture is missing inside it. The same seam is already on a finished `title` with `eyebrow: arrow`, untouched by #2331.
where     — lib/base/base.modifiers.css `.split-cover-lead::after`; lib/base/base.accent-finish.css eyebrow shapes; every `--shape-*` / `--mark-*` mask. Family: engineering/gotchas/export.md "Chromium PDF output of CSS mask-image".
done when — a masked glyph over atrium/strata rasterizes with no seam in poppler and PDFKit, or the gotcha records that this is the accepted cost and why.
evidence  — a 200 dpi crop before/after of examples/finish-split-covers.pdf page 11 and a finished title with `eyebrow: arrow`.
verify    — tier 1 checker: it touches every masked glyph in the export.
```
