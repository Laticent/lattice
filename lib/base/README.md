# lib/base — the foundational CSS layer

The CSS every component inherits: design tokens, semantic element defaults,
auto-detected chrome (eyebrow/subtitle), universal variants, tint/mark
treatments, finish backdrops, and sketch mode. All CSS — nothing here is
`require`d as JavaScript.

**Read `base.docs.md` in this folder** — it is the canonical file-by-file
and feature-by-feature reference; this README is just the signpost.

`tools/build-css.js` concatenates these files in a fixed, load-bearing
order (`base.tokens.css` first) into `dist/lattice.css`.

**Gotchas:** the `--fs-*` typography block inside `base.tokens.css` is
generated from `lib/typography/scale.js` — do not hand-edit it. The finish
CSS has two faces: alpha-blended for screens and an opaque mirror for
`@media print` / `.lattice-exporting` — removing "redundant" opaque rules
bakes gray clouds into exported PDFs.
