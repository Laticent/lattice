---
origin: 2601
priority: P1
recorded: 2026-10-08
area: engine
severity: high
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# `require('@laticent/lattice')` runs the CLI and exits the host process

why now   — package.json `main` and `exports["."]` point at dist/lattice.js, the CLI bundle (and
            `./min` at its minified twin). Importing the package therefore parses the HOST's argv,
            prints the usage text and calls process.exit(1): `require("@laticent/lattice")` kills
            the program that imported it. Found by the red-team lens on #2601 from a clean-room
            install of the packed tarball; pre-existing on main, not caused by the rename. After
            1.0.0 the root import is a public promise, so it must be settled before the first
            publish (slice E).
where     — package.json `main`, `exports["."]`, `exports["./min"]`; README §exports table;
            RELEASE.md §The distribution contract; the `bin` (unchanged either way).
done when — the owner picks what the root import is (recommended: the engine, i.e. `.` →
            ./lib/engine/index.js like `./engine`, `main` the same, and the CLI reachable only
            as the `lattice` bin; alternative: no `.` export at all), and an installed-package
            test asserts `require('@laticent/lattice')` returns without exiting.
evidence  — test/integration/export/installed-package.test.js gains the arm; its failing run
            on today's manifest (the process exits 1 before the next line).
verify    — tier 1 checker, because it changes the package's public entry point.
