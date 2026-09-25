---
origin: 2371
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# Somber and restrained must be told apart at a glance

why now   — owner, after playing the test deck on 2026-09-25: "I can't really tell the difference
            between somber and restrained." Measured in #2371, they differ only in budget (1 vs 2), in
            cursor (none vs arrow) and in marks versus ink. On a slide with one salient moment they
            behave almost the same.
where     — lib/core/resolve-delivery.mjs (the preset table), the live mark/spark CSS in
            lib/base/base.focus.css, and PresentOverlay's pacing hooks; design note engineering/decisions/2026-09-25-vetrina-delivery-presets.md §6.
            Candidate axes: tempo (somber holds longer before a gesture and fades slower); color
            (somber marks in a muted ink, never the accent); motion (somber no pulse, restrained a
            single soft pulse); caption treatment (somber dims the caption crawl).
done when — the test deck played under each preset reads as three distinct deliveries to the owner
            without reading the front matter, and the design note's §6 table states the visible
            difference per preset.
evidence  — side-by-side recordings of one slide under each preset from the built Studio.
verify    — owner review; design-before-code on the axes (one AskUserQuestion round).
