---
origin: 2388
priority: P3
recorded: 2026-09-26
area: engine
severity: low
swimlane: engineering/decisions/2026-09-26-backdrop-register.md
source: https://github.com/Laticent/lattice/pull/2388
---

# `--chrome-pdf` still wedges a pre-#2388 finish that bakes a dim and a mask

Narrowed on 2026-09-28. The default PDF no longer shows it: #2404's shared writer draws each
slide's backdrop as a photo, so there is no vector transparency group for poppler to mis-draw.
A finish saved in the Studio library is regenerated from its recipe on every read
(`finish-library.ts` `toStudioFinish`), so it carries #2388's veil weight without a re-save. What
remains is a hand-copied or exported pre-#2388 finish rule inside a deck, printed with
`--chrome-pdf`.

```text
  P3 · [no ticket] Legacy baked dim + mask → poppler wedge, on --chrome-pdf only.
       why now   — only reachable through --chrome-pdf (the fallback and comparison printer) with
                   a deck that embeds a pre-#2388 finish rule. Measured 2026-09-28 on a legacy
                   finish (baked strength 0.5 + `--backdrop-clear-mask`): pdftoppm at 40 dpi
                   shows the dark wedge on --chrome-pdf and a clean page on the default writer.
       where     — lib/base/base.finish.css § BACKDROP REGISTER; poppler's handling of a hard
                   mask inside an opacity group.
       done when — the legacy finish prints without a wedge through --chrome-pdf, or the
                   fallback printer is retired.
       evidence  — pdftoppm raster of the legacy deck, --chrome-pdf, before/after.
       verify    — tier: export sign-off.
```
