---
origin: 2694
priority: P3
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2694
---

# Five Studio lint e2e tests fail on main on stale wording

why now   — the Studio e2e suite is nightly, off the PR gate, so these drifted unseen. Found
            while verifying #2694; identical on main 82c7247 and on the branch.
where     — docs/e2e/editor-lint.spec.ts:60 ('Fix all' resolves to 2 buttons), :143, :194 and
            :219 (expected message wording no longer matches lint-core, e.g. "'strcit' is not a
            known guards value" vs "`guards:` has been renamed to `fit:`…"), and
            docs/e2e/pane-lint.spec.ts:40 (no 'pane: code' info range appears).
done when — each spec asserts the current message, or pane-lint is shown to be a real
            regression and fixed.
evidence  — CI= npx playwright test --project=desktop e2e/editor-lint.spec.ts e2e/pane-lint.spec.ts
            on a main build: 5 failed, 1 passed.
verify    — the same command, all green.
