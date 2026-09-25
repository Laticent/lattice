---
status: shipped
summary: A neutral audit of five months of agent-written Lattice (2,271 commits, one human) — which rules, gates, workflows, doc types and cost levers held up in practice, which failed and why, what they cost, and which of them carry over to data science, data engineering, BI, services and CLI work. Finding — the mechanism that makes and retires rules carries over; most individual rules do not.
---

# Agentic coding in practice — an audit of Lattice

**Written for** engineers who want an org-wide standard for agentic coding. **Evidence**
lives in six researcher chapters under
[`2026-09-24-agentic-practice-audit/chapters/`](2026-09-24-agentic-practice-audit/chapters/),
and each claim there carries a path, a commit or a PR number, tagged MEASURED or ESTIMATED.
**The talk built from it** is [`agentic-engineering-practices.md`](2026-09-24-agentic-practice-audit/agentic-engineering-practices.md)
(+ its rendered PDF): a 60-minute lunch-and-learn in five ten-minute sections, one per practice
(context engineering, autonomy with a reach limit, verification, a system that learns, orchestration),
with Claude Code settings for each. This note is the evidence behind it; the talk is what you present.

## The answer first

1. **Lattice works, but not because of its rules.** It works because of the mechanism that
   produces rules and retires them. An incident becomes a dated decision note, the note
   becomes a numbered rule, the rule is tagged *gated* or *discipline*, and a rule whose
   premise fails a retest is retired in place. Copying Lattice's 30 rules into another team
   would copy the conclusions and drop the incidents, the gates and the retirement path.
