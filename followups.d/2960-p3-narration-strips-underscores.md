---
origin: 2960
priority: P3
recorded: 2026-10-29
area: engine
severity: low
swimlane: lib/core/chart-narration.js
deferred: off-path — the narration kernel's markdown stripping, which #2960 neither touches nor teaches
source: https://github.com/Laticent/lattice/pull/2960
---

# Narration drops every underscore, so a card named with `snake_case` code does not bind

```text
  P3 · Strip emphasis markers, not every underscore, when the narrator names a part
       why now   — a kanban card "Retire `csv_v1` export" narrates as "Retire csvv1 export",
                   which resolves to no drawn card (scene-binding.test.js caught it on #2960's
                   demo deck), so the Guide falls back to reading the slide's words.
       where     — lib/core/chart-narration.js: seven `.replace(/[*_~`]/g, '')` sites (lines ~634,
                   719, 1036, 1133, 1162, 1452, 3838) strip `_` inside inline code and words.
       done when — a card, task or label holding `snake_case` inline code narrates with its
                   underscores and binds to its drawn part; a test pins one such card.
       evidence  — scene-binding.test.js's "resolves to nothing" rows for csv_v1 / source_id.
       verify    — tier 1: the unit test plus the corpus binding test.
```
