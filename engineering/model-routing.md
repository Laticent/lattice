# Model routing — which model runs which task

**This is the canonical doc behind HARD RULE #27.** It answers one question:
*what is the cheapest model that clears the reliability bar this task actually
needs?* That is deliberately the same question `engineering/orchestration.md`
asks about **how many agents** to spend — this doc is the second half of the
same budget. Orchestration decides *how much machinery*; routing decides *what
each piece of that machinery costs per token*.

The two compose and never override each other: the verification ladder decides
**whether** a checker runs, this doc decides **which model** it runs on. A tier
the ladder mandates is never skipped to save money, and a model this doc pins is
never downshifted to move faster.

---

## The prices (why any of this matters)

| Model | Input $/MTok | Output $/MTok | Context | `effort` |
|---|---|---|---|---|
| **Fable 5** (`fable`) | $10.00 | $50.00 | 1M | full ladder, incl. `max` |
| **Opus 5** (`opus`) | $5.00 | $25.00 | 1M | full ladder, incl. `max` |
| **Sonnet 5** (`sonnet`) | **$2.00** → $3.00 | **$10.00** → $15.00 | 1M | full ladder, incl. `xhigh` |
| **Haiku 4.5** (`haiku`) | $1.00 | $5.00 | **200K** | **none — rejected** |

Sonnet 5 is on **introductory pricing through 2026-08-31**: today it is **2.5×
cheaper** than Opus 5, and **1.67× cheaper** after that date. Haiku 4.5 is 5×
cheaper than Opus 5 but carries two hard constraints that decide where it can
go at all: a **200K context window** (a fifth of the others — it cannot hold a
wide repo sweep) and **no `effort` parameter** (passing one errors), so it is
model-lever-only and cannot be tuned up for a harder-than-expected task.

Refresh these numbers from the `claude-api` skill before citing them; do not
quote them from memory.

### Fable 5 is an UPSHIFT, not part of the cost ladder

Read the table again: **Fable 5 costs 2× Opus 5.** Everything else in this doc is
about routing *down* to the cheapest model that clears the bar; `fable` is the one
tier you route *up* to, and only when the deliverable's quality ceiling — not its
cost — is what you're optimizing. It is Anthropic's most capable widely released
model.

**When it applies here:** the repo already has a rubric for this, and it is
`engineering/workflow.md` § Model recommendation, which defines the `model:fable`
issue label as *"prose-heavy / editorial / voice — the deliverable is words a
human reads and the craft is the writing: doc-prose rewrites, editorial/voice
sweeps, gallery/deck copy,"* explicitly **not** a structural doc fix. **That
rubric governs; this doc does not restate or override it.** The two are one
system seen at two scales — that doc tags a *card* with the tier it should be
worked at, this doc pins the *subagent* that does a slice of it — so a
`model:fable` card whose deliverable really is the prose should spawn its writing
agent on `fable`, not on the `sonnet` the generic docs row below would suggest.

**Its constraints differ from the rest of the ladder** and are worth knowing
before you pin it: thinking is always on (`thinking: {type: "disabled"}` is a
400 — omit the parameter), the raw chain of thought is never returned, assistant
prefill is unsupported, and it requires 30-day data retention (unavailable under
zero-retention). Its safety classifiers can also decline a request outright with
`stop_reason: "refusal"`.

**Why no agent in the roster is pinned to it:** the roster is lookup-and-verify
work plus the adversarial trio — none of it is prose craft. `prose-checker` is
the closest call and stays on `sonnet` deliberately: it *audits* writing against
a stated checklist of AI tells and read-aloud failures and never edits, which is
closer to lookup than to composition. If you want craft-tier auditing rather than
checklist-tier, that is the one agent worth moving to `fable` — a judgment call,
not an oversight.

---

## The decision procedure — two questions, asked in order

Task *names* ("bug fix", "refactor", "review") cut across model tiers and are
the wrong unit to route on. Two properties decide it:

