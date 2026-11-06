---
origin: 3048
priority: P4
recorded: 2026-11-06
area: infra
severity: low
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §3
deferred: blocked — a post-build check is a new CI step, and adding one is the owner's call (CLAUDE.md, the CI / hook contract)
source: https://github.com/Laticent/lattice/pull/3048
---
# Pin that the shipped bundle names the key in exactly one chunk

why now   — openrouter-key.test.ts greps docs/src for the key's name, so a name built at
            runtime, a file under lib/ the site bundles, or an imported *.test.ts would pass
            it. The shipped bundle sees every path at once. Measured 2026-11-06:
            `grep -l lattice-db-or-key docs/dist/_astro/*.js` lists one file,
            openrouter-key.*.js.
where     — a post-build step after `npm run build:e2e` (or the docs build in ci.yml).
done when — the build fails if the key name appears in more than one chunk under
            docs/dist/_astro, or in any HTML file.
evidence  — the step red with a planted second reader.
verify    — tier 0, once the owner approves the CI step.
