---
origin: 3305
priority: P2
recorded: 2026-11-19
area: evidence
severity: medium
swimlane: engineering/decisions/2026-11-17-agent-pack.md §4.5
deferred: large — making kpi fit what its manifest allows, or making the manifest's capacity and `surfaces` plus a lint:deck fit rule say what fits, is a cross-variant layout and lint job across five variants; this PR teaches the measured limits in start.md so no author is steered into the clipping form
---

# lint:deck passes kpi slides that the export clips

why now   — #3305's eval found it: a stand-in model wrote `kpi ops` with three rows and a `>` key
            insight, `lint:deck` reported nothing, and the render clipped the third tile ("Content
            clipped"). The nightly agent-pack eval fails a deck on that, so a model that follows
            the layout's own budget ("best 3, max 4") can still fail the night.
where     — Measured on main's engine, 2026-11-19, `theme: indaco`, terse rows:
              | variant      | 3 rows + `>` | 3 rows | 4 rows + `>` | 4 rows |
              | `ops`        | clips        | fits   | clips        | fits   |
              | `attention`  | fits         | fits   | clips        | fits   |
              | `compliance` | fits         | fits   | clips        | clips  |
            `lib/components/evidence/kpi/kpi.styles.css` (the grids), `kpi.manifest.json`
            (`capacity`, `surfaces`), and the lint fit rules in `lib/authoring/lint-core.js`.
done when — Either the layout fits what its manifest allows, or the manifest's capacity and
            `surfaces` say what fits and `lint:deck` warns on the rest; then start.md's kpi
            sentence reads from the manifest instead of being hand-written.
