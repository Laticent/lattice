---
origin: 2880
priority: P3
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
source: https://github.com/Laticent/lattice/pull/2880
---

# `library-plugins.spec.ts` checks for any lint warning, not the `unknown-plugin` rule.

Found by the checker on #2880. The "importing clears the warning, removing brings it back" test asserts `.cm-lintRange-warning`, so a warning from a different rule would also satisfy the "comes back" step.

```text
  P3 · [no ticket] Tighten the stale-lint test to the rule it is about.
       why now   — a weak assertion passes for the wrong reason, and this is the one test
                   that guards the stale-warning fix.
       where     — docs/e2e/library-plugins.spec.ts lines 48 and 58; read the warning's
                   message (hover or the lint panel) and match `unknown-plugin`.
       done when — the test fails if the warning that remains is any other rule.
       evidence  — the spec fails when the fix in `editor-diagnostics.js` is reverted,
                   and passes with it.
       verify    — tier 0 gates; test-only.
```
