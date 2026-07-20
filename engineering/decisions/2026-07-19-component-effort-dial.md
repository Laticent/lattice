---
date: 2026-07-19
status: shipped
area: studio / component generation
summary: A low/medium/high/maximum EFFORT dial on component generation. Effort maps to
  how many DESIGN self-refine rounds run after generation (0/1/2/3) — each round
  critiques the current best against the boardroom rubric and returns an improved,
  self-rated version; the caller keeps the highest-rated COMPLIANT candidate. Distinct
  from #1113's gate-repair (compliance): this raises quality. The lever is effort,
  not spend.
---

# The component-generation effort dial (design self-refine)

## Problem

#1113 made generated components gate-*clean* (no hex, no margin). But the loop stops
the moment the gate is clean — it never asks "is this a *good* design?" A gate-clean
but mediocre component (a sparse KPI slide, a flat hierarchy, a lonely body-sized
number) shipped exactly as the model first drew it. There was no way to spend more
model effort for a better result.

## Design (chosen by the user)

- **Mechanism: sequential self-refine.** After generation, run N rounds; each round
  the model critiques its current best against the boardroom 10/10 rubric (restraint,
  hierarchy, fit, density, role-sizing) and returns an *improved* version PLUS an
  honest 1-10 self-rating. The caller keeps the **highest-rated** candidate. (Chosen
  over best-of-N-parallel and hybrid.)
- **Control: an EFFORT dial, not a cost toggle.** The user's framing — "the lever is
  effort, not spend." Four levels → round counts:

  | Effort | Design rounds | Notes |
  |---|---|---|
  | low | 0 | today's one-shot behavior |
  | medium | 1 | **DEFAULT** — one refine out of the box |
  | high | 2 | the "iterate 3 times" ask (gen + 2) |
  | maximum | 3 | |

  The user-facing default is **medium** (one refine on every generation) — set in
  `readComponentEffort`. `generateComponent`'s `?? 'low'` is only a programmatic
  fallback for a non-UI caller that passes no effort (keeps tests/API cheap).

- **"Best" needs a judge.** The gate is pass/fail — it can't rank two clean designs.
  So each refine returns a self-rating (folded into the same call — no separate judge
  call), and the caller keeps the max. `coerceRefinement` clamps it to 1-10 (default 5
  when missing/garbled, so a missing rating neither wins nor loses by accident).
- **Composes with gate-repair, doesn't replace it.** Each design candidate is run
  through #1113's `repairToClean` before it's scored, so we only ever compare —and
  return— COMPLIANT designs. Same model-proposes / gate-disposes contract: the rating
  steers *selection*, the gate still *disposes*.

## Shape of the change

- `lib/layout/ai.js` — `REFINE_DESIGN_SYSTEM` (the rubric + "keep the component's
  identity" + the non-negotiable gate rules), `askDesignRefineMessages(draft)`, and
  `coerceRefinement(reply)` (component + clamped rating). Re-exported via layout-core.
- `architect.ts` — the repair loop factored into `repairToClean` (reused per
  candidate); `improveDesign` (the N-round loop: refine → gate-repair → keep
  highest-rated, budget-guarded, `onStatus: 'improving'`); `EFFORT_ROUNDS` map;
  `generateComponent` gains `opts.effort` and an `improved` count on the outcome.
- `drawing-board-settings.js` — `readComponentEffort`/`writeComponentEffort`
  (`lattice-db-component-effort`, default `medium`).
- `Fabricate.tsx` — the effort segmented control (persisted), the "Improving the
  design — round X/N…" cue, and a toast that leads with what the pass did.

## Selection contract (locked by tests)

- `bestRating` seeds at -1 (the initial gen is ungraded), so a clean, rated round-1
  candidate is adopted; subsequent rounds must **beat** the current best rating to be
  accepted — a regression (lower-rated round) is rejected and the better earlier
  design is kept. The original is the fallback if no round yields a clean candidate.
- low effort → 0 rounds, exactly one model call (no design pass). `refined` (gate) and
  `improved` (design) are independent counts.

## Verification

Real built Studio (Chromium, seeded OpenRouter, a stateful mock: gen → a rating-8
refinement → a rating-6 refinement): with effort **High**, the tab issued 3
completions, showed **"Improving the design — round 1/2…"**, adopted the rating-8
design (`var(--accent)`), and **rejected** the rating-6 regression (`var(--warn)`),
with 0 page errors. Unit: `component-ai.test.js` (49 — the refine prompt + rating
clamp) + `architect.test.ts` (34 — low=0-rounds/1-call, high keeps-best/rejects-
regression/emits 'improving', medium refined-vs-improved independence). Full suite +
biome + build:check + docs typecheck green.

UNVERIFIED: whether the self-rating correlates with *actual* human-judged quality on
real model traffic — self-assessment is imperfect; this is a best-effort steer, and
the "return unchanged if you can't improve" instruction + keep-best guard bound the
downside. A future upgrade could swap the self-rating for a separate judge pass, or
best-of-N parallel, behind the same effort dial without changing the UI.

## Not here (follow-ups)

- The manual Motion-style **refine** affordance (nudge the current draft with free
  text) — still open.
- Extending the effort dial to the theme / finish / motion faculties (the setting +
  loop are written to generalize, but this PR scopes to components).
