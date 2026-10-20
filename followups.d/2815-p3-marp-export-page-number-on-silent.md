---
origin: 2815
priority: P3
recorded: 2026-10-20
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11r
---

# The export to Marp draws a page number on a `silent` or `no-paginate` slide that Lattice leaves bare.

Found while rendering the header-scope sign-off deck (`examples/header-scope.md`) through real `marp-cli` 4: slides 1
and 8 (`_class: silent`) and slide 6 (`_class: no-paginate no-header`) show a page number in the Marp PDF and none in
Lattice's own PDF. Header and footer agree on every slide. The PR that found it changed no CSS and no pagination code,
so it is pre-existing and off that PR's path; it was not re-run on `main` to confirm.

```text
  why now   — a deck exported to Marp shows numbers its author hid; a bookend slide reads as page 1 of 8.
  where     — the bundle's CSS against marp-core's pagination (lib/base/base.variants.css `section.no-paginate::after`,
              lib/base/base.modifiers.css `silent`; marp-core draws the number from `data-marpit-pagination`).
  done when — the Marp PDF of examples/header-scope.md shows no number on slides 1, 6 and 8, in dark and light.
  evidence  — both PDFs (Lattice and marp-cli) side by side.
  verify    — tier 1 checker; export sign-off (it changes exported bytes).
```
