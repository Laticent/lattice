---
origin: 2789
priority: P4
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11g
---

# A slide's `<!-- header: H -->` or `footer:` carries onto every later slide, which is Marp's rule and not the one the owner expects.

The owner's rule: front matter sets the header, footer and page number for every slide, and a slide's own `_header`,
`_footer` or `_paginate` applies to that slide only. Measured on the engine: `_header: L` stays on its slide, but a
plain `<!-- header: H -->` on slide 2 puts `data-header="H"` on slides 2 through the end (a deck of five slides:
`-`, `H`, `H`, `L`, `H`), so a later slide inherits it. That is Marp's semantics, kept for the bridge.

**2026-10-19: default taken, ruling still open.** The continuation session kept the carry for the comment form and pinned
it (`test/unit/engine/directive-scope.test.js`, audit §11n); the @meta record already scopes by default with an explicit
`carry`. The map no longer depends on it (§11m removed the chrome test). What is left is only the owner's ruling.

```text
  why now   — the rendered index tells a blank slide by its chrome matching the front matter's, so a carried header
              makes a true blank after it look like a slide of its own (one tile off, nothing flagged).
  where     — lib/engine/slides.js (lattice_directives_apply). The @meta record decision
              (2026-10-17-meta-record.md) moves slide settings to a typed record; that is the place to settle whether
              a per-slide value scopes to its slide, and whether Marp export keeps the carry.
  done when — the owner has ruled. If the ruling is "carry", delete this file: the pin already holds it. If it is
              "scope", change lib/engine/slides.js and flip the pin, with a dark and light render for export sign-off.
  decide    — owner: does a non-underscore per-slide directive keep carrying, or scope to its slide?
```
