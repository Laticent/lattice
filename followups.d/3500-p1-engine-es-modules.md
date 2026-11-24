---
origin: 3500
priority: P1
recorded: 2026-11-23
area: engine
severity: low
swimlane: engineering/architecture.md
deferred: large — about 450 engine files and 1,200 test files, three days before the 1.0.0 freeze; the owner chose after-release
source: https://github.com/Laticent/lattice/pull/3500
---

# Convert the engine from CommonJS to ES modules

why now   — the 12 libraries are ES-modules-only from 1.0 (owner, 2026-11-23); the engine is the last CommonJS layer, half-migrated (642 .js and 270 .mjs files in lib/). It is not a breaking change: `import` users are unaffected, and `require` users keep working through Node's require(esm) on our floor (>=22.13).
where     — lib/ (2,130 require() calls in 449 files; 61 lazy requires inside functions; 28 files use __dirname; 6 use require.resolve), tools/, test/ (1,214 .js files), packages/lattice/package.json (`type`, `exports`), the CLI bundle (dist/lattice-min.js). Two bundlers keep a CommonJS lastra on purpose (tools/lib/lastra-closure.js): converting must keep lastra's names out of functions an export ships as `toString()` source.
done when — packages/lattice/package.json declares "type": "module", lib/ holds no CommonJS, `require('@laticent/lattice')` and `import` both still return the engine (installed-package test), and the full unit + integration tiers pass.
evidence  — a design note first (lazy loading, __dirname, the CLI bundle, test migration order), then the before/after file counts and the installed-package test both ways.
verify    — tier 2 adversarial trio: it changes how every engine module loads.

Measured on main 2026-11-23 by the release desk; the owner asked for this item in that session ("create a follow up for it. we can do it after release").
