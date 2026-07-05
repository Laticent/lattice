# lib/concepts — the design-vocabulary ontology

A hand-authored graph of Lattice's concepts (axes, Frame/Cell/Tile nouns,
the Component join, and the relationships between them), validated against
the live catalogs so it can never claim something the engine doesn't ship.

- `concepts.json` — the ontology (hand-authored).
- `index.js` — `loadConcepts()`: shape + referential-integrity validation
  plus the drift gate against live catalogs.

Consumed by `tools/build-concepts.js` (→ `dist/docs/concepts.json`).
Human-facing concept map: `design/concepts.md`.

**Gotcha:** this module is Node-only (it reads files) — do not import it in
browser code. Counts are derived at build time; never hand-write a count
into the JSON.
