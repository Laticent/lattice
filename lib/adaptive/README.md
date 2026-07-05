# lib/adaptive — box families (structural breakpoints)

The single source of truth for the four "box families" a component reflows
across as its container changes shape (landscape, square, portrait — a full
slide or a narrow nested cell).

- `families.js` — the canonical `@container` aspect-ratio boundaries plus
  `familyFor()` / `orientationFor()`.

Consumed by `lib/runtime/index.js` (bundled into `dist/lattice-runtime.js`)
and `tools/build-docs-portal.js`. Rationale:
`engineering/decisions/2026-06-18-component-adaptive-sizing.md`.

**Gotcha:** CSS `@container` queries cannot read `var()`, so these numeric
boundaries are hand-written literally in each piloted component's CSS. A
drift test asserts the CSS numbers match this module — change one side and
the test fails until you change the other.
