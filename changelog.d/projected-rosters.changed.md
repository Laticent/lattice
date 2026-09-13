- **Adding a chart no longer means remembering nine hand-maintained lists.** Each component
  manifest now declares one `projection` block — how its rendered visual travels off the slide
  (`svg` · `flow` · `spatial` · `placeholder` · `bare` · `none`) and whether its substance is
  data — and `lib/core/projection-catalog.generated.mjs` projects that into the sets the prose
  projection, the image-set export, the Studio's single-chart export, `tools/export-chart-svg.js`
  and the deck scorecard read. Four of the nine literals it replaces held the identical twelve
  names in four different files. None of the nine went red when a chart was missing from it: an
  omission rendered chart fills black, or silently downgraded a vector export to PNG. A
  chart-bucket component that declares no `projection.figure` now fails `build:check`.
- **A deck built on a `journey`, `matrix-grid` or `roadmap` slide now scores Data instead of
  reporting `N/A`.** Those three are chart layouts the scorecard's own roster comment said
  belonged to it, and their absence was drift. This is the only behavior change in the set;
  the other eight projected sets are identical to the lists they replace.
- **A new component with no curated docs family now falls back to its engine bucket** rather
  than to `other`, so a dropped chart appears in the component browser's shape lens with no
  edit to `families.mjs`.
- **`esm.run` is now barred by the docs no-CDN gate**, with the Studio's three AI-tier imports
  carrying a per-URL sanction and its reasoning. `esm.run` redirects to `cdn.jsdelivr.net`,
  which that gate already barred, so the host had been reachable through an alias.
