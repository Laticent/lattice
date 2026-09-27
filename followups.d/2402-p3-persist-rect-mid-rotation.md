---
origin: 2402
priority: P3
recorded: 2026-09-27
source: engineering/decisions/2026-09-26-studio-panel-lazy-loading.md § What shipped, measured
---

# The Studio can store a preview rect measured mid-rotation

```text
  P3 · make persistRect skip a layout that has not caught up with the viewport
       why now   — persistRect (docs/src/components/studio/StudioShell.tsx, on pagehide and
                   visibilitychange) measures whatever box is on screen. Leave the page within a
                   frame of rotating a phone out of landscape and it stores the cinema box
                   (full-bleed, left 0) at portrait fractions. The aspect gate passes it, so the
                   next load's shell draws the slide 16px off and jumps at hand-off. Found as the
                   cause of #2070's test failures; a real user needs a one-frame window.
       where     — StudioShell.tsx › persistRect and rectBootShapedRef; the cinema media query
                   (useLandscapePhone).
       done when — a rect is dropped, not stored, when the rendered cinema state disagrees with
                   the viewport's media query at pagehide, with a jsdom or e2e case that resizes
                   and fires pagehide in the same tick.
       evidence  — the new case failing before the fix and passing after.
       verify    — tier 1; real Chromium via the e2e preview server.
```
