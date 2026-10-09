---
origin: 2622
priority: P2
recorded: 2026-10-09
area: infra
severity: low
swimlane: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md §6
source: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md
---

# Stop writing generated ink values into the hand-written themes/*.css

```text
  P2 · [no ticket] derive-cat-ink.js and derive-chart-cat-ink.js rewrite a generated block
       inside each hand-written palette file. Give the generated values their own file.
       why now   — a file with two writers (a person and a generator) is the shape #2622
                   removed for the indexes; any palette edit can collide with a re-derive.
       where     — tools/derive-cat-ink.js, tools/derive-chart-cat-ink.js, themes/*/*.css
                   (import a sibling generated file), tools/build.js STEPS tags.
       done when — no generator writes into a hand-edited theme file.
       evidence  — the palette files carry no generated block; a theme PR and a re-derive
                   touch different files.
       verify    — tier 1: build:check green; the contrast gates still pass on every palette.
```
