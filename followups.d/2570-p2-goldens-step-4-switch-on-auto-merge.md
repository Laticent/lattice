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
                   everything moves. (d) design/*.gallery.md decks: golden-affected
                   renders them as decks since step 3, but the CI `code` filter has no
                   design/**, so a design-only PR runs no golden-diff and its deck counts
                   as unseen (a CI-contract change, put to the owner on #2614).
       also (e)  — CLAUDE.md rule 7: name the bless bot as the fourth machine PR class
                   that merges itself, with the hybrid rules, in the same PR that
                   switches auto-merge on (moved here from step 3: until then it does not).
       also (f)  — a first-time golden (NEW) passes rules 1 and 2 vacuously: it has no
                   before. Decide what a NEW golden must show before it merges unseen
                   (page count equals slide count, or never auto-merge NEW), and whether
                   rule 4's "shown" should compare the bless render with the PR's
                   published PDF, since an engine PR can change it in between (#2614 red
                   team).
       also (g)  — reverting a bless PR with GitHub's Revert button opens a branch the
                   no-PDF check does not exempt. Decide the path (a revert pushed to
                   chore/golden-bless, or an exemption for revert-*-chore/golden-bless).
       blocked   — after a week of dry-run nights. Adding a label is shared state: ask first.
```
