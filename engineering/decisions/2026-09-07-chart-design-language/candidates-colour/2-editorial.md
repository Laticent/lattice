<!-- Design-competition candidate (colour round), 2026-09-07.
     Track 2 — editorial.  Judge score: 5.5/10.
     Title: Three papers — folio, spread, survey
     A PROPOSAL. The winner is track 3; the ranking and the grafts to
     fold into it are in ../judgement-colour.md. Brief: ../colour-brief.md. -->

# Three papers — `folio`, `spread`, `survey`

**Perspective:** graphics editor. Three finishes are three *papers a chart can be
printed on* — a newspaper page, a magazine feature, a surveyor's sheet. They are
designed to be tellable apart across a room, on a scatter plot and on a funnel,
because they differ in **what color is for**, not in how much of it there is.
Nothing here has been rendered, so that sentence is the prediction the A/B in
"What I do not claim" must confirm, not a report of one.

---

## The answer in five sentences

1. **`folio` spends color on the datum.** The mark is filled at full strength,
   the thing that names it wears its hue, and everything else is the paper's own
   ink. Frameless, gray furniture, air.
2. **`spread` spends color on the subject.** The same filled marks, but the
   figure becomes an object with a color of its own: a hue-tinted ground, a
   hue-tinted chrome ladder, and the mark's ink reaching its value and its own
   reference lines.
3. **`survey` spends color as notation.** Nothing is flooded: every mark is
   *drawn* — a quiet tint body inside a full-ink outline — every reference line
   is present, and the figure carries a hairline edge and square corners.
4. **The three are separated on every member by three unconditional levers** —
   the mark's body (filled / filled / drawn), the figure's frame (none / ground /
   edge), and the reference furniture (half-gray / half-tinted / full-gray) —
   none of which needs a gradient to exist.
5. **The correctness layer is identical under all three**, and it is where the
   grouping rule, the naming floor and the chrome ladder live: a paper changes
   how a chart looks, never whether it can be read.

---

## The measurement the whole design rests on

The family carries three tiers of a category's color. I resolved all three
through the real token chain — `var()`, `light-dark()`, `color-mix(in oklab, …)`
— using the resolver in `test/unit/palette/chart-contrast.test.js`, over the six
working slots (the gate exempts 7–8), pairing each slot with the next (1↔2 …
5↔6) and reporting the **minimum** adjacent distance per row.

**The axis is one theme FILE per row, not "palette × canvas".** In this repo a
dark scheme is usually its own file (`themes/ardesia-dark.css`,
`themes/brina-dark.css`), so the twelve rows below are twelve theme files, named
in full. Twelve rows, twelve files — every count in this section is derived from
this table and nothing else.

| Theme file | INK adjacent | 82% SOLID adjacent | 24/40% TINT adjacent |
|---|---|---|---|
| `onyx.css` (light) | 0.094 | 0.149 | 0.044 |
| `onyx-dark.css` | 0.183 | 0.151 | 0.071 |
| `indaco.css` (light) | 0.201 | 0.164 | 0.048 |
| `indaco-dark.css` | 0.142 | 0.116 | 0.057 |
| `cuoio.css` (light) | 0.197 | 0.189 | 0.055 |
| `cuoio-dark.css` | 0.111 | 0.132 | 0.065 |
| `carbone.css` (light) | 0.094 | 0.077 | 0.022 |
| `magnolia-dark.css` | 0.072 | 0.059 | 0.031 |
| `ardesia-dark.css` | 0.066 | 0.055 | 0.025 |
| `brina.css` (light) | 0.190 | 0.168 | 0.050 |
| **`a11y-achromatopsia.css` (light)** | **0.069** | **0.055** | **0.015** |
| **`a11y-achromatopsia.css` (dark scheme)** | **0.069** | **0.057** | **0.027** |

**This table is a sample, not the tree.** `themes/` carries 15 palette families;
these twelve rows were chosen to span the range and include the worst case. The
resolution script is committed beside this design as
`engineering/decisions/2026-09-07-chart-design-language/measure-tiers.mjs`, takes
the theme file list as its argument, and prints exactly these columns, so any
reader can widen the sample and re-derive every count below.

### What the numbers license, and what they do not

`SLOT_DISTINCT = 0.06` in that test file is **not a floor for these tiers.** It
gates adjacent *raw* palette slots (`--chart-catN`) and the five state colors,
over slots 1–6. The engine has never asserted a floor for a derived tier, and the
raw slots pass 0.060 on `a11y-achromatopsia` by construction — the gate is green
there — so a 0.055 reading on a *mix* of those same slots is a different
quantity, not a failure against a known bar. I therefore use the three tiers as a
**relative ordering** and quote 0.060 only as a familiar reference magnitude.

Three conclusions, each re-derived from the twelve rows above:

- **A tint never carries a category alone.** It is the weakest tier in **12 of
  12** rows, and below the 0.060 reference in **10 of 12** (`onyx-dark` at 0.071
  and `cuoio-dark` at 0.065 are the exceptions). This is why `survey`'s drawn
  mark puts the category on the **outline**, not on the body — and why the
  quadrant's four zone tints are reference material rather than identity.
