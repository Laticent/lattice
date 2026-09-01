- **Every hand-authored manifest is now checked against its JSON Schema.** All
  four families already shipped a `*.schema.json` beside their manifests, and all
  four already declared `additionalProperties: false` — but nothing in the repo
  ran a JSON-Schema validator, so each family grew its own hand-written checker
  and the three disagreed about how much they checked. `tools/manifest-schemas.js`
  now holds one registry of the families and validates all 131 manifests with
  `ajv` (a devDependency; build-time only, so no schema JSON reaches a browser
  bundle). It runs inside `check-ownership.js`, which `npm run build:check`
  already invokes in CI and the pre-push hook — no new CI step, no new git hook.
- **The Form model's frames, cells and tiles were never checked at all.** Their
  validators never read their schemas — the enums are hand-copied — so unknown
  keys passed silently across 37 files. Renaming the optional `slicing` block on
  the `standard` frame to `slicng`, a one-letter typo that deletes the frame's
  whole responsive behavior, returned zero errors from every checker in the repo.
  It now fails the build.
- **Three component manifests carried undeclared fields two levels down**, where
  the component validator does not look: `adapt.capacity.axisRetired` on
  `matrix-2x2` and `split-compare`, and `adapt.capacity.wide.note` on `kpi`. Both
  fields are legitimate and are now declared. `axisRetired` is a tombstone whose
  point is the *absence* of `axis` — `splitFactsFor` reads that key as a split
  opt-in, so restoring it re-enrolls a component in a per-item split its own
  design resolution forbids. `note` is the per-family counterpart of the flat
  `capacity.note` and already ships into `dist/docs/components.json`.
- **The gate also catches a typo'd keyword inside a schema file** (`patttern`),
  a manifest belonging to no registered family, and a `$schema` link resolving to
  another family's contract — the link editors follow for inline completion.
- `themes/theme.schema.json` moved from JSON Schema draft-07 to 2020-12, matching
  the other four schemas.
