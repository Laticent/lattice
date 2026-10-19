---
status: proposed
summary: >
  Every chart should take custom labels, and the family has at least seven separate label
  mechanisms that do not share a model. The proposal is ONE label model with two emitters (HTML,
  SVG), built on three independent slots a label may carry: a MARK (swatch, line, arrowhead,
  icon), the TEXT, and a PLATE (none by default; pill when asked). The pill is not a dependency of
  the label: it is one value of the plate slot. The existing wrap, measure and placement engine
  (`svg-label.js`) stays and becomes the SVG emitter's back end. Migration is byte-identical, one
  adopter per commit, which is how the legend port already shipped. Axis tick labels and the
  placement geometry are not retired.
---

# One legend model, two emitters, three slots

**2026-10-19.** Status: proposed. Nothing in this note is built.

## The ask

> Every chart should support custom labels. A heatmap has none, and labels should be a plugin
> that depends on the pill plugin to render a collection of pills, defaulting to no background,
> no border, no icon: just a label. HTML or SVG, and responsive. Some SVG labels carry a colored
> shape (a swatch, a dotted line, an arrow). Don't overstuff the pill. Audit, then retire pretty
> much every label for one universal plugin.

## Audit: what exists today

There is no "pill plugin". The pill is three things that never met:

| Piece | Where | What it is |
|---|---|---|
| Inline pill grammar | `lib/core/inline-pills.js` (583 lines), Segno `pill` slot | `{LIVE, tag, c4}`: label + shape word + color slot + size. Pure kernel. |
| Trailing-code pill | `base.modifiers.css`, `lib/transformers/pill-tag.js` | A list row's last `code` span becomes a chip. |
| Pill geometry | `--pill-*` tokens in `base.tokens.css` | Radius, padding (em), font, weight, tracking. Color is per site. |

`lib/plugins/` holds no pill plugin. Its inline plugins are `icons`, `avatars`, `sparks`.

Labels are separate again. Grouped by job:

| Job | Mechanism today | Medium |
|---|---|---|
| Category / axis names | `cartesian.js` `buildCategoryLabels`; `heatmap-col-label`, `radar-axis-label`, `gantt-lane-label` | SVG |
| Value labels | `cartesian.js` `buildValueLabel`; `chart-values`, `map-value`, `line-endvalue` | SVG |
| Mark / node names | `quadrant`, `funnel`, `state-label`, `fc-name`, `radar-sector-label`, `gantt-bar-label` | SVG (flowchart nodes HTML) |
| Edge names | `fc-elabel`, `state-edge-label` | HTML / SVG |
| Keys (swatch + text) | `svg-legend.js` (637 lines), `html-legend.js` (111), `graph-key.js` (76), roadmap's own | SVG, HTML, HTML |
| Key content | `label-set.js` (264): `{key, label, detail}`, derived / inline / register | data |
| Notes | `mark-detail.js`, `note=` spans, `chart-caption` | SVG / HTML |
| Pills | inline pills, trailing pill, `chart-status` | HTML |

Shared engine under the SVG half: `svg-label.js` (1195 lines) wraps text to a character budget
as `<tspan>` lines, picks one of eight positions, de-collides, draws leader lines, and reports
what it dropped through `label-drops.js`. `2026-07-26-svg-chart-labels-motion.md` §2 settled
why SVG labels are `<tspan>`, not `<foreignObject>`: foreignObject is unreliable in the
Chromium to PDF path and the motion system cannot animate an HTML node inside an SVG.

Findings that shape the design:

1. **The hard half is already one thing.** Wrapping, measuring and placement live in
   `svg-label.js`. What differs per chart is the thin layer above it: which strings, which
   class, which size. A universal label unifies that layer, not the geometry.
