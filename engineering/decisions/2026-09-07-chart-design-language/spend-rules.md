# Where colour is spent, and what a finish owns

**Status:** settled direction, from the review of `scoring.md`. Corrects four
rules in `finishes.spec.js`'s FLOOR and restructures the three finishes.
Read `colour-brief.md` first — the principle there is unchanged; this says
where it applies.

---

## 1. What a fill ENCODES decides whether a finish may retreat it

`etching` hollows a scatter dot and leaves a quadrant dot solid. That looked
inconsistent, and **it was** — the instinct behind the question was right and my
first answer was wrong.

The accident is real: `.quadrant-dot` carries `data-cell`, not `data-cat`, so the
rule missed it (`scoring.md`). But the answer I gave — that a quadrant dot's fill
is the sole carrier of its cell, so it must stay solid — does not survive being
looked at. **The cell IS the position.** A dot inside the top-right quadrant is
in the top-right quadrant whether it is filled or hollow, and an ink ring keeps
its hue besides. Scatter and quadrant carry the same thing in their fill —
nothing the reader cannot already see — so they behave the same way, and the
prototype now shows them doing it.

The axis that actually decides is **what the fill encodes**, not what shape the
mark is:

| encoding | may a finish retreat the body? | members |
|---|---|---|
| **hue** — identity is *which* colour, and an ink edge preserves it | **yes, all the way to a whisper** | bar, stacked-bar, piechart, funnel, scatter, quadrant, gantt, waterfall, bullet, line, slope, state-chart, timeline-list, roadmap, kanban, progress |
| **ramp** — fill *strength* is the magnitude | **scaled, never flattened** | map (`--mix` per region), journey |
| **presence** — filled-versus-not *is* the datum | **against a floor; never to zero** | matrix-grid |
| **layered** — translucent, composited with its neighbours | **no: settled, radar keeps its alpha.** The finish reaches its edge and its ground | radar |

The two that hold are measured, not asserted. `map` sets `--mix` per region and
mixes the hue into `--map-base`, so flattening the fill deletes the magnitude.
`matrix-grid`'s `.cell-filled` is `background: var(--row-fill)` and its
`.cell-outlined` is `background: none` **with the same 2px border** — a body
taken to nothing turns one cell into the other. Quiet is safe there; gone is not.

This is the judge's magnitude clause, generalised, and it replaces the "sole
carrier" framing above it. It is also computable per member rather than
per-member taste, which is what lets a new chart adopt a finish with no new rule.

## 1b. A textured mark keeps its texture

Found by building the prototype, and it would have shipped: **a finish that sets
`fill` with `!important` deletes the a11y texture channel.**

On the a11y palettes a mark's fill is a `<pattern>` — `fill: url(#latt-a11y-chart-tex-N)`
— and that pattern is the substitution that carries category for a reader who
cannot receive hue. Every finish rule here is `!important` (it has to outrank the
inline `style="fill:url(…)"` the pie and quadrant emit), so every finish silently
repainted the one channel those palettes depend on.

> **A finish reaches a textured mark through SHADE and its edge, never by
> repainting it.** `fill-opacity` under each finish; the pattern is untouched.

Two things this needs, and both are in the prototype:

- **Detect a texture, not a `url()`.** Most members already paint through a
  `<linearGradient>` — the vertical wash — so treating every `url()` fill as a
  texture excludes them from every finish, silently, in the other direction.
  Resolve the reference and look at the node: only a `<pattern>` is the a11y
  channel. Measured on the eleven-chart prototype: **0 textured marks on indaco,
  29 on achromatopsia**, out of 102.
- **Read the paint before the finish applies.** The slot has to be stamped after
  the read, or the finish's own rules are already matching.

## 2. Singular does not mean "own hue" — it means "may own one, if hue carries"

A scatter's points are singulars and they do not get six colours.

`colour-brief.md` says *a group shares one hue; a singular may own one*. **May**
is doing the work, and the qualifier is: **only when hue is the channel that
distinguishes them.** In a scatter it is not — position distinguishes them, and
a direct label names them (census: `scatter → direct-labels`). Six hues would
spend the palette on a channel carrying nothing, and would assert a grouping
the data does not have.

