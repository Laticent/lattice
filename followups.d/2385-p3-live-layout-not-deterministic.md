---
origin: 2385
priority: P3
recorded: 2026-09-27
---

# The same chart text can draw differently in the Studio depending on how it was reached

```text
  P3 · [no ticket] Make a graph chart's live drawing a function of its text and stage alone.
       why now   — the burst-typing run found that a large state chart's final drawing never
                   byte-matched a fresh render of the same text: viewBoxes of 4220x245 (fresh
                   paste), 4969x278 and 4862x276 (fresh reloads), 5183x288 (after a burst). The
                   model was identical each time. Likely cause, unproven: the per-position fit
                   memory that seeds the fit's scale loop, so the loop settles on a different
                   fixed point. Small charts match every time.
       where     — docs/src/lib/trama/pipeline.ts: the fit memory and the scale loop.
       done when — the four paths (paste, reload, burst, key-by-key) give one drawing.
       evidence  — the four oracle SVGs byte-equal.
       verify    — tier 1.
```
