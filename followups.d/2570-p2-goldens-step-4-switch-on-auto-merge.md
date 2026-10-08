---
origin: 2570
priority: P2
recorded: 2026-10-07
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md
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
       also      — open items the #2570 adversarial trio left for before auto-merge:
                   (a) calibrate with a person's label per night ("would I have accepted
                   this unseen?"), not a percentile of what happened; leave out night 1
                   and any night that straddles step 3. (b) The nightly force-push
                   overwrites a person's edit to the bless branch, and closing the PR
                   does not stop the same goldens returning; decide how a rejection
                   sticks. (c) Pin `runs-on` for golden-bless.yml and the golden-diff
                   job, so a runner image change is a deliberate PR, not a night where
                   everything moves. (d) design/*.gallery.md decks are never rendered on
                   a PR (golden-affected maps only lib/ galleries, and the CI `code`
                   filter has no design/**), so they always count as unseen.
       also (e)  — CLAUDE.md rule 7: name the bless bot as the fourth machine PR class
                   that merges itself, with the hybrid rules, in the same PR that
                   switches auto-merge on (moved here from step 3: until then it does not).
       blocked   — after a week of dry-run nights. Adding a label is shared state: ask first.
```
