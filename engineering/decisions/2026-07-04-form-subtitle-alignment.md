---
status: shipped
summary: Under the Form, chart-family and diagram slides lift eyebrow + title into the left-aligned masthead band, but the in-flow subtitle (dek) was left behind — it rendered CENTERED and inset (charts kept the full centered `.chart-header`; the diagram `<p>` was shrink-centered by `align-items: center`) and floated a full title-band clearance below the masthead rule. Fix, family-wide: pin the subtitle to the title's exact left edge (`text-align: left` + zeroed `--sp-2xl` inset for charts; `align-self: stretch` for the diagram `<p>`, the same cure the title and Key Insight blockquote already use), and TIGHTEN the title→subtitle gap ONLY when a subtitle leads (`:has(.chart-subtitle)` / `:has(> p)`) so a title-only slide keeps its full clearance. Retire the chart family's decorative `.chart-header::after` accent hairline under the Form — the masthead's own border-bottom is already the header↔body divider, so it was a redundant second rule (and a stray rule on a subtitle-less header). CSS-only, two files, no transform changes.
---

# Form subtitle: align to the title, hug the band

**Date:** 2026-07-04
**Status:** shipped
**Branch:** `claude/frame-spacing-concept-lh41kw`
**Follows:** `2026-07-03-claim-content-claims-the-stage.md` (the `claim` preset
work that unified the header story) and `#738` (which left-aligned the diagram
*title* via `align-self: stretch`; this finishes the job for the *subtitle*).

## Symptom

On a chart or diagram slide authored under the Form (the default composition
model), the eyebrow + `<h2>` lift into the `.cell-masthead` band, which is
left-aligned to the slide margin. The subtitle (the dek — the italic sentence
under the title) did **not** follow:

- **Charts** — the subtitle lives in the in-flow `.chart-header`, which kept its
  standalone styling: `align-items: center; text-align: center` and a
  `--sp-2xl` horizontal inset (sized for the full centered eyebrow+title+subtitle
  header it used to hold). With the eyebrow+title lifted out, the lone subtitle
  stayed centered and pushed ~`--sp-2xl` in from the left. A left-aligned title
  with a centered, inset dek reads as a mistake.
- **Diagrams** — the subtitle is a bare `section.diagram > p`. Because
  `section.diagram` uses `align-items: center` (to center the Mermaid SVG), the
  `<p>` was shrink-wrapped and centered — the identical trap the masthead band
  and the Key Insight blockquote already needed `align-self: stretch` to escape.

On top of the horizontal miss, the subtitle floated a full **title-band
clearance** below the masthead rule (padding-bottom `--sp-md` → the hairline,
then the section `gap` `--sp-sm` → the body ≈ 33.5px measured). That clearance is
the deliberate *title-band ↔ content* separation and is right when the body
leads with chart content — but a subtitle belongs to the **headline unit** and
should hug the title, not sit a content-gap away.

## Decision

Option **A** (chosen after prototyping A vs. a "restore fully-centered chart
header" B, and red-teaming both): **unify on the left.** The masthead band is
the single title surface; the subtitle aligns to it and hugs it.

1. **Left-align the subtitle to the title edge.**
   - Charts: `section.form.chart-frame .chart-header` gains
     `padding-inline: 0; align-items: flex-start; text-align: left`.
   - Diagrams: `section.diagram > p` gains `align-self: stretch`.
2. **Hug the band — conditionally.** Only when a subtitle actually leads do we
   pull the hairline up under the title (`> .cell-masthead { padding-bottom:
   var(--sp-xs) }`) and the subtitle up under the hairline (section
   `gap: var(--sp-xs)`). Keyed on `:has(.chart-subtitle)` (charts) and
   `:has(> p)` (diagrams). **A title-only slide keeps its full clearance** —
   this was the explicit constraint: the clearance is *needed* when there is no
   subtitle.
3. **Retire the redundant hairline.** `section.form.chart-frame .chart-header::after
   { content: none }`. Under the Form the masthead's own `border-bottom` is the
   header↔body divider; the decorative accent was a second, redundant rule — and
   a *stray* rule on a subtitle-less header (the header box is then empty).

## Why conditional, not a flat tighten

The masthead clearance is load-bearing for title-only slides (most chart/diagram
slides don't carry a dek): the body should not crowd the title rule. A flat
tighten would fix the dek case and regress every title-only case. `:has()`
scopes the tighten to exactly the slides that have a leading subtitle. Plain
`:has()` in engine component CSS is allowed — HARD RULE #12 bans only the
`:not(:has())` / `:is(:has())` compound forms, and only in `themes/`.

## Blast radius

CSS-only; two files (`lib/components/chart/_chart-family/chart-family.css`,
`lib/components/diagram/diagram/diagram.styles.css`). No transform, no manifest,
no token changes. All rules are scoped to `section.form…`, so a non-form render
is byte-identical (keeps the centered header + hairline + full clearance). No
`margin`, hex literal, or retired token introduced (HARD RULES #3/#11/#20 clean;
`build:check` green).

## Verified

Rendered the probe deck (piechart, quadrant, gantt, kanban, diagram — each with
eyebrow/title/subtitle) via `lattice-emulator.js` and inspected the PNGs: every
subtitle pins to the title's left edge and hugs the band; the diagram matches.
Rendered a **no-subtitle** control (pie + diagram): the full clearance is
preserved and no stray hairline appears. Independent checker pass on the diff.
