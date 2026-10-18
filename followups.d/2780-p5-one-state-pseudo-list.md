---
origin: 2780
priority: P5
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §8
source: https://github.com/Laticent/lattice/pull/2780
---

# One list of interaction pseudo-classes, shared by the style scanner and the export prune

why now   — tools/style-needs.js and lib/export/player-prune.js each keep their own list; a missed entry is a silent false negative in the scanner.
where     — tools/style-needs.js STATE_PSEUDOS, lib/export/player-prune.js DYNAMIC_PSEUDO_CLASSES. The core must not import the export pipeline, so the shared piece belongs in a generic kernel.
done when — both read one list, and the unit tests for both pass.
evidence  — test/unit/tools/style-needs.test.js and the player-prune tests.
verify    — tier 1 independent checker: it touches a shared kernel.
