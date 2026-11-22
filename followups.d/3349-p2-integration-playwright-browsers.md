---
origin: 3349
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: test/integration/export-nightly/npm-plugin-export-check.test.js
deferred: off-path — met while running #3349's integration tier; #3349 touched no test infrastructure
source: https://github.com/Laticent/lattice/pull/3349
---

# The integration tier never installs WebKit or Firefox for its export check

`test/integration/export-nightly/npm-plugin-export-check.test.js` launches WebKit and Firefox through
`docs/node_modules/playwright`, but `npm run test:integration` installs neither. In a fresh cloud sandbox,
8 subtests fail with `browserType.launch: Executable doesn't exist at /opt/pw-browsers/webkit-2215/...`.
On 2026-11-21, `cd docs && npx playwright install --with-deps webkit firefox` made the file pass, 12 of 12.
Use that copy of Playwright: the global `npx playwright` is a different version (1.63) and installs
other builds.

done when — the integration tier installs (or fails loudly on) the browsers this file needs, the way
`docs/scripts/e2e-ensure-browsers.mjs` does for the e2e suite, and the file passes in a fresh sandbox.
