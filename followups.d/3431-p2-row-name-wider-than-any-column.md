---
origin: 3431
priority: P2
recorded: 2026-11-23
area: chart
severity: low
swimlane: engineering/decisions/2026-11-22-tall-canvas-retired.md
deferred: large — a single word wider than the widest row column needs a policy for breaking one word (hyphenate, ellipsize or shrink), which no chart kind has yet; PR 3431 leaves these names exactly as main draws them
source: https://github.com/Laticent/lattice/pull/3431
---

# A row name that is one word wider than any row column still starts left of the canvas

```text
  P2 · bar row / stacked-bar row / heatmap: a one-word name wider than 60% of the canvas paints past the left edge
       why now   — PR 3431 makes the row column as wide as its widest measured word. When no column up to the
                   kind's cap holds that word, the loop falls back to the old flat-advance column, which is what
                   main draws. An independent review found the case: at story, `Telekommunikationsunternehmen`
                   starts at x = -6.9 and a 24-letter `mmm…` name at -99.5, on main and on this branch alike.
       where     — `rowGutterForm` (bar, heatmap) and `rowNameColumn` (stacked-bar); `measureLabel` in
                   lib/plugins/chart-family/shared/svg-label.js, which never breaks inside a word.
       done when — at 4:5, story and mobile, every row name either fits whole inside the canvas or is cut with a
                   reported `truncate:` drop, never painted past the edge.
       evidence  — render `- Telekommunikationsunternehmen \`412\`` as `bar row` at story and
                   measure the tspan's left edge with text-measure.js `textWidth`.
       verify    — test/unit/components/chart-phone-edges.test.js gains a case asserting left >= 0 for that name.
```
