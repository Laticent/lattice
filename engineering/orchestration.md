# Orchestration — the standard operating procedure for spending agents

**This is the general SOP for how much machinery any task gets — the standing
default for balancing speed, cost, and reliability across *all* agent work,
not a playbook for one kind of task.** A design-competition ask happened to
expose the problem (improvised into ~53 agents when ~17 would have done better
work — `engineering/decisions/2026-07-05-orchestration-discipline.md`), but the
rule it forced is general: **match the machinery to the job, every time.** This
is the canonical doc behind **HARD RULE #25** and the MAKER-CHECKER section of
`CLAUDE.md`.

**The three-way balance.** Every orchestration decision trades **speed** (wall
clock — parallel fan-out and warm context buy it), **cost** (tokens + my
GitHub/Claude spend — fewer, better-targeted agents buy it), and **reliability**
(correctness/confidence — independent eyes and adversarial verification buy it)
against each other. There is no free axis: more agents costs tokens; a barrier
costs speed; skipping the checker costs reliability. The whole doc is one
question — *what is the cheapest machinery that hits the reliability bar this
task actually needs?* — and everything below is how to answer it without
re-deriving it each time.

**Solo is the default.** An orchestration is a purchase, and it buys exactly
one of three things —

- **coverage** — more surface than one context can hold (a 58-component
  sweep, a whole-gallery audit): buys reliability *and* speed at a token cost;
- **independence** — eyes uncorrelated with the maker (a critic, a checker,
  a red team): buys reliability;
- **confidence** — adversarial verification before something expensive or
  irreversible ships: buys reliability at the top of the risk curve.

If a fan-out isn't buying one of those, it's waste — do the work yourself. The
default posture is *fewest agents that clear the bar*, escalating only when the
cost of being wrong justifies the spend.

---

## The verification ladder — adversarial effort scales with blast radius

Three tiers. Match the tier to the work; both over- and under-shooting are
defects.

| Tier | Applies to | What runs |
|---|---|---|
| **0 — Self-review** | Routine, reversible, well-trodden work | You + the automated gates (lint, tests, `build:check`). No agents. |
| **1 — Maker-checker** | Blast radius but **routine and reversible**: a typical engine transform, shared-kernel edit, hooks/CI tweak, or multi-file refactor that follows an existing pattern and can be reverted cleanly | One independent checker agent bug-hunts the diff; two (inspection vs. assessment) only for the riskiest changes. `CLAUDE.md` §MAKER-CHECKER. |
| **2 — The adversarial trio** | Blast radius **AND** (irreversible **or** critical **or** genuinely novel) — **mandatory** | Red team + Munger inversion + independent checker, each in its own fresh context, applied to **what will actually ship**. |

