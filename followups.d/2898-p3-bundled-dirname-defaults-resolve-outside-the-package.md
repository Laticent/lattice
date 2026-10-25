---
origin: 2898
priority: P3
recorded: 2026-10-25
area: infra
severity: low
swimlane: engineering/decisions/2026-09-13-bundle-era-skew.md
source: https://github.com/Laticent/lattice/pull/2898
---

# Other `__dirname` defaults inlined into dist/lattice.js resolve outside the package

why now   — PR #2898 fixed one of these (`loadAll()` walked `dist/`). The checker found the same pattern
            in files esbuild inlines into the CLI bundle, where `__dirname` is `dist/`, not the source folder.
found     — `lib/authoring/lint.js` `themeNames()` defaults to `__dirname/../../themes`, which in the bundle
            is outside the package, so the bundle's lint vocabulary has no theme names (the CLI reads only
            `unknown-class` findings today, so nothing visible was shown). `lib/core/marp-fidelity.js`
            reads `__dirname/../plugins`, missing in the bundle, which may drop plugin rows from the
            Export-to-Marp fidelity report. `lib/theme/files.js` `ROOT_THEMES` and `lib/packages/fs.js` `ROOT`
            have the same shape but every bundled caller passes a path. (`loadAll` itself is pinned by
            `test/unit/components/loader-bundle-root.test.js`.)
where     — resolve each through `pkgRootFrom` (`lib/core/pkg-root.js`), as `SCHEMA_PATH` and `loadAll` do.
done when — no inlined module resolves a package file from a bare `__dirname`, or each one says why it is safe.
verify    — run the bundled CLI from an installed copy and show the theme vocabulary and fidelity rows are filled.
