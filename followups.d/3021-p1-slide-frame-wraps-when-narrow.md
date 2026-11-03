---
origin: 3021
priority: P1
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — touches the shared slide frame every component renders in; its own PR with its own sweep
source: https://github.com/Laticent/lattice/pull/3021
---

# The slide frame's header, footer and page number wrap or truncate cleanly when the slide narrows

why now   — the Frame Lab (npm run lab:build, type held at slide size) shows the header or footer running past the slide's edge at phone width in 69 of 79 components. It is one shared fix that reaches every component at once.
where     — lib/forms/cell/ (the frame cells), the header/footer rules in lib/base/; measure with the lab's "Header/footer spill" column.
done when — no component's header or footer spills at 360px in the lab, and a full-width 16:9 render is unchanged (sweep against main, as #3021 did).
evidence  — #3021's Frame Lab overview, column "Header/footer spill at 360".
verify    — npm run lab:build, then the overview; plus a render sweep of every gallery at hd against main.