1. **Judgment or lookup?** Does being right require weighing tradeoffs, taste,
   or reasoning with no established pattern to follow? Or is it retrieve,
   verify, and summarize against a spec somebody already wrote? *Judgment →
   Opus. Lookup → continue.*
2. **Who catches a mistake?** Does a machine gate (`npm run lint`, the unit
   suite, `build:check`, a type error) catch a wrong answer before it matters —
   or does it ship silently into a doc, a decision, or a merge? *Gate catches
   it → Sonnet, or Haiku if the work is pure enumeration. Ships silently →
   Sonnet at `high`, and re-ask question 1 honestly.*

When genuinely torn between "judgment" and "a lookup with some interpretation,"
route to Opus. Under-modeling the hard task costs a re-run plus the wrong
answer's blast radius; over-modeling an easy one costs about thirty cents.

---

## The routing table

Look up the closest row; when nothing fits, fall back to the two questions.

| Task | Model | Effort | Why |
|---|---|---|---|
| **Fable 5 — the words themselves are the deliverable (an UPSHIFT, 2× Opus)** ||||
| Editorial / voice sweeps, doc-prose rewrites, gallery + deck copy | fable | high | `workflow.md`'s `model:fable` rubric — craft, not structure |
| **Opus 5 — judgment, or a mistake ships silently** ||||
| Design / architecture / "rethink X" | opus | high–xhigh | Wide solution space, no pattern to follow |
| Red team, Munger inversion, independent checker | opus | high | The trio exists to catch costly errors (#25) |
| Comparative judging of candidate designs | opus | high | Ranking on taste, side by side |
| Root-cause debugging (cause not localized) | opus | high | Multi-file causality, hypothesis over evidence |
| Visual quality **sign-off** vs the 10/10 rubric | opus | high | Aesthetic judgment is the QUALITY BAR itself |
| Token / cascade / `@layer` surgery | opus | high | Silent breakage; #26's rule-3 trap |
| Novel engine transform, first-of-its-kind mechanism | opus | xhigh | "Novel" is a tier-2 trigger by definition |
| Writing a decision doc that will be depended on | opus | high | The doc *is* the deliverable |
| **Sonnet 5 — lookup, or a gate catches the mistake** ||||
| Codebase understanding, "where does X live" | sonnet | medium | Retrieve and summarize; huge input, small output |
| Fact-checking claims against the repo | sonnet | high | Verifying existence, not judging merit |
| CI failure triage → diagnose → fix | sonnet | medium | Tests and lint are the gate |
| Test writing against a defined spec | sonnet | medium | The suite verifies it |
| Mechanical refactor following an existing pattern | sonnet | medium | Pattern already established; gates catch slips |
| Bug fix with a clean repro and localized cause | sonnet | medium | Cause known; the test proves the fix |
| Deck authoring from an existing component | sonnet | medium | `lint:deck` + the docs contract are the gate |
| Structural docs, `CHANGELOG`, doc fixes | sonnet | medium | Reviewable; `checkUsEnglish` and review gate it |
| Folding a critique back into a draft | sonnet | low | Explicitly a mechanical editing pass |
| Visual review **maker** pass (spot rubric misses) | sonnet | medium | Matching slides against a written rubric |
| **Haiku 4.5 — mechanical, gate-verified, fits in 200K** ||||
| Enumerate / count / list files matching a pattern | haiku | — | No interpretation; `effort` unsupported |
| Structured extraction, dedup, reformatting | haiku | — | Shape transformation only |

Two rows deliberately split a workflow across tiers:

- **The visual sweep** (`engineering/visual-review.md`, 22 agents) runs **makers
  on Sonnet, checkers on Opus**. The maker pass reads whole slides against a
  written rubric; the checker pass makes the final aesthetic call. The sign-off
  stays Opus, and the sweep costs roughly half.
- **`design-competition`** runs designers, critics, and judges on Opus (taste
  and ranking), the fold at Sonnet/`low` (mechanical), and the fact-check at
  Sonnet/`high` (verifying claims against files).

---

## Model and effort are two levers, not one

They cut different token pools, so the right lever depends on the task's shape:

- **`effort` cuts output tokens** — the $25/MTok side. It is the lever for a
  task that *writes* a lot: a long design doc, a big refactor.
- **model cuts both rates at once.** It is the lever for a task that *reads* a
  lot and writes a little: a scout that pulls in 200 files and returns 20 lines
  is dominated almost entirely by input price.

A worked example, ~60K in / ~8K out (a typical exploration agent):

| | Opus 5 | Sonnet 5 (today) | Haiku 4.5 |
|---|---|---|---|
| Input | $0.30 | $0.12 | $0.06 |
| Output | $0.20 | $0.08 | $0.04 |
| **Total** | **$0.50** | **$0.20** | **$0.10** |

Dropping that agent's `effort` from `high` to `medium` on Opus saves a slice of
the $0.20; moving it to Sonnet saves $0.30 of the $0.50. **Use both.** Note also
that Opus 5 is unusually strong at `low` and `medium` effort — on a task that
must stay Opus for judgment reasons, sweeping effort down is the available
saving.

---

## The main session stays on Opus 5

Do **not** try to downshift the driving session mid-task. Switching a session's
model invalidates its prompt cache (caches are model-scoped), so the "saving"
buys a full re-read of the conversation — and the session model is the user's
`/model` setting, not an agent's call to make.

Every dollar this doc saves comes from **pushing work down into subagents**,
which is exactly the documented pattern for the cache constraint: keep the main
loop on one model, spawn a subagent on the cheaper model for the sub-task. It
also means routing is only ever a *spawn-time* decision — there is no such thing
as re-routing work already underway.

---

## The agent roster — routing you cannot forget

Prose in a doc gets forgotten by turn 40. The roster in `.claude/agents/` pins
the model in frontmatter, so **choosing the agent is choosing the model** and
there is no separate step to skip:

| Agent | Model | Use for |
|---|---|---|
| `scout` | sonnet | Locate code, map a subsystem, answer "where/how does X work" |
| `fact-checker` | sonnet | Verify load-bearing claims (paths, fields, mechanisms) against the repo |
| `ci-triage` | sonnet | Read a failing job's logs, find the cause, propose or apply the fix |
| `inventory` | haiku | Enumerate, count, extract — mechanical sweeps with no interpretation |
| `red-team` | opus | Trio lens 1: attack it, find the abuse path and the edge case |
| `inversion` | opus | Trio lens 2: argue it is the wrong design entirely |
| `checker` | opus | Trio lens 3 / maker-checker default: refute the load-bearing claims |
| `docs-auditor` | opus | Cross-reference what ships against what the docs claim |
| `prose-checker` | sonnet | Audit human-facing writing for AI tells and read-aloud failures |

`Explore`, `Plan`, and `general-purpose` are harness built-ins with no pinned
model — they inherit Opus 5 from the session. **Pass `model: 'sonnet'`
explicitly** when using them for lookup work, or reach for `scout` instead.

The gate (`checkAgentModelPinning` in `tools/check-ownership.js`, via
`build:check`) fails on any `.claude/agents/*.md` missing a `model:` field, any
unrecognized model name, and any `.claude/workflows/*.js` `agent()` call with no
`model` in its options — so an unpinned agent cannot land, and a workflow stage
cannot silently drift back to inheriting Opus.

**What the gate cannot see:** an ad-hoc `Agent()` call in a live session. That
one rides on discipline — which is why the roster exists, and why the dispatch
table sits in `CLAUDE.md` where it is loaded every session.

---

## When to override the table

Routing is a default, not a cage. Override upward — never silently downward —
and say so in one line when you do:

- **A "lookup" that turned out to need judgment.** If a scout comes back
  hedging, re-run the question on Opus rather than acting on a hedge.
- **A Haiku task that outgrew 200K context.** Move it to Sonnet; do not shard it
  just to keep it on Haiku, since the coordination costs more than the saving.
- **Anything the verification ladder puts at tier 2.** Model routing does not
  get a vote there — the trio is Opus, mandatory, and not negotiable down for
  momentum or cost.
