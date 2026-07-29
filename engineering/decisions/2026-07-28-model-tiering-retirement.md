---
status: shipped
summary: Reversed the model-tiering work from #1187 — every agent in this repo now runs on Opus, pinned explicitly. The two-question judgment/lookup routing procedure did not survive contact with the codebase: answering where something lives, whether a claim holds, or why a gate is red *correctly rather than plausibly* needs the cascade, the token system and a dozen HARD RULES in context at once, so what was filed as cheap lookup was judgment wearing a lookup-shaped prompt — and a downshifted agent fails in the direction the machine gates cannot catch (well-formed, confident, wrong). engineering/model-routing.md replaced by engineering/model-policy.md; all nine .claude/agents/ and all five design-competition stages pin opus; visual-review's maker/checker tier split removed; orchestration.md rule 5 reduced to the effort lever. The gate is KEPT and narrowed — checkAgentModelPinning retains its acorn AST parsing and 11-case mutation table with AGENT_MODELS cut to ['opus'], rejecting sonnet/haiku/fable by name; the explicit pin stays required because relying on session inheritance makes the policy an accident of the current /model setting. Card labels collapse too: model:haiku and model:sonnet retired from .github/labels.json and the work-item form. HARD RULE #27 rewritten in place, number retained.
---

# Model tiering is retired — everything runs on Opus

