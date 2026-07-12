---
status: proposed
summary: Promote the proven .chart-frame into one .viz-frame that both charts and diagrams live inside, so the palette compiler targets a single selector, Mermaid stops borrowing raw core engine tokens (complete --diagram-* + remap its themeVariables bridge — the gated invariant), and hybrid HTML+SVG components stop being a colour special-case; charts keep their edge-to-edge gap model verbatim while section.diagram becomes a citizen that inherits the chart rhythm. Two designed palettes stay two (no 12→8 merge; parked). Design-stage, no code; 3-step shippable sequence with the visual hoist gated behind the gallery sweep + export sign-off.
---

# Unified visualization frame — one `.viz-frame`, charts and diagrams as citizens

**Date** 2026-07-12 · **Status** PROPOSED (design; no code yet) · **Supersedes nothing; extends** `2026-07-12-chart-color-static-palette.md`

> One-line: promote the proven `.chart-frame` into a single `.viz-frame` that every
> visualization — chart *and* diagram — lives inside, so the palette compiler targets one
> selector, Mermaid stops borrowing raw core tokens, and hybrid HTML+SVG components stop
> being a special case.

---

## Why now

The static-palette compiler (`build-chart-palette-css.js`) emits **two plane groups**:

- `chart` — paints the designed `--chart-*` spectrum on `.chart-frame`.
- `diagram` — paints the engine-wide `--cat-*` / `--diagram-*` palette on
  `.chart-frame, section.diagram, .lp-figure`.

The `diagram` group exists as a separate group for one reason only: **Mermaid slides are a
bare `section.diagram`, not a `.chart-frame`.** That single accident of selector spawns a
chain of problems:

1. **The danger (contained, not cured).** Mermaid's SVG reads *core engine* tokens
   (`--text-heading`, `--bg`, `--accent`) directly in paints, so the diagram plane must
   flatten core color to build-time literals. The prior fix scoped that emission to
   `.chart-frame, section.diagram, .lp-figure` so it can't seize the whole deck — but the
   plane still redeclares core color at all, which it should never need to.
2. **Two layout foundations.** `.chart-frame` and `section.diagram` are *independent*
   layout contracts that solve the same "one big visual on a slide" problem two different
   ways. They will keep diverging.
3. **Hybrids are ambiguous.** Components with both HTML chrome and an SVG plot (state-chart,
   journey, word-cloud, radar small-multiples, math canvas) have no single rule for how
   color reaches both halves.

From a **presentation** standpoint there is no difference between a framed chart and a
Mermaid diagram: both are one visualization occupying the content zone. The split is pure
plumbing. This doc unifies it.

## What is NOT in scope (deliberately)

