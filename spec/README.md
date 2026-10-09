# spec/ — the format specification

The canonical, hand-written specs: LFM (Lattice-Flavored Markdown), the Diagnostic Protocol and
the Lattice Timing Track (LTT):

- `LFM-1.0.md` — ratified 2026-10-08. Its shared test cases are in `conformance/lfm/`.
- `LFM-1.1.md` — a **draft** for the owner's sign-off: the front-matter registers, the `_lens` tag
  and the inline notation, each with shared test cases. Not projected into the docs site until it
  is ratified, like `LPM.md`.
- `diagnostics.md`
- `LTT-1.0.md` — the Lattice Timing Track, ratified. It moved here from `engineering/ltt.md` on
  2026-10-08; its conformance fixtures stay beside its reference implementation, in
  `docs/src/lib/ltt/conformance/`.
- `THEME-1.0.md` — the theme contract: what a theme file holds, the 118 tokens, the manifest and what a
  reader refuses. A **draft** for the owner's sign-off; its cases are in `conformance/theme/`.
- `LATTICE-FILE-1.0.md` — the `.lattice` project file. A **draft** for the owner's sign-off; its
  cases are in `conformance/lattice-file/`.
- `LPM.md` — the Lattice Plugin Model, a **draft** (0.x) until Mermaid and the chart family run on
  it. Not projected into the docs site while it is a draft.

These are the source of truth. `npm run docs:spec` projects them into the
docs site; `docs:spec:check` fails CI if the generated pages drift. Edit
here, regenerate — never edit the generated docs-site copies.

## The four parts

A spec is four things: the document, a schema, a reference implementation and shared test cases
(`engineering/decisions/2026-10-08-spec-audit.md` §2). Each file here names the other three in a
comment under its title, which the site does not show:

```markdown
<!-- spec-parts
schema: themes/theme.schema.json
reference: lib/theme/gate.js lib/theme/derive.js
tests: spec/conformance/theme/
-->
```

Paths are repo-relative and space-separated. `schema` may instead say `none: <why>` when the
document states the shape itself. `checkSpecParts` in `tools/check-ownership.js` runs inside
`npm run build:check` and fails on a missing block, a missing part or a path that no longer exists.
