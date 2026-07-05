# spec/ — the format specification

The canonical, hand-written spec for LFM (Lattice-Flavored Markdown) and
the Diagnostic Protocol:

- `LFM-1.0.md`
- `diagnostics.md`

These are the source of truth. `npm run docs:spec` projects them into the
docs site; `docs:spec:check` fails CI if the generated pages drift. Edit
here, regenerate — never edit the generated docs-site copies.
