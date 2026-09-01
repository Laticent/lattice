- The docs end-to-end suite starts again on astro 7. `astro preview` now forks and returns, so
  Playwright's `webServer` reported `Process from config.webServer exited early` and abandoned every
  run before a test body executed. `npm run preview:e2e` goes through `docs/scripts/preview-e2e.mjs`,
  which blocks in the foreground for as long as the server lives and stops it on the way out —
  including a daemon an earlier run left behind, which `reuseExistingServer` would otherwise pick up
  and silently test a stale build against.
