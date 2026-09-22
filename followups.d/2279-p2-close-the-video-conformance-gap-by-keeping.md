---
origin: 2279
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2279#issuecomment-5764143460
backfill: true
---

# Close the `video` conformance gap by keeping its title in-card

Backfilled verbatim from the continuation brief on #2279 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Close the `video` conformance gap by keeping its title in-card
       why now   — video is the ONE non-sovereign component composing as Form with no Cell.
                   Every conformance claim in the record carries it as a standing exception,
                   so closing it lets the rule be stated without a footnote.
       where     — lib/components/imagery/video/video.transform.js (159 lines; the section
                   rebuild is the part that matters). The pattern to copy is wifi's
                   `.qr-head > h2` at lib/components/connect/wifi/wifi.transform.js:79 plus
                   wifi.styles.css:66. `findTopLevelH2` (lib/core/top-level-h2.js) is
                   depth-aware and deliberately does NOT lift an in-card h2 — that is the
                   mechanism wifi relies on and the one video needs to opt into.
       done when — a `video` slide declares a stage Cell and gets one; `companion` still
                   renders side-by-side with its caption intact; the masthead band does not
                   claim video's title.
       evidence  — render the video gallery in BOTH moods and LOOK at it (SendUserFile), plus
                   tools/pixel-check.js against the committed goldens. This repaints goldens,
                   so a diff is EXPECTED — show before/after, do not just re-bless.
                   "Tests pass" is not evidence of a visual claim (#23).
       verify    — tier 1, an independent checker. Blast radius is one component's transform
                   plus a golden repaint, not a shared kernel — but the two obvious fixes are
                   both already-rejected, so a second pair of eyes on the third earns its cost.
       owes      — a demo deck under HARD RULE #9 (examples/<slug>.md + committed .pdf,
                   6–10 slides). Read the title.docs.md note in CONTEXT first.
```
