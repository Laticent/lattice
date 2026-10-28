---
origin: 2915
priority: P3
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# The editor's "re-lint on a new measurement" effect may not re-lint

why now   — `Editor.tsx` re-runs lint on a new preview measurement with `forceLinting(view)`. In @codemirror/lint 6.9.7
            `forceLinting` only runs a pass that is ALREADY scheduled (`force()` checks `this.set`); an idle linter ignores it.
            The photo-contrast work needed a fresh pass and used a `needsRefresh` effect instead. The measured-spark warning may
            therefore appear only after the next keystroke, not "without waiting" as its comment says. Not reproduced for sparks.
where     — `docs/src/components/studio/Editor.tsx` the `measuredKey` effect; `relintEffect` beside it is the working form.

done when — A spec moves a measured spark into view with no edit and the warning appears, or the effect is switched to `relintEffect` and that spec passes.
