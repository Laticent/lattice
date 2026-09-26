---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# no shape family describes a short, wide stacked band

why now   — a stacked pane is 3–5x wider than tall, which the four families (wide, square,
            tall, strip) do not describe: a line chart letterboxes and stat tiles need ~45%
            of the stage.
where     — lib/adaptive/families.js, the band-sensitive components (stats, kpi, charts).
done when — a `band` family (or height-aware sizing) lets a 35% stacked pane hold a stat row
            and a chart fill its width.
evidence  — decision note §6.5; examples/panes.pdf slide 6.
verify    — a `stack 65/35` slide: line chart fills the band width, stats fit the band.
