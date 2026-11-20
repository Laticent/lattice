---
origin: 3232
priority: P3
recorded: 2026-11-19
area: theming
severity: low
swimlane: engineering/decisions/2026-11-16-status-triplets.md §3
deferred: blocked — the owner decides carbone's brand: re-hue its first category, or accept the clash
source: https://github.com/Laticent/lattice/pull/3232
---

# Carbone's first category is green, so an unstatused mark reads as "on track"

```text
  P3 · [no ticket] carbone's first category sits in the on-track green
       why now   — The 26-face visual review of PR 3232 (head 227d8ed9) found it on
                   examples/status-triplets.md: the state chart's unstatused nodes (slide 8) and
                   the gantt's "no status" swatch (slide 5) are carbone's first category, a green
                   next to on-track. Measured as OKLab distance from the node fill to the pass fill:
                   light, main 0.029 and this PR 0.075; dark, main 0.052 and this PR 0.053. The
                   PR did not cause it (the unstatused node fill is unchanged) and made light
                   better, but both faces sit under the 0.08 "merges" line check:glance uses.
       where     — themes/carbone/carbone.css --cat-1-*; tools/curate-status-triplets.js has the
                   matching rule for blocked ("blocked clears the theme's first category").
       done when — the owner picks one: (a) re-hue carbone's first category off green, which
                   changes carbone's look; (b) add "pass clears the first category" to the solver
                   for carbone, which pushes pass off its green; or (c) accept it, because the
                   check glyph marks on-track.
                   Then the pass-to-first-category distance is at least 0.08 on both faces, or
                   the choice is recorded in the decision note.
       evidence  — /home/user/lattice/.scratch/pr3232/faces/pages/carbone/s-08.png (session only).
       verify    — node tools/check-glance.js examples/status-triplets.md --palette=carbone
```
