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

> **Revised 2026-07-19 (post-trio).** An adversarial trio on the shipped changes found the
> original "generate a distillation KERNEL per artifact" framing was over-engineered: the two
> drifts that actually caused bugs (the retired `THEME_CANON` dark model, the missing
> `FINISH_SYSTEM` vocab) were both **enum/contract freshness**, which Win 1 already fixes the
> cheap way — **interpolate the facts from source + a parity gate** (~5 lines, no kernel). The
> skill-prose-vs-canon-prose duplication is a thin slice not worth a generator. So the plan is
> **leaned out** to that pattern; the goals are unchanged.

## The target architecture (lean)

For each artifact, **one canon per generator**, in its system turn, where:

- The **falsifiable facts** — enums (finish vocab, `function.form`), token contracts, word
  budgets, the review traps — are **interpolated from the engine's own source** (the `as const`
  arrays, `prose-budgets`, `RUBRIC`, …), so they cannot drift. A **parity/drift gate** fails the
  build if a canon stops offering what the engine accepts.
- The **teaching prose** stays hand-written (the persuasive voice), and the **skill**
  (`design/skills/X.md`) stays the human/agent teaching source. Where a skill and a canon teach
  the same falsifiable fact, that fact comes from the shared source; the prose is reviewed, not
  generated. (No distillation kernel; no "generate the skill.")

**What the LLM receives:** the canon **+** the genuinely per-request inputs that *make sense* —
the user's prompt, current palette/deck, near-neighbor components, the user's reference doc.

**Prompt caching (with the trio's corrections):** the canon lives in the system turn the setup
caches (`withCachedSystem`, one `cache_control` breakpoint). This is clean for theme / component /
finish (no per-request voice). **The deck path is the exception the trio caught:** `withStudioVoice`
appends volatile voice (deck language + standing instructions) *after* the breakpoint, so a
deck/settings change re-pays the whole canon — **fix: breakpoint after the stable canon, before
the voice.** Caveats to keep honest: the cache is a ~5-min ephemeral TTL, per-artifact (no
cross-artifact sharing), first call per window pays the ~1.25× write — "paid once" is really
"paid once per artifact per burst, then read cheaply."

**On-device tier (trio):** the small on-device models get the **same full canon** with **no
caching** — a 5–6K-token system prompt degrades a tiny model. The canon must be **segmented**: a
short canon (or none) for on-device, the full one for the cloud tier.

## What drove this (freshness, cheaply)

`2026-07-19-skills-fabricate-authoring-truth.md` found the product's canons had drifted from the
engine: `deriveTheme`/`THEME_CANON` shipped a retired dark-mode categorical model, and
`FINISH_SYSTEM` couldn't propose the premium finish layers — both **enum/contract freshness**.
The fix that both the ADR recommended and Win 1 shipped is **interpolate the facts from source +
a parity gate**: drift becomes structurally impossible for the facts that matter, at ~5 lines per
artifact and no build-time generator.

## Already done — banked wins

1. **Skills true to the engine + strengthened freshness gate** (#1084).
2. **Theme generator correctness fixed** — dark-mode categoricals hold the WCAG contract, gated,
   verified by contrast math + a clean dark render (#1089).
3. **The lever is proven.** `DECK_CANON` grounded the *deck* generator (prose + engine-derived
   facts: the review traps from `review-core.RUBRIC`, budgets from `prose-budgets`), bundled +
   drift-gated; a live A/B on the real model showed a clear quality jump (label→claim headings,
   deleted a wall-of-text, added a referent, closed on one ask). **This is the prototype of the
   pattern rolled out to the other artifacts.** (deck-canon branch.)

## The stack (leaned out; re-sequenced by impact: theme → component → finish)

- **Win 1 — Finish vocab: derive-from-source.** `FINISH_SYSTEM` interpolates its closed
  vocabularies from `finish-generate.ts`'s `as const` arrays, so the model is offered every
  shippable layer (incl. `mesh`/`pinstripe`/`lattice`/`frame`) and can't fall behind. Vocab-parity
  gate; live A/B confirms it returns `pinstripe`/`frame` instead of substituting. **(Done, #1095.)**
- **Fix pass (from the trio, folded into the open PRs):**
  - Deck-path **cache breakpoint** after the stable canon, before the volatile voice.
  - **On-device short canon** — segment the canon so the tiny tier isn't degraded.
  - **Gate hardening** — DECK_CANON drift check catches double-quoted/variable-emitted rule ids;
    finish parity uses an exact-token (not substring) match.
  - **Multi-prompt eval** — replace the n=1 A/B with a small multi-prompt before/after to catch
    formulaic/cookie-cutter output.
- **Win 2 — Theme canon: facts-from-source + parity gate.** Interpolate the theme canon's
  falsifiable bits (required tokens, the three-layer contract params) from the engine; gate that
  `THEME_CANON` stays true to source and agrees with `theme.md`. No kernel — hand prose + sourced
  facts. (Highest traffic after component; the correctness bug already fixed in #1089.)
- **Win 3 — Component canon: facts-from-source + parity gate.** `COMPONENT_CANON` already pulls
  enums from `gate.js`; extend the same interpolate-and-gate to its other falsifiable facts and
  reconcile with `component.md`.
- **Win 4 — Finish canon: prose grounding.** With the vocab already sourced (Win 1), add the
  finish teaching (which layer combos read well) and reconcile with `finish.md`.
- **Win 5 — Close the loop.** One drift gate that asserts every product canon stays true to its
  source; confirm each generator gets exactly one canon; verify the cache breakpoint + on-device
  segmentation hold.

Each win is its own small PR, verified with a **multi-prompt** before/after shown to the owner.

## Verification discipline

Every win: machine gates (build:check, unit + docs tests, typecheck, lint) AND a **multi-prompt**
live eval on the real model via the owner's key (a tiny, `.scratch/`, on-demand harness — never
committed, never in CI, per HARD RULE #24). n=1 is an anecdote; a handful of prompts catches the
formulaic-output failure mode a single A/B can't. No claim of "better output" without it.