- **No 12→8 palette merge.** `--chart-cat-*` (8-slot, Wong-2011-capped) and `--cat-*`
  (12-slot, per-theme brand) are **two designed systems by design**
  (`examples/universal-tokens-p6-chart-cat.md`; `--cat-*` is *canonical* under HARD RULE
  #11, not legacy). Each family keeps its own values. The frame anchors **both**; it does
  not fuse them. The palette-consistency cleanup (journey/roadmap/radar/state-chart that
  mix families) is a **separate, parked decision**.
- **No auto-`_class: diagram`.** Whether a Mermaid fence should imply the diagram layout
  (dropping the author directive) is an authoring-ergonomics change with its own edge cases
  — out of scope here.

---

## Decision

### 1. `.viz-frame` = the generalized `.chart-frame`

`.chart-frame` is already a carefully-designed layout reset + palette anchor: it zeros the
section's own padding, drops the native `border-top` spectrum, reserves a bottom band for
footer chrome, and sets `background: var(--bg)` (chart-family.css:61–70). Its **edge-to-edge,
no-inset** model is *intentional* — a chart is a multi-cell composition and the `gap`
between cells/tiles is the spacing rhythm; an outer inset would be redundant and fight the
gap.

We **promote that exact model** into `.viz-frame`. No new frame invented, no averaged
middle-ground. Charts keep their layout and fit math **verbatim** — their model simply
*becomes* the frame's model. The `.chart-frame` class remains as an alias/thin marker;
`.viz-frame` is the load-bearing name the compiler and future components target.

### 2. `section.diagram` becomes a citizen of the frame, and inherits the chart rhythm

`section.diagram` today carries a full parallel layout contract (diagram.styles.css):
`align-items: center` + four `align-self: stretch` overrides to *un-center* the masthead,
dek, header, and Key-Insight blockquote it just broke, plus an SVG sized to
`calc(100cqi − 2×--sp-2xl)` — hardcoding the section's own padding to dodge Mermaid's
0-width `getBoundingClientRect` trap.

Under unification:

- The shared container concern (background, masthead band, footer band, a **measurable
  content-zone**, palette anchor) lives in `.viz-frame`. The four un-centering overrides
  **delete** — the frame uses the standard left-aligned masthead, so nothing needs
  stretching back.
- A diagram is a *single object*, not a gap-spaced composition, so it has no cells to
  provide rhythm. It supplies its own breathing room **locally** — as a `.diagram`
  modifier, not a frame inset. **The whitespace is tuned to read like the chart cell `gap`,
  so a diagram slide and a chart slide feel spatially identical** (the "aligned" decision,
  2026-07-12). The Mermaid SVG becomes `width: 100%` of the frame's content-zone track
  (measurable, non-zero) instead of `100cqi − 2×--sp-2xl` — more robust *and* less code;
  Mermaid stops needing to know the frame's padding math.

### 3. One compiler plane group, one selector

With every visualization root carrying `.viz-frame`, the compiler collapses to a **single
plane group** painted on `.viz-frame` (+ the `.lp-figure` re-host anchor). The
`DIAGRAM_PLANE_SELECTOR` and the separate `diagram` group are deleted. Both token families
(`--chart-*` and `--cat-*`/`--diagram-*`) are emitted as flat literals on the one anchor;
unused vars on any given slide cost nothing.

### 4. Complete `--diagram-*` so SVG never reads raw core — the gated invariant

The diagram system is *incomplete*: it has no diagram-scoped text/background token, so
Mermaid borrows the engine's core `--text-heading` / `--bg` / `--accent`. **Add the missing
bounded tokens** (`--diagram-text`, `--diagram-bg`, `--diagram-node-*`, as the audit
requires) to the diagram palette, and remap Mermaid's `themeVariables` bridge
(`mermaid.css`) onto them. Then:

> **Invariant (to be gated): an SVG paint reads only from a bounded, designed viz palette
> (`--chart-*` for charts, `--cat-*`/`--diagram-*` for diagrams) — never a raw core engine
> token.**

Once this holds, the compiled frame flattens only small designed families and **never
touches engine core** — the deck-wide danger is eliminated at the root, not contained. This
is the correct reading of "migrate the diagram group onto the new tokens": complete the
diagram system so it is self-sufficient, *not* replace it with the chart spectrum.

### 5. Hybrids dissolve

Custom properties inherit into HTML and SVG children identically. With the viz palette
anchored on `.viz-frame`, an HTML legend chip and an SVG `<text>` resolve the same
`var(--…)`. So the rule for any hybrid author is just: **SVG paints from the viz palette;
HTML chrome may additionally use live core tokens for its own text/borders** (HTML isn't
old-WebKit-fragile the way SVG is). state-chart, journey, word-cloud, radar-multiples, math
canvas all follow one rule; "hybrid" stops being a color special-case.

---

## The concrete win — unification deletes code

| Surface | Today | After |
|---|---|---|
| Layout foundations | 2 (`.chart-frame` + `section.diagram`) | 1 (`.viz-frame`) |
| diagram un-centering overrides | 4 `align-self:stretch` hacks | 0 (frame doesn't center) |
| Mermaid SVG sizing | `calc(100cqi − 2×--sp-2xl)` (knows frame padding) | `width:100%` of frame track |
| Compiler plane groups | 2 (chart + diagram) | 1 |
| Compiler diagram selectors | `.chart-frame, section.diagram, .lp-figure` | (folded into `.viz-frame`) |
| Core tokens in a compiled plane | ~20 (mermaid borrows core) | 0 (diagram palette completed) |

## Mechanism — the one-pass anchor tagger

Charts get `.chart-frame` auto-appended by the chart-family transformer (CHART_LAYOUTS
membership). Diagrams have no transformer — `section.diagram` comes straight from the author
`_class`. So the unified anchor needs **one small pass** that stamps `.viz-frame` on every
visualization root: chart frames, `section.diagram`, and the `.lp-figure` re-hosts. That
single tagger *is* the frame unification; it replaces the three-selector diagram plane with
one anchor applied in one place. (Charts also get `.viz-frame` from that pass; `.chart-frame`
stays as their component marker.)

## Build sequence — bank the safe, gate the risky

1. **Complete `--diagram-*` + remap Mermaid bridge; add the SVG-never-reads-core gate.**
   Zero layout change; kills the danger at root. *Low risk.*
2. **Collapse the compiler to one `.viz-frame` group + the one-pass tagger.** Charts keep
   `.chart-frame`; diagrams gain `.viz-frame`. Palette output byte-equivalent where the
   selector already matched. *Low risk; unit-gated by the existing compiler tests.*
3. **Hoist the shared container into `.viz-frame`; reduce `.diagram` to a thin modifier;
   tune diagram whitespace to the chart rhythm.** *This is the visual change* — gate behind
   the full chart+diagram gallery visual sweep (QUALITY BAR) and export sign-off. Re-verify
   the Fit Spine height math (HARD RULE #20 — no margins; the layout measures itself).

Each step stands alone and is independently shippable, so wins bank as they land.

## Cost, risk, gates (honest)

- **Charts do not re-lay-out** — their model becomes the frame's, verbatim. Blast radius is
  the **diagram/mermaid side only**: every Mermaid diagram type, plus the journey / roadmap
  / word-cloud hybrids, re-fitted into the shared zone.
- **Gates:** step 3 alters rendered layout → chart+diagram gallery visual sweep + **export
  sign-off** (a hard stop — it changes exported bytes). Fit Spine re-verification across all
  diagram types (Mermaid's `getBoundingClientRect` must still measure non-zero).
- **No hard blocker found** — nothing in `section.diagram` *can't* move; the load is a set
  of rules, re-parentable onto `.viz-frame` + a `.diagram` modifier.

## Open decisions (for the human)

1. **Palette-consistency scope** (parked): leave journey/roadmap/radar/state-chart on their
   current mixed families, reconcile the chart-bucket strays, or (not recommended) full
   12→8 merge.
2. **Ship as one PR or the 3-step sequence** as separate PRs (HARD RULE #17: each step
   builds on `main` alone → each is independent → its own branch/PR is legitimate).
