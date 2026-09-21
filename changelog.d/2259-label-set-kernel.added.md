- **A component can now DECLARE the set it draws a key for, in its manifest.** The new
  `labelSet` field names the members a key decodes, the default word for each, and the
  markers a component deliberately leaves unkeyed with the reason. It is baked into
  `lib/core/label-set-catalog.generated.js`, and the transform renders from the same rows
  `lint:deck` checks an authored override against — so a key vocabulary that disagrees with
  what the component actually renders is no longer expressible. This is the move
  `coda.claims` made when it replaced two hand-maintained exclusion lists that were wrong
  for 8 of 61 layouts. `roadmap` and `heatmap` declare one; the render is byte-identical on
  both. (`lib/components/manifest.schema.json`, `tools/build-stage-catalog.js`)
- **`lint:deck` now warns on a label-set key that binds to nothing**, naming the keys that
  would work. Until now the only report of a dropped key went into the chart's `<desc>` —
  heard by a screen reader, never by the author who made the mistake. Three findings, and
  the third is why `unkeyed` is a manifest field rather than an absence: a `matrix-grid`
  author naming `[x]` is told that a filled cell's own text *is* its label, not that the
  key is "unknown". Warns, never blocks. (`lib/authoring/lint-core.js`)
- **A label set is addressed by the marker an author already types** — `[x]`, `[-]`, `[ ]`,
  `[/]` — rather than by an internal state name. The brackets are load-bearing: a bare `' '`
  key collapses to empty under the parser's whitespace tidy and takes its row with it, so
  the bracketed spelling is the one that works and is now pinned by a test.
  (`lib/core/label-set.js`)
- **The key HTML has one home.** `buildHtmlLegend` is the sibling of `svg-legend.js` for
  components whose figure is a real `<table>` and so has no viewBox to live in. `roadmap` is
  ported onto it with byte-identical output, verified against a fresh render of its shipped
  gallery, not only against tests. Class names are passed in full rather than composed from
  a prefix — `checkChartMarks` proves a declared mark class is really written by searching
  string literals under `lib/`, and a composed `${prefix}-legend-mark` is invisible to it.
  (`lib/core/html-legend.js`)
- **`liftLabelSet` moved from `heatmap` into the kernel**, so the second adopter neither
  imports across components nor re-derives it. It carries a bug worth keeping fixed: EVERY
  one-code paragraph is a candidate, because a slide's eyebrow sets in exactly the same
  shape and testing only the first match finds the eyebrow, fails to parse it, and silently
  renders the set as a subtitle. (`lib/core/label-set.js`, `lib/core/plain-text.js`)
