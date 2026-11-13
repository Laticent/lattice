---
origin: 3142
priority: P3
recorded: 2026-11-11
area: infra
severity: low
swimlane: RELEASE.md §The distribution contract
deferred: blocked — the owner has not decided whether to publish a second, unscoped package; it is an npm publishing call only they can make
source: https://github.com/Laticent/lattice/pull/3142
---
# Decide on a short no-install command (`npx latt`), and reserve the names on npm

why now   — `lat` ships as a short command, but only after an install: npm's unscoped `lat`
            and `lattice` belong to other publishers, so the no-install form stays
            `npx @laticent/lattice`. A second, unscoped package would give a short no-install
            command. `latt` was free on npm on 2026-11-11 (so were `laticent` and
            `create-laticent`).
how       — If yes: publish `latt` whose `bin` carries `latt`, `lattice` and `lat`. npx runs
            the bin named after the package, so it must carry `latt`. Have it depend on
            `@laticent/lattice` and point every bin at that package's `dist/lattice.js`.
            Either way: confirm Laticent owns the `@laticent` scope on npm.
done when — the owner has decided; if yes, `npx latt --help` works from an empty folder.
verify    — `npx latt --help` in an empty folder prints the Lattice help.
