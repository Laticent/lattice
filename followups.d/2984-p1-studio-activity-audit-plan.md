---
origin: 2984
priority: P1
recorded: 2026-10-29
area: website
severity: high
deferred: blocked — waits on the owner's calls named in the note (export sign-off for items 1 and 3, a design note for item 2); each item is its own PR
swimlane: engineering/decisions/2026-10-29-studio-activity-audit.md §6
source: https://github.com/Laticent/lattice/pull/2984
---

# Work the Studio activity audit's ranked plan

```text
  P1 · [no ticket] cut the Studio's per-activity main-thread and memory cost
       found     — 2026-10-29, PR 2984's measured audit. At 4x CPU a 40-slide PDF export
                   keeps the main thread busy 69 s (longest task 4.0 s) and peaks the
                   renderer at 1.6 GB; each keystroke is a 163-206 ms long task, about
                   60 ms of it React re-rendering the toolbar chrome; first panel opens
                   freeze 340-790 ms; the slide map's pool adds 280-315 MB.
       where     — lib/core/slide-camera.mjs:495-516 and deck-export.js (export);
                   StudioShell.tsx (keystroke re-render); lib/runtime/index.js:2406-2455
                   (per-section layout); preview-pool.tsx (pools); Editor.tsx:545 and
                   coach/coach-core.ts:76 (double lint); docs/public/sw.js:113-115
                   (activate deletes the on-device model caches).
       order     — the note's §6, items 1-10. Item 7's sw.js cache-scope fix is a
                   correctness bug and needs no owner call.
       done when — each item lands with before/after numbers from the same harness
                   (HARD RULE #19), or the owner declines it.
```
