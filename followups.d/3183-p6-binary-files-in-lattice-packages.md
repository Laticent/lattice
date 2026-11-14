---
origin: 3183
priority: P6
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-09-23-portable-packages.md §4
deferred: off-path — the package reader in both tools; PR 3183 moved the .lattice reader without changing how package files are decoded
source: https://github.com/Laticent/lattice/pull/3183
---

# A binary file inside a .lattice package is read as text and corrupted, in the Studio and the CLI

why now   — The shared .lattice reader (lib/packages/lattice-read.mjs, from PR 3183) and the Studio before it read every package
            file as a UTF-8 string, so a font or a raster image inside a package would not survive a round trip.
where     — lib/packages/lattice-read.mjs, docs/src/components/studio/asset-bundle.ts unpackPackages, lib/core/reopenable.js
            buildLatticeZip.
done when — a package carrying a binary file (a woff2, a PNG) round-trips byte for byte through Studio import, CLI render and
            .lattice copy; text files keep their EOL rules.
evidence  — a round-trip test with a binary fixture that fails before the fix.
verify    — tier 1 checker.
