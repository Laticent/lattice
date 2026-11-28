# spec/ — the format specification

The canonical, hand-written specs: LFM (Lattice-Flavored Markdown), the Diagnostic Protocol and
the Lattice Timing Track (LTT):

- `LFM-1.0.md` — the consolidated LFM 1.0 for the Lattice 1.0 release: a core and four profiles, the
  `@meta` record and the four notes. It replaces the 2026-10-08 text and the 1.1 and 2.0 drafts, and
  is a **draft** for the owner's sign-off. Its shared test cases are in `conformance/lfm/`.
- `diagnostics.md`
- `LTT-1.0.md` — the Lattice Timing Track, ratified. It moved here from `engineering/ltt.md` on
  2026-10-08; its conformance fixtures stay beside its reference implementation, in
  `docs/src/lib/ltt/conformance/`.
- `THEME-1.0.md` — the theme contract: what a theme file holds, the 118 tokens, the manifest and what a
  reader refuses. A **draft** for the owner's sign-off; its cases are in `conformance/theme/`.
- `LATTICE-FILE-1.0.md` — the `.lattice` project file. A **draft** for the owner's sign-off; its
  cases are in `conformance/lattice-file/`.
- `EXTENDING-1.0.md` — the seven rules every spec here follows: a closed core, profiles, registries, prefixed
  names, ignoring what a reader does not know, the version line, and what each version may change. A **draft**
  for the owner's sign-off (`engineering/decisions/2026-11-27-specs-1-0.md`); not projected into the docs site
  until it is ratified.
- `SEGNO-1.0.md` — Segno notation, the curly-brace syntax pills, sparks, icons and `@meta` records
  are written in: its grammar, its tree, its refusals and its versioning rule. A **draft** for the
  owner's sign-off; its cases are in `conformance/segno/`.
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
