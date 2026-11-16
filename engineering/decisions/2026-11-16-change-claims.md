---
status: proposed
summary: Draft. Blessing moves from "a nightly bot asks the owner afterward, record by record" to "the PR that changes the slides claims its impact, and the owner's merge is the bless". Each render-affecting PR writes claims.d/<slug>.yml (scope plus bounds such as "no new clips"); the nightly's full sweep re-records drift a merged claim covers, auto-merges its bless PR when every difference is covered, and sends unclaimed or bound-breaking drift to a scheduled morning agent session. Born from the week of #1845 / #3221, when the owner was asked five re-bless questions about changes other sessions had made days earlier. Under adversarial-trio review before it goes to the owner.
---

# Change claims: the PR that changes the slides blesses the change, and the nightly verifies it

Status: **draft, for the adversarial trio and then the owner.** Born from the integration nightly's
week of 2026-11-09 (#1845, #3221): one human was asked five separate re-bless questions (D1–D5)
about changes other sessions had made days earlier, and a bless PR (#3118) sat unmerged for six
days waiting for a person.

## 1. The problem, in one sentence

We bless **after** the merge, record by record, away from the decision that caused the change,
so every design decision returns later as a pile of micro questions to the one human.

Evidence from one week:

| What reached the owner | Caused by | When it was caused | When it reached the owner |
|---|---|---|---|
| 115 rows of family-conformance drift (D2) | #3021, #3031, #3131 and others | Nov 4 to Nov 13 | Nov 15 |
| roster change on the family-overflow record (D1) | #3113, #3131 | Nov 10, Nov 13 | Nov 15 |
| gift-card PDF missing (D4) | #3113 merged without a PDF; bless PR #3118 unmerged | Nov 10 | Nov 15 (6 days) |
| route-budget ceiling (D5) | #3221's own fix | Nov 15 | Nov 15 |
| roadmap card taller than a phone page (D3) | #3131 | Nov 13 | Nov 15 |

Only D3 was a real design question. The other four were consequences of decisions the owner had
already made, asked again in a form nobody could answer without reconstructing the history.

## 2. The principle

- **The owner approves decisions, not records.** One approval per decision, at merge, with the
  impact stated at the scale the owner thinks in ("every deck at phone sizes reflows; nothing new
  is cut off"), not record by record.
- **The session that makes a change states its impact.** It is the only party that knows why the
  slides move. It writes that down as a *change claim* in the PR.
- **The nightly verifies; it does not ask.** It keeps its full sweep. A change a merged claim
  covers is re-recorded and merged by the bot. A change no claim covers is a regression, and it
  goes to an agent, not to the owner.
- **A human is asked only for a design call or a merge.**

## 3. What a change claim is

One file per PR, `claims.d/<slug>.yml`, beside `changelog.d/`. Schema-checked like the cards.

```yaml
pr: 3131
why: "Charts set text at one size per role on phone pages; kanban and roadmap stack their lanes."
scope:                       # what may move; globs over the corpus the records already key on
  components: [chart-family/*, kanban, roadmap]
  sizes: [portrait, square, story, mobile]
  decks: ["examples/chart-*", "examples/*-portrait*"]
records:                     # which recorded truths may change, and how far
  goldens: { pages: may-move, page-count: may-change }
  family-overflow: { roster: may-change, clips: no-new }
  family-conformance: { may-change: true }
  chart-fit: { clips: no-new }
  route-budget: { studio.chartKernelsGz: "+3KB" }
evidence:                    # what the session ran before asking to merge
  - "golden-diff: 40 rendered, montage on the PR"
  - "check-chart-fit: 0 new clips"
```

- **scope** says where change is allowed. **records** says which recorded truths may change and
  the bound on each. A bound like `clips: no-new` is a promise, and the nightly checks it.
- A PR that changes no rendered surface (tooling, CI, docs) writes no claim. The existing
  render-relevance mapping (`tools/lib/golden-affected.mjs`, `renderRelevantChanges`) decides
  whether a claim is owed, and a CI check fails a render-relevant PR without one.
- A massive change (a base token, a theme default) claims a broad scope (`components: ["*"]`)
  and does **not** render everything per PR. The nightly's full sweep is the proof.

## 4. The PR side: cheap, targeted analysis

The session runs what it already runs, and nothing heavier:

- `golden-diff --render-affected`: up to 40 goldens, about 11 minutes (measured on #3221).
- The fast whole-corpus checks: `check-chart-fit` (about 2 minutes), geometry parity (about 2
  minutes).
- For a component change, `check-family-tiers` on that component's gallery slide only (to measure).

The 🚦 card gains one line, `claims`, that summarizes the claim in the owner's terms. **The merge
is the bless.**

## 5. The nightly side: the full sweep sorts drift into covered and uncovered

Cost unchanged (the last full run took 4h38m: goldens 2h36m, conformance 29m, palette 28m, family
tiers 19m, integration slice 14m). After the sweep, a new step reads every claim merged since the
last bless and sorts each difference:

| Difference | Rule | Result |
|---|---|---|
| inside a claim's scope and within its bound | covered | the bot re-records it |
| outside every claim's scope | unclaimed | regression → the morning agent (§6) |
| inside a scope but past its bound (a new clip under `clips: no-new`) | claim broken | regression → the morning agent |

The bless PR auto-merges when **every** difference in it is covered. This replaces rule 4 of the
2026-10-06 bless design ("every changed golden was already shown to a reviewer"): "shown on a PR"
becomes "claimed by a merged PR", and the claim also covers the oracles that note never reached
(family-overflow, family-conformance, chart-fit, player-contrast, split oracles). Rules 1–3 (page
count, pixel threshold, count of goldens) are replaced by the claim's own bounds.

Claims are consumed: a bless records which claims it applied, and a claim never covers drift on a
night after its own bless.

## 6. Unclaimed drift: who fixes it, started how

A **scheduled cloud session** (a Claude Code scheduled task on the owner's account) fires each
morning after the nightly finishes. Its prompt: read the nightly's verdict, bisect each unclaimed
difference to the merge that caused it, fix it at the cause in a PR (HARD RULE #33), or, when the
fix is a design call, post a ❓ card. On a green night it exits within a minute. No API key in CI;
it costs one session on red nights.

## 7. Budgets

A route-budget ceiling is a number the owner set (CLAUDE.md, second filter). Proposal: the owner
sets a **policy** once ("a PR may raise a lazily loaded budget by up to N KB if its claim names the
raise and why"), and a claim within the policy needs no separate decision. Raises past the policy
still go to the owner.

## 8. What changes, and what does not

- **New:** `claims.d/` and its schema; a CI check that a render-relevant PR carries a claim; the
  nightly's sorting step; claim-covered auto-merge for the bless PR; the morning agent; a `claims`
  line on the 🚦 card.
- **Retired:** the bless PR waiting for a person; re-bless questions to the owner about drift a
  merged PR caused; the four-rule hybrid's thresholds (never switched on).
- **Unchanged:** the nightly's coverage and cost; per-PR golden rendering; every existing check.
- **Rule text to approve once:** HARD RULE #9 (the claim joins the demo deck as the PR's visual
  evidence), #28 (the card's `claims` line), and the 2026-10-06 note's §2.1 rule 4.

## 9. Rollout

1. The claim schema, `claims.d/README.md`, and the CI check, in warn-only mode for one week.
2. The nightly's sorting step in report-only mode: it posts "covered / unclaimed / broken" on the
   rolling issue, beside today's verdict.
3. Claim-covered auto-merge for the bless PR.
4. The morning agent.
5. The check moves from warn to fail.

## 10. Open questions

- How fine must `scope` be before "covered" means anything? A claim of `components: ["*"]`
  covers everything.
- Two PRs can claim overlapping scopes on the same night; attribution is to the set, not to one PR.
- What a session should do when its targeted checks cannot predict a massive change's bound.
