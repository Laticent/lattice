---
origin: 3142
priority: P3
recorded: 2026-11-11
area: infra
severity: low
swimlane: RELEASE.md §The distribution contract
deferred: off-path — npm packaging, not the skill-security scan PR #3142 ships; best landed before the first npm publish of @laticent/lattice (owner: by 2026-11-15)
source: https://github.com/Laticent/lattice/pull/3142
---
# Ship `lat` as a short command, and reserve a short no-install package name

why now   — The owner wants a shorter command than `lattice`, and the no-install form,
            `npx @laticent/lattice`, is long. The bare `npx lattice` is not an option: on npm the
            unscoped `lattice` belongs to an unrelated publisher (openlattice, last updated
            2022-06-19).
what was checked (2026-11-11) —
            `lat` is not a common system command, and a command that ships inside our own package
            does not need a free npm name. Rejected: `lt` (localtunnel's command), `lxd`
            (Ubuntu's container manager), `ltc` (Litecoin), `ltx` (a LaTeX file extension).
            Free on npm for a no-install alias package: `latt` (preferred), `laticent`,
            `create-laticent`.
how       — 1. `package.json` `bin`: add `"lat": "dist/lattice.js"` beside `lattice`. Check that
               `tools/build-cli.js` and the release zip (RELEASE.md §The GitHub release zip) need
               nothing else.
            2. Optional, owner's call: publish an unscoped alias package (`latt`) whose bins are
               `latt`, `lattice` and `lat`. npx runs the bin named after the package, so it must
               carry `latt` for `npx latt deck.md deck.pdf` to work.
            3. Reserve the chosen names on npm before announcing them, and confirm Laticent owns
               the `@laticent` scope.
            4. Docs: mention `lat` beside `lattice` in `docs/src/content/docs/reference/cli.md`
               and `design/skills/cli.md`.
done when — after `npm install -g @laticent/lattice`, `lat --help` prints the Lattice help, and
            (if step 2 is chosen) `npx latt --help` does too from an empty folder.
verify    — a global install in a clean container; `npx latt --help` in an empty folder.
