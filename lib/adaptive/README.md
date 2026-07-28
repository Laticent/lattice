# lib/adaptive — box families (structural breakpoints)

The single source of truth for the four "box families" a component reflows
across as the deck's shape changes: `wide` · `square` · `tall` · `strip`.

- `families.js` — `FAMILIES` and their aspect boundaries, plus `familyFor()`,
  `familySelector()` and `orientationFor()`.

Consumed by `lib/engine/index.js` and `lib/engine/css.js` (the export path —
`lib/engine/slides.js` does the stamping but receives the verdict as `opts.family`
rather than importing this module), `lib/runtime/index.js` (bundled into
`dist/lattice-runtime.js`), `lib/authoring/lint.js`, and
`tools/build-docs-portal.js`.

**One classifier, one measurement.** `familyFor()` runs in JS over the DECK
geometry, and both render paths stamp the verdict on the `<section>` as
`data-family`. Component CSS selects that stamp — it never measures anything:

```css
section.foo:where([data-family="tall"], [data-family="strip"]) > .cell-stage { … }
```

Two details that matter when writing one of these rules:

- **The filter attaches to the `section` compound.** The stamp is *on* the
  section, and sections are direct children of `<body>`, so a LEADING
  `:where([data-family=…]) section.foo` is a descendant combinator that matches
  nothing. Use the leading form only when the subject is a descendant
  (`:where([data-family="tall"]) figure.foo .bar`).
- **`wide` carries no stamp.** It is the default, so it is the *absence* of the
  attribute — `familySelector('wide')` returns
  `:where(section:not([data-family]))`, and `[data-family="wide"]` never matches.

**Gotcha — do NOT reach for `@container … aspect-ratio` here.** That was the
mechanism until #1218, and it was silently broken: a container query evaluates
the container's CONTENT box, which the section's asymmetric padding makes
proportionally wider than the deck, so a 1080×1080 deck measured 1.051 and missed
every `<= 1.05` rule in the library. The whole `square` tier was inert for the
life of that mechanism. A unit test now fails the build if an aspect-ratio
container query reappears anywhere in `lib/`. See
`engineering/decisions/2026-07-27-family-stamp-replaces-container-queries.md`
(and `2026-06-18-component-adaptive-sizing.md` for the family model itself, whose
*trigger* that note supersedes).
