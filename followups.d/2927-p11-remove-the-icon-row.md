---
origin: 2927
priority: P11
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §11
source: https://github.com/Laticent/lattice/pull/2927
---

# Remove the icon row once the menu and drag work

why now   — Keeping it until then avoids a worse intermediate state for moving slides.
where     — `docs/src/components/studio/StudioShell.tsx` (`slideOps`, `RailOp`), `docs/e2e/slide-ops.spec.ts`, `docs/e2e/status-pill.spec.ts`, `docs/e2e/compose-note-motion.spec.ts`, `docs/src/components/studio/studio.controls.test.tsx`.
done when — the icon row is gone and every spec that drove it now drives the menu, drag and Undo.
evidence  — Checker finding 5.
verify    — Run the touched e2e specs and state they ran.
