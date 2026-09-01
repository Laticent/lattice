- The docs end-to-end suite starts again on astro 7. `astro preview` now forks and returns, so
  Playwright's `webServer` reported `Process from config.webServer exited early` and abandoned every
  run before a test body executed. `npm run preview:e2e` goes through `docs/scripts/preview-e2e.mjs`,
  which serves the site IN-PROCESS through astro's programmatic `preview()` and blocks on
  `server.closed()`, so there is no daemon that can outlive the run — and none that a later run's
  `reuseExistingServer` can silently adopt and test a stale build against.
