---
origin: 2862
priority: P6
recorded: 2026-10-22
area: infra
severity: low
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# check:venue-conformance cannot see CSS-generated text (::before labels)

why now   — a rotated ::before axis title in matrix-grid was cut and neither the harness nor the engine's clip detector saw it; a person found it from the demo deck. Anything drawn only by a pseudo-element is unchecked.
where     — tools/check-venue-conformance.js inspectInPage; possibly a pixel check on the rasterized page.
done when — a pseudo-element label cut by its container is reported, with a test that fails on the pre-fix matrix-grid.
evidence  — the old matrix-grid CSS (git show fd1296d^:lib/components/chart/matrix-grid/matrix-grid.styles.css) failing the new check.
verify    — tier 1 checker.
