<!-- Design-competition candidate, 2026-09-07. Track 3 — motion-designer.
     Title: Read Order — a chart design language built on five strata and two build laws
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# READ ORDER — the Lattice chart design language

**Track 3 · motion-designer perspective**

---

## 1. The one idea

A chart is a claim delivered in an order. The reader takes five things off it, always in
the same sequence:

| # | Stratum | What it is | Examples |
|---|---|---|---|
| 1 | **GROUND** | the canvas the chart sits on | `--bg`, the frame inset |
| 2 | **FRAME** | the reference the marks are read against | gridlines, axis rules, the zero rule, the polar web, quadrant zones, bullet bands, a map's un-marked landmass |
| 3 | **MARK** | the data | bars, wedges, dots, lines, cells, cards |
| 4 | **EMPHASIS** | which mark carries the point | the hero series, the flagged wedge |
| 5 | **NAME** | what each mark is called | direct labels, the key, tick labels, axis titles |

**The language is two rules, one in space and one in time.** They are a pair, not one law
wearing two hats — the loudness ordering is not monotone in the stratum number (EMPHASIS is
the loudest thing on the slide and NAME, the last stratum, is quieter than the MARK it names),
so stating it as a single "no stratum out-paints the one below it" reads false in both
directions.

> **LOUDNESS.** frame < mark < emphasis. And a name never out-paints what it names.
>
> **ARRIVAL.** The frame is present before the first mark. Marks arrive before emphasis.
> Names land last.

This is why the quadrant is wrong today and why the fix is not a taste call. Its four zone
tints are stratum 2 painted at stratum-3 strength — `color-mix(hue 42→82%, --chart-cat-base)`
on a backdrop, against `--chart-cat-N-fill` at 24%/40% on the dots that carry the data. The
backdrop out-paints the figure. ARRIVAL is why a pie's wedges must not stagger: a hole
mid-build says a piece is missing, which contradicts the claim "these sum to one thing."

Everything below is those two rules resolved against **data shape**.

---

## 2. The seven data shapes

Every rule in this document keys on this column. It is derivable from a member's manifest,
never from its name, so member 22 inherits every rule by declaring its shape.

| Shape | What the reader must do | Members |
|---|---|---|
| **MAGNITUDE** | compare quantities against a shared reference | bar, stacked-bar, waterfall, bullet, funnel, progress |
| **PART-OF-WHOLE** | see that the parts close a whole | piechart |
| **POSITION** | read a coordinate in a space | scatter, quadrant, radar |
| **PATH** | follow a value through an ordered domain | line, slope, journey |
| **SPAN** | read a start and an end on a time axis | gantt, roadmap, timeline-list |
| **NETWORK** | read nodes and the relations between them | state-chart |
| **FIELD** | read labeled regions with no shared scale | map, matrix-grid, kanban, word-cloud |

21 of 21. Shape is a property of the *claim*, not the geometry: radar is POSITION (a polar
coordinate per axis), not PART-OF-WHOLE, even though it draws a closed figure.

Two sub-flags, and they are the only qualifiers any rule below needs:

- a FIELD may declare an **ordinal axis** (kanban's stages are ordered; a map's countries are not);
- POSITION splits **cartesian** (scatter, quadrant) from **polar** (radar). Radar is the member
  every taxonomy strains against, and the strain is real rather than a classification error: it
  plots n *series* over a shared polar frame, where scatter plots n *points*. §6 and §7 both key
  on this sub-flag rather than pretending radar behaves like scatter.

---

## 3. Q1 — Mark and fill finish

### The finish is chosen by what the fill ENCODES, per mark, not per member

Three finishes. Nothing else is admissible.

| The fill encodes… | Finish | Recipe |
|---|---|---|
| **which** (category) | **FLAT** | `--chart-cat-N-fill` + a `--chart-mark-edge` hairline at `--chart-cat-N-hue` |
| **how much / what state** (magnitude, status) | **VERTICAL WASH — kept, unchanged** | the canonical recipe: `--chart-fill-top-l/d` → `--chart-fill-bottom-l/d`, `--chart-fill-edge`, `--chart-fill-accent` |
| **something read THROUGH another mark** (overlay) | **FLAT ALPHA** at one value | one `fill-opacity`, no gradient |

Per-mark, not per-member, is what settles the `bar` / `stacked-bar` exhibit. They disagree
today because one wears the magnitude finish and one the category finish, and neither knew
which it was. Under this rule a single-series bar wears the wash (its fill means *how much*)
and a bar whose bars are categories wears flat (its fill means *which*) — and stacked-bar,
whose segments are always categories, wears flat, which is what it already does.

### The gradient verdict: the dome dies family-wide; the wash lives; radar is a third answer

**The census's "radial-gradient" label conflates two different design objects, and that has
been driving the argument.** It reads paint servers, so it reports both as radial:

- **pie + quadrant** — `color-mix(in oklab, hue 42% / 58% / 82%, var(--chart-cat-base))`
  (`piechart.transform.js` ~line 119, `quadrant.transform.js` ~line 512). A **lightness ramp**
  across the mark.
- **radar** — the same hue at `stop-opacity` 0.10 / 0.14 / 0.20 (`radar.transform.js` ~line 576).
  An **alpha ramp**, roughly six points of opacity end to end.

They are not the same thing and they do not fail the same way.

**Measured** (`node tools/chart-mark-separation.js --theme onyx --type achromatopsia`,
reproduced this session):

| member | self-range | nearest separation | verdict |
|---|---|---|---|
| piechart | 0.286 | 0.097 | **SWAMPED** |
| quadrant | 0.286 | 0.097 | **SWAMPED** |
| **radar** | **0.000** | 0.049 | COLLAPSED — a *palette* collapse, not a fill one |

**The dome is deleted.** On onyx — the theme whose whole identity is that categories differ
by value rather than hue — a wedge's own shading covers 2.9× more perceptual ground than the
step to its neighbor. No palette work reaches that; only the finish does.

**But the replacement is a stop of the existing ramp, not `--chart-cat-N-fill`.** Flattening
to the flat token would be a substitution wearing a deletion's clothes, and it costs three
things: the wedge drops from a 42–82% paint over `--chart-cat-base` to a 24% tint over `--bg`
on the light face; the pie's own legend swatch keeps its 82% recipe
(`piechart.transform.js` ~line 75) so key and wedge stop matching; and an 11-category mark
moves onto the narrower of the two tiers `test/unit/palette/cat-adjacency-floor.test.js`
gates — the tier whose docblock says the wash *is* the whole discrimination channel where no
stroke separates marks, which is exactly the pie's case.

