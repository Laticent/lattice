---
origin: 3096
priority: P4
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The measurement
deferred: off-path — the topic eyebrow (lib/transformers/topic-track.js); #3096 changes the agenda, not the topic
source: https://github.com/Laticent/lattice/pull/3096
---

# The topic eyebrow keeps a section heading's closing period; the agenda drops it

why now   — the same section name reads two ways in one deck: examples/topic.md shows "02 · Where the money actually
            goes." on the eyebrow and "Where the money actually goes" in the agenda (four places).
where     — lib/transformers/topic-track.js, both arms.
done when — the eyebrow drops one closing period the way agenda-autofill.js itemText does.
evidence  — the #3096 measurement, "naming style" findings.
verify    — the rendered examples/topic.md eyebrows read without the period; a demo deck (#9).
