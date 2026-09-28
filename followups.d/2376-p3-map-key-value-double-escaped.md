---
origin: 2376
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2376
---

# a map key value holding `&` or `<` prints its escape code

why now   — a checker on the panes-chart-labels PR found that a `map highlight` value reaches
            `buildSvgLegend` already HTML-escaped and `xmlEsc` escapes it again: a value of
            `R&D hub` renders on the slide as "R&amp;D hub". Pre-existing (the parent commit runs
            the same `xmlEsc(stripTags(value))`), and it also makes the key's new value column
            count `&amp;` as five characters.
where     — lib/components/chart/map/map.transform.js (where the row value is read from the
            rendered `<code>`), lib/components/chart/_chart-family/svg-legend.js (stripTags/xmlEsc);
            check the piechart and other keyed kernels for the same double escape.
done when — a key value `R&D <b> hub` prints as typed on the slide, and a unit arm pins it.
evidence  — the slide before/after.
verify    — tier 1 checker: the legend is shared by every keyed chart.
