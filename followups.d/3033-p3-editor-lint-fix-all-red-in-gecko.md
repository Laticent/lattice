---
origin: 3033
priority: P3
recorded: 2026-11-04
area: website
severity: low
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md
deferred: off-path — red (Gecko) and flaky (webkit-tablet) on main at the same rate; the failure is in the spec's setup, not in what lint finds
source: https://github.com/Laticent/lattice/pull/3033
---

# `editor-lint.spec.ts:121` ("Fix all … then a second run finishes it") times out in Gecko, and is flaky in webkit-tablet

why now   — Found while driving the security spine PR's evidence plan (`npm run evidence`) on the lint surface. The spec
            passes in the desktop and webkit-phone projects and fails in `gecko`, on main (158a43c) and on the PR branch
            alike, with the same error: `locator.click: Timeout 60000ms exceeded` waiting for the "Fix all issues" row.
where     — `docs/e2e/editor-lint.spec.ts:118` (`runFixAllFromPalette`). The page snapshot at the failure shows the editor
            still holding the default 2-slide deck: the spec's large deck never reached the editor in Firefox, so lint
            has no fixable issue and the palette offers only the "How do I fix every issue at once?" help row.
done when — the spec passes in `gecko`, or it is tagged off Gecko with the reason the deck cannot be typed there.
evidence  — `cd docs && npx playwright test e2e/editor-lint.spec.ts:121 --project=gecko --retries=0` fails on main and on
            the branch; the same spec passes in `desktop` and `webkit-phone`. In `webkit-tablet` it is flaky, at the
            same rate on main (2f39b51) and the branch: main passed 2 of 5 runs, the branch 2 of 6, each failure with the
            same snapshot (the editor still shows "2 slides"). Lint itself is not slower: the spec's 501-card deck lints in about 6 ms per
            pass on main and on the branch alike (the security rules return at their first test on a deck with no tag,
            `url(` or Mermaid fence).
verify    — self-review; it is a test-harness fix.
