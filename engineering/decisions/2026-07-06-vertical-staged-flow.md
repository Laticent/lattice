---
status: shipped
summary: Add three list-steps variants for a vertical staged-argument flow (chevron cascade, converge funnel, ghost editorial) chosen from a 5-track design bake-off; converge is renamed from "funnel" to avoid colliding with the chart-funnel component, and all three are wired into the shared slot-label-lift so nested authoring lifts the stage label to <strong>
---

# Vertical staged-flow variants for `list-steps` (chevron / converge / ghost)

**Date:** 2026-07-06
**Status:** shipped
**Area:** `lib/components/progression/list-steps`

## Context

A user shared a slide they admired: a vertical cascade of labelled chevrons
(Problem → Vision → Policy → Plan), each flowing into a one-line description —
the classic "build the argument one stage at a time" persuasion frame. They
liked the *concept*, not that particular execution, and asked for several
polished takes to choose from.

The concept is a **labelled sequence cascading down the frame**. In Lattice's
grammar that is not a new component — it is `list-steps` (already the ordered
step-cards progression, already with a `vertical` stacking variant). Authoring
stays `## title` + a numbered list; a variant only restyles the badge/row. So
this shipped as **new variants**, not a new component (the user's stated
preference).

## Process — a 5-track design bake-off

Five directions were seeded, then each refined through ~5 render→critique→improve
passes by an independent agent (palette-blind, `cqi` sizing, no margins, must fit
four rows with zero overflow):

1. **chevron cascade** — accent down-chevron tab + keyed description card.
2. **funnel** — one continuous tapering silhouette converging on the last stage.
3. **spine & arrowheads** — thin accent spine with downward arrowhead nodes.
4. **interlocking ribbons** — a stack of down-arrows nesting point-into-notch.
5. **ghost chevron** — faint chevron watermark, eyebrow label, hero description.

All five reached 8.5–9/10. The user picked **1, 2, and 5** to ship.

## Decision

Ship three `list-steps` variants:

- **`chevron`** — the reference, elevated. `li > strong` → an accent chevron tab
  via `clip-path`; `li > ul` → a `--surface` card with a solid accent left key.
- **`converge`** — the funnel look. Renamed from "funnel" because
  **`section.funnel` is already the chart-funnel component** — `list-steps funnel`
  would collide on both the CSS class and the slot-label-lift trigger. `converge`
  is the qualitative sibling; the docs cross-reference the value-driven chart
  `funnel`. Geometry is authored for 4 bands (3–4 ideal); a 5th degrades to the
  narrowest band rather than breaking.
- **`ghost`** — editorial restraint: a faint (`--accent` @ 0.12 opacity) chevron
  watermark, an `--fs-meta` eyebrow label, and an `--fs-h4` hero description.

### Wiring notes

- **Slot-label lift.** Nested authoring (`- Problem` / `  - body`) leaves the
  label a bare text node; the variants need it as `<strong>`. Wired
  `chevron|converge|ghost` into the two shared lift implementations (HARD RULE #1):
  the markdown-it `slotLabelLift` (`lib/integrations/markdown-it/plugins.js`, used
  by the build + emulator) and the runtime `transformSlotLabels` SELECTOR
  (`lib/runtime/index.js`, used by the docs-site Playground). **Scoped to a
  `list-steps` host** (`section.list-steps.chevron` …, and `list-steps` +
  variant in the regex) rather than registered as bare global tokens: unlike the
  other distinctive layout names in the lift set, these three are generic English
  words, so scoping keeps a future unrelated `.ghost`/`.chevron`/`.converge`
  component from silently having its `<li>` leads lifted (maker-checker Risk 1).
- **Self-contained.** Each variant establishes its own vertical column, so
  `<!-- _class: list-steps chevron -->` needs no companion `vertical`.
- **Reflow exclusion.** The box-local `@container` reflow that auto-stacks the
  default horizontal strip is now `:not(.chevron):not(.converge):not(.ghost)` —
  same reason `timeline` is excluded: these own their layout.
- **Palette-blind.** Colour only through tokens (`--accent`, `--accent-soft`,
  `color-mix` of the two, `--on-accent`, `--accent-soft-body`, `--surface`,
  `--border`, text tokens); verified in both light and dark galleries.

## Alternatives not shipped

Spine-&-arrowheads (3) and interlocking-ribbons (4) were strong but not chosen.
Both remain viable as future variants if a need arises; the ribbon's soft-wave
seams were its main weakness at 10/10 scrutiny.
