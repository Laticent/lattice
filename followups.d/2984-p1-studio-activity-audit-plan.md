---
origin: 2984
priority: P1
recorded: 2026-10-29
area: website
severity: high
deferred: large — each remaining item in the note's §6 is a PR-sized change of its own; 1(c) also needs the owner's export sign-off
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
       where     — lib/core/slide-camera.mjs:495-516 (export capture, items 1b-1c);
                   preview-pool.tsx (pools, item 4); first panel opens (item 5);
                   Editor.tsx:545 and coach/coach-core.ts:76 (double lint, item 6);
                   docs/public/sw.js (navigation preload and cache refresh, item 7).
       order     — the note's §6. Done in PR 2984: 1(a) re-aimed at the vector writer,
                   1(d) investigated (no leak), 7's cache-scope fix, and 10 (the bench).
                   Item 2 is PR 2993. Item 3 was measured and dropped (the
                   note's §8); a pass that skips unchanged sections is open.
       done when — each item lands with before/after numbers from the same harness
                   (HARD RULE #19), or the owner declines it.
```
