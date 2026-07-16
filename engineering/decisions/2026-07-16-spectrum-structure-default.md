---
status: in-progress
summary: >
  Pull the spectrum back to the brand BAR by default. The in-content structural
  accents (table-header rails, the list-steps timeline spine, code-panel strips,
  the hr rule, split-card underlines) now read a new --spectrum-structure token
  that defaults to a quiet accent-tinted hairline, so a no-config deck stays
  elegant and low-noise instead of repeating the rainbow on every rule. A new
  opt-in register `spectrum-trim:` (off default / on) points that token at
  --spectrum to flow the deck's STYLE back onto the structure. Breaking vs main
  (default appearance of tables/code/timeline/hr changes); the opt-in restores
  the prior look. Fifth spectrum axis, beside spectrum/-edge/-card/-card-edge.
---

# Spectrum on the brand bar only by default — `spectrum-trim:` opt-in

**Date:** 2026-07-16
**Status:** in-progress (folded into the accent-finish work)
**Branch / PR:** `claude/spectrum-finish-consolidation-ear59p` / #1021 (folded into the accent-finish work)

## The ask

> "i think it would be wise to have spectrum off of except for brand bar. these are
> finishes people can add but we stay elegant and less noise by default."

The spectrum consolidation (2026-07-15) made the `spectrum:` STYLE flow to **every** accent
that reads `--spectrum` — the brand bar AND the in-content structural accents (table-header
rails, the `list-steps` timeline spine, code-panel strips, the `hr` rule, split-card
underlines). On a default (rainbow) deck that means the rainbow is repeated on every table
header and rule, competing with the brand bar — two rainbows, visual noise.

## The decision

**Default: the spectrum lives on the brand BAR alone.** The structural accents drop to a quiet
neutral hairline, so a no-config deck reads elegant and low-noise. Turning the spectrum back
onto the structure is an **opt-in finish**, `spectrum-trim:`.

- **Brand bar family** (keeps `--spectrum` directly): the section-edge bar (`base.elements.css`),
  the `section.dark` top line (`base.modifiers.css`), the divider left rail
  (`divider.styles.css`).
- **Structure family** (now reads `--spectrum-structure`, a NEW token that defaults to a quiet
  accent-tint hairline — see "Design-trio treatment refinement" below): table-header rails
  (compare-table, glossary, obligation-matrix, statute-stack, roadmap), the `list-steps` timeline
  spine, code strips (code, compare-code, hljs), the `hr` rule, the split-cover-compare underline.
- **`spectrum-trim:` register** (`off` default / `on`) → `section.spectrum-trim { --spectrum-structure: var(--spectrum); }`, so the opt-in flows whatever the `spectrum:` STYLE resolved to
  (rainbow / solid / duo / mono) onto the structure. Per-slide `_class: spectrum-trim` opts one
  slide in, `spectrum-trim-off` out of a deck-wide `on`. Mirrors the `lift:` shape.

## Why a token indirection (not per-component classes)

The structural sites are spread across ~13 component CSS files, each hard-coding
`var(--spectrum)`. Redirecting them all to a single `--spectrum-structure` token means the
default (neutral) and the opt-in (`section.spectrum-trim` flips the token to `--spectrum`) are
each a **one-line** change, and a component added later opts in for free by reading the token.
The brand-bar sites are left reading `--spectrum` directly, so they are unaffected.

## Breaking change

Relative to `main`, this changes the DEFAULT rendered appearance of every deck that uses a
table, code block, timeline, or `hr`: those accents go from the rainbow to a neutral hairline.
Existing decks that want the old look add `spectrum-trim: on`. Recorded in `CHANGELOG.md` as
**Breaking**. Committed example PDFs re-rendered; the golden-image baseline re-blessed in the
same change.

## Naming

`spectrum-trim` (human pick over `spectrum-structure` / `spectrum-rules`) — "trim" = the accent
detailing on the content, distinct from the brand bar. It joins `spectrum:` / `spectrum-edge:` /
`spectrum-card:` / `spectrum-card-edge:` as the fifth spectrum axis.

## Design-trio treatment refinement (2026-07-16)

Human asked: *"i assume we will still be able to tune each type of spectrum right"* — then requested
a **red team + Munger inversion + independent checker, from a UI/UX + visual-artist lens**, on the
granularity question (should `spectrum-trim` be one toggle, per-element, structure-own-style, or all
of it?). All three reviewed real rendered specimens (quiet default / trim-on / a two-tier mock).

**Verdict — keep the single `spectrum-trim` toggle. Reject per-element and per-structure-style
control.** Convergent reasoning: more granularity multiplies the ways to build an incoherent,
theme-fragile, patchwork deck (the exact "ransom-note" the whole change fought); a two-tier
independent-style axis tends to *clash* (a mono structure rail under a rainbow bar reads "these
don't match," not "primary vs quiet tier"), costs a second resolver + a per-theme audit, and the
trim effect is nearly invisible on the most common components (code panels, cards) — so sub-toggles
would ship controls a viewer can't see. One toggle stays coherent by construction with the lowest
author burden.

**But the trio's more valuable finding — the lever is the COLOR TREATMENT, not the knob count.**
Two reviewers independently flagged that the first-cut quiet default (a flat *neutral* `--border`
hairline) reads slightly "half-applied" on light (accent-toned labels over a de-branded gray rule)
and thins out on dark. Refinement adopted: the quiet default is now a **low-intensity tint of the
brand accent** — `--spectrum-quiet: color-mix(in oklab, var(--accent) 60%, var(--border))`, and
`--spectrum-structure` defaults to `linear-gradient(var(--spectrum-quiet), var(--spectrum-quiet))`.
The hairline now echoes the accent-toned labels above it (reads intentional + on-brand), survives
dark canvases, and stays clearly secondary to the full-spectrum bar. Palette-blind, one dial,
theme-overridable via `--spectrum-quiet`. Verified light + dark (indaco, indaco-dark, ardesia-dark).

**The one value added — `restrained`, a fixed middle tier (NOT the rejected style axis).** The
human then asked to *"add restrained itself as an option that holds the restrained line."* This is
precisely what the Munger inversion had endorsed: the value authors want from a two-tier look is
real, but it should be a **de-saturated derivation computed once**, not a per-structure STYLE axis
the author composes (the C/B/D the trio rejected). So `spectrum-trim:` grows from `off/on` to
**three tiers of increasing presence**: `off` (the quiet accent-tint hairline) / `restrained` (a
single-hue accent ramp, `--sp-fill-mono-h`, held constant regardless of the bar's STYLE so it never
clashes — the two-tier look as ONE curated value) / `on` (the full spectrum follows the bar). A
single value on the existing register — no new token (reuses `--sp-fill-mono-h`), no new axis, no
per-element control. It threads the needle the trio drew: two-tier elegance without the clash risk
or knob sprawl. The granularity *axis* is still deliberately NOT added — one register, three tiers,
is the whole answer to "tune each type."
