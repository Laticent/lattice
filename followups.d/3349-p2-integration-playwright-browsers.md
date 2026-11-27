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
8 subtests fail with `browserType.launch: Executable doesn't exist at /opt/pw-browsers/webkit-<build>/...`.
On 2026-11-21, `cd docs && npx playwright install --with-deps webkit firefox` made the file pass, 12 of 12.
Use that copy of Playwright: the sandbox's global `npx playwright` can be a different version (1.63 on
2026-11-21, against the docs copy's 1.56.1) and installs other builds. `main` pins 1.65.1 as of 2026-11-27,
and no change to this file or to the integration tier since then installs these browsers.

Re-checked 2026-11-27 on `main` at e0598ab6 (`@playwright/test` 1.65.1): `node --test
test/integration/export-nightly/npm-plugin-export-check.test.js` failed 4 of 12, every one
`Executable doesn't exist at /opt/pw-browsers/firefox-1572/...`. WebKit passed only because an e2e run had just
installed it.

done when — the integration tier installs (or fails loudly on) the browsers this file needs, the way
`docs/scripts/e2e-ensure-browsers.mjs` does for the e2e suite, and the file passes in a fresh sandbox.
