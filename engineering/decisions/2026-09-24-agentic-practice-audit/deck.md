---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Lattice · Agentic coding in practice"
lenses:
  brief: { label: "Bottom line", base: none, kind: rung }
  story: { label: "The argument", base: none, kind: rung }
---

<!-- _class: title -->
<!-- _lens: brief story -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Standardize the loop, not the rules

`Agentic coding audit · Lattice · September 2026`

Five months, 2,271 commits and one human: what held up in practice, what failed, and what carries over.

<!--
Source of record: engineering/decisions/2026-09-24-agentic-practice-audit.md. Every number in this deck is in that note or one of its six chapters, tagged MEASURED or ESTIMATED.
-->

---

<!-- _class: stats -->
<!-- _lens: brief story -->

`The practice · 2026-04-28 to 2026-09-24`

## One person directed agents that wrote nearly every commit.

1. 2,271
   - commits in five months
2. 90%+
   - carry an agent trailer since July
3. ~60
   - pull requests a week, since August
4. 30
   - numbered hard rules, one retired

<!--
Caveat for the room: this is one human plus agents, not a team. Team-scale claims later in the deck are reasoning, not evidence.
-->

---

<!-- _class: agenda -->
<!-- _lens: story -->

## Five questions, answered from the record.

1. What Lattice constrains `p.4`
2. What works, and why `p.8`
3. What fails, and why `p.13`
4. What it costs `p.18`
5. What carries over `p.22`

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 01`

## What Lattice constrains

---

<!-- _class: table table-fill -->
<!-- _lens: story -->

`Enforcement · 30 hard rules`

## A check backs the rules about code; nothing backs the rules about agents.

| Enforced by | Rules | What they govern |
| --- | --- | --- |
| A gate in the build | 11 | Tokens, margins, sanitizers, changelog |
| Partly, or a warning | 5 | Generated files, commit format, rebase reminder |
| Agent discipline only | 13 | Honest claims, evidence, reach, spend |
| Retired or reversed | 2 | A CSS ban and model tiering |

---

<!-- _class: cycle -->
<!-- _lens: brief story -->

`How a rule is born and dies`

## Every rule runs the same loop from incident to retirement.

- Incident
  - Something breaks, or an agent overreaches.
- Decision note
  - A dated record of the symptom, cause and fix.
- Numbered rule
  - One line in the rule file, tagged gated or discipline.
- Retest
  - Someone checks whether the premise still holds.
- Retire in place
  - The number is never reused, and the story stays.

---

<!-- _class: cards-grid four -->

`Gate design`

## The gate design is the most portable engineering in the repo.

- Budget zero
  - Zero allowed, plus an allowlist with a reason per entry.
- Fails on stale
  - An entry that matches nothing turns the gate red.
- Planted arm
  - Each run plants a defect the gate must catch.
- Warn before block
  - A check blocks only after a streak of green nights.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 02`

## What works, and why

---

<!-- _class: bar row -->
<!-- _lens: brief story -->

`Compliance · authored pull requests`

## Rules hold when a machine or a human reads the output.

- Pre-merge card, read by the human `99%`
- Commit format, local hook `98%`
- Changelog fragment, build gate `91%`
- Demo deck, discipline only `49%`

<!--
Card: ~99% of authored PRs since 2026-08-26. Commit format: 98% on main since June; the local hook gates each commit an agent makes, but not the PR title that becomes the squash subject. Fragments: 91% of authored PRs after #1606. Demo deck: share of CSS-touching PRs that ship one; 73% in September, and a ceiling on non-compliance rather than a violation count.
-->

---

<!-- _class: big-number -->
<!-- _lens: story -->

`Independent re-derivation`

- 315
  - commit messages record a review agent catching, refuting or breaking something.

<!--
A keyword count, not audited commit by commit. Catches include a self-XSS on a page holding a user's API key, a performance diagnosis refuted before code shipped, and a test suite that could never fail. The same practice has the largest unrecorded cost: only four notes record tokens, and none records dollars.
-->

---

<!-- _class: quote -->

> Two checkers verified it; none of them could have found what was wrong with it, because it was correct.

— Lattice commit for #1817, after an inversion pass showed the framing was false

---

<!-- _class: compare-prose chosen -->

`Review at agent speed`

## The card replaced the diff as the thing a human actually reviews.

- Reading the diff
  - At about 60 pull requests a week and a median of 1,272 lines, one person cannot read them.
- Reading the card
  - Confidence is the lowest of five axes, with a line naming what would raise it. Agents act on that line.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 03`

## What fails, and why

---

<!-- _class: table table-fill -->
<!-- _lens: brief story -->

`Failure mechanisms`

## Failures cluster where a rule depends on the agent's own report.

| Failure | Incident | Mechanism |
| --- | --- | --- |
| False "verified" claims | Recurred after the ban | Agent grades itself |
| Built from a summary | Invented confidence level | Index row looked complete |
| Chasing a proxy | Auto-rebase thrashed the build | Goal was mergeable, not current |
| Fixed one at a time | Five queue incidents in a row | Shared files never listed |
| Argument became rule | "Confident, wrong" never seen | Rule dropped its evidence grade |

---

<!-- _class: line -->
<!-- _lens: story -->

`Always-loaded rule file · kilobytes`

## The rule file quadrupled after a review set out to shrink it.

- May 15 `5.0`
- Jun 1 `22.6`
- Jun 17 `15.1`
- Jul 1 `22.2`
- Jul 15 `28.3`
- Aug 1 `34.7`
- Aug 15 `36.4`
- Sep 1 `59.4`
- Sep 15 `61.7`
- Sep 24 `53.4`

<!--
The June 17 review targeted about 2.5k tokens. Each incident adds a paragraph. The size gate arrived later and was set at 16.5k tokens, above the grown size. Every session and every subagent pays for this file before its first tool call.
-->

---

<!-- _class: compare-prose -->

`Two retirements`

## One rule was retired on a retest, the other on an argument.

- CSS ban, rule 12
  - Its premise was retested on a current browser and passed five of five. The rule was retired with the evidence attached.
- Model tiering, rule 27
  - Reversed after 58 hours. Its own note says no failure was measured, yet the rule file states one as fact.

---

<!-- _class: stats -->

`Pending work`

## Pending work grows at agent speed while triage waits on one human.

1. 342
   - open issues, up from 45 in June
2. 12
   - of them marked ready
3. 627
   - changelog fragments, no release yet
4. 43%
   - of chat-only follow-ups already done or duplicated

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 04`

