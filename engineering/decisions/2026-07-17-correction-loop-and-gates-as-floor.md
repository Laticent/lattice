---
status: proposed
summary: >
  A design for reliably getting boardroom-quality artifacts (themes, components,
  finishes, decks) on first delivery — including from TOOL-LESS API models in the
  BYOK Studio Playground — via a generate → gate → correct loop, with correctness
  living in machine gates rather than skill prose. An adversarial trio (red team,
  Munger inversion, independent checker), each grounded in the code, reviewed it.
  Verdict: the DIRECTION is right and largely ALREADY BUILT (the theme-AI and
  layout-AI propose→gate→repair pipelines), but the central promise was overstated
  and three sub-claims fail. The unanimous finding: Lattice's gates certify "not
  broken," never "brilliant" — so "correctness = gates" raises the FLOOR
  (structurally valid + AA-clean) but the correction loop's "never ship red →
  safe-default" rule actively pressures output toward BLAND. The 2→10 "killer"
  gap stays a human (or a genuinely CALIBRATED judge) gate. Adopt the floor loop
  around pieces that already exist; kill the vision-judge and the
  "skill→two-target compiler" as premature; stop promising the loop makes decks
  good.
---

# The correction loop, and why gates are the floor — not the ceiling

## Context

Three rounds of dogfooding (sakura+policy-recommendation; the authoring-churn lint
guards; physis+cycle+canopy) surfaced a recurring pattern: the machine **gates**
caught every catchable defect reliably, while the **skill prose** drifted and
actively misled (e.g. `component.md` teaching the inert `@layer components`). That
led to a strategic question: **can we reliably produce boardroom-10/10 artifacts on
the FIRST delivery** — not just for a tool-having agent (Claude Code / the SDK,
which can run gates and look at renders), but for the **tool-less API models** that
author in the Studio Playground on the user's own OpenRouter key (BYOK, HARD RULE
#24)?

This note records the proposed design, the adversarial review that stress-tested
it, and the corrected conclusion.

## The design that was proposed

1. **Correctness lives in machine gates, not skill prose.** Gates fail loud; prose
   rots silent. Shrink skills to orientation / judgment / gate-pointers.
2. **A skill compiles to two targets.** A tool-having agent reads the doc and runs
   the gate commands; a tool-less BYOK model has the facts injected into context
   and the **harness runs the gates around it**, feeding findings back.
3. **Each skill's checklist = machine-runnable gate-pointers** (the only form
   portable to both consumers).
4. **The correction loop:** deterministic autofix → fixpoint (free) → re-prompt the
   content/judgment residue only (≤3 rounds, stop when a round stops reducing
   findings) → escalate / safe-default. Never ship red; never loop forever.
5. **Effort is a product-level dial** for BYOK (model choice, loop count, a
   vision-judge pass) and a reasoning-tier dial for the agent. No reliable
   one-shot; the goal is a reliable first HUMAN-VISIBLE delivery.
6. **Many error classes are deterministically fixable**, including theme contrast
   (a "darken the fill until it passes" search).

## How it was reviewed

