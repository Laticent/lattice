---
origin: 2687
priority: P5
recorded: 2026-10-14
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-plugin-inline-door.md §10
source: https://github.com/Laticent/lattice/pull/2687
---

# Settle what a zip kind's `fields` hold before #2686's reader changes how a record reads

why now   — a zip kind's `fields` are whatever Segno's slot reader returns (lib/core/segno-spec.js `compileSlot`).
            #2686's chart-authoring model changes number reading (ISO in, a comma never part of a number) and adds a
            `{> …}` description production inside records, so a plugin's `fields.value` would change between minor
            releases with no version on it. Freezing the inline contract in phase G before that lands freezes a moving
            shape.
where     — lib/core/segno-spec.js, docs/src/lib/code-packages/door-run.ts and lib/packages/code-door.js `inlineFields`,
            spec/LPM.md §3.3 (`inline`), engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §5-§6.
done when — either the field types are versioned in the manifest (`api`), or the freeze waits for #2686's phase 2
            reader, and LPM says which; a test pins a `fields` shape for a number, a list and a description.
evidence  — the LPM text and the test.
verify    — tier 1 checker.