What a scatter's one hue *should* do is reach its direct labels, so the label
and its dot read as one object. That is rule 3.

If a scatter ever gains a series dimension, hue becomes the group channel and
the rule flips itself — no per-member exception needed.

## 3. Colour goes to the join, once

A legend swatch and a coloured legend label are two copies of the same fact,
and the second copy is the one at the worse contrast. The census already splits
the family by how it names a category, and that split is the rule:

| member's key | who wears the hue | members |
|---|---|---|
| **legend rail** — a swatch sits next to the label | the **swatch**. Label stays `--text-body` | gantt, journey, map, matrix-grid, piechart, radar, roadmap, state-chart |
| **direct labels** — no swatch; the label *is* the key | the **label** | line, scatter, slope, stacked-bar |
| **no key** — every name sits on or beside its own mark | nobody; adjacency already joins them | bar, bullet, funnel, quadrant, progress, timeline-list, waterfall, kanban, word-cloud |

> **A hue appears once per link between a name and its mark** — in the swatch
> if there is one, in the letterform if there is not, and nowhere at all when
> the name is already touching the thing it names.

`finishes.spec.js`'s FLOOR painted `.chart-key-label` in category ink for every
member. On the eight legend-rail members that is the redundant copy. It is
wrong and it comes out.

## 4. The spend is ranked, and it stops at two rungs

Not "colour everything that is owned". **Colour what the reader would otherwise
have to search for.** Adjacency is free; search is what costs.

1. **The mark.** Always, under every finish.
2. **The one join**, per rule 3 — and only when the name is not adjacent to its
   mark.
3. **Nothing else.**

Neutral under every finish, without exception: axes, gridlines, plot bounds,
tick labels, axis titles, a value printed inside or immediately beside its own
mark, a category label under its own bar. An axis is owned by no group (that
part of the FLOOR was right). A tick label is owned by the axis, not by a mark.

This retires `etching`'s move of `.cart-value` and `.cart-cat` to category ink:
those sit against their own marks, so the colour buys nothing and spends a
4.5:1 budget to buy it.

## 5. Two contrast floors, by role — and a finish never moves a token across them

The tree already carries this and it is stricter than a single 4:1 line, in the
direction that matters. `lib/tokens/contracts.js`:

- **`TEXT_FLOOR = 4.5`** — WCAG 1.4.3 AA normal text. The floor an `-ink` /
  `-fg` / `text-*` value clears.
- **`GRAPHICAL_FLOOR = 3`** — WCAG 1.4.11 non-text contrast. The floor a
  `-mark` / `-border` / `-stroke` clears.

`lib/theme/cat-ink.js` solves `--chart-cat-N-ink` to **4.65:1**, a deliberate
0.15 margin so a later regeneration cannot land under 4.5.

A single 4:1 floor would be worse at both ends: it fails AA for text, and it
over-constrains a mark, which cannot hold the palette's chroma at 4:1. **The
answer is not one number — it is that every element declares which role it
plays, and a finish may not silently move an element from one role to the
other.**

Two consequences a finish must obey:

- **Mark depth and on-mark ink are coupled.** `--cat-on-mark` is solved against
  a mark at full strength. A finish that drops the body to 30% has invalidated
  it. The settled register system already answers this: **MARK** (bare mark,
  full strength) is where a finish varies depth; **BACKDROP** (text-bearing,
  quiet) is pinned by the register and a finish does not touch it. Measured
  earlier: text on the 82% mark fails AA in 117 of 224 theme × mode × slot
  combinations, against 0 and 1 for the two quiet levels. The register is the
  guard; the finish is not allowed to be.
- **Every element a finish repaints declares its floor,** so the existing
  contrast tooling can check a finish the way it checks a theme. A finish that
  cannot be measured against these two floors is not shippable.

## 6. A finish owns how the MARK is drawn. The frame is its own register.

Today `ground` owns the figure frame, `etching` owns the doubled edge, and
`pigment` owns nothing distinctive. Three finishes each hoarding one attribute
is not a system, and it is why `ground` measured as distinguishable on 21 of 21
while changing nothing about how a chart is drawn (`scoring.md`).