- **Ink is the most separated tier**, ahead of the solid in **10 of 12** rows
  (`onyx.css` light and `cuoio-dark.css` are the two where the solid leads).
- **On `a11y-achromatopsia` the ink tier separates roughly 25% better than the
  82% solid** (0.069 vs 0.055–0.057) — the largest relative ink advantage in the
  sample. So an *outlined* mark is measurably more distinguishable than a
  *filled* one on the palette whose readers need it most. That is an ordering,
  not a pass/fail.

> **Rule S — a category is carried by the most separated tier its mark can
> hold: INK for a stroke, a ring or an outline; the SOLID for a filled area;
> never the TINT alone.** A tint may accompany a category. It may never be the
> only thing telling one from the next.

Rule S answers the failed attempt's three errors at once: it forbids removing
color (the tint keeps its job as a *companion*), it puts color on the tier that
carries the decision, and it varies something a reader actually reads.

**One thing Rule S does not settle: separation is not presence.** Adjacent OKLab
distance says two marks differ; it says nothing about whether either is strong
enough on the canvas. `word-cloud.styles.css` already caught a case this
instrument is blind to (below), so a **presence measure** — chroma and contrast
against `--bg` — is owed alongside separation before `survey`'s dark outline is
ratified.

---

## Constant under all three papers — the correctness layer

### G0, the grouping test — the companion to R0

R0 asks *does the mark carry text inside it?* and decides the register. G0 asks
one more question, answerable the same way, by looking. The earlier phrasing
("does this mark's KIND recur?") gave the wrong answer on pie, funnel and
scatter — a slice's kind is "a share", which recurs — so the test is restated on
something the mark actually carries:

> **G0 — does this mark carry its own name, or does it share a label axis with
> its siblings?**
> Shares an axis, or is named only by a shared series key → it is one of a
> **group**, and the group shares one hue.
> Carries its own name on or beside itself → it is a **singular**, and it may
> own a hue, subject to G1.

Re-derived, unaided: a **bar** is named by a category axis its siblings share →
group, one hue. A **pie slice** carries its own label at its own wedge → singular.
A **funnel stage** carries its stage name in its own band → singular. A **scatter
point** carries an entity label when the chart names them, and none when it does
not → singular when named, one group when not. Those four fall out of the
sentence with no commentary, which is the test the earlier phrasing failed.

> **Rule G1 — the singular cap.** The palette's working range is six slots
> (slots 7–8 are allowed to converge, per `chart-contrast.test.js`). Above six
> singulars a member does **not** cycle: the marks become **one group at one
> hue**, and identity moves entirely to the direct label. Where a member has a
> natural ranking, the alternative is permitted: the top six take slots and the
> tail takes a single neutral.

G1 is what stops the singular branch committing the "merge, not redundancy"
defect this design objects to elsewhere. It bites hardest on `word-cloud`, which
**cycles seven slots today** (`word-cloud.styles.css` re-points slots 1–7) — that
is now a **stated defect the language fixes**, not a sanctioned exception, and it
is costed below.

**The 21 members, and what changes:**

| Member | Group or singular | Hue count | Changes? |
|---|---|---|---|
| `bar` | group (shared category axis) | 1, or 1 per series when grouped | no |
| `stacked-bar` | groups (one per part, shared axis) | 1 per part | no |
| `waterfall` | groups (rise / fall / total — semantic) | 3 semantic | no |
| `funnel` | **singulars** — each stage names itself | 1 per stage, G1 capped | no |
| `bullet` | group (shared row axis) | 1 | no |
| `piechart` | **singulars** — each wedge names itself | 1 per slice, G1 capped | no |
| `map` | group (shared region axis); magnitude ramps *within* it | 1 | no |
| `radar` | groups (a series shares every axis) | 1 per series | no |
| `quadrant` zones | reference regions — **encode nothing** | 0 | **yes** |
| `quadrant` dots | **singulars** | 1 per entity, G1 capped | **yes — gains the four hues the zones give up** |
| `scatter` | **singulars when the chart names them**, one group when it does not | 1 per named entity, G1 capped | **yes — color ADDED** |
| `line` | groups (one per series) | 1 per series | no |
| `slope` | **singulars** (each entity, named at both ends) | 1 per entity, G1 capped | no |
| `gantt` | groups (status) | semantic | no |
| `kanban` | groups (status) | semantic | no |
| `progress` | groups (status) | semantic | no |
| `timeline-list` | **singulars** (each item names itself) | 1 per item, G1 capped | no |
| `state-chart` | groups (status) | semantic | no |
| `roadmap` | groups (status) | semantic | no |
| `matrix-grid` | **one group** — the marked cells share the grid's axes | 1 | **yes** |
| `journey` | groups (lanes); the mood curve is magnitude | semantic | no |
| `word-cloud` | **singulars** (each word names itself) | 1 per word, **G1 caps at 6** | **yes — the 7-slot cycle collapses** |