**Date:** 2026-07-28
**Status:** decided, implemented
**Supersedes:** the routing half of #1187 (`agents(routing): pin a model per
subagent and gate it`), and the multi-tier card rubric that predated it
**Rules touched:** HARD RULE #27 (rewritten in place, number retained)

---

## The decision

Every agent this repo spawns runs on **Opus**. The `.claude/agents/` roster, every
`agent()` call in `.claude/workflows/**`, and the `model:*` card label all name
`opus` and nothing else. `sonnet`, `haiku`, and `fable` are rejected by name by
`checkAgentModelPinning`.

This reverses the *routing* built in #1187 while keeping its *enforcement*: the
gate stays, with its accepted set narrowed from three tiers to one.

## What was tried

#1187 (2026-07-26) introduced a two-question routing procedure — **judgment or
lookup?** and **does a gate catch a mistake?** — and pinned nine agents across
three tiers: `scout`, `fact-checker`, `ci-triage` on Sonnet; `inventory` on
Haiku; the adversarial trio, `docs-auditor` on Opus; `prose-checker` on Sonnet.
`design-competition` split its stages across tiers, and the visual sweep ran
makers on Sonnet with the checker sign-off on Opus. A card-level `model:*` label
taxonomy (added a week earlier, 2026-07-20) tagged whole issues by tier.

The stated saving was real arithmetic: a typical exploration agent at ~60K in /
~8K out cost about $0.50 on Opus, $0.20 on Sonnet, $0.10 on Haiku.

## What was observed vs. what is argued

**Read this before the next section.** The four findings below are *arguments*,
not measurements, and the honest scope of the evidence is narrow:

| | |
|---|---|
| **Observed** | #1187 shipped 2026-07-26 and was retired 2026-07-29 — a **58-hour** window. One concrete misroute: `inventory` on Haiku, whose 200K context could not hold a repo-wide sweep. The principal's withdrawal of confidence: *"I have no confidence in any model other than Opus."* |
| **Argued a priori** | All four findings in "Why it failed". Every one of them could have been written the day *before* #1187 shipped. Finding 4 is the routing doc quoted against itself. |
| **Not observed** | No agent returned a wrong map that was caught. No fact-check confirmed a false claim. No CI triage broke something. No re-run cost more than the routing saved. **There is no measured failure here.** |

This distinction matters because this repo has a canonical example of the
opposite: `2026-07-10-hard-rule-12-retirement.md` retired a rule by *empirically
retesting its premise*, and its indictment was precisely that the gate "had never
been re-verified since it was written." This decision does not clear that bar and
should not be read as though it does.

What makes it defensible anyway is not evidence but **decision rights and
asymmetry**: the principal owns the spend and the risk tolerance, and the cost of
being wrong is lopsided (a confidently-wrong answer costs a re-run plus its blast
radius; over-modeling an easy task costs about thirty cents). Under that
asymmetry, routing down is only correct where you are *confident* a task is pure
lookup — and confidence is exactly what was withdrawn. A decision can be right on
those grounds while its supporting arguments remain untested. Both things are
true here.

## Why it failed

**1. The judgment/lookup split does not survive contact with this codebase.**
The routing procedure assumed a large class of tasks that are retrieve-and-
summarize against a spec someone already wrote. Lattice has less of that than it
looks. "Where does X live" here means knowing whether the answer is in the
shared kernel or one render path (#1), whether a token is universal or retired
(#11), whether a layout measures with `padding` because `margin` corrupts the
height math (#20). "Is this claim true" means knowing that `:has()` was
un-banned in #12 and why. What was filed as lookup was judgment wearing a
lookup-shaped prompt.

**2. Context demand, not token price, is the binding constraint.** A useful
sweep pulls in component manifests, theme tokens, layout CSS, and the docs that
govern them at once. Haiku's 200K window could not hold it; the tiering doc's
own answer — "move it to Sonnet, do not shard" — conceded the point for one tier
and should have been followed to its conclusion for the other.

**3. The failure mode is silent and lands past the gates.** A downshifted agent
does not error. It returns something well-formed, confident, and wrong. The
machine gates catch hex literals, margins, token names, counts, and ownership —
none of them catch a map pointing at the wrong file, or a fact-check that marked
a claim confirmed without opening the file. That is precisely the class of error
the verification ladder (#25) exists to catch, and routing put cheaper models on
several of the agents doing the catching.

**4. The stakes are asymmetric and the tiering doc said so.** Its own override
guidance read: "Under-modeling the hard task costs a re-run plus the wrong
answer's blast radius; over-modeling an easy one costs about thirty cents." That
asymmetry is an argument against the ladder, not for calibrating it. Once you
accept it, the expected-value case for routing down survives only where you are
*confident* a task is pure lookup — and finding (1) is that this repo rarely
offers that confidence.

## What was kept, and why

- **The gate.** `checkAgentModelPinning` is retained with `AGENT_MODELS = ['opus']`.
  It went through four implementations in #1187 (three unsound text scans, then an
  acorn AST parse) and an 11-case mutation table; that soundness work is worth
  keeping. Its job flips from "prove each agent was routed deliberately" to
  "prove nothing has drifted off Opus".
- **The explicit pin.** Omitting `model:` would also give Opus today, by
  inheriting the session's. It is still required, because an unstated policy is
  an accident of the current `/model` setting rather than a property of the repo,
  and it fails silently if that setting ever changes.
- **The roster.** All nine agents stay, all on Opus. Their value was never the
  tier — it is the **prompt**: `red-team` attacks, `inversion` refuses the
  framing, `fact-checker` refuses to rank. Choosing the agent is still choosing
  the posture, which is the part that was doing the real work.
- **`effort` as a lever.** Model and effort were always separate, and only the
  model lever traded reliability. `effort: 'low'` on the mechanical fold stage
  survives untouched; Opus 5 is unusually strong at low and medium effort. Cost
  discipline now runs entirely through **fewer agents at the right effort**
  (HARD RULE #25, `engineering/orchestration.md` rule 5).

## What was removed

| Surface | Change |
|---|---|
| `engineering/model-routing.md` | Replaced by `engineering/model-policy.md` — the routing table, price table, and two-question procedure are gone |
| `.claude/agents/*.md` (9) | All `model: opus`; per-agent "you are routed here because this is lookup work" rationale removed |
| `.claude/workflows/design-competition.js` | All 5 `agent()` calls and 4 phases on `opus`; the Critique phase regains a phase-level model (it only lacked one because it straddled two tiers) |
| `engineering/visual-review.md` | Maker/checker tier split removed; both passes are Opus |
| `engineering/orchestration.md` rule 5 | "Two levers" reduced to effort only |
| `engineering/workflow.md` § Model recommendation | Multi-tier card rubric collapsed to `model:opus` |
| `.github/labels.json`, `work-item.yml` | `model:haiku` and `model:sonnet` retired; `model:opus` is the only option |
| `CLAUDE.md` | § MODEL ROUTING → § MODEL POLICY; HARD RULE #27 rewritten in place |

## Consequences accepted

- **Agent work costs more per token**, by choice. The bet is that one avoided
  wrong-but-plausible merge is worth more than the aggregate saving, and that
  cost control belongs at the *agent count* and *effort* levers where it does not
  trade against correctness.
- **`model:*` as a card axis carries no information.** A single-valued label is
  redundant. It is kept rather than deleted so existing tagged cards stay valid
  and the axis has somewhere to go if a tier is ever reintroduced; the rubric
  now states plainly that it routes nothing.
- **Retired labels linger on GitHub.** `sync-labels` is add-only and never
  deletes, so cards still carrying `model:haiku` / `model:sonnet` keep them until
  cleared by hand. Harmless — nothing reads them.
- **HARD RULE #27 keeps its number** and is rewritten in place, per the numbering
  convention. It was not retired: there is still a binding rule about what model
  an agent runs on. The rule's *answer* changed, not its subject.
- **Cost pressure moves onto the verification lever.** This is the second-order
  effect most worth watching, and it cuts against the change's own justification.
  `effort` is not declarable on a roster card — only `design-competition.js` uses
  it — so for a roster spawn the surviving lever is **agent count**, which *is*
  the verification ladder. The 22-agent visual sweep previously ran 11 makers on
  Sonnet and 11 checkers on Opus at roughly half price; it now costs full price
  for identical output, and HARD RULE #25's ~10-agent session-cumulative gate
  bites at half the previous work per dollar. Under real budget pressure that
  lands as *11 makers instead of 22*, or a skipped checker pass, or a change
  ruled not-quite-critical enough for the trio. The retirement is justified as
  protecting verification from silent error; its second-order effect is to
  redirect all remaining cost pressure onto verification volume. Accepted, but
  it is the thing to watch — see "If this is ever revisited".
- **The repo is heavier than if tiering had never been tried.** Net of
  `model-routing.md`'s removal, this leaves roughly 700 added lines (policy doc,
  this doc, the gate and its tests, the rule, the label and form entries, the
  pins) for **zero behavioral delta** — before #1187 every agent inherited Opus;
  after #1240 every agent runs Opus. The return is the written record itself,
  which is only worth having if it is accurate about its evidence and preserves
  what a future reader would reason from. Hence the section above, and the
  appendix below.

## If this is ever revisited

The case for tiering is easy to re-derive from first principles — cheap work
should run on cheap models — and it was already wrong once here. Anyone
proposing it again should start by naming which specific tasks in this repo are
*verifiably* pure lookup, and what catches a confidently wrong answer from one
of them before it merges. Absent a concrete answer to the second question, the
answer is no. Mechanics: `engineering/model-policy.md` § If a tier is ever added
back. **Start from the appendix**, which is the withdrawn hypothesis in full —
do not re-derive it from scratch.

Three triggers that should reopen this deliberately, rather than requiring
someone to argue against a closed case:

1. **A tier ships that did not exist on 2026-07-28.** The ladder was rejected
   against the models available on that date. A new tier is new evidence, not a
   re-litigation of settled ground.
2. **Agent spend becomes a binding monthly constraint AND verification volume is
   being cut because of it** — sweeps halved, checker passes skipped, the trio
   ruled out on borderline-critical work. At that point the revert is costing
   more verification than it buys, which inverts its own justification.
3. **A shape emerges where a cheaper stage is adjudicated by a named Opus stage
   in the same workflow** — the `fold` pass feeding an Opus fact-check, or the
   visual-sweep maker feeding an authoritative Opus checker. That shape answers
   the "what catches a wrong answer" question structurally rather than by
   assertion, which is the one form of the argument this doc does not defeat.

---

## Appendix — the withdrawn hypothesis

Preserved deliberately. The section above demands that a future proposer name
which tasks are *verifiably* pure lookup; deleting the repo's only existing
attempt at that taxonomy while raising the bar to clear it would make
reconsideration harder in both directions at once. This is the routing table from
the deleted `engineering/model-routing.md`, verbatim as it shipped in #1187 —
**withdrawn, not endorsed**. Every row is a claim that a task is lookup; the
retirement is the position that those claims were not reliably true here.

| Task | Model | Effort | Claimed rationale |
|---|---|---|---|
| Editorial / voice sweeps, doc-prose rewrites, gallery + deck copy | opus | high | The words *are* the deliverable |
| Design / architecture / "rethink X" | opus | high–xhigh | Wide solution space, no pattern |
| Red team, Munger inversion, independent checker | opus | high | The trio catches costly errors (#25) |
| Comparative judging of candidate designs | opus | high | Ranking on taste |
| Root-cause debugging (cause not localized) | opus | high | Multi-file causality |
| Visual quality **sign-off** vs the 10/10 rubric | opus | high | Aesthetic judgment is the QUALITY BAR |
| Token / cascade / `@layer` surgery | opus | high | Silent breakage; #26's rule-3 trap |
| Novel engine transform, first-of-its-kind mechanism | opus | xhigh | "Novel" is a tier-2 trigger |
| Writing a decision doc that will be depended on | opus | high | The doc *is* the deliverable |
| Codebase understanding, "where does X live" | sonnet | medium | Retrieve and summarize |
| Fact-checking claims against the repo | sonnet | high | Verifying existence, not merit |
| CI failure triage → diagnose → fix | sonnet | medium | Tests and lint are the gate |
| Test writing against a defined spec | sonnet | medium | The suite verifies it |
| Mechanical refactor following an existing pattern | sonnet | medium | Pattern already established |
| Bug fix with a clean repro and localized cause | sonnet | medium | The test proves the fix |
| Deck authoring from an existing component | sonnet | medium | `lint:deck` is the gate |
| Structural docs, `CHANGELOG`, doc fixes | sonnet | medium | Reviewable; gated |
| Folding a critique back into a draft | sonnet | low | Explicitly a mechanical pass |
| Visual review **maker** pass | sonnet | medium | Matching slides to a written rubric |
| Enumerate / count / list files matching a pattern | haiku | — | No interpretation |
| Structured extraction, dedup, reformatting | haiku | — | Shape transformation only |

Prices as of 2026-07-26, also point-in-time and not re-verified since: Opus 5
$5/$25 per MTok (1M context); Sonnet 5 $2/$10 introductory through 2026-08-31,
$3/$15 after (1M context); Haiku 4.5 $1/$5 (**200K** context, no `effort`
parameter). Note that Sonnet's context window equalled Opus's — only Haiku was
context-constrained, which is why the principal's stated reason ("requires
significant context window") reaches Haiku directly and Sonnet only through the
confidence argument.
