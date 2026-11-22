---
origin: 3410
priority: P2
recorded: 2026-11-22
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-21-spectrum-keys.md (S8)
deferred: large — two generators with downstream plans (Waves 2 and 3 build on the finish generator), each a design change of its own
source: https://github.com/Laticent/lattice/pull/3410 — the owner's ruling, relayed by the coordinator 2026-11-22
---

# Retire the two places a script writes CSS

The owner ruled that the engine must not generate styles ("engine does not magically create a style
which is an anti-pattern in lattice (anyone else does this today we need to fix that)"); styling is
CSS-driven, recorded as S8 in `engineering/decisions/2026-11-21-spectrum-keys.md`. Two cases exist
outside presets:

1. `tools/build-marks-css.js` writes `chart-family.styles.generated.css` (#3349 extended it).
2. The finish generator (`lib/finishes/`, checked by `checkFinishPackages`) turns recipes into CSS;
   N2 and N5 of preset Waves 2 and 3 are planned on it.

Done when each ships hand-written, checked-in CSS that a gate keeps in step with its data, with no
generated stylesheet left, or the owner records an exception with its reason.
