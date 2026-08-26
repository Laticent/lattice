- **Added: the Coach quick-read chips have real-browser coverage.** Every claim about them
  was jsdom, and a user-facing claim wants the surface a person actually uses. One `@smoke`
  Playwright test drives the `Top fixes` chip in Chromium on a deck with no `_class`
  directives and pins the honesty guard — the card must say it has not assessed the deck
  rather than congratulating it — plus the guard's narrowness, since `Structure` reads the
  source directly and must still answer. Mutation-checked both ways: with the guard reverted
  the test fails.
