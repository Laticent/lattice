---
origin: 2570
priority: P2
recorded: 2026-10-07
source: engineering/decisions/2026-10-06-goldens-bot-blessed.md
---

# Goldens step 4: set the thresholds and switch on the bless bot's auto-merge

```text
  P2 · [no ticket] Goldens rollout step 4: hybrid auto-merge for the bless PR.
       why now   — the owner chose a hybrid on 2026-10-07; rules 2 and 3 use guessed
                   starting values (1% of a page, 10 goldens) until real nights exist.
       where     — MAX_PAGE_FRACTION / MAX_GOLDENS in tools/lib/golden-bless-verdict.mjs;
                   golden-bless.yml gains `gh pr merge --auto --squash` when the verdict
                   says yes, and a `golden-review` label when it says no.
       done when — the thresholds come from a week of dry-run verdict comments, are
                   recorded in the decision doc, and the bot merges a night that passes.
       evidence  — the seven verdict comments and the chosen values in the decision doc.
       verify    — tier 2: one real night that auto-merges, one that waits for a person.
       blocked   — after a week of dry-run nights. Adding a label is shared state: ask first.
```
