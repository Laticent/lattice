---
origin: 2388
priority: P3
recorded: 2026-09-26
area: engine
severity: low
swimlane: engineering/decisions/2026-09-26-backdrop-register.md
source: https://github.com/Laticent/lattice/pull/2388
---

# `--chrome-pdf` draws gray tile seams on a dimmed textured finish, at some zoom

Narrowed on 2026-09-28. The default PDF no longer shows them: #2404's shared writer draws the
backdrop as a photo. Measured with pdftoppm on three decks, counting the seam gray (153,153,153):

| Deck | Writer 40 / 60 / 100 dpi | `--chrome-pdf` 40 / 60 / 100 dpi |
|---|---|---|
| atrium, baked strength 0.40 | 0 / 0 / 0 | 78,001 / 62,577 / 0 |
| atrium, `backdrop: 40` | 0 / 0 / 0 | 39,316 / 0 / 49,350 |
| examples/backdrop-register.md | 0 / 0 / 0 | 3,086 / 0 / 1,867 |

```text
  P3 · [no ticket] Poppler tile seams under a dimmed finish, on --chrome-pdf only.
       why now   — only reachable through --chrome-pdf, the fallback and comparison printer.
                   Poppler draws 1px gray lines at the texture's tile boundaries under any
                   strength below 100%, as group opacity or as the veil. PDFium and Ghostscript
                   draw neither.
       where     — lib/base/base.finish.css § BACKDROP REGISTER; poppler's handling of a
                   transparency group or soft mask over a tiled pattern.
       done when — --chrome-pdf rasterizes a dimmed slide seam-free at 40, 60 and 100 dpi, or
                   the fallback printer is retired.
       evidence  — the table above, re-measured before/after.
       verify    — tier: export sign-off.
```
