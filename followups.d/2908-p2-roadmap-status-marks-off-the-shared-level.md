---
origin: 2908
priority: P2
recorded: 2026-10-28
area: chart
severity: medium
swimlane: engineering/chart-styling.md §3 (one status level per finish)
source: https://github.com/Laticent/lattice/pull/2908
---

# Roadmap's status dots stay solid under etch and tone, off the one status level

```text
  P2 · Roadmap status marks do not follow the one-status-level rule
       why now   — #2908 made every status mark in a finish take one level (a progress bar is as
                   quiet as a gantt bar), and roadmap is the one status chart that missed it: its
                   status dots and key stay solid green, amber and red under etch and tone. Both
                   blind scorers on cdf3de6 put roadmap at 6.5 in etch and tone, the lowest pair.
       where     — roadmap's status pills/dots (`.roadmap .lat-pill`, the chart-status mask marks) and
                   the STATUS_MARKS table in tools/build-marks-css.js, which roadmap's marks are not in.
       done when — roadmap's status marks render at the same level as gantt and state-chart in each
                   finish, light and dark, and the 192-deck AA audit stays at 0 failures.
       evidence  — blind scores (r15) and a render of roadmap beside gantt in etch and tone.
       verify    — tier 1: marks-css unit tests + the AA audit + a rendered look.
```
