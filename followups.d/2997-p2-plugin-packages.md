---
origin: 2997
priority: P2
recorded: 2026-11-02
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-01-plugin-contract-hollywood.md §5, §9
deferred: large — moves every workspace library out of docs/src/lib into a top-level packages/ (the docs build, the route budget and every import path change), adds a contract package and a private package.json per plugin; outside #2997's split line (owner decision 8, 2026-11-02)
source: https://github.com/Laticent/lattice/pull/2997
---

# The plugin packages: `@laticent/plugin-api`, a private `package.json` per plugin, a top-level `packages/`

why now   — the Hollywood note's step 5. Today a plugin's allowed imports are the gate's rule (own folder, the
            workspace libraries, the plugins it `requires`); a private package.json makes them the plugin's own
            declaration, which is what an npm plugin will carry, and `@laticent/plugin-api` gives the contract
            (ctx types, manifest schema, `api` versions) one home instead of spec/LPM.md plus resolve.js.
where     — engineering/decisions/2026-11-01-plugin-contract-hollywood.md §5 (the table, versioning, layout);
            package.json `workspaces`; tools/structure.js (`declared`, the library rule); lib/plugins/*/.
done when — every workspace library `lib/` imports lives under packages/; `@laticent/plugin-api` exists and
            resolve.js reads `KNOWN_API` from it; each in-tree plugin has a private package.json mirroring the
            engine's version, and the structure gate holds each plugin to its declared dependencies; `npm pack`
            shows the root tarball unchanged in what it ships. Publishing them stays an owner decision (§7 Q3).
evidence  — npm run identity:check (0 differ); npm pack --dry-run before and after; route budget measured
verify    — npm run build:check; npm test; checker on the diff (it moves every library import path)
