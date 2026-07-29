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

## If this is ever revisited

The case for tiering is easy to re-derive from first principles — cheap work
should run on cheap models — and it was already wrong once here. Anyone
proposing it again should start by naming which specific tasks in this repo are
*verifiably* pure lookup, and what catches a confidently wrong answer from one
of them before it merges. Absent a concrete answer to the second question, the
answer is no. Mechanics for adding a tier back: `engineering/model-policy.md`
§ If a tier is ever added back.
