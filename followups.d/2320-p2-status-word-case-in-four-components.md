---
origin: 2320
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2320
---

# progress, timeline-list, state-chart and slope still disagree on a capitalized status word

why now   — #2320 made kanban fold case like gantt; the other four still do not,
            and they fail two different ways, so `AT-RISK` means three things
            across the family
where     — progress.transform.js:28-33 and timeline-list.transform.js stamp the
            word verbatim (`AT-RISK` falls to the info fallback); state-chart
            .transform.js:333 (`STATUS_KEYWORDS.has(p)`) and slope.transform.js:64
            (`CHART_STATUS.includes(...)`, no lowercase) reject it into the label.
            docs/src/content/docs/guides/pills.mdx §"Two ways a status word trips
            you up" documents the current split — update it with the fix
done when — every CHART_STATUS consumer either folds case (stamping the
            lowercase word) or rejects mixed case, one rule for all six, pinned
            by a unit test per component in the shape of
            test/unit/components/kanban-status-case.test.js
evidence  — a deck with `AT-RISK` in all six components, rasterized light and
            dark via SendUserFile
verify    — tier 1 checker, because it is four engine transforms whose output
            three render paths consume
