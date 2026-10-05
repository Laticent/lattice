---
origin: 2538
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2538
---

# Drive the Studio's PDF export at 4K and measure the slide's edge

#2538 draws the section's own edge (the spectrum bar, a dark slide's hairline) as a vector in
the shared writer, and gave the Studio's `withSlide` the camera's fixups (`--slide-edge-k: 0`,
a squared corner) so the reader there draws the same edges. That was reasoned from the code;
the CLI is the only surface measured. A live host keyline or a rounded corner left on during
the read would refuse every edge, and the Studio would keep the soft 4K edge.

```text
  P1 · verify the Studio's 4K PDF export draws the slide edge as a vector
       why now   — the writer change shipped for both hosts; only the CLI was measured.
       where     — docs/src/components/studio/export/deck-export.js withSlide;
                   docs/e2e/pdf-shared-writer.spec.ts (the existing Share → PDF e2e).
       done when — a 4K deck exported through the real Share dialog has its dark hairline and
                   light bar within 6 levels of the CLI writer's (pdftoppm -r 96, rows 0/11/12).
       evidence  — an e2e arm in pdf-shared-writer.spec.ts with a 4K fixture, plus the PDF sent.
       verify    — tier 0 gates, because it adds a test and moves no engine code.
```
