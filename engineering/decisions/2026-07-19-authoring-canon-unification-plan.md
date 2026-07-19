---
status: in-progress
summary: >
  The plan to make the product AI (Fabricate) generate top-tier theme / component / finish /
  deck on the first try, by feeding each generator ONE generated, always-current authoring
  canon built from the skills + the engine — cached in the system prefix, and gated so it
  can never drift. Supersedes the "keep skills separate" recommendation in
  2026-07-19-skills-fabricate-authoring-truth.md: the owner has decided to UNIFY via
  generation (skills drive creation; the assets are generated and combined so the LLM gets
  one truth per artifact, not several overlapping ones). Records what is already done and
  sequences the remaining work as stacked, independently-verified wins.
companion:
  - ./2026-07-19-skills-fabricate-authoring-truth.md
  - ./2026-07-19-skill-recertification.md
---

# Authoring-canon unification — the plan to the promised land

**Date:** 2026-07-19 · **Status:** in-progress · **Owner:** Sharmarke

## The goal (owner's words, distilled)

Make the product AI generate top-tier **theme / component / finish** (and deck) on the first
try, with minimal churn — by having the **skills drive creation** alongside the other assets
we already send the model, with everything **up to date**, **generated and combined** so the
LLM gets **one truth per artifact** (not several overlapping instruction sources), and
**drift-proof** going forward.

## The target architecture

For each artifact, **one source → two generated outputs**:

- The **skill** (`design/skills/X.md`) is the human/agent-facing teaching *source*.
- The **LLM canon** (what enters the generator's system turn) is **generated** from that
  skill's teaching **+ the engine's own facts** (enums, token contracts, budgets, the review
  traps, the finish vocabulary) — distilled to what the model needs, nothing it doesn't.
- A **freshness gate** fails the build if a generated canon drifts from the skill or the engine.

**What the LLM receives:** exactly **one canon per artifact**, always current. The genuinely
per-request inputs stay separate *because they make sense* — the user's prompt, the current
palette/deck, near-neighbor components, the user's reference doc. Nothing redundant.

**Prompt caching (hard constraint):** the canon lives in the **stable system prefix** the
setup already caches; only the small per-request turns vary. Consolidating truth into a
bigger-but-stable canon is therefore cache-friendly — paid once, not per call. Every win keeps
the system prefix stable (no per-request interpolation into it).

## What drove this (why generation, not hand-sync)

`2026-07-19-skills-fabricate-authoring-truth.md` found the product's canons are independently
hand-maintained and had drifted worse than the skills: `deriveTheme`/`THEME_CANON` shipped a
retired dark-mode categorical model, and `FINISH_SYSTEM` couldn't propose the premium finish
layers. Hand-sync + a freshness gate was the cheap fix; the owner chose the stronger option —
**generate the canons from source and combine the assets** — so drift is structurally
impossible and the skills become the single teaching source that also drives the model.

## Already done — banked wins

1. **Skills true to the engine + strengthened freshness gate** (#1084).
2. **Theme generator correctness fixed** — dark-mode categoricals hold the WCAG contract, gated,
   verified by contrast math + a clean dark render (#1089).
3. **The lever is proven.** `DECK_CANON` grounded the *deck* generator (prose + engine-derived
   facts: the review traps from `review-core.RUBRIC`, budgets from `prose-budgets`), bundled +
   drift-gated; a live A/B on the real model showed a clear quality jump (label→claim headings,
   deleted a wall-of-text, added a referent, closed on one ask). **This is the prototype of the
   pattern rolled out to the other artifacts.** (deck-canon branch.)

## The stack (each ships value, compounds, and is proven with a live before/after)

- **Win 1 — Finish: fix + derive-from-source.** `FINISH_SYSTEM`'s closed vocabularies are now
  interpolated from `finish-generate.ts`'s `as const` arrays, so the model is offered every
  shippable layer type — including the premium `mesh`/`pinstripe`/`lattice`/`frame` it silently
  couldn't propose — and the prompt can't fall behind the engine again. Gated by a vocab-parity
  test; live A/B confirms the model now returns `pinstripe`/`frame` instead of substituting.
  **(This win.)**
- **Win 2 — Make "generated canon" a reusable pattern.** Generalize `DECK_CANON`'s shape (prose
  + engine-derived facts + freshness `--check`) into one convention every artifact uses.
- **Win 3 — Theme: single-source it.** Generate the theme LLM-canon from the engine + `theme.md`;
  the skill and the canon share one truth; gated. Replaces hand-written `THEME_CANON`.
- **Win 4 — Component: single-source it.** Same, replacing hand-written `COMPONENT_CANON`
  (already half-derived from `gate.js`).
- **Win 5 — Finish: single-source it.** Fold Win 1 into the generated pattern, reconciled with
  `finish.md`.
- **Win 6 — Close the loop.** One drift gate over all canons; confirm each generator gets exactly
  one canon; verify the system prefix stayed cache-stable.

Each win is its own small PR, verified with a live A/B shown to the owner — the lift accumulates
visibly rather than on trust.

## Verification discipline

Every win: machine gates (build:check, unit + docs tests, typecheck, lint) AND a live A/B on the
real model via the owner's key (a tiny, `.scratch/`, on-demand eval — never committed, never in
CI, per HARD RULE #24). No claim of "better output" without the before/after to back it.