**Seven members carry singulars** (funnel, piechart, quadrant dots, scatter when
named, slope, timeline-list, word-cloud). **Four members change**, and three of
the four are a *relocation*, never a removal: the quadrant's four hues move from
a 12-inch reference field onto the dots that carry the data; matrix-grid's six
hues move from its rows onto the marked path; scatter *gains* per-entity hue it
never had. The fourth, word-cloud, loses a seventh cycling hue to G1.

### The naming floor — interaction #2, resolved once

> **Rule K0 — anything that NAMES a mark wears that mark's ink, in every
> finish.** A key entry's label and swatch, a direct label, a series name, a
> stage name at its band, the dot on a timeline item.

This is the floor of color reach, not a lever, so no paper can take it away.
It is also a live defect: `.chart-key-label` fills `var(--text-body)`
(`chart-family.css`), while the swatch beside it carries `data-cat`. The key
names the mark in words and disagrees with it in color, on every one of the
eight keyed members. K0 is one declaration.

`line`, `stacked-bar` and `timeline-list` already satisfy K0 — that is what the
brief means by "three members already color their labels correctly". K0 is that
practice made a rule.

### The chrome ladder — and one correction to the taxonomy

One ladder, weakest to strongest: `grid` → `rule` → `tick` → `label` → `title` →
`value`. A member picks a rung, never a color. Two things the taxonomy reports
as incoherence are worth restating accurately, because the fix differs:

- **`gantt`'s tick is `var(--text-label)`, not `var(--accent)`.** In indaco
  `--text-label` *is* `var(--brand-accent)` (`themes/indaco.css` line 96), which
  is why it measured `#006fa8`. The defect is real and the fix is the ladder's
  tick rung; there is no rogue accent reference to delete.
- **`bar`'s zero rule is not bar's.** `.cart-zero` is family chrome for every
  Cartesian member and is deliberately `color-mix(in oklab, var(--text-body)
  42%, transparent)` — the file says why: it is the reference the marks are read
  against, so it must survive a theme that softens the grid to nothing. That is
  a role distinction, not a drift. It stays.

### The other three interactions, each as a rule

**I1 · Occlusion × hue.** `radar` is the only LAYERED member and keeps its alpha
(settled). The rule that generalizes it:

> **A layered mark's category is carried by its EDGE, and its separation is
> measured on the composited result, not on its tokens.**

So no paper touches radar's fill; the papers reach radar only through its
polygon stroke weight, its dash cycle and its labels. `chart-mark-separation.js`
already composites `stop-opacity` over the section background (lines ~232–249),
so this is measurable today — candidate 5's "the tool cannot score an alpha
ramp" has since been fixed and I do not rely on it.

**I2 · Naming × ink.** Rule K0 above.

**I3 · Text-bearing × saturation.** R0 sends a text-bearing mark to BACKDROP.
The addition:

> **Color reaches a text-bearing mark through its EDGE and its LABEL, never
> through its body.** The body is capped by the AA floor; the edge is not.

This is why the papers differ on `kanban`, `gantt`, `progress`, `state-chart`,
`roadmap`, `journey` and `timeline-list` *at the edge and the accent bar*: the
card's wash is contrast-bound and cannot be a lever, but its edge and its
`--chart-fill-accent` stripe are free.

**I4 · Substrate × weight.** A 1-unit stroke and a 200-unit area at the same mix
are not the same color experience.

> **Strength is declared per SUBSTRATE, not once per finish.** AREA, POINT and
> STROKE each take their own pair; POINT and STROKE sit at ink strength in every
> paper because they have no area to hold a tint.

The tree already knows this and says so: `scatter.styles.css` fills its dot with
`--chart-cat-1-ink` and explains that a 3-unit dot painted in `-fill` "reads as
a smudge at this size". The rule is that comment, generalized. I4 is also the
reason a single derived-tier floor would be wrong even if the engine had one: a
filled area and a 2-unit stroke do not need the same separation.

### The point-shape redundancy rung lives here, not in `survey`

The 8-wide point-shape cycle is **correctness, under all three papers** — it is a
redundant channel, and a paper must not be able to remove one. It is stated here
rather than as a `survey` lever for a concrete reason: a `<circle>` cannot become
a triangle by declaration, so a shape cycle owned by a paper would need the
transform to read the front-matter register — a paper made member-aware, which
the architecture forbids. As a correctness rung it is emitted unconditionally by
the point members' transforms, exactly like the texture channel, and no paper
touches it. `survey` therefore introduces **no new mechanism at all**: its point
treatment is the open ring, which is pure token.

---

## The three papers

### `folio` — the newspaper page *(default)*

**Color is the datum.** It lives in the shapes and in the words that name them,
and nowhere else. This is what the FT, the Economist and Datawrapper do, and it
is what a board pack should default to.

| | |
|---|---|
| Mark | **filled** — area at the 82% solid over `--chart-cat-base`, with a canvas hairline seam; point a solid ink disc with a canvas ring; stroke at standard weight |
| Color reaches | the mark, and its name (K0). Nothing else |
| Chrome | the ladder, neutral, at half presence |
| Frame | none — no ground, no edge, square |
| Framing text | eyebrow in `--text-label`; the caption's 7.5cqi hairline stub |

### `spread` — the magazine feature