**Split the axes.**

**`charts:` — the finish. Owns the mark body, and sets every other knob rather
than hoarding one.**

| | the body | the edge (derived, not chosen) | the mark's ground |
|---|---|---|---|
| `pigment` | full strength | single weight | none |
| `etching` | retreats to a whisper | doubled — the boundary now carries identity | none |
| `ground` | mid strength | single weight | **each mark sits in its own drawn track** |

Edge weight is a *consequence* of body depth, not an independent knob: when the
body retreats, the boundary has to carry more. Deriving it is what keeps the
three coherent and stops an author assembling an incoherent combination.

`ground`'s real story is the **per-group track** — a bar's headroom, a funnel's
intake, the denominator made visible. `bullet`, `progress` and `quadrant`
already draw one; `ground` generalises it. That is a statement about the mark,
so it belongs to a finish. The figure frame never was.

**`frame:` — the container. Orthogonal, available under all three.**

`none` (default) · `ground` (the figure declares its own tinted ground) ·
`ruled` (ground plus a border)

This is the export and visual-distinction feature asked for directly, it is a
slide-composition decision like the existing `rule:` and `corners:` registers,
and no finish has a monopoly on it. Each finish declares a sensible default;
an author overrides per deck or per slide.

**Both still gate on the same rule:** a register offers pre-canned choices that
cannot be combined incoherently. Two registers with three and three values are
nine combinations, all of which have to look deliberate — which is exactly why
the edge is derived rather than exposed.

---

## What changes in the spec

1. FLOOR drops `.chart-key-label` recolouring on the eight legend-rail members;
   swatches already carry the hue.
2. FLOOR keeps direct-label recolouring (line, scatter, slope, stacked-bar) —
   that is the join, and three of the four already did it correctly.
3. `etching` drops `.cart-value` / `.cart-cat` recolouring entirely, which also
   retires the F4 emitter-contract dependency that was blocking it.
4. `etching` retreats a body only where the fill encodes **hue**; `ramp` scales,
   `presence` floors, `layered` is edge-only — read off the slot contract, not
   hand-written per member.
4b. Every finish declares a `fill-opacity` for a textured mark and repaints none
   of them.
5. `ground` loses `.chart-body` to the new `frame:` register and gains its
   per-group track, which is the part that was never built.
6. Every finish declares, per element it repaints, whether that element is text
   (4.5) or graphical (3), so a finish is checkable by the existing contrast
   tooling.

All six sit downstream of the slot contract in `scoring.md`. None is buildable
until a mark can be addressed on every member.

---

## The prototype, and what it measured

`scratchpad`-built, published as an interactive page: eleven members spanning the
taxonomy (hue / ramp / presence / layered; legend-rail / direct-label / no-key;
SVG and HTML marks), four palettes, live finish and frame controls, every chart a
real engine render. The slot contract is applied in the browser from the
attributes members already emit — the mapping is the contract, the JS is
scaffolding for an emitter change.

**11 of 11 members show all three finishes as distinct**, on indaco, onyx and
achromatopsia alike, against 5 of 21 for the CSS in `finishes.spec.js`.

Divergence is measured over **the union box of the marks a finish may touch**,
not the whole slide. That correction matters more than it sounds: a scatter's
dots are a fraction of one percent of a 1280x720 slide, so a whole-slide diff
reports 0.2% for a change that alters every mark on the chart. Scatter and
quadrant still read lowest (1.3% and 1.7% pigment>etching) because a dot is a
small object inside a large plot — the honest floor of an area metric, not a
finish failing to land.

Three collisions worth remembering for any future viewer built this way: the
engine styles `.badge`, `.card`, `.grid`, `.seg`, `.stage` and `.top`, and it
styles bare `section`, `h2`, `ol` and `dl` as slide content — so viewer chrome
needs its own namespace and its own resets, or the page quietly inherits deck
typography. And a theme cannot be swapped by appending a second theme file to a
render that already baked one: an a11y variant redeclares almost none of the
first theme's tokens, so the palette stays put. Compose the engine sheet with one
theme, the way `lattice-emulator` does.
