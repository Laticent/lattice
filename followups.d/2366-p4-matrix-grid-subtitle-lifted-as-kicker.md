---
origin: 2366
priority: P4
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2366
---

# Read · Article prints matrix-grid's subtitle as an all-caps kicker above the heading

why now   — seen in the #2366 before/after screenshots. It predates #2366 (the same on `main`).
where     — `lib/transformers/prose-projection.mjs` kicker lift (`.lp-kicker`); the matrix-grid
            subtitle sits after the h2 on the slide but reaches the article as the kicker.
done when — a matrix-grid subtitle reads as a normal paragraph under its heading in Read ·
            Article, and a real eyebrow still lifts as the kicker.
evidence  — `examples/read-article-chart-paints.before-light.png` and `.after-light.png`: "THE
            FILLED CELL IS THE LEVEL…" above "The grid keeps its filled and outlined cells."
verify    — before/after Read · Article screenshots of the demo deck's matrix-grid slide.
