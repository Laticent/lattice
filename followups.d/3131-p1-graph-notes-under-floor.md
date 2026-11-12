---
origin: 3131
priority: P1
recorded: 2026-11-12
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-10-chart-form.md
deferred: blocked — the owner's pick between moving the notes out of the drawing and lifting them in it (❓ card D1 on #3131)
source: https://github.com/Laticent/lattice/pull/3131#issuecomment-6817033887
---

# Notes on a flowchart or state chart print under the legibility floor on a phone page

why now   — the phone type ladder grows a graph's names, so its fit shrinks the drawing harder, and the notes, capped at
            18 drawing units, shrink with it: callouts-schedule.md p4 at 4:5 prints them at 4.5pt (main 4.9pt) and p5 at
            5.2pt (main above the 5.4pt floor). Lifting the notes inside the drawing was tried twice (to the label size,
            and to half of it): the drawing grows, shrinks again, and overprints at square.
where     — state-chart.layout.js and flowchart.layout.js `calloutsOf`, shared/callout-browser.js, Trama's fit
            (docs/src/lib/trama/pipeline.ts).
done when — the owner's pick is built (recommended: the notes leave the scaled drawing and set at page size under it),
            and callouts-schedule.md p4 and p5 print every note at or above the floor at mobile, story, 4:5 and square.