> **Flatten pie and quadrant to a single stop of their own ramp over `--chart-cat-base`** —
> the 58% mid, or the 82% rim if the key swatch is to stay literally identical. Same
> substrate, same weight, no new token, and the gradient is gone.

The choice between 58% and 82% is a measurement, not a preference, and it is owed before this
ships: run `tools/chart-mark-separation.js` over the chart stress deck
(`tools/build-stress-deck.js --bucket chart`) at the pie's documented 11-slice ceiling, on
`a11y-achromatopsia` and `cuoio` as well as `onyx`, and publish the before/after rows. The whole
dome argument rests on that tool; the replacement owes a reading from it.

**The vertical wash survives, and the reason is mechanism, not mercy.** Run the same tool
over the six wash-bearing members (bar, gantt, progress, state-chart, timeline-list,
waterfall) and every one comes back `single category` or `no categorical marks`. **Not one of
them has an adjacent-category read for a wash to swamp.** The wash sits on marks whose fill
means *how much* or *what state*, where self-range costs nothing because there is no
neighbor to be confused with. And on `progress` it is doing real work: the gradient's
leading-edge intensity scales with `--pct` (`progress.styles.css` ~line 77), double-encoding
value as length *and* intensity. A rule that killed the wash would delete a working
double-encoding to fix a defect the wash does not have.

**Radar gets a third answer, and it is better than either "keep" or "kill".** The alpha
ramp is defensible on one ground: the rim reads slightly stronger than the hub, which
emphasizes the extremity, and extremity is what a radar is about. It is indefensible on
measurement: it buys that emphasis on a channel worth 0.000 in the separation tool, worth
nothing in grayscale, and worth nothing in print — while costing a `<radialGradient>` per
series, a unique `<defs>` id per render, and a place in `namespaceInternalRefs`'s
id-rewriting machinery in `chart-anima.ts`. So:

> **Flatten radar's areas to one alpha, and buy the rim emphasis back with the stroke** —
> `--chart-mark-edge` on `.radar-poly`, which is already stroked, and which survives
> grayscale, print, and every a11y palette. Move the emphasis to the channel that survives.

The human's instinct — kill it on pie and quadrant, keep it on radar — is right about the
harm and right about radar being different, and lands on the wrong remedy for the right
reason. Radar is different because its ramp is alpha, not lightness. That difference is
exactly why the ramp is *safe to delete*, not why it is worth keeping.

### The backdrop rule (the quadrant test, stated in a unit that can be measured)

The first draft of this rule compared mix **percentages** — 24% against 8% — and that ratio is
not a quantity. The two percentages are taken against different substrates: a zone tint is a
percentage into `--chart-cat-base` (`quadrant.transform.js` ~line 514) while
`--chart-cat-N-fill` is a percentage into `--bg` on light and into black on dark. 8% of a hue
over a tinted plate can read louder than 24% of it over the canvas, and the relation inverts on
the dark face where `--chart-cat-base` is black. Stated properly, in the unit the tool already
reports:

> **A stratum-3 mark's OKLab distance from its own stratum-2 backdrop must be at least N times
> that backdrop's OKLab distance from the canvas** — measured per theme and per simulated
> condition, on both canvases.

`N` is derived, not asserted, the way `cat-adjacency-floor.test.js` derives its two floors: take
the members that already read correctly (bar over its gridlines, scatter over its plot), measure
their ratios, and set `N` at the low end of that band. `--chart-zone-tint` is then the tuning
knob a theme turns, and its default is whatever value puts the quadrant at or above `N` on the
worst of the 13 themes — a measurement, not the 8% the first draft picked.

**This is gateable.** `tools/chart-mark-separation.js` already computes a mark's
representative color after the cascade; the rule needs a third number — OKLab separation from
the mark's own backdrop — beside the two it reports.

---

## 4. Q2 — Type

The census measures **eight** roles, not five: `value`, `value-2nd`, `category`, `tick`,
`series`, `heading`, `axis-title` (SPLIT), `legend` (SPLIT). All eight get a ruling.

**Ratify the six that are already coherent.** `value` → display face, `value-2nd` → display
face at the value's weight minus one step, `category` → body, `series` → body, `tick` →
label/mono, `heading` → body at the section weight. `value-2nd` is the home bullet, funnel and
stacked-bar each arrived at independently — a conversion rate, a plan marker, a part of a whole —
and naming it is what stops the next member inventing a seventh face for the same job.

**Fix the two splits:**

- **`axis-title` → the label face, uppercase-tracked** (`.cart-axis-title` as it stands).
  scatter, slope and stacked-bar already paint it; quadrant paints body and changes. An axis
  title is chrome naming a scale, and the family already sets chrome in the label face — the
  chart eyebrow does exactly this.
- **`legend` → the label face**, which is the census's "most visible incoherence in the family"
  and therefore a decision, not a ratification. `svg-legend.js` already sets it, so the SVG
  members are correct today; the change lands in the four HTML/hybrid members that style their
  own key: **gantt, journey, roadmap, state-chart**. All four are costed in §11.
- **radar's split `tick` is a misclassification, not a face problem.** Radar carries both a
  label-face tick and a body-face one; the body-face node is an *axis label* — it names a
  category, not a scale position. Re-class it `.cart-cat` and the split disappears without
  touching a font.

### Which roles a member is OBLIGED to print, keyed on shape

This is the harder question the census names, and it is the actual source of the "several
authors" impression — not the faces, but which subset each member happened to use.

| Shape | value | value-2nd | tick | category | series | axis-title |
|---|---|---|---|---|---|---|
| MAGNITUDE | **required** | when a target/plan/rate is drawn | required if a value axis is drawn | **required** | if >1 series | required unless the unit is in the subtitle |
| PART-OF-WHOLE | **required** (the share) | when a part is called out | — | **required** | — | — |
| POSITION | required only on an emphasized mark | — | **required** | **required** | if >1 series | **required** — a coordinate with no named axes is unreadable |
| PATH | **required at the endpoints only** | — | **required** | at the domain ends | **required** | **required** |
| SPAN | **required** (dates or duration) | — | **required** (the time axis) | **required** (the row name) | — | — |
| NETWORK | — | — | — | **required** (node name) | — | — |
| FIELD | required when the field encodes a magnitude | — | — | **required** | — | — |

