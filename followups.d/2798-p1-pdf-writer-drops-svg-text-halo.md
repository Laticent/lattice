---
origin: 2798
priority: P1
recorded: 2026-10-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-19-universal-legend.md §15
source: https://github.com/Laticent/lattice/pull/2798
---

# The CLI's vector PDF writer drops the halo on SVG chart text

```text
  P1 · The vector PDF writer draws a stroked SVG <text> as plain fill and drops its halo
       why now   — found while building heatmap callouts (#2798): a bare label with
                   `paint-order: stroke` kept its canvas-color halo in --chrome-pdf
                   and lost it in the default PDF. The same path draws the halo'd
                   labels on stacked-bar, waterfall, scatter, radar and pie (read
                   from the code, not rendered), so those halos are likely lost too.
                   The legend avoided needing one (callouts sit in a lane).
       where     — lib/core/pdf-compose/read-slide.mjs `textRefusal` (refuse a
                   stroked SVG <text> so it stays in the photo) or write-pdf.mjs
                   (draw the stroke as a text render mode, marked as an artifact)
       done when — a halo'd SVG label looks the same in the default PDF as in
                   --chrome-pdf
       evidence  — stacked-bar and waterfall galleries, dark and light, before/after
       verify    — owner sign-off: the fix moves export bytes (QUALITY BAR)
```
