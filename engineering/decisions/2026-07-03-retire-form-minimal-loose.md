---
status: shipped
summary: Retire two dead dials scheduled by the `claim` decision (§11) — the deck-wide `form: minimal` toggle and the `loose` density modifier. Both have 0 real authored uses. `form: minimal` only ever added `no-progress`, which is now the explicit `no-progress` chrome control (deck-wide `class: no-progress`) — an EXACT behavior-preserving equivalent, so it migrates there rather than to `claim: quiet` (which also drops the meta bay + tightens the inset — a behavior change). `loose` (grow the spacing scale) is superseded by `claim` owning "give the content the stage." Keeps `form: off`/`form: standard`/`no-form`/`compact`/all chrome tokens. The `density` EXCLUSIVE_AXIS is removed (compact is now a lone standalone toggle); the Studio density Seg becomes a compact-only Switch. A `retired-form-minimal` lint tripwire flags a lingering key. The `minimal` frame manifest is kept, re-described to reference the rail control.
---

# Retire `form: minimal` and `loose`

**Date:** 2026-07-03
**Status:** shipped
**Branch:** `claude/frame-spacing-concept-lh41kw`
**Follows:** `2026-07-03-claim-content-claims-the-stage.md` §11 (scheduled these
retirements as a separate follow-up PR, not smuggled into the claim change —
HARD RULE #17/#8), and the chrome-control matrix PR (#735), which shipped the
`no-progress` deck-wide chrome control this retirement leans on.

## What is retired

- **`form: minimal`** — the deck-wide Form toggle's quiet variant.
- **`loose`** — the semi-universal density modifier (the inverse of `compact`;
  grew the `--sp-*` spacing scale ~25%).

## What is KEPT (explicitly)

`form: off`, `form: standard`, per-slide `no-form`, `compact`, and every chrome
token (`silent`, `no-header`, `no-footer`, `no-paginate`, `no-progress`). These
are load-bearing — `form: off` in particular is a component-isolation contract
used by the test harness (`test/helpers/semantic-render.js`, `check-svg-scaling`).

## Why

Both have **0 real authored uses** (census across `examples/` + `exemplars/`;
the only references were galleries/tests/docs). Beyond disuse:

- **`form: minimal` was never its own behavior — it just added `no-progress`**
  (`plugins.js` `formToggleClass`). Since the chrome-control matrix (#735) shipped
  the `no-progress` control at deck scope (`class: no-progress`), `form: minimal`
  is now an exact synonym for "Form on (the default) + drop the rail." A dedicated
  toggle for a one-token stamp is dead weight.
- **`loose` (more spacing) is what `claim` now expresses better.** The `claim`
  concept ("give the content the stage") owns roominess deliberately, per-slide or
  deck-wide, with chrome awareness — a spacing-scale bump can't.

## The key decision: `form: minimal` → `class: no-progress`, NOT `claim: quiet`

The claim design doc (§11, §309) originally sketched folding `form: minimal` into
`claim: quiet`. Adversarial review flagged that as a **behavior change**: `claim:
quiet` drops the section rail **and** the meta bay **and** tightens the inset,
whereas `form: minimal` dropped **only** the rail. Now that the rail has its own
control, the honest, behavior-preserving migration is `class: no-progress` — it
reproduces `form: minimal` exactly. `claim: quiet` remains available for authors
who want the *quieter* look, but it is not the mechanical equivalent.

## Migration

| Old | New | Note |
|---|---|---|
| `form: minimal` | drop the key; add `class: no-progress` if you want the rail gone | Form is on by default; `class: no-progress` is the exact old look |
| `_class: … loose` | drop `loose` (default spacing); or `claim: hero`/`claim: quiet` to hand over the stage | no exact spacing equivalent — `loose` had 0 uses |

A lingering `form: minimal` resolves to `standard` (the rail returns) and earns a
`retired-form-minimal` lint warning (mirrors `retired-backdrop-key`). A lingering
`loose` becomes an `unknown-class` lint warning.

## Mechanical notes

- **`density` EXCLUSIVE_AXIS removed.** With `loose` gone, `density` would have one
  member (`compact`) — an exclusive axis needs ≥2. `compact` stays a standalone
  SEMI_UNIVERSAL_VARIANT; the Studio's density Seg (Compact/Default/Loose) becomes a
  compact-only Switch.
- **The `minimal` frame manifest is kept, re-described.** It is inert taxonomy (no
  CSS, no runtime resolver), and it documents a *still-reachable* composition (form +
  no rail). Its description now points to the `no-progress` control instead of the
  retired toggle.
- **`section.loose` CSS removed** from `lib/shared/shared.styles.css`; `FORM_MODES`
  drops `minimal`; the playground vocab (`grammar-vocab.js` `FORM_VALUES`,
  `deck-config.js`) drops the `minimal` option.

## Blast radius / verification

Breaking (removed vocabulary → major). Render-path parity (#1): `readFormMode` /
`formToggleClass` / `applyFormToggleToHtml` updated in the shared kernel, mirrored
in the playground `deck-config.js`. Full unit suite + the committed-decks lint gate
pass; the gallery + shared docs demos of `loose` were migrated off it.
