---
origin: 2424
priority: P3
recorded: 2026-09-28
---

# A live preview with no worker still redraws from the remembered fit

```text
  P3 · [no ticket] Settle a synchronous live redraw from a cold fit, as the worker path does.
       why now   — #2424 made a graph chart's drawing at rest a function of its text and
                   stage: the worker path's SETTLE fits from a cold start once the author
                   pauses, and 30 of 30 typed paths on the real Studio now match a paste and
                   the CLI export. A host that blocks blob workers falls back to drawing in
                   place on every edit, and that path still starts its fit from the scale it
                   remembers, so its drawing at rest can differ slightly from the export.
                   Every tested host has a worker, so no tested surface regressed.
       where     — docs/src/lib/trama/pipeline.ts: the synchronous branch of `draw` (after
                   `liveWorker()` returns null) and the SETTLE in the live branch.
       done when — with `document.__<p>Worker` forced to null, the determinism run
                   (paste, reload, key by key, bursts) gives one drawing, without a
                   keystroke paying for a cold fit on the editor's thread.
       evidence  — the determinism run's table for the no-worker arm, before and after.
       verify    — tier 1.
```