`heading` is not in this table on purpose: it is optional everywhere, a member-level affordance
(roadmap uses it) rather than a shape obligation.

Deltas this forces, and all of them are counted in §11: quadrant gains axis titles; line and
journey gain axis titles (PATH); roadmap gains value and tick (SPAN); word-cloud prints the
weight it encodes but never names (FIELD, magnitude).

**`--chart-text-min` stays a floor, not a role** (HARD RULE #4). Nothing here mints an
`--fs-*`.

---

## 5. Q3 — Furniture

Keyed on the reader's task, which is a property of the shape:

| Reader must… | gridlines | axis rule | zero rule | ticks | Shapes |
|---|---|---|---|---|---|
| compare magnitudes against a shared scale | ✓ | ✓ when values do not fit beside the marks | ✓ always | ✓ with the axis | MAGNITUDE |
| read a coordinate | ✓ both axes | ✓ both | — | ✓ | POSITION-cartesian (scatter, quadrant); radar's web is its gridlines |
| follow a path | ✓ value axis only | ✓ | ✓ when values cross zero | ✓ | PATH |
| read a span | — (rows are not a scale) | ✓ time axis | — | ✓ time axis | SPAN |
| only rank, or read no shared scale | — | — | — | — | PART-OF-WHOLE, NETWORK, FIELD |

**There is no "bar gains gridlines" delta, and the reason is that bar already implements this
rule.** An earlier draft called that the language's one loud delta; it was built on a census
reading the brief itself retracts. `bar.transform.js` draws `referenceLines` via `cart.buildGrid`
(~line 398) and decides its own value axis from the data with `wantsValueAxis` (~line 211). The
census reports `baseline` for bar, not nothing.

So §5 **generalizes bar's rule to every MAGNITUDE member** rather than overriding it, and it
carries bar's hard-won carve-out forward verbatim, because it is the kind of thing a general rule
loses:

> **On a MAGNITUDE member the axis rule IS the zero rule, never the plot edge.** `buildAxisRule`
> draws at the edge, which is the zero line only while every value is positive. Drawing both on a
> signed series gives a floating zero rule *and* a meaningless rule under the negative bars —
> two baselines, which is one more than a bar chart has. `buildGrid` emits zero as its own
> emphasized `cart-zero` and covers both cases in one call.

`matrix-grid`'s existing gridlines are re-classed — they are cell separators in a FIELD, so they
paint at `--chart-rule-grid` (frame weight), not as a scale.

Furniture belongs to stratum 2 and therefore takes the **frame weight tokens** (§10), never a
categorical hue. `matrix-grid` spending six categorical hues on its row labels and cell
outlines is a stratum violation — color on the axis the reader decides least from — and it is
the same defect `2026-06-22-kanban-chart-redesign.md` records fixing once already.

**Furniture reserves gutter, so it is not paint-only.** `wantsValueAxis` feeds
`cart.plotBox({ gutter: GUT_COL_NOAXIS })`: any member that gains or loses an axis changes its
plot box. `npm run check:chart-fit` and `overflow:check` are therefore **required evidence** for
this section, not an expectation (§11).

---

## 6. Q4 — Key

| Condition | Key |
|---|---|
| the mark is already named by a category axis | **nothing** |
| the mark has a free edge and n ≤ 8 | **direct labels** |
| marks tile with no free edge, or n > 8 | **one rail** |

By shape: MAGNITUDE with a category axis → nothing (bar, funnel, waterfall, bullet, progress).
POSITION-cartesian and PATH → direct labels (scatter, quadrant, line, slope, journey —
`svg-label.js`'s `placeLabels` + `leaderLine` already make this work on a crowded plot).
PART-OF-WHOLE, FIELD, NETWORK → the rail (piechart, map, matrix-grid, kanban, state-chart).
SPAN → the row name is the key, which means **gantt's rail is deleted, not relocated**.

**POSITION-polar keeps the rail, and that is the sub-flag earning its place.** Radar plots n
*series* over a shared frame, not n points; a direct label per series has no free edge to sit
against — every polygon overlaps every other one. So radar takes the rail with piechart and map,
and the taxonomy stops leaking at the one member it was leaking at.

**One rail, one geometry: a right rail with a vertical hairline.** The family currently has
three physically different "rails" — the right rail (piechart, radar, map), gantt's centered
row below the plot, matrix-grid's inline bottom-left mono-italic caption. gantt's goes away
entirely; matrix-grid's becomes the right rail. `svg-legend.js` already emits `data-cat` on its
rows, so the rail is the shape that also carries the texture channel for free (§9).

---

## 7. Q5 — Motion: the build vocabulary

### 7.1 The build law

> **The build's order is the chart's claim. A chart whose claim has no order has no stagger,
> and a chart that animates a quantity it is not comparing is decoration.**

Two tests every build must pass:

1. **Does the order teach?** If the marks could arrive in any order without changing what the
   reader concludes, they arrive together.
2. **Does the motion animate the compared quantity?** A bar chart's claim is *length*. A
   staggered opacity fade shows every bar at full length from frame one, at 20% alpha — the
   length was never in question, so the build taught nothing. A bar that grows from the
   baseline animates the exact quantity being compared.

Today's default fails test 2 for every member: `chart-anima.ts` emits `reveal` (opacity),
optionally `slide`, and `highlight`. Nothing animates a measured quantity.

### 7.2 The four gestures

| Gesture | What moves | Shapes | Verbs |
|---|---|---|---|
| **SETTLE** | opacity only, all marks together | PART-OF-WHOLE, FIELD (no ordinal axis), NETWORK nodes | `reveal` |
| **GROW** | the mark scales from its reference edge, staggered in the claim's order | MAGNITUDE, POSITION-polar (radar grows from center) | `reveal` + `grow` |
| **TRACE** | the mark draws along its own path, in the domain's direction | PATH, SPAN, NETWORK edges | `trace` |
| **LAND** | marks appear at their coordinates, no travel that implies a false order | POSITION-cartesian (scatter, quadrant) | `reveal` + `grow(center)` |

Four gestures, seven shapes, no per-member preference. Every member's gesture is derived.

### 7.3 Stagger order, per shape — the order IS the claim

| Shape | Order | Why |
|---|---|---|
| MAGNITUDE, monotone (funnel) | top → bottom | the drop-off is the story (already correct) |
| MAGNITUDE, cumulative (waterfall) | left → right, each bar starting where the last ended | the running total is the claim |
| MAGNITUDE, ranked (bar, bullet, progress) | the order the chart already reads in | the ranking is the author's argument |
| MAGNITUDE, composed (stacked-bar) | columns stagger; **segments inside a column arrive together** | a staggered segment is the pie's hole problem in a column |
| PART-OF-WHOLE | none | a staggered wedge says a piece is missing |
| POSITION | none — **land together** | a scatter has no order; staggering by document order invents one |
| PATH | along the domain, left → right | the domain is time; the trace re-enacts it |
| SPAN | by **start**, never by row | a gantt's claim is the schedule; row order is arbitrary |
| NETWORK | nodes settle → edges trace | topology reads node-then-relation |
| FIELD, no ordinal axis | none | a map has no order |
| FIELD, ordinal axis (kanban) | along that axis | the stages are a flow |
| FIELD, weighted (word-cloud) | largest first | weight is the only order a word cloud asserts |

**The PART-OF-WHOLE row is prior art, not a delta.** `chart-anima.ts` (~line 285) already
detects a `sector`-role first mark and sets `synchronized`, giving every mark the full
`buildSpan`. It is not counted as a change in §11, and it is the best evidence for this whole
document's thesis: the kernel *already* keys a behavior on archetype, one member at a time. The
shape table generalizes what `isSector` does, exactly as §5 generalizes `wantsValueAxis`.

### 7.4 Curves — three rules, each about meaning

- **`ease-out` for every arrival.** A mark decelerating into position reads as settling on a
  measured value.
- **`linear` for a trace.** Constant speed along a time axis is what a time axis means. An
  eased trace says time sped up.
- **Never `ease-in`, never `ease-in-out`, never overshoot.** `ease-in` implies the quantity is
  accelerating; `ease-in-out` implies both. **An overshoot on a data mark is a lie** — it says
  the value exceeded its true reading and came back. The closed easing set
  (`docs/src/lib/anima/easing.ts`: `linear`, `ease-in`, `ease-out`, `ease-in-out`) has no
  spring, which is fortunate; this rule keeps it that way.

### 7.5 Timing — the current defaults produce a queue, and the arithmetic says so

`chart-anima.ts` today: `buildSpan` 0.6, per-mark onset `slot = buildSpan / n`, per-mark span
`slot + 0.08`. `speedToDurationMs` gives slow 5400 / normal 3600 / fast 2000 /
auto `clamp(2400, 1600 + 640n, 5400)` ms.

| n marks | speed | total | per-mark onset | per-mark span |
|---|---|---|---|---|
| 3 | auto (3520 ms) | 3520 | **704 ms** | 985 ms |
| 8 | auto (5400 ms, clamped) | 5400 | **405 ms** | 837 ms |
| 8 | normal (3600 ms) | 3600 | **270 ms** | 558 ms |

The sign is backwards: **fewer marks make each mark slower**, because the onset is
`buildSpan/n`. Every stagger system in the discipline does the opposite. And at 270–704 ms
apart the marks arrive one at a time, each visibly waiting its turn — a queue rather than a
build.

**The fix is to invert which quantity is derived, with the onset as the primitive** so the
arithmetic is runnable rather than circular (an earlier draft defined the onset from the build
window and the build window from the onset):

```
onset spacing       clamp(45 ms, authoredTotal / n, 110 ms)      ← the primitive
per-mark duration   constant per gesture:  GROW 420 ms · SETTLE 300 ms · LAND 300 ms
                                           TRACE 520 ms per path
build window        markDuration + onset × (n − 1)               ← derived
names               start at buildEnd − 25% of markDuration, span 260 ms
total               buildWindow + nameSpan, × the speed multiplier
speed multiplier    slow 1.6 · normal 1.0 · fast 0.6 · auto 1.0
authoredTotal       the existing speed cascade, unchanged in meaning
```

For n = 8, GROW, normal: onset = clamp(45, 3600/8, 110) = 110 ms, build = 420 + 110×7 =
**1190 ms**, names land by ~1.5 s. Against today's 2160 ms build inside a 3600 ms timeline. That
is the difference between a chart building and a chart loading.

**The 45 / 110 ms clamp is a chosen default, not a measurement**, and it is stated as one. The
reasoning: 45 ms is roughly one 60 Hz frame times three, below which adjacent onsets are hard to
resolve as separate events; 110 ms is where a stagger stops reading as one gesture with internal
order and starts reading as discrete arrivals. Neither number is sourced, and if the review wants
them earned, the way to earn them is a side-by-side of the same eight-bar chart at 40 / 70 / 110 /
160 ms on the real Playground — not a citation.

**This changes the meaning of numbers the human already set** (`speedToDurationMs`'s
5400 / 3600 / 2000). Per CLAUDE.md's second filter, row 3, that is not mine to substitute
silently — it is listed in §12 as the one decision this track hands back, with the arithmetic
above as the evidence.

### 7.6 The frame never animates — and this is where the biggest defect is

`chartToScene` animates every `[data-mark], [data-anima-role]` node plus **every `<text>`**.
Measured `data-anima-role` counts from the census: **map 175, bullet 44, line 35,
stacked-bar 27, waterfall 25, slope 25**. A map has 9 marks and 175 roled regions; a bullet
has 5 measures and 44 roled nodes. The surplus is stratum 2 and stratum 5 — basemap regions,
qualitative bands, gridlines, tick labels, axis titles — fading in as if they were data.

**175 regions fading in is a shimmer, not a build.** And it breaks ARRIVAL directly: you cannot
read a mark arriving against a scale that is also arriving.

**The split is declared on the role, not inferred from an attribute.** An earlier draft defined a
mark as "carries `data-mark` or `data-cat`", which is wrong in both directions and would have
shipped two regressions. `data-cat` means *categorical slot*, and both marks and names carry it
legitimately: `svg-legend.js` (~line 161) stamps it on every `.chart-key-swatch`, so the key would
animate as figure — stratum 5 painted as stratum 3. In the other direction radar's data polygons
are `<polygon class="radar-poly" data-anima-role="region" data-series="N">` with neither attribute,
while radar's `data-mark` sits on its **axis labels** (`radar.transform.js` ~line 451) — so the
member would stay eligible while animating only its names, and §7.2's "radar grows from center"
would be deleted by the definition meant to enable it. `chart-anima.ts` (~lines 227–236) already
carries a docblock explaining why radar's polys cannot take `data-mark`: it would shift the
popover's index map.

> **A node is FRAME if its `data-anima-role` says so. Every kernel declares
> `data-anima-role="frame"` on gridlines, axis rules, qualitative bands, basemap regions,
> tick text and axis titles. Everything else in the candidate set is a MARK, and the frame is
> present at t = 0.**

The candidate set stays `[data-mark], [data-anima-role]` — unchanged, so nothing is
reclassified by accident. It reclassifies correctly where it matters: map's 175 regions → 9
marks (the un-marked basemap declares `frame`); bullet's `.bullet-band` reference ranges →
frame; quadrant's `.quadrant-tint` zones (`data-cell`, already `aria-hidden`) → frame;
bullet's `.bullet-measure` → mark; radar's polys → mark, untouched; legend swatches → names,
untouched.

It also fixes the `region` role's overload: the role currently means both "a data region"
(a map country) and "a reference region" (a bullet band), which is why 44 nodes animate for
5 measures.

### 7.7 Three SVG members are effectively un-animatable, and it is a selector mismatch

`hasAnimatableChart` (`anima-host-sel.ts` line 121) is `section.querySelector('svg [data-mark]')`.
`chartToScene` collects `[data-mark], [data-anima-role]`. The two disagree, and the
eligibility gate is the stricter one — it decides the candidate set on all three paths
(`prehideEligibleCharts`, `anima-scenes.ts` line 130 and line 185, `DeckPreview.tsx` line 476).

Census `data-mark` counts: **line 0, word-cloud 0, journey 0.** Read carefully, those are three
different situations:

- **`line` is eligible only when the author writes a detail bullet.** `line.transform.js`
  (~lines 958–961) emits its `line-hit` rect carrying `data-mark` *only* where a nested detail
  exists — "a chart without detail is byte-identical to one that never had the feature." The
  gallery's line has none, which is where the 0 comes from; a line *with* detail animates today.
  The defect is real but it is not absence: **motion is coupled to an unrelated authoring
  choice**, so the same deck gains and loses its build depending on whether someone wrote a
  tooltip. Separately, two of line's roles — `area` and `line` (`line.transform.js` lines
  813–840) — are not in `ChartRole` (`'bar' | 'sector' | 'point' | 'region' | 'label'`), so even
  when selected they fall through `roleForNode`'s `?? 'bar'` tail and animate as bars.
- **`word-cloud` emits no `data-mark` and no `data-anima-role`** — verified 0/0 independently of
  the gallery. It cannot be selected. `chart-family.docs.md`'s support table says "Motion: yes —
  words fade in." The table is wrong.
- **`journey` emits neither**, which the table does record correctly.

**Fix:** align `hasAnimatableChart` to the candidate set — `svg :is([data-mark], [data-anima-role])`
— rather than the reverse, so the gate and `chartToScene` stop disagreeing and line stops
depending on its tooltips. Add `area` and `line` to `ChartRole` (they are real geometries with
real gestures: an area settles, a line traces).

**So the family's motion gap is eight of twenty-one** — five with no `<svg>`, word-cloud and
journey with an `<svg>` and nothing roled, and line eligible only by authoring accident.

### 7.8 What the five non-SVG members do

**They do not become SVG.** The ruling is keyed on shape, not on convenience: kanban, roadmap
and timeline-list are FIELD/SPAN members whose content is prose that must wrap and reflow;
matrix-grid is a table; progress is a bar with a text readout. SVG cannot wrap text natively —
the family already pays for that with `svg-label.js`'s `<tspan>` wrapping and `placeLabels`,
and the two surviving hybrids are hybrid for exactly this reason (`state-chart`'s `<ol>`
measuring harness, `journey`'s HTML board). Converting five prose-bearing boards to SVG
multiplies that machinery by five and loses reflow to buy an opacity channel.

**The brief offers a second, cheaper route, and it has to be priced before the expensive one
wins.** A class-gated CSS build — `@keyframes` on the member's own units, the shape
`lib/base/base.build.css` already runs for the narrative build — costs **no new backend, no scene
ids, no export-bundle growth, and no `SourceModel`**. What it cannot do: take its stagger order
from the data (a CSS `nth-child` delay is document order, and §7.3's whole point is that document
order is wrong for SPAN and for FIELD-weighted), and it cannot share one timeline with the SVG
members on a slide that has both. A deck with a gantt beside a kanban would run two clocks.

**The shared timeline is what buys the DOM backend, and it is worth it** — a build whose order is
the claim cannot take its order from the DOM, and two clocks on one slide is the incoherence this
document exists to remove. So: a declared DOM build, driven by the same timeline. Nothing in the
scene shape is SVG-specific: `SvgScene` is
`{source, duration, hero, asset, elements: [{id, pathRef, motion}]}`, and the shared painter's
three channels are opacity, transform, and stroke-width. Two of the three apply to an HTML
element unchanged.

The change is contained:

1. `chartToScene` generalizes from "the first `<svg>` in the section" to "the chart body",
   partitioning candidates by node type. Ids are minted exactly as today.
2. A `dom-marks` backend, a sibling of `backends/marks.ts`, writing `opacity` and `transform`
   to HTML elements. It advertises the same caps minus `draw`.
3. `SourceModel` gains `'dom'`; `registry-svg.ts` returns it for a dom scene, so the chart
   entry still pulls neither Zdog nor the drawing library.
4. The five members stamp `data-mark` on their unit elements — kanban cards, roadmap phases,
   timeline items, matrix cells, progress rows.

Their gestures fall straight out of the shape table:

| Member | Shape | Gesture |
|---|---|---|
| **progress** | MAGNITUDE | **GROW** from the left edge, staggered top→bottom |
| **kanban** | FIELD + ordinal axis | SETTLE per column, columns left→right along the stage axis |
| **matrix-grid** | FIELD, no ordinal | SETTLE, every cell together |
| **roadmap** | SPAN | TRACE left→right by start |
| **timeline-list** | SPAN | TRACE down the spine (its domain is vertical) |

**progress's double-encoding is a tier-2 item, not a free one.** Growing the bar by driving
`--pct` itself — so length and leading-edge intensity ramp together — would be the truest build
in the family, and it is not available with the mechanism above. `--pct` is not
`@property`-registered (the repo registers only the `--z-*` set, `lib/base/base.tokens.css`
~lines 1284–1289 and ~1360), so CSS interpolates it discretely; and the `dom-marks` backend
advertises opacity and transform, which is two channels, not three. Either register `--pct` with
`syntax: "<number>"` and give the DOM backend an explicit custom-property channel — listed in
§7.10 tier 2, where its cost is visible — or ship progress with a plain transform GROW like every
other MAGNITUDE member. The recommendation is the plain GROW first and the token channel as a
tier-2 follow-on; the observation is good but it is not free.

**Print safety is structural, not a rule to remember.** The host writes inline `opacity` /
`transform` at mount; the PDF/PPTX path never mounts a host (`lattice-emulator.js` contains
zero references to anima). Absent a host, nothing is written, so the exported bytes are
unchanged. That is the same 0-pixel guarantee `lib/base/base.build.css` states for the
narrative build, obtained the same way.

**If the DOM backend's cost is refused**, the fallback is the CSS build above with its two
limitations stated — and if that is refused too, the honest alternative is to declare motion a
property of the SVG-bodied subset and say so in the `render` manifest field the family
already gates with `npm run check:render-nature` — not to leave five members silently still
while a stale prose table says otherwise.

### 7.9 Reduced motion: reduce, not remove — and today it removes

Three sources disagree about what a reduced-motion viewer sees.

| Source | Behavior |
|---|---|
| `chart-family.docs.md` | "A viewer whose system asks for reduced motion **still sees the build**: the tier is *reduce*, not *remove*." |
| `hydrate.ts` `effectiveTier` / `toLegible` | reduced → `legible` → strips only `spin`/`orbit`. Charts emit neither, so **the full build plays, unchanged.** `legible` is a no-op for charts. |
| `anima-scenes.ts` line 194 | `startSettled: settled \|\| reduce` → `mountSettled()` → the final frame, **no build at all.** |

The third one wins on the live Playground. And because charts pass `chrome: false`
(`chart-anima-hydrate.ts` line 89), the "Play the motion" opt-in `hydrate.ts` offers a
floor-suppressed scene is never mounted for a chart — so the viewer loses the build *and* the
choice.

**The language defines the `legible` chart projection explicitly**, on the principle that what
triggers a vestibular response is *travel and scale*, not *luminance change*:

| Channel | full | legible |
|---|---|---|
| reveal (opacity) | per gesture | **kept** |
| stagger order | per gesture | **kept, collapsed to ≤ 2 groups** — the order is content |
| `grow` (scale) | from the anchor | **dropped** — marks appear at final size |
| `trace` (path draw) | full draw | **dropped** → becomes `reveal` |
| `slide` (travel) | ≤ 20% of chart height | **dropped** |
| `highlight` | pulse | **kept** — a one-shot weight change, no travel |
| total duration | the speed cascade | **clamped to ≤ 400 ms** |

The reduced viewer still learns the order — which marks belong together, which came first —
and is spared every pixel of displacement. That is reduce, not remove, and it is the first
time the phrase has been true in the code.

Two consequential corrections:

- **`slide` and the new `grow` are *reducible* even though they are not *vestibular*.**
  `hydrate.ts` classifies `slide` as non-vestibular and it is right to — `legible` exists to
  quiet sustained oscillation, and `slide` is a one-shot windowed move. But `rise` displaces
  every mark by `vbH * 0.2` (a fifth of the chart height, deliberately large), and a screenful
  of marks all traveling that far is exactly the class of motion the OS setting is asking
  about. Rather than overload "vestibular", add a **`REDUCIBLE`** set alongside it, applied on
  the chart source only.
- **A floor-reduced chart keeps its control.** `chrome` becomes conditional — `false` while a
  chart plays its normal one-shot build, `true` when the floor reduced it, so the ↻ replay is
  reachable. One boolean.

**The poster stays the final frame** (`hero: 1`). That is what print and export use and it
must not move.

### 7.10 New motion machinery, in two separable tiers

**Tier 1 costs no new verbs** — every rule in §7.3–§7.7 and §7.9 is a change to reveal
windows, ordering, one selector, and one classification:

- the declared `frame` role and the frame/mark split
- the eligibility selector, aligning `hasAnimatableChart` with `chartToScene`
- `area` + `line` added to `ChartRole`
- per-shape stagger order and easing
- the `legible` projection and the conditional `chrome`

**Tier 2 buys the gestures that animate a measured quantity:**

- **`grow`** — one new verb, `{verb, anchor: 'baseline'|'origin'|'center', at, span, easing}`.
  It composes into the transform channel the shared painter already paints, which already
  reads `getBBox` for a slide's center and already guards it for jsdom.
- **`trace`** — the verb already exists (`vocabulary.ts` line 36: "draw, following path
  direction"), currently capability-gated to the anime.js drawable backend. Implement it
  natively in `svg-paint.ts` as a `stroke-dashoffset` channel from `getTotalLength()`, guarded
  exactly as `getBBox` is, and give it its own capability rather than reusing `'draw'` — so the
  chart path gains the trace without importing the drawing library that `registry-svg.ts`
  exists to keep out.
- **a custom-property channel** on the DOM backend, plus `@property` registration for `--pct` —
  the only thing that buys progress's length-and-intensity double-encoding (§7.8).

Tier 1 alone fixes the incoherence. Tier 2 is what makes the build teach.

---

## 8. Q6 — Detail reveal

> **A mark owes a popover when its value lives only in geometry.**

If the slide prints the number next to the mark, the popover is optional context the author
opts into. If the reader can only estimate — a scatter coordinate, a quadrant position, a map
region, a radar vertex, a wedge angle, a matrix cell, a word's weight — the popover is owed.

By shape: POSITION, PART-OF-WHOLE, FIELD, NETWORK **owe** one. MAGNITUDE, PATH and SPAN
**print** their values (§4's obligation table) and owe one only when the author writes a
`<template class="chart-detail">`.

Members that gain one under this rule: **matrix-grid, word-cloud, journey**. (kanban,
roadmap and timeline-list carry their own text on the card — nothing is hidden.)

**The authored grammar does not change.** `chart-interact.js` binds `[data-mark]` marks to an
inert sibling `<template class="chart-detail" data-mark="i">` inside `.chart-details`, keyed by
index. A gaining member emits the same pair.

**The print fallback already exists and needs no new mechanism.** The family's label pass
already routes a dropped label to `data-label`, the popover, *and the speaker note*. A member
gaining a popover routes its payload the same way, and the value also lands in the SVG `<desc>`
that `buildSvgRoot` requires — which is the only route to the data for a screen reader anyway,
since `role="img"` prunes the subtree.

---

## 9. Q7 — The non-color channel

**The channel exists; the wiring is hand-written per member, which is why coverage is 9/21.**
`themes/a11y-base.css` and `lib/base/base.print-textures.css` both point `--cat-N-texture` at
the literal a11y pattern set — but the chart rules that *consume* it name each member's own
mark class with `nth-of-type` selectors (`section.piechart .wedge:nth-of-type(6n+1)`,
`section.funnel .funnel-band:nth-of-type(6n+1)`, …). Adding a member means editing both files
by hand, and nothing fails when you don't. Measured: **12 `nth-of-type` rules in each sheet
(24 across the two), beside 34 `data-cat` rules already in each.**

> **Every categorical mark declares its slot with `data-cat`, and declares which channel
> expresses it. Texture is applied once, family-wide, off that pair.**

The second half of that rule is load-bearing and an earlier draft did not have it. `data-cat`
alone cannot mean "hatch me": §9's own principle is that texture is for **area** marks, and the
motion work (§7.8) needs `data-cat`'s sibling attribute on kanban cards and word-cloud words —
prose-bearing marks where a hatch behind the text is a regression, not a redundancy. So the slot
and the channel are two declarations:

| Channel | Geometry | Members |
|---|---|---|
| **texture** | area marks | piechart, funnel, waterfall, bar, stacked-bar, quadrant dots, map regions, matrix-grid cells |
| **dash** (`stroke-dasharray`) | path marks | line, slope, radar — already wired |
| **shape** (`--mark-*` / `--shape-*` masks, HARD RULE #29) | point marks | scatter, quadrant |
| **none — the label carries it** | prose-bearing marks | kanban cards, word-cloud words, roadmap phases, timeline items |

Then the 24 hand-written `nth-of-type` rules collapse to one `[data-cat="N"]` set inside
`.chart-frame`, and member 22 is covered the day it declares its slot and its channel.

### The width-parity rule, which is the census's sharpest finding and the one the first draft reproduced

The census's most general rule is that **a redundant channel narrower than the channel it backs
up is a silent merge.** Verified: `a11y-base.css` references only `latt-a11y-chart-tex-1..6`, its
cycles are `6n+k`, and its cartesian swatch rules stop at `data-cat="5"` — against 8 categorical
tokens and a documented 11-slice pie ceiling. Collapsing to twelve `[data-cat="N"]` rules would
have been the same 6-wide cycle in a new selector: categories 7 and 8 still wearing 1 and 2.

> **The non-color cycle's width equals the categorical cycle's width.** Eight slots, eight
> textures, no modulo. A test compares the wired selector count against `--chart-cat-1..8` so the
> two cannot drift.

**Above eight, the merge is deliberate and named.** The pie's 11-slice ceiling exceeds the
categorical cycle itself, so slices 9–11 already re-wear a hue; the texture channel must not
pretend otherwise. The ruling: **cap the categorical cycle at 8 and make the 9th slot the
"other" treatment** — one neutral fill, one neutral texture, no cycling — so an 11-slice pie
reads as eight named categories plus a remainder rather than as eleven categories, three of which
silently duplicate. That is a real editorial constraint and it belongs in `design/editorial.md`
beside the slice-count guidance.

Two notes:

- **`bullet` stays untextured, and the code is right.** The brief counts bullet among six
  uncovered categorical members; `a11y-base.css` exempts it deliberately and states why: its
  three layers separate by **value** — a light band wash, a solid measure bar, a dark target
  tick — and value is exactly what survives grayscale. Texturing the band would fight the
  measure bar read against it. Bullet is one category rendered in three values, not three
  categories. **Four members gain the texture channel** (quadrant dots, map, matrix-grid), plus
  kanban and word-cloud gaining a *slot* but declaring `none`.
- **The quadrant's zones must not take a texture.** They are stratum 2. A textured backdrop
  under textured dots is two patterns competing, and the backdrop rule (§3) already says the
  zones paint at `--chart-zone-tint`.

---

## 10. Q8 — Tokens

Seven new primitives. None is a color; every one is an alias over what ships; each one is the
smallest thing that makes a rule above expressible in `var()`.

| Token | Default | Makes expressible |
|---|---|---|
| `--chart-rule-grid` | `0.5` | §5 — the grid weight, currently a literal `0.5` in `.cart-grid` that no theme can re-tune (onyx wants heavier) |
| `--chart-rule-axis` | `0.6` | §5 — same, `.cart-axis` |
| `--chart-rule-zero` | `0.7` | §5 — same, `.cart-zero`; the zero rule must stay heavier than the grid |
| `--chart-mark-edge` | `1` | §3 — one mark edge weight, so bar's 1px outline and stacked-bar's absent one stop disagreeing; also carries radar's rim emphasis |
| `--chart-radius` | **per-member current value** | corner radius, currently unowned: gantt bars and kanban cards are pill-rounded, bar/stacked-bar/quadrant square. **Introducing it changes nothing** — each member's default is its today value, so the token starts as pure plumbing and the family-wide radius decision is a separate, visible change. A global `0` default would silently square gantt and kanban. |
| `--chart-zone-tint` | derived (§3) | §3 — the backdrop rule's one number; the default is whatever puts the quadrant at or above the measured `N` on the worst theme, not a chosen 8% |
| `--chart-motion-scale` | `1` | §7.9 — how much motion this surface admits. Print sets `0`; `@media (prefers-reduced-motion: reduce)` sets the legible clamp; a theme or a slide can damp it. One value instead of a branch, readable from JS at mount. |

**Nothing new is needed for color.** Killing the dome is a deletion to a stop of the ramp pie
and quadrant already paint (§3), over `--chart-cat-base`, which survives regardless (stacked-bar
and line use it). The wash keeps its four existing strength tokens.

**Nothing new is needed for type.** `--chart-text-min` remains a floor, not a role; the 12-token
`--fs-*` scale is untouched (HARD RULE #4).

---

## 11. What it costs

**The cost table below is written by hand and should not be.** Every column is derivable from a
rule in §3–§9 plus the census's `--json`, so the artifact a reviewer actually needs is a generated
matrix — one row per member, one column per rule, current vs. rule-derived, with the delta
computed. Generating it is the first task of the landing plan (§13), and until it exists these
numbers are a best count, not a measurement. An earlier draft of this table claimed 11 members and
enumerated 10.

**Members whose rendered still changes: 15 of 21.**

| Change | Members |
|---|---|
| dome → a stop of its own ramp | piechart, quadrant, radar |
| zone tint → `--chart-zone-tint` | quadrant |
| mark edge normalized | bar, stacked-bar |
| gridline/label hues → frame weight | matrix-grid |
| legend face → label | gantt, journey, roadmap, state-chart |
| axis-title face → label | quadrant |
| gains axis titles (§4 obligation) | quadrant, line, journey |
| gains value + tick (SPAN) | roadmap |
| prints its weight (FIELD magnitude) | word-cloud |
| tick re-classed to `.cart-cat` | radar |
| key rail deleted (SPAN → row name) | gantt |
| key rail relocated to the right rail | matrix-grid |
| gains direct labels | journey |
| gains the texture channel | quadrant, map, matrix-grid |
| declares a slot with channel `none` | kanban, word-cloud |

Distinct: piechart, quadrant, radar, bar, stacked-bar, gantt, journey, roadmap, state-chart,
line, word-cloud, matrix-grid, map, kanban — **14**, plus any member the generated matrix turns
up that this hand count missed. Call it 14–16 of 21 and let the matrix settle it.

**Members whose motion changes: 21 of 21** — 13 SVG members get new order, curve and a
frame/mark split; 5 HTML members gain a build; line's eligibility stops depending on its
tooltips, and word-cloud and journey gain eligibility. **None of this changes a rendered still.**

**Files touched:** `chart-family.css` (tokens, `.cart-*`), ~14 member transforms/styles,
`themes/a11y-base.css` and `lib/base/base.print-textures.css` (24 `nth-of-type` → one 8-wide
`data-cat` set), `chart-anima.ts`, `anima-host-sel.ts`, `svg-paint.ts`, `types.ts`,
`vocabulary.ts`, `registry-svg.ts`, one new `backends/dom-marks.ts`.

**What churns:** both chart-gallery PDFs (light + dark) and every committed deck containing a
pie, quadrant, radar, gantt, roadmap, line or matrix-grid.

**Furniture and type obligations move boxes, not only paint.** `wantsValueAxis` feeds
`plotBox({ gutter })` (§5), and a gained axis title, tick row or deleted rail all change reserved
space. So `npm run check:chart-fit` and `overflow:check` over the 268 committed decks are
**required evidence** for slices 1–2, and a clipping regression is a live possibility rather than
one ruled out in advance. The earlier draft's "nothing here changes a box, only paint" was false.

**What breaks:**

1. **A theme that overrode the `nth-of-type` texture rules.** Grep says only `a11y-base.css`
   and `base.print-textures.css` carry them, so the blast radius is those two files.
2. **`chart-family.docs.md`'s support table**, which is already stale — it omits the eight
   cartesian members and claims word-cloud animates when the eligibility gate excludes it.
   It is replaced by the shape table, which is derivable and therefore testable.
3. **`chart-anima.test.ts`'s invariant** ("every geometry mark a kernel emits declares a
   `data-anima-role`") must extend to the DOM members and to the declared `frame` role.
4. **The `--player` export bundle grows** by the `grow` and `trace` channels and the DOM
   backend. Small — a transform term, a dash term, and a painter that shares the compile path —
   but I have not measured it and will not guess.

**What does not change:** the palette and its `light-dark()` recipe; the 13 curated themes; the
Cartesian kernel's scales, ticks and gutters; `--chart-cat-base`; the `--fs-*` scale; the
authored popover grammar; each member's current corner radius; and the PDF/PPTX bytes of any
deck with no chart — **and of any deck at all, from the motion work specifically**, because
print never mounts a host.

**The export gate applies.** The fill, furniture, type and key rulings change the bytes of
exported artifacts. Per CLAUDE.md's QUALITY BAR that is a hard stop: a representative demo deck
rendered in **both dark and light mode** and sent for sign-off before any of §3–§6 and §9 ships.
The motion work (§7) does not trip that gate.

---

## 12. How it lands

HARD RULE #17 forbids a stacked chain, and this change spans ~14 members, two theme sheets and
eight motion files — so it cannot land as one PR without being an enormous one. The cut the
document itself supplies is the export gate: §7 provably does not change exported bytes, and
everything else does.

| Slice | Contents | Rendered change | Gate |
|---|---|---|---|
| **0** | the generated cost matrix (§11) + `--chart-radius`/`--chart-rule-*`/`--chart-mark-edge` as no-change aliases | none | `build:check` |
| **1** | type roles: `value-2nd`, `heading`, the two split rulings | four legend faces, quadrant's axis title | export sign-off, `check:chart-fit` |
| **2** | fill + furniture + key + §4 obligations | the bulk of §11's table | export sign-off, `check:chart-fit`, `overflow:check` |
| **3** | the texture channel: `data-cat` + channel declaration, 8-wide parity, the width test | a11y and print faces only | `build:check` + the new parity test |
| **4** | motion tier 1 (§7.10) | none | unit + the real Playground (#23) |
| **5** | motion tier 2: `grow`, `trace`, the custom-property channel | none | unit + the real Playground |

**The demo deck HARD RULE #9 requires is `examples/chart-read-order.md`** — 8 slides, one per
shape, each carrying the member whose still changes most in that shape (pie, quadrant, bar,
line, gantt, state-chart, matrix-grid, radar), committed with its `.pdf` in both canvases. It is
authored in slice 2 and re-rendered by slice 3; slices 4–5 extend it with a motion slide that
prints identically.

---

## 13. The one decision this track hands back

**Do the `motion-speed` numbers keep their current meaning?**

`speedToDurationMs` fixes slow 5400 / normal 3600 / fast 2000 / auto `clamp(2400, 1600+640n, 5400)` ms
as the *total*, and today's per-mark onset falls out of it at 270–704 ms — a queue, and one that
gets slower as marks get fewer. §7.5 proposes inverting that: onset as the primitive, constant
per-mark duration, total derived, and the speed names become multipliers (1.6 / 1.0 / 0.6). For
eight marks at `normal` the build goes 2160 ms → 1190 ms.

Those totals were a number the human set. Substituting mine silently would discard a decision,
so the recommendation is on the table with its arithmetic and the change is not made without
a yes.

Everything else in this document is inside the diff the brief asks for.