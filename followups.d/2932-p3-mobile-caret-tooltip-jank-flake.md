---
origin: 2932
priority: P3
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2932
---

# The caret-move tooltip test's "never removed" check flakes in the Chromium `mobile` project

why now   — `docs/e2e/photo-contrast-coach.spec.ts`, "moving the caret to another slide gives that slide's tooltip the
            single ink (390px)", fails its `jank.removed` check in the `mobile` project about 1 run in 5. Measured on
            main at c2aec51: 3 failed of 16 (`--project=mobile --repeat-each=8`). The spec already exempts the
            `desktop` project at phone width for a known Chromium artifact (a parked mouse gets a synthetic mousemove
            when the preview redraws, which closes and reopens the tooltip). `mobile` is the same Chromium with a mouse
            at 390 px and is not exempted.
where     — the `if (!(test.info().project.name === 'desktop' && width < 700))` guard in that test.

done when — Either the cause in `mobile` is shown to be the same artifact and the guard names it, or the tooltip
            is kept open through the redraw; and 16 repeats in `mobile` pass.
