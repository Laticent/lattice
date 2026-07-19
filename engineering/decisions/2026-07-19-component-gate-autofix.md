---
date: 2026-07-19
status: shipped
area: studio / component generation
summary: A generated component that fails the gate no longer dead-ends on a wall of
  findings. Two layers: PREVENT (a terse HARD CONSTRAINTS restatement at the end of
  the prompt + a worked terminal/console example, killing the #00ff00-hex + stray-
  margin failure at the source) and REPAIR (a silent loop that feeds the draft + the
  exact findings back to the model to fix — up to 2 passes, stop when clean, accept
  only improvements — before the user ever sees it, with a live "Refining…" cue).
---

# Component generation: prevent + silently repair gate violations

## Problem

A real "sci-fi console" generation came back with **17 gate errors** — a wall of
`no-hex` (`#00ff00`, `#00ff99`, `#00ffff`, … reaching for "terminal green" with raw
hex) plus a `no-margin` (`margin: var(--sp-sm)`). The gate correctly *reported*
them, but that was the end of the road: no auto-fix, no loop-back, and the user was
left to hand-fix a component the model should never have shipped. The violations
were a **lack of understanding** of two load-bearing rules — every color is a
`var(--…)` token, and `margin` is banned — that the canon teaches but the model,
buried in a long prompt, ignored.

## Design (chosen: Prevent + Repair; manual Refine is a separate follow-up)

Three candidate layers, cheapest-first; the user chose the first two for this PR.

1. **Prevent** — make the model violate less. The canon already carries the fixes
   (a terminal panel INVERTS tokens: `background:var(--text-heading); color:var(--bg)`;
   status = `--pass`/`--warn`/`--fail`; margin → `gap`/`padding`), but it's diffuse.
   Added (a) a **worked terminal/console example** (the exact failure mode, gate-clean)
   and (b) a terse **"HARD CONSTRAINTS — the gate REJECTS these"** block at the VERY
   END of the prompt (recency) restating the five rules models miss most, with the
   named-color→token map inline. No extra model calls; the system prefix is prompt-
   cached, so the added tokens are paid once per burst.

2. **Repair** — a silent self-fix loop. After generation, gate the draft; if it has
   ERRORS, feed the draft + the **exact findings** (with per-rule remediation:
   `askRepairMessages`) back to the model, re-gate, and repeat — **up to 2 passes,
   stopping the instant it's clean, accepting a pass ONLY if it reduces the error
   count** (never a regression). Warnings are advisory and never trigger a pass. The
   UI shows a live **"Refining — fixing N issues…"** cue via an `onStatus` callback,
   so the extra latency is legible, not mysterious. Deterministic auto-fix was
   rejected for hex/margin: hex→token is a *semantic* choice (is `#00ff00` `--pass`
   or a `--cat-*`?) and margin→padding is a *spatial* change `coerceComponent`
   already refuses to auto-apply (it shifts the render). The model fixes those
   meaningfully; code can't safely. The repair is re-gated, never trusted blind —
   same model-proposes / gate-disposes contract as generation.

3. **Refine** (manual, Motion-style nudge) — a *separate* follow-up PR, not here.

## Shape of the change

- `lib/layout/ai.js` — `EXAMPLE_TERMINAL` (added to `ASK_SYSTEM`), the trailing
  `HARD CONSTRAINTS` block, and `REPAIR_SYSTEM` + `askRepairMessages(draft, findings)`
  (pure; the repair prompt with the token/margin remediation). Re-exported through
  the layout-core bundle.
- `architect.ts` — `gateDraft(coerced)` (the shared "is this clean" judge, used by
  the first pass AND each repair pass) and the repair loop in `generateComponent`
  (`MAX_REPAIR_PASSES = 2`, budget-guarded per pass, `onStatus` progress, a `refined`
  count on the outcome).
- `Fabricate.tsx` — a `compStatus` line ("Refining — fixing N issues…") during the
  passes, and the success toast leads with "auto-fixed N passes" when repair ran.

## Behavior contract (locked by tests)

- Prevent: the terminal example is **gate-clean** (make-or-break test), and
  `ASK_SYSTEM` provably carries the example + the HARD CONSTRAINTS block at the end.
- Repair: dirty→clean drafts refine to zero errors in one pass (`refined:1`); an
  unfixable draft keeps the best version and **SHOWS** the surviving findings
  (`refined:0`, errors present — never papered over); an already-clean first draft
  triggers **no** repair call. `askRepairMessages` carries the remediation + exact
  findings + the round-tripped draft.
- Save is unchanged — still gated on zero errors, so repair *reduces* what the user
  must fix but never fakes a pass.

## Verification

Real built Studio (Chromium, seeded OpenRouter, a stateful mock returning a dirty
draft then a clean one): the component tab issued **2 completions** (generate →
one repair), the **"Refining — fixing 2 issues…"** cue was visible during the pass,
and the final draft was **gate-clean** (`var(--pass)`, hex gone) with 0 page errors.
Unit: `component-ai.test.js` (43) + `architect.test.ts` (31, incl. 3 repair-loop
cases) green; biome + build:check clean.

UNVERIFIED: whether prevention alone (layer 1) measurably lowers the violation rate
on real model traffic — that needs live generations to measure; the repair loop is
the backstop regardless. Cost: repair adds up to 2 extra LLM calls only when the
first draft fails the gate (0 when it's clean); the user picked the 2-pass budget.
