---
origin: 2978
priority: P3
recorded: 2026-10-30
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-checks.md
deferred: large — every chrome mask and its export bytes change, and each surface needs a rendered before/after; #2978 kept to the status marks, and #2992 to icons
---

# Draw the `--shape-*` chrome masks from Tabler, then make them styleable

```text
  P3 · [no ticket] replace every hand-drawn --shape-* mask with its Tabler drawing, then let a theme style them
       decided   — the owner, 2026-11-02 (PR #2992): "use tabler and ditch our custom svgs". All eleven shapes come
                   from Tabler; no hand-drawn mask stays. Checked on the real shipped decks first (galleries and
                   examples, unchanged), light and dark:
                     arrow-right      Tabler arrow-right        nearly identical (a hair thinner)
                     chevron-right    Tabler chevron-right x4/3  plain Tabler is visibly smaller; scaled about its
                     chevron-down     Tabler chevron-down  x4/3  center it matches today's size (stroke 2.67 vs 2.6)
                     refresh          Tabler reload             the same symbol (one arrow, head top right); NOT
                                                                 `refresh` (two arrows) or `rotate-clockwise`
                     spark-open       Tabler sparkle (outline)  pinched curved arms instead of straight ones
                     spark            Tabler sparkle, filled    no filled sparkle in Tabler: fill the outline path
                     arrow-up / -down Tabler arrow-up / -down   no shipped deck draws these
                     triangle-right   Tabler player-play (filled)   only during a scene's animation
                     pause            Tabler player-pause (filled)  only during a scene's animation
                     warning          Tabler alert-triangle (filled) only on a note-warn over a blockquote
       then      — the owner wants to STYLE these too. A CSS mask takes its shape from a fixed SVG, so line
                   weight and fill cannot follow a theme today. Options to weigh in the PR's design note: draw them
                   from the same Lattice Icons font (lib/fonts/icon-faces.js; weights already track --icon-stroke),
                   or generate one mask per weight. Either way the shapes get the icons' line-weight control.
       where     — lib/plugins/_icons-source/marks.json (add the fits), tools/build-icons-data.js (it already bakes a
                   fit into bare paths and writes a generated block), lib/base/base.tokens.css. The two
                   SANCTIONED_GLYPH_CHROME files read these masks for the grayscale shape channel; keep them.
       done when — Every --shape-* token sits in a generated block from Tabler, build:check fails on a hand edit,
                   and the calco-refusals, calco-pseudo and status-marks-tabler tests still pass.
       evidence  — Rendered before/after of every surface that uses a shape mask, light and dark (the D1 sheets in
                   PR #2992's session are the template: real decks, slide and 4x mark side by side).
       verify    — tier 1 checker, because it changes every chrome mask and the PPTX lift reads them.
```
