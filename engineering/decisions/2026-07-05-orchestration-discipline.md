---
status: shipped
summary: Retro of the 53-agent design-competition run → orchestration becomes a global discipline (HARD RULE #25). Verification tiers by blast radius (self-review → maker-checker → the adversarial trio of red team + Munger inversion + independent checker for critical/high-blast-radius/novel work), fan-out cost controls (estimate before launch, >10 agents needs an explicit OK, warm-context iteration, harden only the winner), and the competition shape codified as the parameterized .claude/workflows/design-competition.js. Canon lives in engineering/orchestration.md.
---

# Orchestration discipline — the 53-agent design-competition retro

**Symptom (2026-07-05):** a "5 designs × 5 iterations + red team + inversion +
independent check" request was improvised at maximum scale: ~53 agents — 5
parallel tracks of (1 draft + 5 FRESH critic-revise agents, sequential), plus
per-design hardening (3 hostile agents × 5 designs), 5 folds, and 3 judges.
The output was good; the spend was not. Cost and wall-clock were dominated by
three structural mistakes, not by the size of the ask.

## Root causes

1. **Cold context per iteration.** Every fresh iteration agent re-read the
   grounding pack and re-verified the repo from scratch — ~10–15 minutes and
   full input tokens per round, no cache reuse. Iteration is exactly the work
   that should stay *inside one agent session*, where the context is warm.
   A fresh context is a purchase; the only thing it buys is *fresh eyes*, so
   it should be spent only where independence is the point (critique,
   verification) — never on round 3 of the author's own revision loop.
2. **Hardening every candidate.** All 5 designs got the full hostile
   treatment (red team + inversion + independent check), but only the winner
   gets built — 4/5 of that spend was discarded with the losing designs.
   Deep hardening belongs *after* the human pick, immediately before
   implementation, where it changes what actually ships.
3. **Fixed high iteration counts.** Rounds 4–5 produced no material
   corrections; the big ones landed in rounds 1–3. A fixed high count spends
   the tail regardless of whether it earns anything.

## Decision

Orchestration stops being improvised per-request and becomes a **global
discipline**: **HARD RULE #25** (tiered, budgeted, shaped), with the full
model in `engineering/orchestration.md` (the canonical doc) and the
competition shape saved as a parameterized named workflow
(`.claude/workflows/design-competition.js`) so future "redesign X" asks start
from the cheap default instead of being re-invented at maximum scale.

The three legs, in brief (the canon carries the detail):

- **Tiered verification.** Adversarial effort scales with blast radius:
  routine work self-reviews; real blast radius gets MAKER-CHECKER; critical,
  high-blast-radius, or genuinely novel work MUST get the adversarial trio —
  red team, Munger inversion, independent checker — applied to what will
  actually ship. The trio is non-negotiable at the top tier *and*
  deliberately absent below it; both directions are the rule.
- **Budgeted fan-out.** Estimate agent count + rough cost before launch;
  above ~10 agents, get an explicit OK (one bundled question). Token targets
  and guarded loops on every workflow run; refine loops cap at ~3 or stop
  when a round changes nothing.
- **Shaped fan-out/fan-in.** Iterate warm inside one agent; buy fresh
  contexts only for fresh eyes; one shared fact-checker before a pick;
  comparative judging in one context beats isolated scoring; machine gates
  before agent judgment on bulk work; log any dropped coverage.

## Why a hard rule and not just a doc

The failure mode is a *default*, not a knowledge gap: an agent asked for "N
designs with red team and inversion" will faithfully multiply every
adjective into agents unless a standing rule makes the cheap shape the
starting point and puts a confirmation gate on large fan-outs. The same
retro also cuts the other way — the trio was *worth it* for the winner — so
the rule binds in both directions: mandatory hardening at the top tier,
mandatory restraint below it.

## Verification — the rule was dogfooded on itself

Changing a global HARD RULE is tier-2 by the rule's own test (high blast
radius + novel), so it got the full trio applied to what shipped:

- **Maker-checker** (pre-trio) caught the workflow-script crash paths — a null
  fold producing a truthy-but-malformed candidate that escaped `filter(Boolean)`
  and later threw, and dead-critic/dead-designer stages that discarded valid work.
- **Red team** found the load-bearing flaw: the >10-agent gate was defeatable by
  construction — invent-a-"named-shape", the uncapped "audit sweep" shape, and
  per-fan-out (not per-session) counting let a session chain to 40+ agents with
  zero human OK, reproducing the founding incident. Fixed by requiring a
  *pre-registered* shape with a committed hard cap and making the count
  **session-cumulative**.
- **Munger inversion** flagged over-encoding: the cost-control half is well-
  evidenced, but the mandatory-trio half must stay *decidable* or it inflates
  routine kernel/CI work into tier 2. Fixed by collapsing the tier-1/tier-2
  category overlap into one ordered two-question test (blast radius? then
  irreversible/critical/novel?).
- **Independent checker** confirmed the facts (paths, the ~17 vs ~53 arithmetic,
  the gates) — FACTS-HOLD, 0 refuted — and pinned the one doc/script mismatch
  (the injected-globals list omitted `parallel`/`budget`).

The workflow itself gained fixes for the review's script findings (fact-check
"refuted" vs "forward-proposal" so divergent designs aren't sunk for being new;
the judge is told when a track carries unaddressed critique; a `degraded` flag
when fewer than 2 designs survive) and a parse+cap smoke test
(`test/unit/cli/workflows-meta.test.js`), since the script is Biome-excluded and
otherwise run by nothing. This section is itself the artifact HARD RULE #23 asks
for: the claim "verified" naming its surface.

## Pointers

- Canon: `engineering/orchestration.md`
- The rule: `CLAUDE.md` HARD RULE #25; MAKER-CHECKER section (the middle tier)
- The named workflow: `.claude/workflows/design-competition.js`
- Related prior art: `engineering/visual-review.md` (the review-sweep shape),
  `2026-06-14-drift-watch-rebase-thrash.md` (the same lesson — automation
  volume is a cost, not a virtue — in the git workflow)
