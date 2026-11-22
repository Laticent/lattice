---
origin: 3366
priority: P3
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/development.md
deferred: off-path — the docs e2e build pipeline for the in-repo libraries; #3366 changes only Playwright and test specs
source: https://github.com/Laticent/lattice/pull/3366
---

# The e2e site build serves cadenza's install-time dist, not its source

why now   — docs/src/lib/cadenza has its own package.json (`module: ./dist/index.mjs`), so `@/lib/cadenza` resolves to a dist/ that is generated at install and that `npm run build:e2e` does not rebuild. On #3366 a mutation of src/lib/cadenza/cadence.ts (EMPHASIS_HOLD_MS = 0) never reached the e2e site, and present-emphasis passed against it; only a mutation of dist/index.mjs turned it red. An edit to cadenza's source is therefore not what an e2e run tests until the next install. The other in-repo libraries with the same package shape may share it.
where     — docs/package.json `build:e2e`; docs/src/lib/cadenza/package.json; any sibling library under docs/src/lib with its own package.json and dist/
done when — `build:e2e` (or the step it calls) rebuilds every in-repo library dist the site imports, or the site resolves those imports to source, and a source-only mutation of cadence.ts turns present-emphasis red
evidence  — #3366: source mutation 2/2 passed; dist mutation 2/2 failed
verify    — mutate EMPHASIS_HOLD_MS in src/lib/cadenza/cadence.ts, cd docs && npm run build:e2e && npx playwright test e2e/present-emphasis.spec.ts --project=desktop: it must go red