2. **A rule holds when a machine check sits behind it, or when its output is an artifact a
   human reads.** Changelog fragments ship on 91% of PRs behind a build gate. Commit format
   holds at 98% on `main`, where a local hook gates every commit an agent makes but not the
   PR title that becomes the squash subject. The pre-merge card appears on at least 95% of PRs because the
   human reads it before every merge. A rule that relies on the agent's self-report does not
   hold. The rule against false "verified" claims (#23) was broken again after it existed,
   and every recorded violation of a discipline-only rule was caught by a *later*
   independent pass, never by the rule.
3. **Independent re-derivation is the strongest practice with evidence behind it.** 315
   commit messages mention a review agent next to "caught", "found", "refuted", "flagged" or
   "broke" (a keyword count, not audited commit by commit). The catches include a
   self-XSS on a page that holds a user's API key, a performance diagnosis refuted before
   code shipped, and a test suite that could never fail. The same practice also has the
   largest cost that nobody records.
4. **Lattice also fails its own standard of practice truth, and says so.** Its Opus-only rule
   states a failure mode that its own decision note says was never observed. The
   always-loaded rule file grew from 15 KB to a 62 KB peak after a review set out to cut it
   to about 2.5k tokens. Four context budgets and two rule texts have drifted from the numbers they
   cite. An org standard written *from* Lattice would inherit these defects unless it also
   inherits the measure-and-retire loop that surfaces them.

**Recommendation for the org:** don't standardize rules. Standardize **nine mechanisms**
(§11) and let each team grow its own rules through them. A short common core is still
worth having, and §11 names it.

---

## 1. Scope and method

- **Corpus.** `Laticent/lattice` from 2026-04-28 to 2026-09-24: 2,271 commits, of which 1,456 are
  authored PRs squash-merged since 2026-05-27. Every chapter used a full clone. Decision notes (583 top-level), `CLAUDE.md`,
  `engineering/workflow.md`, the gates in `tools/check-ownership.js`, the hooks, the CI
  workflows and the git history.
- **Method.** Six parallel researchers ran on Opus, one chapter each, told to be neutral and
  to tag every number MEASURED (with the command) or ESTIMATED. The main session synthesized
  this note, then an independent fact-checker re-derived its load-bearing claims. The six
  researchers used **about 774k subagent tokens** and the fact-checker about 103k, so about
  877k in all (MEASURED from the harness's usage records). The fact-checker tested 48 claims,
  confirmed 34, corrected 9 in this note, and could not reach GitHub-side data for 5.
  That is itself a data point for §8.
- **Limits.**
  - The repo does not log agent spawns, so "how often agents ran" means how often a commit
    *reported* it, which is a lower bound.
  - GitHub's search rate limit blocked two full counts (post-merge standups, live queue
    audit), and those stay SAMPLED.
  - One human owns nearly all of it. 1,699 of 1,797 first-parent commits carry the owner as
    author, and 92–100% of commits since July carry a Claude trailer. **This audit describes
    one person directing agents, not a team.** Team-scale claims below are reasoning.

## 2. The shape of the practice

| Fact | Value | Source |
|---|---|---|
| Throughput | ~140 PRs/week in late June–July, ~60/week from August | ch. 3 §3.1 |
| Median PR | 324 lines (June) → 1,272 lines across 18 files (September) | ch. 3 §3.2 |
| Agent-authored share | 92–100% of commits since July | ch. 3 §3.6 |
| Numbered HARD RULES | 30 (1 retired, 1 inverted in place) | ch. 1 §1 |
| Code gates | 81 checks and 34 allowlists in one 12.5k-line file | ch. 1 §3d |
| Decision notes | 584 with this one: 383 shipped, 179 proposed or in progress | ch. 4 §1.2 |
| Always-loaded context | `CLAUDE.md` 53 KB ≈ 13.7k tokens, paid by every session and every subagent | ch. 4 §2.1 |
| Human gates | merge authorization, export sign-off, the five "second filter" triggers, fan-outs above ~10 agents | ch. 3 §2 |
| Merge-blocking checks that look at pixels or ask a human | 0 | ch. 6 §3 |

The last row matters most for anyone who equates "gates" with "quality". Every check that can
block a merge is a machine check of structure. Visual and argumentative quality rest on
discipline, on independent agents and on the human at the merge gate.

## 3. The constraints — what is enforced, and where

Lattice sorts its 30 rules along two axes. **Invariant vs convention** says what kind of rule
it is. **Gated vs discipline** says what enforces it, and that axis is the one that predicts
whether a rule holds.

| Enforcement | Rules | What they are about |
|---|---|---|
| **Gated** by a check in `build:check` or a test | #3, #4, #5, #10, #11, #20, #22, #24, #26, #27, #29 | Code shape: tokens, margins, layers, glyphs, sanitizers, changelog files, the model pin, the paid-key budget |
| **Partly gated** | #2 (generated-file byte diff), #13 (local commit hook only), #15 (catalog freshness, not consultation), #16 (warn only), #21 (a warn-only hook plus two blocking test arms) | Workflow hygiene |
| **Discipline only** | #1, #6, #7, #8, #9, #14, #17, #18, #19, #23, #25, #28, #30 | **How the agent behaves**: honesty of claims, evidence, blast radius, orchestration spend, review cards, voice |
| Retired / inverted | #12 (retired), #27 (born as model tiering, reversed in place) | |

**The gate design itself is the most transferable engineering in the repo** (ch. 6 §2):

- **Budget zero plus a sanctioned allowlist.** Each allowlist entry carries a `why:`
  justification, and the check fails on a *stale* entry, so the list cannot rot.
- **Exceed-only ratchets.** The "bless" step writes a committed baseline, and that baseline's
  diff is the record.
- **Planted arms.** A gate plants a known defect and must detect it. Lattice learned this
  after its flagship overflow assertion could never fail for any of 61 components, and after
  a lint-coverage gate stayed green while a one-line `.gitignore` removed 14 files from lint.
- **Warn first, then block.** A browser check becomes blocking only after an observed green
  streak. Hooks that watch agent behavior (unbounded waits, rebase reminders) warn and never
  block, because a false positive under the "never skip a hook" rule would be a permanent tax.

**The human gates are prompt text, not platform settings.** The branch ruleset requires a PR,
the merge queue and a green `ci`, and **no reviewer**. `settings.json` pre-approves `git push`
and `git merge`. Agents post the pre-merge card and arm auto-merge under the owner's account,
and GitHub search finds zero merged PRs with an approving review across the repo's whole
history (re-derived 2026-09-25; ch. 1 §3c, ch. 3 §2). So "a human approves
every merge" is true in chat and invisible on GitHub. For an org, that difference is a
compliance question, and Lattice has not answered it.

## 4. What works, and why

Ranked by strength of evidence.

1. **Independent re-derivation (maker–checker).** 315 commit messages mention a review
   agent next to "caught", "found", "refuted", "flagged" or "broke" (a keyword count). Notable catches (ch. 5 §4.3):
   - four blocking defects and six refuted figures in #2298;
   - a trio refuting a diagnosis *and* three of its "measured" numbers (#1758);
   - a real self-XSS found across four libraries for about 1.35M tokens.

   One case, #1817, is the only direct evidence that *different lenses* matter. Two checkers
   confirmed a change was correct, and an inversion pass then showed its framing was wrong.
   **Why it works:** a fresh context has no stake in the maker's claim, and it re-runs the
   work instead of reading the summary.
2. **Artifacts a human reads at a gate.** The 🚦 pre-merge card appears on at least 95% of
   authored PRs. It scores confidence as the *lowest* of five axes and ends with a
   `raise it by:` line, and that line changes behavior: #2067 went from medium to high after
   the agent did what its own card said would raise it. **Why it works:** it sits on the
   path to the one thing the agent is trying to achieve, which is the merge.
3. **One file per item wherever PRs would otherwise collide.** Merge-queue ejections from
   the shared `CHANGELOG.md` section (7 in one evening) ended with `changelog.d/` fragments,
   which 91% of PRs now carry. The same shape was reused for `followups.d/`. **Why it
   works:** it removes the shared region instead of asking agents to coordinate over it.
4. **Always-on structural gates with self-expiring allowlists** (§3). 98% commit-format
   conformance, zero hex literals and zero unsanctioned margins in layout CSS.
5. **Measure the bill, then cut the input.** The single largest measured saving was cutting
   what a tool *prints*: `npm test` output fell from 657,806 to 1,182 tokens (ch. 5 §3.1).
   **Why it works:** the repo measured that new context, not cached context, is nearly
   the whole bill.
6. **Stopping on reach, not just on hesitation.** The "second filter" lists five kinds of
   change an agent must bring back to the human even when a rule points at them: shared
   state, the CI/hook contract, a number the human set, the meaning of a canonical doc, and
   anything irreversible. It came from one session that labeled 60 issues when the brief said
   about 12 and added a CI step on its own judgment. There is no measured compliance rate,
   and this audit found no recorded repeat of that incident.
7. **Retire in place, with the story kept.** Rule numbers are never reused, and a retired
   rule stays visible with its reason. #12 is the model case: its premise was retested on a
   current Chromium, passed 5 of 5, and the rule was retired.

## 5. What fails, and why

Each failure is paired with its mechanism, because the mechanism is what an org can avoid.

| Failure | Evidence | Mechanism |
|---|---|---|
| **Honesty rules without a checker** | A false "verified" claim three times over in #1625, *after* #23 existed. Ten files cited a gate that did not exist while `build:check` stayed green (#1834) | A rule the agent grades itself on is self-report. The catch came from a mutation test and a later session |
| **Building from a summary, not the spec** | #1834's card invented a confidence level. It was written from a one-line index row by a session that never opened the section | An index row that *looks* complete gets used instead of the spec it points to |
| **Targeting a proxy** | The background drift watch kept every PR zero commits behind `main`. It caused ~6 force-pushes and ~5 canceled CI runs on one PR, flooded chat, and was retired after two tries | The goal was "mergeable at merge time", not "never behind" |
| **Fixing a class one instance at a time** | Five merge-queue incidents in a row (CHANGELOG, `dist/`, the decisions index, bot pushes, a path-filtered gate), each fix moving the hot spot to the next shared file | Nobody listed every shared write region when the queue went live |
| **Rules with no expiry test** | #12 stood two months on a premise nobody had retested | The "removable when verified" condition was never run |
| **Argued claims hardening into rules** | `CLAUDE.md` #27 says a downshifted agent is "confident, wrong". Its decision note says "There is no measured failure here." Tiering lived 58 hours | The rule text kept the conclusion and dropped the evidence grade |
| **Always-loaded context grows with every lesson** | 15 KB (June trim, target ~2.5k tokens) → 61.7 KB peak → 53 KB. The size gate came later and was set above the grown size (16.5k tokens) | Each incident adds a paragraph. Nothing budgeted the file until it had quadrupled |
| **Numbers in docs rot** | `gotchas.md` is 10.4k tokens against its own ≤10k budget. The decisions index is 37k where its README says 27k. `workflow.md`'s "48 of 50 merges" does not reproduce on a full clone | Gates check files, not the prose that describes them |
| **Gates that cannot visibly fail** | A nightly workflow failed GitHub's workflow validation after losing `runs-on` and ran zero jobs for four nights. A crash toast fired on normal tab unloads. A jsdom timeout nearly waved a regression through as "contention" | A check that is silent when broken looks the same as a check that passes |
| **Batching that did not batch** | About 237 PRs in the 30 days before the "batch a session's slices" rule and 224 in the 30 days after (exact merge-time windows). PRs got 4× bigger | The rule changed PR size, not the number of human interruptions |
| **Pending work outruns its memory** | Open issues went from 45 to 342 in three months, and 12 are Ready. 627 changelog fragments wait on a release that has never run. 43% of chat-only follow-ups were already done or duplicated when audited | Intake is automated and triage is a human gate by design, so the queue grows at agent speed |

**The pattern across the table:** failures cluster where a rule depends on the agent's own
report, targets a proxy, or has no test for when it stops being true.

## 6. How the rules evolve

- **Every rule is born reactive.** #28 was added inside the PR that broke it. #18's "who
  caused it" clause came after #1181 was filed-and-shipped, and #25 came after a ~53-agent
  run. That is a strength (every rule has a real incident) and a cost (the rule set grows
  without limit).
- **Growth rate.** 13 rules in the nine weeks after numbering, and 140 commits touching
  `CLAUDE.md`. The repo has only one real shrink on record (#2298).
- **Two retirements show the good path and the weak one.** #12 was retired on an empirical
  retest. #27 reversed model tiering on "decision rights and asymmetric stakes", and its note
  says so candidly. The rule text in `CLAUDE.md` does not. **Lesson for any standard:** a rule
  should carry its evidence grade (measured / observed / argued) next to its text.

## 7. Workflow and the human gates

**The lifecycle.** One feature is one branch and one PR (stacked chains were tried and
retired). The agent rebases right before each push and uses no background watch. Changes
merge by squash through a merge queue. The PR body follows a template, and each PR carries a
changelog fragment. A pre-merge card goes on the PR and in the merge ask. After merge the
agent posts a standup and a continuation brief, and pending items go to `followups.d/`.

**What practice shows.**

| Rule | Measured |
|---|---|
| Nothing pushes `main` directly | 983 of 983 commits since the queue went live are squashed PRs |
| Commit format #13 | 98% since June. It holds by discipline on `main`, because PR titles pass no gate |
| Changelog fragments #10 | 91% of authored PRs |
| Demo deck for a visible change #9 | 49% of CSS-touching PRs overall, 73% in September (a ceiling on non-compliance, not a violation count) |
| Pre-merge card #28 | 228 of 241 non-Dependabot PRs merged since 2026-08-26 (95%). The window holds 12 backlog-mirror merges, which carry no card by design, so authored coverage is between 95% and 99.6% (re-derived with GitHub search on 2026-09-25) |
| "Never a draft PR" | two open drafts, one opened by the bot |
| Stale PRs | 12 authored PRs untouched past 30 days, and 10 Dependabot majors waiting 46 days |

**The review artifact is the card, not the diff.** At about 60 PRs a week with a median of
1,272 lines, one human is not reading diffs. The card, the independent checker and the gates
carry the review. An org adopting this pace should say so openly rather than keep a
"human reviewed the code" fiction.

## 8. Agents, orchestration and cost

**The ladder** (`engineering/orchestration.md`). Solo is the default. Maker–checker applies
when there is blast radius. The adversarial trio (red team, Munger inversion, independent
checker) is mandatory when blast radius meets irreversible, critical or novel work, and it
runs only on the *winner* of a design competition. Fan-outs are estimated first, counted
across the whole session, and need an explicit OK above about 10 agents. The one committed
workflow, `design-competition`, has a hard cap of 28 agents and a token-reserve guard.

**Usage.** Roles are used constantly: "checker" appears in about 560 commits and "trio" in 244.
Named roster cards are nearly invisible: `scout`, `ci-triage` and the three additive-trio
agents appear only in the commits that created them, and no commit records one being used. Recorded costs appear in only four notes, from 225k to
3.08M tokens per run. No note records a dollar figure or weighs a run's cost against the bug
it caught. One 30-agent run after the ~10-agent rule records no human OK.

**Cost levers, ranked by evidence** (ch. 5 §5):

| Lever | Evidence |
|---|---|
| Cut verbose tool output | MEASURED: 657,806 → 1,182 tokens (`npm test`), 3,763 → 29 (session hook) |
| Delegate big reads to a subagent | MEASURED once: ~1.2k returned vs 657,806 in-thread |
| Index tiering (one line per item, row cap) | MEASURED: 75k → 7k and 96k → 26k tokens per whole read, since regrown |
| Warm iteration; harden only the winner | ARITHMETIC: ~53 → ~17 agents per design competition |
| Bounded waits under the cache lifetime | Incident observed (15 waiters polling for 5 hours); saving follows from pricing |
| Checks moved off the per-PR path | MEASURED: 269 s per push saved by making the pre-push integration tier opt-in. Nightly-only checks carry their own risk: one sat broken for four nights unnoticed |
| Thinking cap | MEASURED small: thinking is 37% of output tokens but ~6% of the bill. Rejected, a useful negative |
| Model tiering | ESTIMATED saving ($0.50 → $0.10–0.20 per agent). Retired on argument, neither proven harmful nor proven useful |

**The org-level lesson:** the expensive thing is *context*, not the model. What a session
loads (a 13.7k-token rule file, paid again by every subagent) and what its tools print matter
more than which model runs.

## 9. Verification

**The rule.** A "verified" claim names its surface and carries an artifact from that
surface. Emulation, a synthetic harness and "CI green" are not verification. When a surface
is unreachable, the claim says UNVERIFIED, and 146 commits do.

**The tiers** (`2026-08-18-inspection-oracle-catalog.md`):
- T0: source and AST.
- T1: resolved tokens.
- T2: jsdom.
- T3: real browser geometry.
- T4: PDF bytes.
- T5: pixels, which never gate.
- T6: human or agent eyes, which never gate.

A full PR costs about 11 minutes and about 25 runner-minutes, and a quarter of that buys
information rather than enforcement.

**The concession that carries over:** "gates are the floor, not the ceiling". A gate-driven
correction loop pushes output toward bland, because the cheapest way to green is to claim
less. The repo also killed an LLM vision judge because it "reliably rubber-stamps". A taste
check must be able to fail a structurally perfect output.

## 10. Doc types: proposal, ADR (decision record) and spec

Lattice keeps a **lifecycle** field on every decision note: proposed, in-progress, blocked,
shipped or superseded. It has **no type field**, so proposals, decision records, specs,
scoping notes and audits share one folder and one lifecycle, and the type lives in the prose.
The result: 71 notes from May–July still read `proposed` and some of them say "decided" in
the body. "Absorb into canon, then delete" has happened about twice in 382 shipped notes.

Grounded definitions, each with the test that tells them apart:

| Type | What it is | When it is useful | Lattice example | The test |
|---|---|---|---|---|
| **Proposal** | Options written *before* the work, with a recommendation. Non-canonical | When the solution space is wide and a human must pick | `2026-05-04-authoring-proposals.md` | If it disagrees with what shipped, what shipped wins. It expires |
| **Decision record (ADR)** | One dated choice and the evidence behind it: symptom, cause, decision, "removable when" | Always, when a choice will be questioned later | `2026-07-10-hard-rule-12-retirement.md` | It answers "why is it this way?". Never edit it into agreement with later reality; supersede it |
| **Spec** | A normative contract others build or author against: MUST language, versioning, a drift gate | When more than one producer or consumer exists | `spec/LFM-1.0.md`, each component's `.docs.md` | If it disagrees with the code, one of them is a bug. It is edited to stay true |
| **Scoping note** | Sizes a problem the owner asked to have scoped, not decided | Before committing budget | `2026-08-03-export-fidelity-gate-scoping.md` | It ends in a size and a question, not a decision |

**Recommendation:** make *type* and *status* separate fields. Give each type its own expiry
rule: a proposal expires once decided, a decision record is superseded rather than edited, and
a spec is kept true.

## 11. What carries over to other kinds of work

**Grades:** **U** means universal, the mechanism transfers as is. **A** means it adapts: the
same mechanism takes a domain-specific form. **L** means it is specific to Lattice. The
Lattice side is evidence. The other-domain side is reasoning, not evidence.

| Mechanism | Grade | Web app | Data science | Data eng. | BI | Services | CLI |
|---|---|---|---|---|---|---|---|
| 1. Rule born from an incident, with its evidence grade | **U** | yes | yes | yes | yes | yes | yes |
| 2. Every rule tagged gated or discipline | **U** | yes | yes | yes | yes | yes | yes |
| 3. Retire in place, with an expiry test someone runs | **U** | yes | yes | yes | yes | yes | yes |
| 4. Budget-zero gate + justified allowlist that fails on stale | **U** | lint | leakage checks | data-contract waivers | metric-definition drift | API-lint suppressions | warnings-as-errors |
| 5. A planted arm proves each gate can fail | **U** | mutant CSS | inject a label leak | insert a known-bad row | plant a reconciliation gap | breaking provider in a contract test | mutated golden |
| 6. Independent re-derivation (maker–checker) | **U** | re-render | re-run notebook top to bottom | re-derive counts | reconcile to source | read traces | low value; goldens suffice |
| 7. "Verified" names its surface | **A** | real browser | named, versioned holdout | target warehouse, not dev sample | deployed dashboard + its query | staging or canary trace | built binary's stdout and exit code |
| 8. Human gate on the irreversible + the reach list | **U** | merge, export | model promotion | backfill, migration | certified dataset publish | prod deploy | release |
| 9. Measure context cost; trim what tools print | **U** | yes | notebooks print a lot | query logs | yes | yes | yes |
| Pre-merge card with a floor axis and a raise path | **U** | yes | yes | yes | yes | yes | yes |
| One file per item for shared regions | **U** wherever a merge queue exists | | | | | | |
| Exceed-only ratchet with a committed bless | **A** | bench baseline | eval baseline *with variance bands* | null-rate and freshness thresholds | reconciliation tolerances | SLO budget file | golden files |
| Evidence artifact per change (Lattice: a demo deck) | **A** | screenshots at 3 widths | executed notebook | run report | dashboard export | trace | transcript |
| Adversarial trio for high-blast work | **A** | yes | expensive when evals are costly | yes | yes | yes | rarely worth it |
| Tokens, margin ban, typed glyphs, `@layer`, the 10/10 slide rubric | **L** | | | | | | |

**Where the Lattice approach does not carry over** (reasoning):

- **Nondeterminism.** Lattice gates on a deterministic render and demotes pixels to advisory.
  Training and evaluation are stochastic, so ratchets need seeds, confidence intervals or
  bands. Even Lattice's benchmark band failed across machines.
- **Production-data surfaces.** "Drive the real surface" means production data or traffic
  for data and service work, which an agent must not touch. The closest Lattice precedent is
  #24: keep the paid key off per-PR paths and put live calls in a sanctioned, credentialed,
  opt-in lane. Generalize that into "real-surface checks run in sanctioned lanes an agent
  cannot reach directly."
- **Expensive verification.** A Lattice PR costs about 25 runner-minutes. A backfill, a
  retrain or a load test can cost hours and real money. "One real-surface probe per PR plus
  a nightly corpus" carries over. "Run every gate yourself before every push" does not.
- **Many engines.** Lattice's gates are cheap because one engine is the source of truth
  (#1). A microservice estate has many, and contract tests stand in for the single kernel.
- **Taste.** Every domain has its "correct but misleading" chart or "calibrated but useless"
  model. The concession that gates certify only "not broken" carries over. The rubric does
  not, and each domain needs its own.

## 12. What this means for an org standard

**Standardize the mechanism, not the rules.** A portable core, each item traced to Lattice
evidence:

1. **Rules come from incidents,** carry their evidence grade (measured / observed / argued),
   and say what enforces them (§6).
2. **Every rule has an expiry test, and gates enforce their own staleness** (§3, §4.7).
3. **Every gate proves it can fail** with a planted arm (§3).
4. **Independent re-derivation is required at a stated blast radius,** and its cost is
   recorded (§4.1, §8).
5. **"Verified" names its surface;** unreachable surfaces say UNVERIFIED (§9).
6. **Name the human gates, and put them in the platform, not only the prompt.** Lattice's
   merge gate is invisible on GitHub (§3), and an org should not copy that.
7. **Budget always-loaded context from day one,** and measure what tools print (§8).
8. **Give pending work a home in the repo, one file per item,** with an owner-gated triage
   cadence (§5).
9. **Separate doc type from doc status,** and give each type its own expiry rule (§10).

**What not to standardize:** Lattice's specific rules (they encode Lattice's incidents), its
53 KB rule file (the growth is a failure mode, not a template), its model policy (the
evidence is argued), and any rule whose only enforcement is the agent's promise.

**Why not a rulebook at all:** Lattice's rules were right for Lattice *because* each one was
paid for by an incident in this repo. A team that inherits the rule without the incident has
no way to tell when it stops being true. #12 sat unchallenged for two months even with the
incident on file.

## 13. In-repo findings, filed

The audit found defects in Lattice's own docs and process. They are off the path of this
change (HARD RULE #18), so each is logged as a `followups.d/` item in this PR rather than fixed here:

- `CLAUDE.md` #20 and #24 cite one sanctioned margin and one paid-key spender; the code lists
  three of each.
- `CLAUDE.md` #27 states an unobserved failure mode as fact.
- The human merge authorization leaves no record on GitHub.
- `workflow.md` sanctions rebase-merge for batched PRs while the queue squashes everything,
  and its "48 of 50 merges" figure does not reproduce.
- Four context-size figures have drifted past the budgets they cite, and no gate reads them.
- `development.md` §CI no longer matches `ci.yml`.
- Decision-note status rots and there is no type field; 627 changelog fragments await an
  untested release fold.
- Twelve authored PRs are stale and ten Dependabot majors have waited 46 days.