**Color is the subject.** The figure is a designed object, and the object has a
color. The marks read exactly as they do in `folio` — the paper does not touch
what the data says — but everything around them belongs to the figure.

| | |
|---|---|
| Mark | **filled**, identical to `folio` |
| Color reaches | the mark, its name, **its own value**, and **its own reference furniture** (a lane rule, a row rule, a baseline connector); the shared ladder is **tinted** — every rung mixed toward `--chart-figure-hue` at the per-rung proportions below |
| Chrome | the tinted ladder, at half presence |
| Frame | **a ground** — `color-mix(in oklab, var(--chart-figure-hue) 4%, var(--bg))` light, 7% dark; small radius; no edge; **plus a figure inset** (the ground extends a fixed gutter beyond the plot on all four sides) |
| Framing text | eyebrow in `--chart-figure-hue` ink; caption hairline tinted |

**Rule F2 — the figure hue is never a categorical slot the chart is using.**
`--chart-figure-hue` defaults to the theme's `--brand-accent`, not to
`--chart-cat-1-hue`. Slot 1 is the hue a one-group member spends — a
single-series bar, bullet or map — and defaulting the ground, gridlines, ticks
and axis titles to that same hue puts the furniture in the datum's color, which
is the brief's error #2 inverted. Deriving the figure hue from brand keeps it
structurally outside the categorical spectrum. It is still checked against the
ladder rule: the *ladder* takes a fixed mix toward the figure hue, it never
takes `--accent` wholesale.

**The ladder tint proportions, named.** An unstated proportion is furniture
opacity wearing a new name — the exact failure that killed the previous attempt —
so each rung declares one: `grid` 12%, `rule` 14%, `tick` 18%, `label` 20%,
`title` 24%, `value` 28% toward `--chart-figure-hue`. These are the starting
values, and they are **owed a measurement before ratification**: the tinted rung
against the neutral rung, with `tools/chart-mark-separation.js`, showing the
delta is visible *and* that the tinted grid stays below the categorical tint so
it cannot read as data. If the visible proportion turns out to make the grid read
as a mark, the result changes the design.

**Rule F3 — the ink is re-solved on the ground.** `--chart-cat-N-ink` is solved
to AA against `--bg`. `spread` moves that canvas, so labels, values and
conversion figures on the ground, and any `--cat-on-fill` surface sitting on it,
must be re-resolved at 4% and 7% across the theme set and the worst case stated.
The ground percentage is bounded by that measurement, not by taste. **This is
owed, not done.**

**Is a ground that carries no datum decoration?** No. The ground carries the
figure's **boundary** — Rule F1's whole job: an exported SVG that states what it
must be read on, a chart that can sit on a background image, a BACKDROP register
with something to be quiet against. Its hue carries **deck identity**, not datum
identity, and F2 is what makes that legible rather than asserted. At 4% it sits
an order of magnitude below the 24% categorical tint, checkable with the same
tool that measures mark separation.

The precedent is the obvious one: **the FT's paper is not white, and nobody
calls the FT loud.**

**What `spread` is, and is not for.** `spread` is a color-canvas paper. Two
conditions strip its primary lever, and both are stated here rather than
discovered later:

- **Print** re-points `--chart-frame-bg` to `transparent` (a 4% ground prints as
  a visible gray band on toner), which deletes the ground.
- **An achromatic palette** flattens the tinted ladder to the neutral one.

What survives both is the **figure inset** — a plot held off its own edge by a
fixed gutter is a shape difference, not a color one — plus values in the band's
ink rendered as gray levels. That is deliberately why the inset is a listed part
of the frame and not a decorative aside: without it `spread` under print is
`folio`. An author who sets `spread` and exports to monochrome gets *inset
`folio`*, and the resolver should say so in its warning. `spread` is **not
offered as the recommendation** for print-bound or a11y decks.

### `survey` — the surveyor's sheet

**Color is notation.** Nothing is flooded. Every mark is drawn, every reference
line is present, and the figure is a plate with an edge.

| | |
|---|---|
| Mark | **drawn** — area at the 24%/40% tint body inside a **full-ink outline at 2× hairline**; point a canvas core inside an ink ring; stroke at 1.25× weight |
| Color reaches | the mark's outline, its name, and **its value**. The shared ladder stays **neutral** — a technical sheet's reference apparatus is black — but heavier |
| Chrome | the ladder, neutral, at **full** presence: every gridline, bound, split line and axis rule drawn |
| Frame | **a hairline edge**, square corners, no ground |
| Framing text | eyebrow in `--text-muted`; caption hairline runs **full width**, tabular-nums |

**The outline weight is device-space, not user-space.** `stroke-width` is in
viewBox user units and the boxes differ across the family (cartesian 320×180,
quadrant 420×348, radar 300×300), so one `--chart-mark-outline-w` would render at
three different physical weights. `survey`'s outline therefore carries
`vector-effect: non-scaling-stroke`, making it a device-space hairline multiple
everywhere, independent of the member's box.

