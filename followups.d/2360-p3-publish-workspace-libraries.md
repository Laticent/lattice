---
origin: 2360
priority: P3
recorded: 2026-09-25
area: infra
severity: low
swimlane: RELEASE.md
source: https://github.com/Laticent/lattice/issues/2360
---

# Build a publish path for the workspace libraries (ltt and Cadenza together)

why now   — the libraries are packaged to be published (`@laticent/ltt`, Cadenza, Suono, Lente,
            Vetrina; each typechecks in a nodenext consumer since the step-2 PR), and Cadenza's
            published types import `ltt`'s, so the two must reach npm together. Nothing
            publishes any of them: `release-publish.yml` and tools/release.js publish none.
where     — .github/workflows/release-publish.yml, tools/release.js, the five
            docs/src/lib/*/package.json files (versions, `files`, `exports`).
done when — the owner decides whether the libraries publish at all and on what cadence (a new
            CI job or step is the owner's call — CLAUDE.md second filter, row 2), and if so, one
            release publishes ltt before Cadenza at matching versions, gated on
            test/unit/tools/package-nodenext-types.test.js.
evidence  — a dry-run publish (`npm publish --dry-run`) of ltt and Cadenza from the workflow.
verify    — maker-checker: it adds a release step and an external, irreversible surface.

**Owner ruling, 2026-09-25: not now.** Keep this open until the main package publishes. A
check that day found `npm view @laticent/lattice` returns E404: the package has never reached
npm, most likely because `NPM_TOKEN` is unset, so `release-publish.yml`'s publish step skips.
Measured the same day with `npm publish --dry-run --access public` in each package folder:
`@laticent/ltt` 0.1.0 packs 21 files, 38.8 kB (146.6 kB unpacked), and `@laticent/cadenza`
0.1.0 packs 30 files, 86.6 kB (264.2 kB unpacked). Cadenza pins `@laticent/ltt` at exactly
`0.1.0`, so the two must be published at matching versions.

**Trama, 2026-09-27.** `@laticent/trama` (the graph-chart library) is a sixth workspace
library, and the flowchart draws with it on every export. The published CLI bundle,
`dist/lattice-emulator.js`, inlines it (`tools/build-emulator.js` `INLINE_PACKAGES`, pinned by
`test/unit/trama/serialization.test.js`), so the bin needs no install of it. Two surfaces still
resolve it only through the workspace symlink: the LOOSE `lattice-emulator.js` source and a
consumer that `require()`s `lib/components/chart/flowchart/flowchart.layout.js` directly. On
either, outside the repo, the flowchart exports as its fallback tiles, and the CLI now warns
that it did. Publishing Trama, or adding it to `dependencies`, closes both.

**Added by #2512, 2026-10-05: the main package now needs Trama at render time.** Hub-spoke's
transform requires `@laticent/trama/radial` on its first slide (lazily, so the engine itself
still loads). The bundles in `dist/` inline it, but the `./engine` and `./lib/*` exports load
`lib/` raw, and the package's `files` does not carry `docs/src/lib/trama/dist/`. So the day
`@laticent/lattice` publishes, Trama must ship with it (a dependency or inside `files`), or a
hub-spoke slide rendered through `./engine` throws `Cannot find module '@laticent/trama/radial'`.
The flowchart's browser pass has the same need.