The adversarial trio (HARD RULE #25), run blind and in parallel, each instructed to
ground every claim in the actual repository:

- **Red team** — break it, find the production failure.
- **Munger inversion** — "what would GUARANTEE this ships forgettable decks?" then
  check whether the design prevents each.
- **Independent checker** — fit / risk / build-cost verdict; is any claim
  overstated; is there a simpler 80% path.

The trio disagreed with each other on two factual points (below) — which is exactly
why running them blind was worth it — and converged unanimously on the deepest flaw.

## The unanimous finding — gates are the FLOOR, not the ceiling

**Lattice's gates certify "not broken," never "brilliant," and the correction
loop's terminal rule pressures output toward bland.**

- `lib/authoring/scorecard.js`'s own header: *"it measures the ABSENCE of detected
  problems, not the presence of brilliance — a clean deck can still be dull."*
- Every gate is structural: hex, margins, typography tokens, US-English,
  `checkCatContrast` (WCAG ratios), the lint-core footgun shapes, `checkSkillFreshness`
  (integer counts). **None scores the argument, the narrative arc, or the "so what."**
  `review-core.js` (the taste-adjacent layer) is advisory-only and *deliberately*
  under-fires.
- Fuse that with claim 4's "never ship red → safe-default": the cheapest path to
  green is to claim less, argue less, risk nothing. The loop's stable output is the
  **most-certainly-green** deck — which is the least-surprising, slot-filled,
  forgettable one. A sharp, memorable, contrarian slide is *more* likely to trip a
  heuristic and is *never* rewarded for the bet.

So the goal splits into two gaps, and the design as proposed only closed one:

| Gap | Status under the design |
|---|---|
| **Floor** — not-broken → structurally valid + AA-clean | Closed well; mostly already built |
| **Ceiling** — valid → *killer* | **Open.** Nothing automated perceives it; the safe-default floor pushes away from it |

The codebase already says this out loud: `design/skills/README.md` — *"the last mile
is taste… render it and actually look"*; `tools/component-gen-eval.mjs` — *"the
aesthetic 10/10 read still needs a human."* **Corrected promise: the loop reliably
delivers a valid, AA-clean first draft. It does not deliver a killer one. The 2→10
gap stays a human (or a calibrated judge) gate.**

## The two contradictions, reconciled

**Contrast repair (claim 6).** Red team: unsound (naive "darken" is backwards for a
dark-ink theme, and the constraint system is coupled). Checker: sound and shipping —
`ensureContrast` (`lib/theme/color.js`) is a real OKLCH lightness search with
per-canvas direction, repairing both modes. **Munger broke the tie:** the mechanism
exists but (a) is wired to the ink ramp, **not** the categorical fills (no
`cat-*-fill` is passed to it), (b) a naive per-slot repair across 12 hues
re-introduces the exact *categorical-collapse* bug `checkCatContrast` guards (each
slot passes AA while the 12-color set converges toward mutual indistinguishability),
and (c) it can return a still-failing best-effort color silently. → **Claim 6 is
withdrawn as stated.** A sound categorical contrast auto-fix is a coupled,
set-aware, currently-unbuilt problem — not the easy win claimed.

**Does the loop exist (claims 2/4).** Red team: the *deck-authoring* Studio flow is
human-click-Apply (true — and a deliberate honesty contract: the model never owns
correctness). Checker: the *theme* and *component* generation pipelines
(`lib/theme/ai.js`, `lib/layout/ai.js`, `tools/component-gen-eval.mjs`) are already
automated propose→gate→repair loops (also true). → **The pattern is proven twice;
automating the deck-fix loop is net-new, and must keep model rewrites human-Apply**
(auto-applying *mechanical* fixes is fine; auto-applying *model* rewrites breaks the
shipped contract).

## Sub-claims that failed verification

- **A mechanism was mis-named:** `validate()` (`lib/components/index.js`) is **not**
  browser-safe (`require('node:fs')`). The fs-free browser module is
  `lintTextWith` (`lib/authoring/lint-core.js`), which is *deliberately approximate*
  (`countPrimaryCollection` returns 0 when it can't see a collection). The gates that
  define correctness — `checkCatContrast`, the **rendered** overflow probe — are
  Node/render-only and **invisible to a BYOK model.** So "the harness runs the gates
  around the tool-less model" holds only for the footgun subset; the hard checks need
  a browser twin or a render step the BYOK path doesn't have.
- **Deterministic ≠ meaning-preserving:** `autofixNestedTitle` strips a title's
  trailing punctuation and can invert a slide's emphasis
  (`- **Ship it.** Board should approve` → title/sub-body swap); the green gate then
  certifies the altered meaning. Mechanical autofix needs a re-check or must be
  restricted to provably meaning-preserving transforms.
- **The convergence signal is buggy:** "stop when finding count stops dropping"
  false-aborts legitimate multi-step fixes (fixing A routinely exposes B → net-zero
  delta). Use "target finding cleared + oscillation detection," not a raw count delta.
- **The injected context is largely ungated:** `components.json` has **no** freshness
  gate; the Studio `SYSTEM` prompt (`architect.ts`) is hand-written prose paraphrasing
  lint rules with nothing tying it to them. Stale facts ship silently to every BYOK
  user — the one consumer that cannot cross-check.
- **Autofix coverage is ~3 of ~40 rules**, not "more than it looks" — the maintainers
  found exactly three uniquely-invertible shapes; everything else carries only a `fix:`
  string for a human/model.

## Decision — what we adopt

**ADOPT-WITH-CHANGES.** The direction is right and largely already real (the best
evidence for it). Treat this as *wire-and-formalize what exists*, not a greenfield
build, and demote the promise to the truth.

Adopted:
- **Gates over prose (claim 1)** — already the repo's operating philosophy
  (`checkSkillFreshness` is the proof), with the standing caveat: **gates are the
  floor, not the ceiling.**
- **Checklist = gate-pointers (claim 3)** — for the agent, and for the footgun subset
  on BYOK.
- **The floor loop (claim 4), corrected** — close the *deck* autofix loop around
  existing pieces (`applyAllFixes` → deterministic re-score → bounded re-prompt of the
  residue only). Mechanical fixes auto; model rewrites stay human-Apply. Convergence =
  target-cleared + oscillation guard, not count-delta.

Killed / deferred, with reason:
- **The vision-judge (claim 5)** — killed. Uncalibrated by construction; a model
  grading conformance to its own trained aesthetic reliably rubber-stamps and
  manufactures false confidence that the taste gap is closed. If a taste signal is
  ever built, it MUST be able to *fail a structurally-perfect deck*, anchored on
  reference good/bad decks — otherwise it is worse than none.
- **The "skill → two-target compiler" abstraction** — deferred. Two bespoke pipelines
  (theme, component) already prove the pattern; formalizing them into one compiler
  before a third consumer needs it is speculative abstraction.
- **Categorical contrast auto-fix (claim 6)** — deferred. A coupled multi-objective,
  set-aware repair; unbuilt for `cat-*-fill` today. `checkCatContrast` stays
  check-only until a set-aware solver exists.

## The concrete path

1. **Merge the pending skills work first.** Everything here is gated on the
   skill-recertification + `checkSkillFreshness` work and the authoring-churn lint
   guards landing — "skills as thin orientation + gate-pointers" has no foundation
   until they merge.
2. **Close the deck autofix loop** in the Studio around what already exists; inject
   the already-synthesized skill canon as the truthful context pack; **add a freshness
   gate for `components.json` and the `SYSTEM` prompt** to plug the silent-drift hole
   at the BYOK consumer.
3. **Own the ceiling gap explicitly.** The automated loop raises the floor; "killer"
   stays a human gate (or a genuinely calibrated judge). Stop promising the loop
   delivers 10/10 — the honest promise is "reliably ship a valid, AA-clean draft."

## Evidence pointers

`lib/authoring/scorecard.js` · `lib/authoring/review-core.js` ·
`lib/authoring/lint-core.js` (autofixes 301/320/336, `applyAllFixes` 408) ·
`lib/components/index.js` (fs-bound `validate()`) ·
`tools/check-ownership.js` (`checkCatContrast` ~2002, `checkSkillFreshness` ~2065) ·
`lib/theme/ai.js` · `lib/theme/derive.js` · `lib/theme/color.js` (`ensureContrast` ~247) ·
`lib/layout/ai.js` · `lib/layout/gate.js` · `tools/component-gen-eval.mjs` ·
`docs/src/playground/architect-model.js` (BYOK OAuth) ·
`docs/src/components/studio/architect.ts` (the `SYSTEM` prompt, the per-finding fix flow).
