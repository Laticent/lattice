---
origin: 2264
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2264#issuecomment-5767264630
backfill: true
---

# A wide diagram is unreadable on a phone in the reading article

Backfilled verbatim from the continuation brief on #2264 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] A wide diagram is unreadable on a phone in the reading article
       why now   — it is the one surface in this swimlane still below the bar; everything else
                   shipped. THE OWNER WAS ASKED AND HAS NOT ANSWERED: if there is still no
                   answer when you read this, ask once in your first message and work P2 while
                   you wait — do not start it silently.
       where     — the bake (lattice-emulator.js "player capture: serialize baked DOM";
                   docs/src/components/studio/export/deck-export.js) and the three host rules:
                   lattice-emulator.js:5504, lib/export/player-core.mjs:1655,
                   docs/src/components/studio/ReadArticle.tsx:94
       done when — a 923x67 LR flowchart at a 390px viewport is legible rather than scaled to
                   ~4px labels; the plan is intrinsic width/height written at bake time plus a
                   horizontally scrollable figure, so the diagram stops shrinking past reading
                   size and the reader pans instead
       evidence  — tools/screenshot.js @1440/820/390 on the Studio Read pane AND a rendered
                   --read export at 390; measured label font-size, not a claim
       verify    — tier 1 checker, because it changes the bake's OUTPUT BYTES, which three
                   surfaces and a frozen player golden depend on
```
