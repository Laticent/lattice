# spec/ — the format specification

The canonical, hand-written spec for LFM (Lattice-Flavored Markdown) and
the Diagnostic Protocol:

- `LFM-1.0.md` — ratified 2026-10-08. Its shared test cases are in `conformance/lfm/`.
- `diagnostics.md`
- `LPM.md` — the Lattice Plugin Model, a **draft** (0.x) until Mermaid and the chart family run on
  it. Not projected into the docs site while it is a draft.

These are the source of truth. `npm run docs:spec` projects them into the
docs site; `docs:spec:check` fails CI if the generated pages drift. Edit
here, regenerate — never edit the generated docs-site copies.
