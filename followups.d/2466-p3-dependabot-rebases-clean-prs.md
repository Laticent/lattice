---
origin: 2466
priority: P3
recorded: 2026-10-14
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-rebase-only-on-conflict.md §6
source: https://github.com/Laticent/lattice/pull/2466
---

# Dependabot rebases its own PRs when they would have merged cleanly

```text
  P3 · [no ticket] find out why Dependabot rebases a PR that merges cleanly, and stop it if it is waste
       why now   — the 2026-10-14 re-measure found 16 Dependabot rebases of PRs that
                   would have merged cleanly on GitHub's terms (~140 CI minutes, ~1% of the
                   window), against 3 by agent sessions. HARD RULE #16 cannot reach a bot.
       where     — .github/dependabot.yml (no `rebase-strategy` is set, so the default
                   `auto` applies); .github/workflows/dependabot-auto-merge.yml; the
                   2026-09-28 note §6 for the method.
       done when — the trigger is named from Dependabot's docs and its own PR events, and
                   either the config changes so a behind-but-clean PR is left alone, or the
                   note says why the rebases are needed.
       evidence  — the count of Dependabot same-message pushes, clean on GitHub's terms,
                   over a window of at least a week after the change.
       verify    — tier 0 gates. A `dependabot.yml` change alters shared bot behavior, so
                   put the options to the owner first.
```
