---
origin: 2927
priority: P1
recorded: 2026-10-28
area: website
severity: medium
swimlane: engineering/decisions/2026-07-04-studio-demo-walkthrough.md
deferred: off-path — fails on main too; the PR does not touch the demo's typing path
---

# the demo-mobile WebKit tail-follow spec never sees the demo finish typing

why now   — `e2e/demo-mobile.spec.ts` "@webkit-phone the editor follows the typing on real WebKit too" times out after 90s: the persisted deck stops one character short of its end (`- Sentiment \`5` with no closing backtick). PR 2927's raise loop ran it locally; it fails the same way on origin/main at 3a469fb/079df36 (WebKit 26.0, Playwright build 2215, this sandbox), so the per-PR CI, which runs no WebKit, has never caught it.
where     — `docs/e2e/demo-mobile.spec.ts:437` (`expectTailFollows`, `DECK_END`); the demo's typing ops in the Studio tour runner.
done when — the spec passes on `webkit-phone` three runs in a row, or the root cause is named and fixed (the last keystroke dropped on WebKit vs. the final commit never persisting).
evidence  — local runs on 2026-10-28, branch and main: `Expected substring: "  - Sentiment \`5\`"`, received ends `Sentiment \`5`.
verify    — `cd docs && npx playwright test e2e/demo-mobile.spec.ts -g "real WebKit too" --project=webkit-phone`
