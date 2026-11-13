---
origin: 3096
priority: P6
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The measurement
deferred: off-path — the topic eyebrow (lib/transformers/topic-track.js); #3096 changes the agenda, not the topic
source: https://github.com/Laticent/lattice/pull/3096#issuecomment-6730760918
---

# A divider headed with # gives the topic eyebrow a number and no name

why now   — topic-track.js reads only an ## heading for the section name, so a divider written "# Alpha" yields the
            eyebrow "01" where an ## divider yields "01 · Alpha". The agenda fill reads any heading level.
where     — lib/transformers/topic-track.js, both arms.
done when — the eyebrow names the section whatever the divider's heading level.
evidence  — fixture g-h1-divider in the #3096 measurement comment.
verify    — the fixture renders "01 · Alpha"; a demo deck (#9).
