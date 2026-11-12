- **Tests are fixed, never switched off without proof (HARD RULES #33 and #34).** `build:check`'s flaky-test census now
  fails on a test disabled by a literal (`{ skip: true }`, `test.skip('title', …)`, a bare `test.fixme()`) unless the
  comment above it gives what was tried, the evidence and what would re-enable it, and on any `.only`. Twelve integration
  files that skipped themselves when Chromium was missing, and so read as green in CI, now use `skipWithoutChrome`, which
  fails in CI.
- **Playwright no longer retries a failing test in CI.** `docs/playwright.config.ts` sets `retries: 0`, held by
  `checkPlaywrightRetries`; the nightlies now report a flaky test as a failure instead of a pass.