## What it costs

---

<!-- _class: stats -->
<!-- _lens: story -->

`Cost · measured`

## Context, not the model choice, is the bill.

1. 99.8%
   - cut in test output tokens by changing reporter
2. 13.7k
   - tokens of rules loaded by every agent
3. 6%
   - of the bill is thinking, so a cap barely helps
4. 877k
   - tokens for the seven agents behind this deck

<!--
npm test output went from 657,806 tokens to 1,182. Thinking is 37% of output tokens but about 6% of the bill, so a cap saves little. The repo measured that new context, not cached context, is nearly the whole bill.
-->

---

<!-- _class: table table-fill -->

`Cost levers, ranked by evidence`

## Cut what tools print before you cut which model runs.

| Lever | Evidence |
| --- | --- |
| Trim tool output | Measured: 657,806 to 1,182 tokens |
| Delegate big reads to an agent | Measured once: 1.2k back instead of 658k |
| One line per item in indexes | Measured: 75k to 7k tokens, since regrown |
| Iterate warm, harden only the winner | Arithmetic: 53 agents down to 17 |
| Cheaper models for lookups | Estimated only, retired on argument |

---

<!-- _class: table table-fill -->
<!-- _lens: story -->

`Doc types`

## Proposal, decision record and spec answer different questions.

| Type | Answers | Expires when |
| --- | --- | --- |
| Proposal | Which option should we pick? | A decision is made |
| Decision record | Why is it this way? | Never; a newer record supersedes it |
| Spec | What must every implementation do? | Never; it is edited to stay true |
| Scoping note | How big is this problem? | The owner commits budget or declines |

<!--
Lattice keeps a status field on every note but no type field, so all four share one folder and one lifecycle. 71 notes from May to July still read "proposed", and some say "decided" in the body. Recommendation: separate type from status.
-->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 05`

## What carries over

---

<!-- _class: table table-fill -->
<!-- _lens: story -->

`Portability · six kinds of work`

## The mechanisms carry over; the rules mostly do not.

| Mechanism | Carries over | How it bends |
| --- | --- | --- |
| Rule with incident and evidence grade | Everywhere | Unchanged |
| Planted arm proves a gate can fail | Everywhere | A known-bad row, a leaked label |
| Independent re-derivation | Everywhere | Rerun the notebook, reconcile |
| "Verified" names its surface | Adapts | Holdout set, warehouse, canary, binary |
| Tokens, margin ban, slide rubric | Lattice only | None |

---

<!-- _class: cards-grid four -->
<!-- _lens: story -->

`Where it breaks`

## Four limits stop the Lattice approach outside a web app.

- Nondeterminism
  - Model evals need seeds and bands before a ratchet means anything.
- Production data
  - The real surface is data an agent must not touch; use sanctioned lanes.
- Expensive checks
  - A backfill or retrain costs hours, so run one probe per change.
- Many engines
  - Services have no single kernel; contract tests replace it.

---

<!-- _class: list-criteria -->
<!-- _lens: brief story -->

`The org standard · part 1`

## Require these five mechanisms of every team.

1. Rules carry their incident and evidence grade
   - What broke, how sure we are, what enforces it.
2. Every rule has an expiry test
   - Stale exemptions fail; someone reruns the premise.
3. Every gate proves it can fail
   - A planted defect turns it red on every run.
4. Independent re-derivation above a set risk
   - A fresh agent reruns the work; record the cost.
5. "Verified" names its surface
   - An unreachable surface is marked unverified.

---

<!-- _class: list-criteria -->

`The org standard · part 2`

## Add four more once agents run at volume.

1. Human gates live in the platform
   - Lattice's merge approval lives only in chat.
2. Budget always-loaded context from day one
   - Measure what sessions load and tools print.
3. Pending work gets one file per item
   - Chat is not a backlog; triage on a schedule.
4. Doc type is separate from doc status
   - Proposals expire, records are superseded, specs stay true.

---

<!-- _class: decision -->
<!-- _lens: brief story -->

`The decision`

## Adopt the loop that made Lattice's rules, not the rules.

- Adopt the mechanisms
  - They transfer to all six kinds of work and keep each team's rules honest.
- Why not the rulebook
  - Each rule encodes an incident another team never had, so nobody knows when it expires.
- Why not nothing
  - Without a shared loop, argued claims harden into rules, as they did here.

---

<!-- _class: closing -->
<!-- _lens: brief story -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Standardize how rules are made

`Evidence: engineering/decisions/2026-09-24-agentic-practice-audit.md`
