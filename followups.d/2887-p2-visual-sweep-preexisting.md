---
origin: 2887
priority: P2
recorded: 2026-10-25
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-24-status-is-one-system.md
source: https://github.com/Laticent/lattice/pull/2887
---

# Defects the #2887 visual sweep found that render the same on main

```text
  P2 · pre-existing slide defects, each reproduced on a main render of the same gallery
       why now   — #2887's full sweep (43 galleries, light and dark, three reviewers) flagged these. Each was
                   rendered from main's build and compared side by side: identical, so none is #2887's.
       where / what —
         · columns, rows, layout galleries: a stray "1" under every pane (leaked counter or list number).
         · rows stress test: "Content clipped", the BY FUNCTION table loses its Sales row.
         · regulatory-update cards, verdict-grid five-options: the bottom cards run into the footer, no bottom border.
         · comparison pricing: row text runs into the card's right border ("Checks accumulate up the ladder").
         · obligation-matrix `pills`: renders the same discs as the default grid, no status words, against its caption;
           `lanes` in dark mode loses the per-regime stripe and label color (legal gallery too, plus legal rails/eyebrows).
         · kpi spotlight: support-tile pills are outline-only with no mark and tight left padding.
         · journey curve: sentiment gridlines stop halfway across the plot.
         · piechart donut: the center is empty although the slide says it carries the total.
         · heatmap 10x12 stress: values sit at the top of each cell; histogram 12-band stress: labels touch the bar tops.
         · ep-curve anti-patterns: inline code breaks around `$410M` (stray backticks render).
         · state-chart curved: the back edge to `publish` runs through the `revise` self-loop label.
         · palette (indaco and peers): non-neighboring category slots nearly coincide, teal 6 vs cyan 8 at 0.043 OKLab and
           rust 2 vs gold 7 at 0.057 (main: 0.045, 0.061). chart-contrast.test.js gates only NEIGHBORING slots (>= 0.15),
           but tower and stacked charts can place any two slots side by side.
         · the descoped disc's slash is a see-through knockout, so in dark mode it reads dark while the check/dash/x read white.
       done when — each item is fixed or deliberately kept with a reason, one PR per area (#17).
       verify    — re-render each named gallery in light and dark; the palette item adds an all-pairs floor to
                   chart-contrast.test.js.
```

Off the path of #2887 (HARD RULE #18): main renders each one identically. Evidence: main|branch pairs built
during the sweep, `scratchpad/p4.png`–`p6.png` of the session.