**Rule S1 — the minimum drawn dimension.** SVG strokes are centered on the path,
so a full-ink 2× outline doubles at every shared seam (adjacent stacked-bar
segments, touching pie wedges) and, on a thin waterfall delta or a small stacked
segment, consumes the body it is meant to bound. Below a minimum mark dimension —
**provisionally 6 device-space units, to be set against the thinnest real segment
in `chart.gallery.md`** — `survey` falls back to the filled body with the outline
suppressed. This is the same class of precondition Track 4 established for
textures below ~16 viewBox units, and the number is not settled until it is
checked against the gallery.

Two existing marks in the tree are already drawn this way, which is what
"generalize what the tree does well" means here: `timeline-list`'s dot is a
canvas center inside a 3px ink border, and `quadrant`'s dot is the same idiom.
`survey` makes that the paper's rule rather than two members' habit.

---

## How they stay apart on a member with no gradient

**The mechanism is three unconditional levers**, none of which is a gradient:

- **M — the mark's body.** filled · filled · **drawn**.
- **F — the figure's frame.** none · **ground + inset** · **edge**.
- **R — the reference furniture.** half + gray · half + **tinted** · **full** + gray.

Plus **T** (which type roles wear the mark's ink), which reaches fewer members,
and **E** (the eyebrow ink and the caption rule).

**E and F are FIGURE-level: they separate the three papers once, globally, and
are identical on every member.** Counting them per member inflates every row, so
the table below counts them once and reports the **mark-level** count (M, R, T)
as the honest per-member figure.

### `scatter`, drawn out

*(Descriptions of an unrendered design — what the A/B is expected to show.)*

- **folio** — solid ink discs, one hue per named entity (G0/G1), each label in its
  entity's ink, gray grid at half presence, no ground, no edge.
- **spread** — the same discs on a tinted, inset ground; gridlines, ticks and axis
  titles all tinted toward the figure hue; the trend line a wash of it; each
  point's value in its own ink.
- **survey** — **open rings** (canvas core, ink ring); the full grid and axis rule
  at full presence; a hairline frame edge and square corners; labels in ink with a
  hairline leader in the same ink.

Three pictures that should be unconfusable: colored discs in air · colored discs
on a tinted, inset field with tinted rules · small open rings on a ruled sheet.

**Two scatter details the paper must settle, not inherit:**

- **The size key is magnitude, and must stop wearing category 1.**
  `.scatter-size-ring` is painted in `--chart-cat-1-ink`. Once the dots carry
  per-entity hues, that key reads as naming a category. It re-points to a
  neutral (`--text-label` ink) whenever the dots are categorical.
- **`survey` inverts the overlap answer, so it owes one.** `.scatter-dot`'s
  `--bg` ring is documented as "the answer to the overlap problem": a solid disc
  with a canvas halo separates where two dots cross. An open ring separates
  differently — two crossing rings read as two outlines, which is *better* for
  identifying both and *worse* for reading density. The A/B must include a dense
  overlap region at 3-unit radius; if rings read as noise there, `survey`'s point
  falls back to a filled ink core inside the ring rather than a canvas core.

### `funnel`, drawn out

- **folio** — solid trapezoids in the stage hues, each stage name in its band's
  ink, values in heading ink, conversion figures muted, no ground.
- **spread** — the same bands on a tinted, inset ground; names *and* values in the
  band's ink; the conversion figure in the band's ink at reduced strength; the
  gaps carrying tinted connector rules.
- **survey** — the bands **outlined**: a 24%/40% body inside a full-ink edge, so
  the funnel reads as a plotted region rather than a poster block; values in the
  band's ink; a hairline frame edge and square corners; conversion figures
  neutral at full presence. Adjacent bands share seams, so S1 applies.

### And on all 21

Figure-level levers **F** and **E** apply to all 21 members, once. The table
counts mark-level levers only.

| Member | Mark-level levers that differ | Weakest link |
|---|---|---|
| bar, stacked-bar, waterfall, bullet, quadrant, scatter, matrix-grid | M R T (3) | — |
| gantt | M(edge + accent bar) R T (3) | — |
| funnel, piechart, map | M T (2) | no furniture to vary |
| line, slope | R T + stroke weight (3) | M is frozen: a stroke has no body |
| radar | R T + stroke weight (3) | M frozen by I1 — its alpha is settled |
| kanban, progress, state-chart, roadmap, timeline-list | M(edge + accent bar) T (2) | the card's wash is contrast-bound (I3) |
| journey | M(lane edge) T + curve weight (2–3) | its marks are unfilled today |
| **word-cloud** | **weight cycle (1)** | **its marks ARE text** |

**`word-cloud` is the honest floor of this design, and it is a floor by
construction rather than by neglect.** Its words are already in the ink register.
Repainting them at the 82% solid would move solved text onto the tier measured as
failing AA in 117 of 224 theme × mode × slot combinations, so no paper may touch
their color. Because stripping E and F leaves it at **zero** mark-level levers, it
is given one of its own: a **weight cycle** — `folio` sets the words at the type's
standard weights, `survey` one step lighter with tabular figures for any count,
`spread` one step heavier. That is a real mark difference that survives
monochrome. With F and E it renders three visibly different ways; at the mark
level it carries one lever, and I would rather state that than dress it up.

**No member falls below one mark-level lever plus the two figure-level ones, and
20 of 21 carry two or more mark-level levers.** That is the specific claim the
previous four-finish attempt could not make.

---

## Accessibility and print, per paper

The redundant channel each member owes — position → direct label → value →
shape or line-style → **texture, last** — is correctness, so it does not move
with the paper.

**The texture channel needs no work.** `themes/a11y-base.css` wires
`--cat-1-texture` … `--cat-9-texture`, and `lib/base/base.print-textures.css`
points nine slots at `#latt-a11y-tex-1 … -9` (and defines twelve). There is no
six-wide cycle and no 7/8-wears-1/2 merge. An earlier draft claimed both; it was
wrong, and the item is deleted rather than restated.

What *does* differ, and it is the ordering measured above:

- **`folio` on `a11y-achromatopsia`** puts the category on the 82% solid, the
  least-separated of the two carrying tiers there (0.055–0.057 vs the ink's
  0.069). So `folio` leans hardest on the texture rung. It is correct, and it is
  the most dependent on its backup.
- **`spread` degrades to inset `folio`.** With no hue, the tinted ladder collapses
  to the neutral one and the ground becomes a pale gray plate. Only the inset
  survives as a shape difference. Say it plainly: `spread` is the paper with the
  least left when hue is gone, and it is not the paper to pick for these decks.
- **`survey` degrades best on separation.** Its category rides the outline ink,
  the better-separated tier on this palette, and the outline **fences the
  texture** so a pattern reads inside a hard boundary instead of bleeding to an
  unmarked edge. **The recommendation — a monochrome-print or a11y-palette deck
  should be set `chart-finish: survey` — is provisional** and ships only after
  the presence measure below clears, because separation alone does not establish
  that a thin ink outline is strong enough on the canvas.
- **The presence caveat, from the tree's own evidence.**
  `word-cloud.styles.css` re-points slots 1–7 to the raw `--chart-cat-N-hue`
  under `section.dark`, with a comment that the derived ink "resolves to
  `color-mix(catN-hue 78%, white)`, which reads as pastel against navy". The tree
  has already judged the ink tier insufficient for a large text mark on dark —
  a defect adjacent OKLab distance cannot see. `survey`'s whole thesis is a thin
  ink outline on both canvases, so **`survey`'s dark outline must be re-scored
  with the presence measure** before ratification. If it reads pastel, the lever
  is `--chart-mark-outline` toward the raw hue on dark, declared once in the
  paper — not a member override.
- **word-cloud's dark override is a defect the language absorbs, not a sanctioned
  exception.** It re-points a family token below the derivation (see the
  architecture rule below) and it cycles seven slots against G1. Both are fixed;
  the *substance* of its complaint — the ink is pastel on dark — moves into the
  family derivation where every member benefits. An earlier draft cited this file
  as both a legitimate pick that stays and evidence the ink is already solved; it
  is neither.
- **Print.** `spread`'s ground re-points `--chart-frame-bg` to `transparent` —
  one declaration, the inset survives. `survey`'s hairline edge and full
  reference apparatus are exactly what a print figure wants. `folio` prints as
  it screens.

---

## The architecture — a paper is token declarations, and nothing else

The chain, in four layers. **No rule in a finish block names a member.**

```
1 · THE SLOT + 2 · THE DERIVATION (family, once, ×8, ON THE SAME SELECTOR)
    [data-cat="0"] {
      --mark-hue: var(--chart-cat-1-hue);
      --mark-ink: var(--chart-cat-1-ink);
      --mark-fill:   light-dark(
                       color-mix(in oklab, var(--mark-hue) var(--chart-mark-body-l), var(--bg)),
                       color-mix(in oklab, var(--mark-hue) var(--chart-mark-body-d), black));
      --mark-stroke: color-mix(in oklab, var(--mark-ink) var(--chart-mark-outline), var(--chart-cat-base));
      --mark-surface: var(--mark-fill);          /* HTML substrate */
      --mark-edge:    var(--mark-stroke);        /* HTML substrate */
    }
    …×8

3 · THE PAPER (a [data-chart-finish="…"] block — ~21 declarations, zero member names)
    folio  : --chart-mark-body-l:82%; --chart-mark-body-d:82%; --chart-mark-outline:0%;   …
    spread : (the same three) + the tinted ladder, --chart-figure-hue, --chart-frame-bg, --chart-frame-inset
    survey : --chart-mark-body-l:24%; --chart-mark-body-d:40%; --chart-mark-outline:100%; …

4 · THE MEMBER (two lines PER SUBSTRATE)
    SVG : fill: var(--mark-fill); stroke: var(--mark-stroke);
          stroke-width: var(--chart-mark-outline-w); vector-effect: non-scaling-stroke;
    HTML: background-color: var(--mark-surface); border-color: var(--mark-edge);
```

**Layers 1 and 2 sit on the SAME selector, and that is load-bearing.** Custom
properties substitute `var()` at computed-value time on the element where the
declaration sits, and the substituted value then inherits. Declaring
`--mark-fill` once on the family root would resolve `--mark-hue` *there* — slot 1
— and every `[data-cat]` descendant would inherit slot 1's fill. An earlier draft
placed layer 2 at "family, once" on the root; that is a trap, and it is why the
selector is now printed rather than described.

**Rule A1 — a member may re-point a slot token only ABOVE the derivation, and
every such re-point is listed.** Once a member can re-point what the derivation
consumes, `--mark-ink` silently means something different there. There is one
today (`word-cloud`'s dark override), and it is being removed, so the list is
expected to be empty; the rule keeps it a checkable list rather than a hole.

**Layer 4 is two lines per substrate, not two lines full stop.** The six HTML
members and two hybrids paint `background-color` / `border-color` /
`border-left` — `progress.styles.css` and `roadmap.styles.css` already use
`border-left: var(--chart-fill-accent)` — so the HTML pair (`--mark-surface`,
`--mark-edge`) is a first-class part of the derivation, not an afterthought.

`--chart-mark-outline: 0%` resolves the stroke to `--chart-cat-base` — which is
exactly the canvas hairline seam `funnel` and `piechart` paint today. One
percentage turns a seam into an outline across all eight slots and every area
member at once.

**The full token surface a paper declares:** five for the mark (`body-l`,
`body-d`, `outline`, `outline-w`, `point-r`), two for the point substrate
(`point-core`, `point-ring`), two for the HTML substrate (`surface-mix`,
`edge-mix`), one for stroke weight, six for the chrome ladder plus
`--chart-furniture-presence`, four for the frame (`bg`, `edge`, `radius`,
`inset`), two for the framing text, and `--chart-figure-hue`. Twenty-three
declarations.

**The register is `chart-finish:`, not `charts:`.** `lib/core/resolve-finish.js`
already ships a deck-level `finish:` register for backdrops. An author who has
read the brief's "chart finishes" would otherwise type `finish: survey` and get
either a value error on the wrong register or, worse, a valid backdrop value that
silently does something unrelated. `chart-finish:` makes the word match the
concept; the concept is called a **paper** throughout this document precisely so
the two never collide in prose either.

`chart-finish:` is the fifteenth front-matter register, not a new mechanism. The
engine already ships fourteen with the same shape — a closed value set, a default
on omission, a typo caught by name, a per-slide override, a ~70-line resolver in
`lib/core/resolve-*.js`, and a Studio control. `resolve-cards.js` (141 lines) is
the template.

**Interaction with `mode: sketch`, stated:** **sketch wins on the frame and the
ladder; the paper keeps its mark treatment.** So `chart-finish: survey` under
sketch draws its outlined marks and open rings, but takes sketch's hand-drawn
frame and sketch's `--font-label` ladder rather than a hairline plate and tabular
figures. `spread`'s ground survives under sketch, its inset does not. Nothing in
any paper touches `gantt`'s tick, whose docblock warns that its character-advance
constant is selected off the sketch class — the ladder changes the tick's *color
rung*, never its advance selection.

---

## Cost

**The emitter contract — the largest single item, and it is on this design's
critical path.** Only **6 of 21 members emit `data-cat`** (bar, bullet, line,
piechart, scatter, stacked-bar); the other **15 identify their slots with
`nth-of-type` / `nth-child` rotations or inline paint. All 15 must gain an
emitter** — transform change, snapshot churn, tests — before layer 1 resolves for
them, and **no paper renders on those 15 until it lands.** Rough size: 15
transforms, each a per-mark attribute on an existing element, plus their gallery
snapshots. *Note, beside the number rather than instead of it:* this is the same
prerequisite the a11y texture block needs to go from "ten rules per member" to
"one rule per slot for every member at once. One piece of work, two payoffs — but
the work is counted here.

**What collapses.** There are **112 direct references to a numbered categorical
slot** (`--chart-cat-N-{hue,ink,fill}`) across **19 files** in
`lib/components/chart/`. The majority are 6- or 8-row rotations — funnel's six
`nth-of-type` bands, piechart's six wedges, line's six series inks, stacked-bar's
six names, timeline-list's six dots, matrix-grid's eight rows, quadrant's four
cells — and they collapse into the one 8-row family block. A handful are
legitimate single-slot picks (scatter's size key, which is re-pointed to a
neutral) and stay. **The language is a net deletion in the member layer.**

**Members that change, by what they must consume:**

| Group | Members | What they pay |
|---|---|---|
| SVG area | bar, stacked-bar, waterfall, funnel, piechart, map | swap a hand-written 82% mix for `var(--mark-fill)` / `var(--mark-stroke)`; add `vector-effect` and the S1 fallback |
| Point | scatter, quadrant dots | `--chart-point-core` / `-ring` / `-r`; scatter also re-points its size key |
| Stroke | line, slope, radar | `--chart-stroke-w`; radar's fill is untouched |
| Card / table, on the recipe | gantt, progress, state-chart, roadmap | **adopt `--mark-surface` / `--mark-edge`** — they already consume the canonical fill constants (5, 2, 13 and 4 references), but their per-paper edge and accent bar are new tokens, so this is a costed row, not a free one |
| Card / table, not yet on the recipe | kanban, timeline-list, matrix-grid, journey | adopt `--chart-fill-top-l/-d`, `-bottom-l/-d`, `-edge`, `-accent` first — each carries **zero** references to them today, despite the family stylesheet naming kanban as the member that set the language |
| Text-mark | word-cloud | the G1 collapse from 7 cycling slots to 6, the weight cycle, and removal of its dark re-point (its substance moves into the family derivation) |
| All 15 non-emitters | — | the emitter contract row above |

**Family-level:** the chrome ladder's eight literals become six ladder tokens in
`chart-family.css`; `section.chart-frame`'s `background: var(--bg)` becomes
`var(--chart-frame-bg)` and gains an edge, a radius and an inset;
`.chart-key-label` gains K0; `.chart-caption::before`'s `width: 7.5cqi` becomes a
token.

**Decks re-rendered.** **48 of the 168 committed `examples/*.md` decks carry a
chart member**, so 48 committed PDFs churn, plus `chart.gallery.light.pdf` /
`chart.gallery.dark.pdf` and the cross-bucket showcase decks. HARD RULE #8 keeps
the galleries in a separate post-review commit. HARD RULE #9 applies — this is
visible on a slide, so it owes `examples/chart-papers.md` plus a committed PDF,
6–10 slides, showing all three papers on a gradient member, a no-gradient member
and an HTML member, in both modes.

**What a NEW chart pays: two lines and two questions.** It emits `data-cat` on
its categorical marks and paints the pair for its substrate — `var(--mark-fill)`
/ `var(--mark-stroke)` for SVG, `var(--mark-surface)` / `var(--mark-edge)` for
HTML. It answers **R0** (does the mark carry text inside it?) and **G0** (does it
carry its own name?). It writes **zero finish rules** and inherits all three
papers. A chart that introduces a genuinely new taxonomy cell — a second layered
member, say — is the only kind of novel that should cost anything.

**Why `folio` is the default.** The correctness layer changes every chart deck
regardless — the chrome ladder, K0, G1, the grouping relocations, the mark
tokens — so the "defaulting to folio restyles everything" objection is already
paid. Given that, default to the reference practice rather than to inertia.

---

## What I do not claim, and the risks worth naming

- **Nothing here has been rendered.** Every visual statement above is derived
  from resolved tokens and existing rules, not from a slide I looked at. Under
  HARD RULE #23 this design is **UNVERIFIED** and owes a rendered A/B of all
  three papers across at least `scatter` (including a dense overlap region),
  `funnel`, `kanban` and `word-cloud`, light and dark, before anyone ratifies it.
- **Three measurements are owed before ratification, and each can change the
  design:** the ink-on-ground re-resolution at 4%/7% (F3), the ladder tint
  proportions against the neutral rung, and the presence measure on `survey`'s
  dark outline. The `chart-finish: survey` recommendation for print and a11y
  decks is provisional on the third.
- **The tier table is a 12-file sample, not the tree.** `themes/` carries 15
  palette families. The script is committed; widening the sample is cheap and the
  three conclusions should be re-derived, not restated, if it is.
- **`survey`'s drawn area is the risk to check on the render.** A 24% body at
  projection distance may read weak even with a full-ink outline. The measurement
  says the *category separation* orders better; it says nothing about presence in
  a large room. If it reads thin, the lever is `--chart-mark-outline-w`, not the
  body.
- **S1's minimum drawn dimension is a placeholder.** 6 device-space units is a
  guess until it is checked against the thinnest real segment in
  `chart.gallery.md`.
- **`spread`'s ground over the `.canvas` glass panel and over a background image
  is unmeasured.** A 4% tint composited onto a translucent frosted surface may
  vanish or double. That is a render question, not a token question.
- **`color-mix(in oklab, <ink> 0%, var(--chart-cat-base))` is assumed to resolve
  to the base.** I have not executed it in a browser. If it does not, the paper
  declares the base color directly and loses nothing but elegance.
- **Two claims in the grounding docs are stale and this design does not lean on
  them.** `tools/chart-mark-separation.js` *does* composite `stop-opacity` over
  the section background, so an alpha ramp is scorable today. And
  `chart-family.style.md`'s "adjacent-slot OKLab ≥ 0.15" is a curation
  aspiration; the gate's operative floor for *raw slots* is 0.06, and there is no
  gate floor for derived tiers at all.
- **The brief's three-ink table mixes two tiers.** `--chart-cat-N-ink` belongs
  to the chart family; `--cat-on-fill` / `--cat-on-mark` belong to the universal
  categorical tier (`lib/base/base.tokens.css`), which `roadmap` and
  `matrix-grid` reach into. This design builds only on the chart-family tier and
  leaves the universal one where it is — except that F3's re-resolution must
  cover `--cat-on-fill` surfaces that sit on `spread`'s ground.
- **The `.chart-header` element no longer exists** — the chart's eyebrow, title
  and subtitle hoist into the standard `.cell-masthead > .masthead-lede`, and
  the lucent strip is retired. So the papers cannot differ on the masthead, only
  on the chrome the chart still owns: the eyebrow's `code` ink and the caption's
  rule. That is why lever **E** is figure-level and small — smaller than a
  graphics editor's instinct wants it to be.