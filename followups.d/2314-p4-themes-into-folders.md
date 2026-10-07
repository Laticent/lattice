---
origin: 2314
priority: P4
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Seed a shipped motion library, and let the theme schema take `type` and `format`

Spec: `engineering/decisions/2026-09-23-portable-packages.md` (§8 phase 5, §10).

```text
why now   — the owner chose one shape for every kind. Themes moved into themes/<name>/ folders
            (2026-10-06, PR #2568); the other two halves of phase 5 are still open.
where     — lib/motion/ (new), the Studio surface that inserts from it; themes/theme.schema.json and
            test/unit/tools/manifest-schema-equivalence.test.js for the two fields.
done when — example motion ships as packages that something lists and inserts, and a shipped theme
            manifest may carry "type": "theme" and "format": 1 like every other kind.
evidence  — `lattice packages list --type motion` names the shipped scenes; a theme manifest with
            both fields passes the schema and the equivalence corpus.
verify    — build:check + integration.
```

## Themes into folders: done (2026-10-06)

The blocker this file used to record is gone. It was an external desktop wrapper that might read
flat theme paths off disk, which no Lattice session could check. #2552 records that the desktop app
is built in THIS repository and does not exist yet, so nothing outside the repo reads `themes/`,
and the move went ahead without flat compatibility copies. The published
`@laticent/lattice/themes/<name>.css` still resolves, through an `exports` remap measured from a
packed tarball. The record is the spec's §10 "Phase 5" entry.

## The motion library (unstarted)

The examples hold 7 scenes (`examples/anima-scene.md` ×3, `examples/motion-asset.md` ×4) that could
seed `lib/motion/<name>/`, but nothing yet LISTS shipped motion except `lattice packages list`. So
seed it together with the Studio surface that inserts from it, or the shipped data sits unread.

## The theme schema's `type` and `format` (unstarted)

`manifest-schema-equivalence.test.js` pins the theme schema's exact mutation corpus and requires
every property to be carried by a shipped theme, so adding the two fields means stamping all 33
shipped theme manifests in the same change. Until then a Studio-exported theme's stamped manifest
is a valid package but not yet a valid `themes/` manifest.
