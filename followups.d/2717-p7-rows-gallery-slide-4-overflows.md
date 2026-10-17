---
origin: 2717
priority: P7
recorded: 2026-10-17
area: layout
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §13.8
---

# the rows gallery's fourth slide (the second plain `rows` slide, `rows.gallery.md` line 60) overflows its frame

why now   — the render tier could not see it until 2026-10-17: a layout consumes its own class, so `rows` was credited zero slides (§13.8). Nightly run 118 lists `rows  overflow on 1 slide(s)`; `CONFORMANCE_RENDER=1 CONF_ONLY=rows node --test test/integration/components/component-conformance.test.js` reproduces it, and `.scratch/conformance-render/report.json` names slide 4.
where     — lib/components/layout/rows/rows.gallery.md line 60; lib/components/layout/rows/rows.styles.css
done when — that slide fits (the shared overflow probe reads `over: false`) or the gallery slide is shortened and the reason is written in the gallery; the nightly line for `rows` disappears
evidence  — the rows gallery slide 4 rendered via SendUserFile before and after, plus the probe line from the CONF_ONLY=rows run
verify    — tier 0 gates, because it is one gallery slide and one layout's CSS
