---
origin: 2831
recorded: 2026-10-20
area: engine
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2831
priority: P3
severity: low
---

# Flex hosts that are not list items still split a label

glossary headings, statute-stack titles, wifi's call to action and journey's lane labels are flex hosts holding bare text, built by their own transforms. The inline-run gate injects objects into list items only.

why now   — the same defect class, found by the audit and left off the list-item fix.
where     — lib/components/{glossary,statute-stack,wifi,journey}; extend lib/core/inline-run.js beyond li, or wrap in each transform.
done when — the gate injects an object into these hosts too and finds zero splits.
evidence  — the audit's latent-host list (38 component and host combinations on the gallery) with these four cleared.
verify    — tier 1: shared kernel; needs a checker.
