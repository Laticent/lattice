- **Fixed: a `classDiagram` deck now renders to the same bytes every time.** Mermaid's
  class-node shape builds its box through rough.js on every render and only flattens the
  wobble afterwards, so a *classic* diagram still read `handDrawnSeed` — which Lattice
  emitted only for `look: handDrawn`. rough.js treats the resulting default of `0` as
  "use `Math.random()`", and spends one draw positioning each edge's bezier control
  points along the segment. Both points stay on the straight line between the endpoints,
  so the picture never changed and the `<path d>` text changed on every render. The seed
  is now stated on both looks. Renders are pixel-identical to before — measured across
  all 31 committed mermaid decks: 7 changed bytes, 0 changed pixels beyond the 2-7 px of
  anti-aliasing those decks were already flickering between run to run, which this fix
  removes. No golden was re-blessed.
- **Fixed: the committed-golden freshness gate now runs on a cadence.**
  `tools/regression-gate.mjs` renders every committed deck fresh and pixel-diffs it
  against its golden, and it was wired to no workflow and no hook — the one tool able to
  see a stale golden ran nowhere. It now runs nightly over both scopes, report-only,
  feeding the existing rolling tracking issue. Tolerances are unchanged. The first run on
  `main` reports 75/75 galleries green and 184 of 199 deck goldens drifted; re-blessing
  that corpus is deliberately a separate change.
