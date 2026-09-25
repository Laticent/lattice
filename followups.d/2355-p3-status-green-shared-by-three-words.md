---
origin: 2355
priority: P3
recorded: 2026-09-24
---

# The family pill vocabulary still paints on-track, done and live one green

```text
  P3 · [no ticket] The shared pill table maps on-track, done and live to one tone (pass).
       why now   — state-chart and gantt now paint `live` as info (running work) and the
                   pill table (kanban, progress, slope, print textures) still paints it
                   pass, so a deck with a state chart and a kanban names one word in two
                   colors. state-chart's legend merges same-tone words into one chip, so
                   the duplicate-key symptom is gone there.
       where     — chart-family.css `.chart-status` table; kanban.styles.css,
                   progress.styles.css, slope.styles.css `live` rows;
                   base.print-textures.css (the `live` shape glyph).
       done when — the owner decides whether `live` takes info family-wide (the
                   recommendation: yes, it is gantt's argument and state-chart now
                   follows it) and whether `done` gets its own tone at all.
       evidence  — composed-contrast run + rendered kanban/progress/slope with `live`.
       verify    — tier 1.
```
