---
origin: 2503
priority: P3
recorded: 2026-10-04
source: https://github.com/Laticent/lattice/pull/2503
---

# golden-diff diffs against the PR's stale base and times out on main's own re-bless

`ci.yml`'s golden-diff job runs `tools/golden-diff.mjs --base ${{ github.event.pull_request.base.sha }}`.
That sha is `main` as it was when the event's PR snapshot was taken, while the job checks out the
PR merged into CURRENT `main`. On #2503 the base was `bbe5a60`; between it and `main` 469 committed
PDFs had changed (mostly #2492's re-bless), against 0 in the PR. The tool tried to rasterize all of
them (~272 ms a page) and the job hit its 25-minute timeout. Any PR opened before a large re-bless
lands behaves the same. The job gates nothing, so it costs a red X and a runner, not a merge.

```text
  P3 · golden-diff diffs against a stale base and times out
       why now   — every long-lived PR across a re-bless gets a red golden-diff and 25 runner-minutes.
       where     — .github/workflows/ci.yml golden-diff job (--base); tools/golden-diff.mjs.
       done when — the tool diffs the PR's own changes only: the merge-base of HEAD^2 and HEAD^1 on
                   the merge ref, or HEAD^1 (current main) as the base.
       evidence  — a PR behind a re-bless shows "no visual change" in seconds; a PR that moves one
                   golden still shows exactly that one.
       verify    — tier 0, plus the owner's OK: it edits a CI step (CLAUDE.md second filter, row 2).
```
