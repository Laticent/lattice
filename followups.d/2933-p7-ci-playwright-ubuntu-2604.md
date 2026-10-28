---
origin: 2933
priority: P7
recorded: 2026-10-28
area: infra
severity: high
swimlane: engineering/gotchas/ci.md
source: https://github.com/Laticent/lattice/pull/2933
---

# Playwright 1.56.1 cannot install browsers on the Ubuntu 26.04 runners

```text
  P7 · [no ticket] `ubuntu-latest` is now 26.04 and Playwright refuses it
       why now   — on #2933 (`f2642d9`) `studio-smoke` died at `npx playwright install --with-deps chromium`: "Playwright does not support chromium on ubuntu26.04-x64". `studio-smoke` is advisory, but `player-webkit` IS in the `ci` gate and runs the same install on `ubuntu-latest`, so the next PR that touches the player cannot go green. Not #2933's to fix: both remedies change the CI contract, which is the owner's call.
       where     — .github/workflows/ci.yml jobs `studio-smoke` and `player-webkit` (`runs-on: ubuntu-latest`); `golden-diff` already pins `ubuntu-24.04`.
       done when — both jobs install their browser and run on the current runner image: either pinned to `runs-on: ubuntu-24.04` (recommended, one line each) or on a Playwright release that supports 26.04.
       evidence  — a green `studio-smoke` and a green `player-webkit` run on a PR that touches the player.
       verify    — owner decision first (CI contract); then the two jobs' logs.
```
