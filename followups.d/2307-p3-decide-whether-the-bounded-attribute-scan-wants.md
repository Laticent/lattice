---
origin: 2307
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2307#issuecomment-5777628875
---

# Decide whether the bounded attribute scan wants a regression test

Backfilled verbatim from the continuation brief on #2307 (merged 2026-09-22).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P3 · [no ticket] Decide whether the bounded attribute scan wants a regression test
       why now   — #2307 bounded AUTHOR_SCRIPT_OPEN_RE's `[^>]*` to `{0,1024}`, taking
                   156 KB of pathological input from 6475 ms to 208 ms. That number is
                   in the changelog and the PR body but NOT in any test, so the bound can
                   be widened back to `*` and nothing fails. lint-core runs on the
                   browser's main thread as a Playground user types.
       where     — lib/authoring/lint-core.js ~:3951; a timing arm belongs in
                   test/unit/components/lint-core.test.js only if it can be made
                   non-flaky in the merge train — otherwise pin the bound's PRESENCE, not
                   its wall-clock.
       done when — either a non-flaky arm exists, or a one-line comment records the
                   deliberate decision not to add one and why.
       evidence  — the arm failing with the bound removed, then passing.
       verify    — tier 0, because it is additive coverage on a shared but well-tested
                   kernel.
```