2. **The mark vocabulary already exists, in three copies.** `graph-key.js` `keySwatch` draws
   solid, heavy, dashed, dotted lines and open / dot / cross heads. `svg-legend.js`
   `swatchClass` draws fills. `--mark-*` and `--shape-*` mask tokens hold the glyph shapes
   (HARD RULE #29). A "dotted line with an arrow" is a mark, and it is the same mark in a key,
   on an edge and beside a label.
3. **Authored custom labels already exist for one job only**: a key. A label set
   (`[{1, Cold}, {3, Warm}]`) renames legend entries. Nothing lets an author rename or restyle
   the label on a mark, a value or an axis. That is the gap the ask names.
4. **Heatmap draws no per-mark labels today** beyond column and row names and the in-cell
   number; its key is optional. "Labels as a plugin" for heatmap means annotation labels
   (callouts on cells, a ramp end-cap name), which is job 7 above.

## The model

A label is a record with three independent slots. Each slot is optional except text.

```
label = { text, detail?, mark?, plate?, tone? }
          │      │        │       │       └ color slot c1..c12 or a semantic tone
          │      │        │       └ none (default) | pill | chip | tag | tag-bordered | circle ...
          │      │        └ none (default) | swatch | line{solid|heavy|dashed|dotted} + head{open|dot|cross|arrow} | icon
          │      └ second line, smaller (label-set `detail`)
          └ the words
```

- **Text** is the only required slot. Default render is bare text: no plate, no mark.
- **Plate** is the pill. It reuses the inline-pill vocabulary (`SHAPES`, `COLORS`, `SIZES` in
  `inline-pills.js`) and the `--pill-*` geometry. The label does not import the pill's author
  grammar; it imports its vocabulary and tokens. That keeps the pill from growing a `mark`
  slot, an arrow, a dash pattern. A pill stays "text on a plate".
- **Mark** is a new small kernel (`lib/core/legend-mark.js`) that absorbs `keySwatch`,
  `swatchClass` and the `--mark-*` / `--shape-*` lookups. Color comes from the element, shape
  from us (#3, #29).

Two emitters, one model (HARD RULE #1):

- **HTML emitter**: flex row of `[mark][text][plate]`, sized in `cqi` and `em` so it scales with
  the slide. Replaces `html-legend.js`, `graph-key.js`'s HTML, the trailing-pill markup.
- **SVG emitter**: `<g>` with `<tspan>` text from `wrapSvgLabel`, a mark drawn as SVG path or
  rect in viewBox units, an optional `<rect>` plate behind the text sized from `measureLabel`.
  Replaces the per-chart emit code above `svg-label.js` and `svg-legend.js`'s row builder.
  Responsive because everything is viewBox units, the rule `svg-label.js` already states.

"HTML or SVG" is one model with two emitters, not one emitter that does both. A single emitter
would mean `<foreignObject>`, which §2 above rules out.

**Collections**: a "collection of pills" is a `label[]` plus a layout: `flow` (HTML wrap),
`stack` (key column), `anchored` (SVG, handed to `placeLabels`), `along-path` (edge label).
`label-set.js` stays the authoring and data layer for the collection; it already holds
`{key, label, detail}`.

## Name: legend (decided)

The owner chose **`legend`** for the plugin, over `label`. The model below stays the same: a
record of text, mark and plate. What changes is the word. "Legend" is the plugin's name and the
name of the broad concept; "label" remains the word for one record, and `label-set` keeps its
name as the data shape for a collection.

Consequences to handle during the build, not after:

- `lib/core/html-legend.js` and `svg-legend.js` already use the word for the key alone. The
  plugin absorbs both, so the old files retire into the new kernel rather than sit beside it.
  Until each port lands, docs must say "the legend plugin" for the new thing and name the old
  files by path.
- A legend now covers value labels, axis names and node names as well as keys. Its docs open by
  saying so, because a reader who knows the old meaning will assume a key.
- The key layout keeps a name of its own so the two senses stay apart: `key` (swatch + text,
  stacked or flowed) versus the other collection layouts `anchored` and `along-path`.

## Plugin or kernel? Decided: an embedded plugin, like pills

The owner chose a **built-in ("embedded") plugin that ships with the engine, as pills do**,
over a bare core kernel. The shape that follows:

- A `legend` plugin under `lib/plugins/legend/` (manifest, docs, fixtures, styles) that
  contributes the inline author form and registers with the host the way `icons` and `avatars`
  do, so the loader, the docs site's Plugins hub and the conformance harness all see it.
- The model, the mark vocabulary and both emitters live in `lib/core/legend*.js`, so charts in
  every bucket import the kernel directly (HARD RULE #1). The plugin is the author-facing and
  registry-facing shell around that kernel; the chart-family `kernel` extension point is how
  charts take it.
- Per the grammar decision, an author writes a per-occurrence label with the pill record
  (`{text, c3, tag}`, same words) and a deck-wide set in the label-set register.

Open sub-question (assumed, not asked): whether the inline form needs a new sigil. Pills use
`{…}`, icons `^{…}`, avatars `!{…}`. Recommend NO new sigil in phase 1: heatmap annotations
ride the existing cell `note=` and `{…}` forms, and the plugin's author surface is the label
set. Add a sigil only if an author cannot say something the existing forms already cover.

## What this retires, and what it does not

Retires, after migration: `html-legend.js`, `graph-key.js` swatch code, the row builder in
`svg-legend.js`, roadmap's private key builder, per-chart label emit blocks, and the three
copies of the swatch vocabulary.

Does not retire:

- **`svg-label.js` geometry** (wrap, de-collide, leader lines, eight-position placement). It
  becomes the SVG emitter's back end.
- **Computed axis ticks** (`line`, `histogram`, `ep-curve` stride and thinning). They are
  numbers the engine generates, not labels an author names. They keep the shared text measure.
- **Narration and `<desc>` text.** Not painted.

## Migration and risk

- **Byte-identical ports, one adopter per commit.** The legend port already did this:
  `buildHtmlLegend` was proved equal to `buildStatusLegend` against a committed PDF. A label
  port that changes bytes is an export change and stops for the owner's dark + light sign-off
  (QUALITY BAR).
- **Gates this touches**: `checkChartMarks` (a class must appear whole in a string literal;
  the legend port hit this), the SVG label CSS mirror test, `chart-label-drop-census`, #20 (no
  margin), #22 (authored label text must be escaped; `html-legend.js` already escapes).
- **Order by downstream impact**: (1) mark kernel, since it is shared by key and label;
  (2) HTML emitter, replacing the two HTML key builders; (3) SVG emitter wrapping
  `wrapSvgLabel`, adopted by `svg-legend`; (4) author surface for custom labels on marks;
  (5) heatmap annotation labels as the first new capability, which proves the ask end to end.

## Decisions

1. **Form: embedded plugin, like pills.** Kernel in `lib/core`, shell in `lib/plugins/legend`.
2. **Grammar: both** the pill record (per occurrence) and the label-set register (deck-wide).
3. **First PR: kernel + heatmap annotations.** Legend and chart ports follow, one adopter per
   commit, byte-identical.
4. **Plate defaults to none everywhere**, keys included, so ports stay byte-identical.