**The tier-1/tier-2 boundary is one decidable question, asked in order — not
a category lookup** (shared kernels and hooks/CI live in *both* rows above on
purpose: the surface doesn't decide the tier, these two questions do):

1. **Does it clear tier 0 at all?** Real blast radius — could a mistake here
   break more than the immediate diff (a shared kernel, the hooks/CI
   machinery, the token system, many files at once)? *No* → tier 0. *Yes* →
   continue.
2. **Is it irreversible, critical, or novel?** Irreversible/expensive to walk
   back (a release, export-pipeline *bytes*, a data migration, a security
   surface, anything touching `OPEN_ROUTER_KEY` handling); *critical* (a
   failure is not merely a revert but a real-world loss); or *novel* (no
   established pattern — first-of-its-kind design, new architecture, new
   tooling the repo has no precedent for). *Any one → tier 2.* *None →
   tier 1.*

So a routine shared-kernel refactor that follows the existing playbook is
tier 1 (one checker); the *same file* touched by a first-of-its-kind
mechanism, or in a way that can't be cleanly reverted, is tier 2. **The trio
is mandatory once question 2 is yes — that mandate is not negotiable down for
momentum** (you asked for exactly this: critical, high-blast-radius, and new
work always get the three lenses). Equally, don't inflate the *routine*
blast-radius majority into tier 2 — that just re-creates the overspend this
doc exists to stop. When honestly torn between "novel" and "routine variant,"
treat it as novel and escalate: under-verifying the genuinely new is the
costlier error.

**The trio, defined** (three different questions — don't collapse them into
one "review" agent):

- **Red team** — a hostile agent actively tries to break it: adversarial
  inputs, abuse paths, edge cases, the exploit the design didn't consider.
  Prompted to attack, not to assess.
- **Munger inversion** — an agent argues the opposite: "how would we
  *guarantee* this fails?" / "steelman the case that this is the wrong
  design entirely." Inversion catches wrong-problem and
  wrong-frame errors that bug-hunting never surfaces.
- **Independent checker** — a fresh context verifies the load-bearing
  claims against reality: does the cited file exist, does the mechanism
  work as described, do the numbers reproduce. Prompted to refute, with
  "refuted" as the default on uncertainty.

**Harden only what ships.** In any generate-then-pick flow, the trio runs on
the *winner*, after the human pick, immediately before implementation —
never on every candidate (hardening N candidates discards (N−1)/N of the
spend with the losers). Top-2 only when the pick is genuinely close.

**Exploration is tier 0 — the ladder gates what SHIPS, not what you TRY.**
This is the load-bearing protection for innovation, so it is explicit:
prototyping, spikes, "throw five wild directions at the wall," anything in
`.scratch/` or thrown away after — **tier 0, no ceremony.** "Novel" escalates
a thing to tier 2 only at the moment you decide to make it *real and
depended-upon* (merge it, build on it, ship it) — because that's when it
becomes irreversible, not because exploring is expensive. The trio is a
*ship gate on the winner*, never a *permission slip to experiment*. An agent
that makes you run a red team before you're allowed to try an idea has
misread the ladder: divergence is meant to be cheap and plentiful, and the
`design-competition` shape exists precisely to generate bold, divergent
options at low cost and harden only the one you choose. If this rule is ever
felt as "I can't just try things," that is a bug in how it's being applied,
not the intent.

---

## Cost controls — every orchestration, no exceptions

1. **Estimate before launch, and count cumulatively.** State the expected
   agent count and rough token/wall-clock cost before spawning. **Once a
   task's *cumulative* agent count — across every fan-out in the session so
   far, plus the one you're about to launch — passes ~10, get an explicit OK
   first** (one `AskUserQuestion` round, bundled with any other open
   decisions). **Cumulative, not per-fan-out:** two serial 8-agent sweeps sum
   to 16 and trip the gate; you cannot chain sub-10 fan-outs under it. That
   chaining is exactly how the founding 53-agent run would slip a
   per-fan-out gate.

   **The only exemptions are pre-registered:** a fan-out CLAUDE.md *already
   mandates* without asking (the QUALITY BAR's large visual sweep — its
   canonical layout audit is 22 agents, 11 makers + 11 checkers), or a
   **named workflow that ships in `.claude/workflows/` with a hard agent cap
   declared in its `meta`** (today: `design-competition`). A cap you can read
   off a committed file is the exemption; a name you coin in a `log()` line is
   **not** — "I'll call this the audit shape" does not self-authorize. When
   you invoke an exempt shape, still `log()` its cap so the committed cost is
   visible, and it still counts toward the session cumulative for the *next*
   decision. If a shape has no hard cap, it is not exempt — estimate it and
   apply the gate.
2. **Hard budget every workflow run.** Launch with a token target; guard
   loops with `budget.remaining()`. Never an unguarded `while`.
3. **Iterate warm; buy fresh contexts only for fresh eyes.** Revision
   rounds stay *inside one agent session* (warm context, cache reuse, no
   re-grounding). A fresh agent is justified only where independence is the
   product: critique, verification, judging. A fresh agent per iteration
   re-reads the grounding pack every round — that was the single biggest
   cost in the 53-agent retro.
4. **Kill diminishing returns structurally.** Refine loops default to ~3
   rounds, or loop-until-dry (stop when a round produces no material
   change) — never a fixed high count for its own sake. The retro's rounds
   4–5 corrected nothing.
5. **Tier effort — the one lever left.** Mechanical stages (formatting,
   extraction, dedup, folding a critique in) run at low effort; reserve high
   effort for the adversarial verify/judge stages where reasoning depth changes
   the verdict. Opus 5 is unusually strong at `low` and `medium`, so this is a
   real saving and not a quality trade. **The model is not a lever here**: every
   agent runs on Opus, by decision — tiering was tried and retired because a
   downshifted agent in this repo fails silently
   (**`engineering/model-policy.md`**, HARD RULE #27). Savings come from
   spawning *fewer* agents at the *right effort*, never from a cheaper model
   underneath them.
6. **Prefer `pipeline()` to `parallel()` barriers.** A barrier makes fast
   tracks idle behind the slowest one. Use it only where a stage truly
   needs ALL prior results at once — dedup across findings, a shared
   fact-check, comparative judging.
7. **Machine gates before agent judgment.** On bulk work, build/run the
   automated checks (coverage, counts, lint, word budgets) *before* the
   sweep so they police the writers; spend agent review only on what
   machines can't judge (visual quality, prose fit).
8. **Log dropped coverage.** Any top-N cap, sampling, or no-retry choice
   gets a `log()` — "covered everything" must never be silently false.

---

## Named shapes — start here, don't improvise

### Design competition ("redesign X", "N candidate designs")

Saved as the parameterized workflow **`.claude/workflows/design-competition.js`**
(args: brief, tracks, iterations, judges). The shape:

1. **N designer tracks (default 5), each iterating INTERNALLY (default 3
   rounds)** in one session, self-selecting its best version. One agent per
   track — warm context, no repeated grounding.
2. **One fresh-eyes critic per design, once.** Self-review polishes but
   misses its own blind spots; one outside critique per track breaks the
   bias at a fraction of the cost of fresh-agent-per-round. The critique is
   folded back in by a cheap low-effort pass.
3. **One shared fact-checker across all candidates** verifies load-bearing
   claims (file paths, field names, mechanisms) against the repo — the only
   hardening that must precede the pick, so no design wins on fabrications.
4. **Comparative judging in one context** (1–3 judges max, all candidates
   side by side) — comparative scoring beats isolated scoring.
5. **Present → human picks → the adversarial trio on the winner only**,
   right before implementation.

At the defaults that's ~17 agents for 5 tracks (designer + critic + fold,
per track, + fact-check + judge) versus the retro's 53 — and the expensive
high-effort work (the trio) lands on exactly one design.

*(A note on the file itself: `.claude/workflows/*.js` scripts run inside the
harness's async wrapper with injected globals (`agent`, `pipeline`,
`parallel`, `log`, `phase`, `budget`, `args`) and a top-level `return` — they
are not standard Node modules and cannot parse as such, so the directory is
excluded from Biome in `biome.jsonc` under the `unparseable:` class — house source
in a non-standard dialect, which is a different thing from vendor or generated and
now says so (#1223). `parallel(thunks)` takes an array of `() => Promise` thunks and
barriers on all of them; `budget.total` / `budget.remaining()` expose the
run's token target — both are used by `design-competition.js` and are part of
the harness contract, not extras.)*

### Bulk content sweep (many files, one voice — e.g. 55 manifests' copy)

1. Write **one shared style spec first**; every writer works from it.
2. **Sharded writer agents** by family/bucket (coverage is the purchase).
3. Verify in cost order: **automated gates first** (built before the sweep),
   agent review only for machine-blind quality — rendered-slide review goes
   through the `engineering/visual-review.md` fan-out.

"1 writer + trio verification" is the right shape for a *single high-stakes
document*; it does not scale to a 55-file sweep — the gates do the scaling.

### Visual review sweep

Already canon: `engineering/visual-review.md` — split by whole deck / bucket
/ breakpoint, never by carving a slide; maker pass then checker pass.

### Understand / research / audit sweeps

Fan out readers by subsystem or search modality, then synthesize. Same cost
controls; a completeness critic ("what's missing?") replaces the trio unless
the *output* of the audit is itself tier-2 (e.g. it gates a release).

---

## Anti-patterns (each one is a line item from a real bill)

- **Fresh agent per iteration round** — re-grounds every round; iterate warm.
- **Hardening all N candidates** when only the winner ships.
- **Fixed high iteration counts** past the point rounds stop correcting.
- **One "review" agent standing in for the trio** on tier-2 work — the three
  questions (break it / invert it / verify it) find different failures.
- **A barrier where a pipeline would do** — fast tracks idling on slow ones.
- **Silent caps** — sampling or top-N without a `log()`.
- **Improvising a shape a named workflow already covers** — start from the
  saved default and vary the args.
