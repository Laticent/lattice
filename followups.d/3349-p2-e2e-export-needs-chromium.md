---
origin: 3349
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: docs/scripts/e2e-ensure-browsers.mjs
deferred: off-path — met while driving #3349's WebKit and Firefox e2e; #3349 touched no test infrastructure
source: https://github.com/Laticent/lattice/pull/3349
---

# The docs e2e suite does not install Chromium when only WebKit or Firefox projects run

`docs/scripts/e2e-ensure-browsers.mjs` installs a browser only when a selected Playwright project
needs it. Four specs export a deck through the CLI first, and the CLI runs Chromium (build 1194 for
`@playwright/test` 1.56.1) whatever project is selected. So `cd docs && npm run test:e2e --
--project=webkit-phone --project=webkit-tablet --project=gecko` fails 14 tests with
`Browser was not found at the configured executablePath (/opt/pw-browsers/chromium-1194/...)`:
`player-chart-reveal`, `code-copy-engines`, `collage-player-engines` and `export-subresource-engines`.
On 2026-11-21, `npx playwright install chromium` (from `docs/`) made all 26 of those runs green.

done when — `e2e-ensure-browsers.mjs` installs Chromium whenever a selected spec exports through the CLI,
and the three-project command above passes in a fresh sandbox without a manual install.
