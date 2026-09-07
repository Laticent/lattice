<!-- Design-competition candidate, 2026-09-07. Track 4 — accessibility-print.
     Title: The Redundancy Ladder (revised)
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# The Redundancy Ladder

**A chart design language for all 21 members, keyed on which channel is load-bearing.**
Track 4 — accessibility and print production.

---

## The answer in two laws

Everything below is a consequence of two rules. Both are measurable, both key on data shape, neither names a member.

> **Law 1 — Redundancy.** Every mark set owes **at least one** channel that is not color, and the one it is *designed* around is the highest rung of a fixed ladder its geometry supports. Color is then never the only channel.
>
> **Law 2 — Self-range budget.** A mark may not spend more of a channel *on itself* than the channel has left to separate it from its neighbor. Measured in OKLab on the resolved paint by `tools/chart-mark-separation.js`. The law is the **ratio**; the shipped budget is a conservative implementation of it — **0 for a mark whose color is load-bearing, 0.06 for a mark whose color is redundant.**

**Why the load-bearing budget is 0 and not "whatever the ratio allows."** A ramp is authored once and resolved thirteen times. The separation it must stay under is a property of the *theme* — cuoio's adjacent gaps run 0.017–0.095, onyx's are narrower by construction — so a ramp span that passes the ratio on the palette its author was looking at fails on the next one, silently, in someone else's deck. The ratio is the law because it is the truth; 0 is the budget because it is the only span that is safe on a palette nobody has written yet.

Law 1 is the answer to the non-color channel, the key model, and half of furniture. Law 2 is the answer to gradients — and it kills more of them than the brief expected.

**One axis is answered at lower altitude than the rest: motion (Q5).** The build vocabulary below is keyed on data shape like everything else, but no build has been prototyped and none of it is measured. Read Q5 as a proposal, not as a finding.

---

## 1. What I measured

Every number here I produced in this session and can be re-derived. `CHROME_PATH` was exported; the tool renders the real gallery in a real browser and reads resolved paint.

### 1.1 The gradient question, and what the metric does and does not model

`tools/chart-mark-separation.js` reports two numbers per mark: **self-range** (the OKLab spread across the mark's own stops) and **separation** (the gap from the mark's representative color to the nearest other slot's). A mark whose self-range exceeds its separation has painted over its own categorical read.

**State the metric's assumption before using it.** Self-range-vs-separation compares the *extremes* of mark A against the representative color of mark B — it assumes any color inside A can be confused with any color inside B. That is exactly right for a **radial dome**: every stop is present at every angle near the mark's center, so a dome's light core really does abut a neighbor's dark rim. It is **worst-case** for a **vertical wash**, because two bars read edge-to-edge at matched height sit at the same gradient offset, where the wash cancels and the comparison the reader actually makes is between two flat colors.

So the dome verdicts below stand as measured, and the wash verdicts need two more arguments before they carry.

**Argument one: the wash de-synchronizes.** Gradient stops are normalized per mark, so two bars of unequal height are at different absolute offsets at every shared y. A short bar's top and a tall bar's middle are the same pixel row and different stops — and unequal heights are the *normal* case for a bar chart, since equal heights would be a chart with nothing to say. Matched-offset cancellation is the exception, not the rule. **This is UNVERIFIED as a measurement**: I did not re-run the tool with a matched-vertical-position pairing mode, so I cannot report how much of the 24× survives the pairing correction. What I can say is that the mismatched case is not the worst case — it is the common one.

**Argument two: the edge does not discharge Law 1.** The census's defense of the wash is that "the mark is identified by its EDGE, not its fill," with every edge measured at 5.34–11.93:1, and `chart-family.css` says the same — "Color rides the edge; the wash only tints." That is a real channel and I am not disputing the contrast numbers. It is not a *non-color* channel: a `--chart-cat-N-ink` edge separates slot 3 from slot 5 by hue, and under achromatopsia it separates them by whatever value survives, which is the same collapse the fill has. A high edge contrast against the *canvas* proves the mark is visible; it does not prove two marks are distinguishable **from each other**. Law 1 asks the second question. The edge is what makes the mark *readable*; the rung is what makes it *identifiable*.

**The gate inherits the blind spot, so the tool is fixed with it.** `chart-mark-separation.js` gains a `--pairing {worst,matched}` mode and its docblock states the assumption, so a wash verdict says which pairing produced it. Until that lands, every wash row below is labeled worst-case.

The measured rows, on a four-series grouped bar I authored — the one live case where a wash-bearing member spends the categorical cycle — across three themes:

| deck / theme / condition | verdict (worst-case pairing) | self-range | nearest separation | ratio |
|---|---|---|---|---|
| grouped bar · **cuoio** · achromatopsia | **SWAMPED** | 0.071 | 0.003 | **24×** |
| grouped bar · **onyx** · achromatopsia | **SWAMPED** | 0.099 | 0.022 | **4.5×** |
| grouped bar · **indaco** · deuteranopia | **SWAMPED** | 0.095 | 0.007 | **13.6×** |
| grouped bar · a11y-achromatopsia | textured | — | — | color not load-bearing |

The onyx row does to the wash exactly what the brief's onyx row did to the dome: on the one theme whose whole identity is *categories differ by value, not hue*, the wash spends 4.5× more value on one bar's own shading than the palette has between two bars.

**And the wash's problem is not only pairing-dependent.** Resolving cuoio's eight chart hues through the canonical recipe with full color vision, no simulation:

| paint | own self-range (min–max, 8 slots) |
|---|---|
| vertical wash, `20% → 38%` into `--bg` | **0.074 – 0.114** |
| radial dome, `42% → 82%` | **0.165 – 0.255** |
| a 6-point span, `26% → 32%` | 0.025 – 0.038 |

against what the palette actually has to spend:

| separation | value |
|---|---|
| adjacent slots at the wash midpoint (29% tint), unsimulated | **0.017 – 0.095** |
| the floor `chart-contrast.test.js` gates at (`SLOT_DISTINCT`) | **0.06** |
| the authoring target `chart-family.style.md` sets | 0.15 |

A normally-sighted reader on cuoio, on a light canvas, gets a wash whose own shading (0.074 minimum) is wider than the gate's entire distinctness floor (0.06) and wider than five of the seven adjacent gaps the tinted marks actually achieve. That comparison is pairing-independent — it is one mark against the palette's budget, not one mark against another mark's extremes. **The gradient is not an accessibility problem that happens to hurt everyone else. It is a legibility problem that happens to hurt disabled readers most.**

### 1.2 What the texture channel actually covers

The brief says twelve members have no non-color channel and calls that a coverage gap. It is a coverage gap on **two axes**, and the second is the larger one.

| theme + mode | members that lose the categorical read (of 21) |
|---|---|
| a11y-achromatopsia, seen as achromatopsia | **3** — kanban, matrix-grid, quadrant |
| cuoio, seen as achromatopsia | **9** — funnel, kanban, line, matrix-grid, piechart, quadrant, radar, slope, stacked-bar |
| cuoio + `color-mode: print`, seen as achromatopsia | **3** — the same three |

Nine of twenty-one members collapse on the shipped default theme, and the same nine are fine the moment either the a11y theme or the print band is selected. The channel exists; it is bound to the **author's choice of theme**, and the reader's vision is not the author's to choose. That asymmetry is the structural defect, and it is why "add texture to six members" is the wrong shape of fix.

**A correction to the census's textured-member list.** Re-derived from the stylesheets rather than from the census row: `themes/a11y-base.css` textures piechart `.wedge`, funnel `.funnel-band`, bar `.bar-mark[data-cat]`, stacked-bar `.sbar-seg[data-cat]`, line `.line-area`/`.line-band[data-cat]`, scatter's three mark classes, waterfall `.waterfall-bar[data-s]`, and `.chart-key-swatch[data-cat]`. **There is no radar texture rule.** Radar's non-color channel today is its per-series dash pattern, not a fill texture, and the census row that counts it as textured is wrong.

**And waterfall's mapping is semantic, not categorical.** Its textures map `data-s` (up / down / total) onto slots 1 / 3 / 5. That is a second canonical rule shape, and Q7 owes it one — a single per-mark-class categorical rule cannot express it.

### 1.3 Six "uncovered" members, adjudicated

I read what each of the six actually encodes. Four of them are false positives — they already carry a stronger channel than texture, and the tool cannot see it because, as its own docblock says, *"POSITION and SHAPE are channels too, and this scores neither."*

| member | what its categorical color encodes | rung it already has | verdict |
|---|---|---|---|
| **quadrant** | the zone a dot falls in (`data-cell`); the zone tint is the same slot | **position** — the dot's zone *is* its coordinates, plus a printed zone label and per-dot labels | color is fully redundant → **demote**, do not texture |
| **matrix-grid** | the table row, by `tbody tr:nth-child(8n+K)` | **position + label** — a row in a table with its own row header; cell state is `cell-filled` / `cell-outlined` / `cell-empty`, a shape channel | color is decorative → **demote** |
| **kanban** | the lane name, first-appearance order | **direct label** — `<span class="kanban-lane">` prints the lane; `--lane-color` is inert on the default card since the 2026-06-22 redesign | already correct → **no change** |
| **word-cloud** | nothing. `CAT_ROTATION[(rank − 1) % 6]` — a hue per rank position | **size** — weight is the variable, size is the encoding | color carries no variable → **demote** |
| **bullet** | nothing. `data-cat="0"` on every `.bullet-measure` | **value** — band wash / measure bar / target tick, three values | not categorical; `base.print-textures.css` is right to leave it untextured |
| **map** `highlight` | the region, `(i % 6) + 1` | **legend rail only** | **genuinely uncovered → the one member that needs a new channel** |

So the census's headline is inverted: **one of the six needs a non-color channel. Four need color taken away from them. One is already right.** Nothing measured the sixth case, because `chart.gallery.md` ships only the choropleth `map`; `map highlight` is unmeasured and should be added to the gallery.

Two more members deserve the same defense on the record. `roadmap` and `journey` spend the *engine-wide* `--cat-N-*` tier — the one tier that does have a universal texture channel — and still get no texture. Both are fine: roadmap's phase name is the row's first cell (direct label), journey's mood ramp is ordered 1–5 (value). Neither needs a rung it does not have.

### 1.4 One finding that is not a design question: `stacked-bar` fails AA today

Measured, and worth stating on its own rather than as a footnote to a token proposal: `stacked-bar.styles.css` hard-codes `--chart-cat-1-hue 82%`, and heading ink on that fill measures **2.58:1** on cuoio light, below the 4.5:1 AA floor. `stacked-bar` carries labels on its segments, so that is a live WCAG AA failure on shipped output.

**The gate misses it by construction.** `chart-contrast.test.js` runs `TEXT_ON_FILL = 4.5` against `--chart-cat-N-fill`; an 82% mix written literally in a member stylesheet is not that token and is not seen. This is a **pre-existing, off-path** defect under HARD RULE #18 — I did not cause it and the language does not worsen it — so it is **logged, not folded in**: file it with the measured number and the reason the gate misses it. The language happens to fix it (§Q8's labeled-fill token replaces the literal), which is a benefit of the change and not a substitute for recording the defect.

---

## 2. The ladder

The non-color channel is not one channel. It is a preference order, and texture is the **last** rung, not the first — it costs ink, it adds visual noise, and on a projector at the back of a boardroom an 8px tile is mush.

| rung | channel | survives | cost |
|---|---|---|---|
| **1** | **Position / geometry** — where the mark is, or what shape it is | everything | free; already paid by the layout |
| **2** | **Direct label** — the category's name beside its own mark | everything, including a fax | slide room |
| **3** | **Value** — a monotone light→dark ordering | grayscale, achromatopsia, photocopy | one axis of the palette; caps at ~5 slots; **unavailable on value-led palettes** |
| **4** | **Shape / line style** — dash pattern, marker glyph, outline weight | everything | only available to stroked or point marks |
| **5** | **Texture** — a repeating pattern overlay | everything | ink, noise, a paint-server per slot; **unavailable below ~16 viewBox units** |

**Two rungs carry a precondition, and both are load-bearing.**

- **Rung 3 is unavailable when the palette is value-led.** On onyx, value *is* the color channel — categories differ by value, not hue, and that is the whole reason onyx survives without chroma. A member assigned rung 3 on onyx has one channel wearing two names, and Law 1 is not satisfied. So: **rung 3 requires that `--chart-cat-N-hue` slots differ by hue.** Where they do not, fall through to rung 4, then 5. A theme declares which it is; onyx, concrete and the a11y palettes are value-led, cuoio and indaco are hue-led.
- **Rung 5 is unavailable on small marks.** Tile geometry is fixed at 8×8 user units in the emitted `<pattern>` (see Q8), so a 9-unit scatter dot gets roughly one tile and reads as noise. **Marks under ~16 viewBox units fall through to rung 4** — marker glyph or outline weight — which is a channel they already have. This is a real unsolved constraint, not a token.

**The assignment rule, keyed on data shape.** Walk the ladder top-down and take the first rung the mark set supports *and* whose preconditions hold:

1. **Is the category recoverable from where the mark sits, or from what shape it is?** → rung 1, done. *(quadrant dot, matrix-grid row, waterfall's up/down/total, journey's stage.)*
2. **Does every mark have room for its own name at `--chart-text-min` or above?** → rung 2, direct label, done. *(≤ ~8 marks: line, slope, scatter, pie with ≤6 wedges, funnel, kanban, roadmap, gantt.)*
3. **Is the variable ordered rather than nominal, on a hue-led palette?** → rung 3, a monotone value ramp, done. *(map choropleth, progress, journey mood, bullet, word-cloud weight.)*
4. **Are the marks stroked or point marks?** → rung 4, line style. *(radar, line, slope, scatter trend, and any mark too small for rung 5.)*
5. **Otherwise** — abutting filled areas, nominal categories, no room for names → rung 5, texture. *(stacked-bar with ≥5 parts, grouped bar with ≥5 series, map highlight, a pie forced past 6 wedges.)*

**The ceiling rule — the census's most general finding, stated as law.** *A member whose documented category ceiling exceeds the width of its assigned channel must fall back to a wider rung or cap its category count.* Pie's ceiling is 11 slices; the texture sets are 8 wide; so an 11-slice pie on rung 5 merges slices 9–11 and the redundant channel is *narrower than the channel it backs*. That is the defect the gate must catch and the gallery cannot show it, because every gallery slide fits inside six categories. See Q7(d).

**Color is applied after the rung is chosen, and it is never the reason the chart reads.** That single sentence is the language.

---

## 3. Answers to the eight questions

### Q1 — Mark and fill finish

**Rule (data shape).** *A gradient may only ramp a quantity that is data. Every other ramp is a self-range charge against Law 2.*

**The three classes are DERIVED from the rung, not listed by hand.** This is the one place the earlier draft contradicted itself member by member, so the classification is now a function:

- **rung 1–4 assigned** ⇒ the mark's color is **redundant** (something else already names it) ⇒ sheen permitted, budget 0.06.
- **rung 5, or no rung available** ⇒ color is **load-bearing** ⇒ flat, budget 0.
- **the variable is ordered and the ramp is the encoding** ⇒ **ordered** ⇒ unrestricted along the data axis, budget n/a.

Applying it:

| class | fill finish | budget | members |
|---|---|---|---|
| **load-bearing** (rung 5, or no rung) | **flat** | **0** | grouped bar ≥5 series, stacked-bar ≥5 parts, map highlight, a pie past 6 wedges, radar areas |
| **redundant** (rung 1–4) | flat, or a **sheen** — one ramp of `--chart-sheen` | **0.06 OKLab** | piechart (≤6, direct-labeled), funnel, line areas, scatter, quadrant, matrix-grid, gantt, state-chart, timeline-list, waterfall, kanban, roadmap |
| **ordered** (the ramp *is* the encoding) | the ramp, unrestricted along the data axis | n/a | map choropleth, **progress**, journey mood, word-cloud weight |

**`progress` is ordered, and only ordered.** `chart-family.css` documents its horizontal ramp as intensity scaling with `--pct` — value double-encoded as length *and* intensity. That is data on a data axis, which is precisely what the ordered class exists to protect. Listing it as redundant, as the earlier draft did, would have capped a documented encoding out of existence with a 0.06 sheen budget.

**The dome dies. All three of them.** `piechart` and `quadrant` lose it because a radial dome is the one shape the worst-case metric models exactly (2.9×–54×, brief's table, reproduced) — every stop abuts every neighbor's stop near the center. Both members are *redundant*-class under the derivation above, so they may keep a sheen; what they may not keep is a 0.165–0.255 span. `radar` loses it too — and this is where I part company with the human's instinct, on the merits:

- Radar's dome is not a color ramp at all. It is an **alpha ramp** at constant `stop-color` — 0.10 / 0.14 / 0.20 in `radar.transform.js`. Composited over cuoio's canvas that is a self-range of **0.040–0.064**, against area separations of **0.009–0.037**.
- The instinct to keep it is right about the *translucency* and wrong about the *ramp*. Alpha is functional on radar — series overlay, and you must read the lower curve through the upper one. A **constant** alpha does that job completely. The ramp adds nothing except a second value gradient stacked on top of an already-multiplied overlap, which is precisely what makes three overlapping radar areas unreadable in grayscale.
- **So: keep radar's translucency, at one constant alpha (0.14, the current midpoint). Drop the ramp.** Radar's categorical read lives on the stroke, where the dash pattern is (rung 4), and that is where it should stay.

**The vertical wash does not survive as a categorical fill either**, on the evidence in §1.1 — the pairing-independent half of it: 0.074 minimum self-range against a 0.06 distinctness floor. It survives as a **sheen** on redundantly-encoded marks — and even there it must be tightened, because today's span breaks the *status* floor as well:

| cuoio light status fill, canonical `20% → 38%` wash | self-range |
|---|---|
| pass | **0.147** |
| fail | 0.107 |
| warn / info / mute | 0.084 – 0.087 |

against a mutual status floor of 0.12 (the `chart-contrast` contract) and measured `warn/info` and `info/mute` separations of **0.006 and 0.000** at the wash midpoint. A 6-point span (`26% → 32%` light, `52% → 58%` dark) lands the self-range at **0.025–0.048** on both canvases, under both floors, and still reads as a finish rather than a flat block. Status marks abut in a legend row, so the matched-offset defense does not apply to them at all.

**What flat *buys*, which is the part that makes this cheap.** Removing the ramp frees the whole mix range for separation. Measured on cuoio light, eight slots, `--text-heading` on the fill held to AA (the gated constraint):

| flat mix into `--bg` | mean adjacent separation (unsimulated) | mean under achromatopsia | worst text-on-fill |
|---|---|---|---|
| 24% (today's `--chart-cat-N-fill` tint) | 0.053 | 0.030 | 10.64:1 |
| 29% (today's wash midpoint) | 0.063 | 0.035 | 9.61:1 |
| 48% | ~0.105 | ~0.060 | **~5.6:1** |
| 58% | **0.127** | **0.072** | 4.85:1 |
| 82% (today's `stacked-bar`) | 0.179 | 0.102 | **2.58:1 — fails AA** |

**And the strength is not one number — the keying variable is whether a label sits ON the mark.** The earlier draft's single `--chart-fill-flat` was contradicted by the first member you check: `funnel` already paints 82% with its reason recorded in `funnel.styles.css` — *"Labels + values sit on the canvas, never on a band"* — so a one-strength rule would either lighten funnel for nothing or be broken on arrival. Two tokens, split on the real predicate:

- **`--chart-fill-flat-labeled`** — a mark that can carry text. Bound by AA, **with headroom**: target ~5.5:1, not the 4.5 floor. On cuoio that is **48% light / ~62% dark**, not 58/74. Parking thirteen themes exactly on a gated floor leaves zero variance for a re-tuned ink or a curated hue, and the first theme that drifts fails the gate.
- **`--chart-fill-flat-bare`** — a mark that never carries text on itself (funnel bands, stacked-bar segments whose labels are external, map regions). No text-on-fill constraint; deeper is better for separation. Cuoio's measured **82% / 88%** stands, which is why funnel genuinely does not move.

**And say plainly what happens to `--chart-cat-N-fill`.** The two new tokens **supersede** it for member fills: `--chart-cat-N-fill` stays as the compatibility alias, redefined as `--chart-fill-flat-labeled` applied to slot N, so `chart-contrast.test.js`'s `TEXT_ON_FILL` loop keeps gating the thing that actually ships. `chart-contrast.test.js` additionally gains a loop over `--chart-fill-flat-bare` asserting `SLOT_DISTINCT` only (no text constraint) — otherwise the language's central numbers are ungated, which is the failure mode the 82% literal already demonstrates (§1.4).

**The quadrant test — a mark must out-rank its own backdrop.** Stated as a rule: *a reference region is furniture, and furniture is painted from the neutral tier, never from a data tier.* The quadrant's four zone tints are `--chart-cat-1..4-hue` at 42/58/82% — the same tokens its dots use, at greater area and greater saturation. Under the ladder the zone is rung 1 for the dot (position), so the zone owes no color at all: paint it from `--bg-alt` / `--border` as a four-step neutral value ladder if the zones need distinguishing at all, and give the dots the single categorical ink. Figure and ground come back the right way round, `--chart-cat-1..4` stop being spent twice on the same slide, and the SWAMPED verdict disappears without a texture in sight.

**The `bar` / `stacked-bar` exhibit.** The brief is right that this pair must be fixed and the language does it without naming either: both are filled rectangular categorical marks, so both take the same flat strength for their label condition, the same `--chart-fill-edge` at `--chart-hairline`, and the same furniture rule (Q3). Today `bar` paints a 20→38% wash with a `--chart-cat-N-ink` stroke at 0.7 and `stacked-bar` paints 82% flat with a canvas-colored separator. After the rule, `bar` paints `--chart-fill-flat-labeled` (it prints its value on the bar), `stacked-bar` paints `--chart-fill-flat-bare` **if its labels are external** and `-labeled` if they sit on the segment — which is the fix for §1.4's AA failure and the reason the choice has to be per-deck, not per-member. `stacked-bar` keeps its canvas separator, which is a *geometry* device (a sliver of slide showing through between abutting areas) and not a fill.

### Q2 — Type

**Ratify the five roles as they stand.** `.cart-value` display, `.cart-cat` body, `.cart-series` body-semibold, `.cart-tick` mono-tabular, `.cart-axis-title` mono-uppercase-tracked. The census is right that this axis is close to correct.

**Fix the two splits, both toward the majority and both with a reason:**

- `axis-title` → the **label face**, uppercase and tracked (`scatter`, `slope`, `stacked-bar` already; `quadrant` is the outlier). The reason is not the vote: the axis caption belongs to the same register as the chart eyebrow, which is what `chart-family.css` says the role is for.
- `radar` `tick` → the **label face**, tabular, matching every other tick in the family. A figure that prints two tick faces has no defense.

**Which roles a member is obliged to print, keyed on data shape:**

| if the reader must… | the member owes |
|---|---|
| read a magnitude off a mark | `.cart-value` on the mark **or** `.cart-tick` + gridlines — never neither |
| tell two series apart | `.cart-series`, direct-labeled (Q4) |
| know the unit or the axis meaning, and it is not obvious from the values | `.cart-axis-title` |
| name a category | `.cart-cat` |
| nothing but rank order | none of the above; the labels are the chart |

**One accessibility rider on `axis-title`.** Uppercase at 0.12em tracking is the least legible register the family owns, and at 6.5 viewBox units it is also the smallest. Cap it at a caption of two or three words and never let data ride it. And note that `--chart-text-min` (11px) is consumed by exactly **five declarations, in `roadmap` and `state-chart` only** — the SVG `.cart-*` roles have no rendered floor at all, because their sizes are viewBox user units that shrink with the plot box. In a half-width or split stage that is a real risk. I did not measure it; it needs one run of `tools/check-chart-responsiveness.js` extended to *rendered* text height at the narrow stage widths, and it should become a gate.

### Q3 — Furniture

**Rule (data shape), and the reader's task is the key:**

| the reader's task | furniture owed |
|---|---|
| **compare magnitudes across marks that are not adjacent** | gridlines + axis line + tick labels |
| **read a level against a reference** (a target, a plan, zero) | the reference rule only — `.cart-zero` weight — no grid |
| **rank, or read a value printed on the mark** | axis line only, or nothing |
| **read a position in a 2-D space** | both axes, and a grid only if a coordinate must be recovered |
| **read a proportion of a whole** | nothing; the whole is the frame |

This exonerates `bar`, which the census flags as incoherent for drawing neither a gridline nor an axis. `bar.docs.md` states the actual rule: *"the chart prints each value on its own bar and drops the axis and gridlines whenever those labels fit — the number is right there, so a second way to read it is redundant chrome."* That is rung-2 reasoning and it is correct. The bar/bullet divergence the census scores is bar being right and the language not having written it down.

**Two print riders.** In the print band the grid resolves through `--print-border`, and a 0.5-weight line at 62% toward transparent can vanish on a 300dpi laser or bloom on a photocopier. The grid must never be the only thing separating two marks (Law 1 again — it is furniture, not a channel), and its weight must stay strictly below the axis rule, which stays strictly below `.cart-zero`. That three-step ordering already exists in `chart-family.css` (0.5 / 0.6 / 0.7) and should be stated as a contract rather than left as three numbers.

### Q4 — The key model

This is the same question as Q7 wearing a different hat, and the ladder answers both at once.

> **A legend rail forces a color lookup. So a rail is only permitted when the mark set carries a non-color channel too. Where it does not, direct labels are mandatory.**

| data shape | key |
|---|---|
| ≤ ~8 marks, each with room for its name at `--chart-text-min` | **direct labels** (rung 2). Non-negotiable — this is where the family's own principle already sits |
| marks that cannot hold a name (abutting stacked segments, small multiples, map regions) **and** a non-color channel present (texture, dash, value order) | **rail**, and every swatch mirrors the mark's non-color channel, not just its color |
| marks that cannot hold a name and **no** non-color channel | **not shippable** — reduce the categories, direct-label, or opt into texture |
| one category, or a category the position already names | **nothing** |

The `.chart-key-swatch[data-cat]` mirroring already exists for six slots in both `themes/a11y-base.css` and `lib/base/base.print-textures.css`, with the right reason recorded: *"without it the bars carried six distinct textures while the key carried six flat grays, which on the one palette whose whole job is the non-color channel makes the key unusable."* The rule generalizes that from a fix to a contract — and because Q7 paints texture through a fill token, the swatch mirrors the mark by consuming **the same token**, not by carrying a duplicated rule.

This also resolves "legend placement is a fifth divergence": there is one rail, docked right with a vertical hairline; `gantt`'s centered row below and `matrix-grid`'s inline mono-italic caption converge on it or drop to direct labels.

### Q5 — Motion

**Answered at the same altitude as the rest, and flagged: nothing here is measured or prototyped.** The brief asks for a build vocabulary keyed on archetype plus a verdict on the five non-SVG members, and an eight-question brief answered seven times is not a deliverable.

**Four builds, keyed on data shape — the same key as everything else:**

| the mark set is… | build | members |
|---|---|---|
| **a part-of-whole** — the marks sum to one frame | **reveal-whole**: the frame draws, then all parts appear together. Never sequential — a staggered pie tells the reader the first slice is more important, which is a claim the data did not make | piechart, funnel, stacked-bar, progress |
| **ordered** — the marks have a documented sequence | **stagger-along-order**, in the data's own direction: funnel top-down, gantt left-to-right, journey along its stages, one step per mark at a fixed interval | gantt, journey, roadmap, timeline-list, waterfall, kanban, state-chart |
| **continuous** — the mark is a path | **draw-along-path**: stroke-dashoffset from full length to zero, areas fading in behind the completed stroke | line, slope, radar |
| **positional** — the mark's meaning is where it sits | **no build on the marks**; the frame and axes may draw, the marks appear at once. A dot that flies to its position spends the animation implying motion the datum does not have | scatter, quadrant, map, matrix-grid, bullet, bar, word-cloud |

**The five non-SVG members: declare a CSS build, do not restructure.** `kanban`, `matrix-grid`, `progress`, `roadmap` and `timeline-list` are HTML by design — kanban's card is a real card, matrix-grid is a real table with row headers, and both of those *are* their rung-1/rung-2 channel. Restructuring them to SVG to win a build would spend the accessibility tree to buy an animation. Each takes the stagger or the no-build its row above assigns, expressed in CSS on its own DOM. `chart-anima.ts`'s `chartToScene` keeps owning the SVG members only, and says so.

**Three riders, binding on whatever vocabulary ships:**

1. **Print renders the final frame, always** — already a stated constraint; it means no build may leave a mark at an intermediate opacity or scale in the last frame, which is exactly the failure mode a staggered opacity build produces if the last step is not pinned.
2. **`prefers-reduced-motion: reduce` renders the final frame too.** Vestibular triggers are an accessibility requirement (WCAG 2.3.3), not a preference. A build that only honors the print path leaves that user with the animation.
3. **Support is declared per member and gated.** `chart-family.docs.md` § "Motion + mark-detail support, by member" must list all 21 and be gated against the manifest set — it currently lists none of the eight cartesian members added since it was written, so an author reading it plans around motion that will not happen.

### Q6 — Detail reveal

**Rule (data shape).** *A popover is owed by any mark that carries a datum the slide does not print. It may never be the only route to that datum.*

That is WCAG 1.4.13 and keyboard access, and it is also a print rule: the PDF has no hover. So:

- **The reveal payload is authored, not derived.** A `data-detail` template the author writes is content; a derived tooltip is a duplicate of what is already on the slide and owes nothing.
- **The print fallback is the caption.** A member that gains a popover gains, in the same change, a `.chart-caption` obligation to carry whatever the reveal says that the marks do not. If the caption cannot hold it, the datum belongs on the slide or in the notes.
- **A member with no hidden datum owes no popover.** That closes the seven-member gap the census reports without restructuring anything: `journey`, `progress`, `roadmap`, `timeline-list` and `word-cloud` print their payload; `kanban` and `matrix-grid` print theirs on the card and in the cell.
- **The hit target is the mark itself.** This is why Q7 paints texture through the mark's own `fill` rather than stacking an overlay sibling on top of it — an overlay would intercept the pointer and every textured member would need `pointer-events: none` plumbing to get its own popover back.

### Q7 — The non-color channel

**The rule.** Every mark set gets its rung from §2. Where the rung is 5, the mechanism is a **fill-replacement pattern** — one mechanism, not two — and three things change from today.

**(a) One mechanism: the mark's own `fill` resolves to a pattern that preserves hue.** The earlier draft specified both an overlay sibling *and* a fill token, which are mutually exclusive: a transparent-tile pattern applied as a `fill` renders ink geometry over nothing and destroys the hue, which is the exact defect it diagnosed in today's `CHART_FILLS` grays. **The fill route wins**, for three reasons Q6 and the tree between them settle: an overlay sibling intercepts the pointer for the detail popover; it breaks `piechart.styles.css` and `funnel.styles.css`'s `:nth-of-type(6n+k)` slot selectors, which `piechart.styles.css` already carries a comment about `<defs>` offsetting; and it puts a non-data node in `chartToScene`'s per-mark `data-anima-role` walk. It is also what `mermaid.css` already does.

**Hue is preserved inside the pattern content, which is where the problem actually is.** The new sets emit a tile whose base rect paints `fill="currentColor"` with the ink geometry over it at fixed literal hex — so the mark's own `color` (set to its slot hue by the member rule) supplies the field and the pattern supplies only the geometry:

```
latt-chart-ov-dark-1..8    currentColor field + dark  ink geometry   (for light canvases)
latt-chart-ov-light-1..8   currentColor field + light ink geometry   (for dark  canvases)
```

They are **appended** to `TEXTURE_SETS`, which the table's docblock says is the documented-safe operation because emission order is byte-locked. Ink geometry stays literal hex — page-level defs, zero token resolution — the exact constraint `accessibility-textures.js` documents after the all-black-pie regression on real iOS Safari. `currentColor` is the one inherited value that resolves at the *reference* site rather than the def site, which is why it is available here and `var()` is not; **this is UNVERIFIED on iOS Safari** and is called out again in §6. Polarity picks through `light-dark()` in a CSS rule with a literal presentation-attribute fallback — the graceful-degradation shape `schemeAwarePatternSet` already ships — plus pinned selectors for per-slide `_class: dark`, in lockstep with onyx's, which `texture-polarity.test.js` holds.

**(b) The chart family adopts the *existing* universal token channel — it does not fork one.** Today `--cat-N-texture` is consumed by `lib/integrations/mermaid/mermaid.css`, **and also by `lib/runtime/index.js` (`lookForSection` probes `--cat-1-texture` to decide a slide's diagram look), retargeted by the runtime's onyx prefix rewrite, and listed as load-bearing in `lib/theme/serialize.js`.** A parallel `--chart-cat-N-texture` family would leave a theme that sets only the chart variant classified as non-textured by the runtime, and two token families for one concept is the shape HARD RULE #1 exists to prevent. So the chart family paints through the channel that already exists:

```css
fill: var(--cat-1-texture, var(--chart-cat-1-fill));
```

It is also **12 slots wide against the chart palette's 8**, which closes the census's 6-vs-8 width defect for free and raises the ceiling rule's headroom (§2) from 8 to 12. The 60-odd per-member `!important` selectors across `a11y-base.css` and `base.print-textures.css` collapse into one canonical rule per mark class — which is why every new member arrives uncovered today: `map`, `matrix-grid`, `quadrant`, `kanban` and `word-cloud` all landed after the wiring and none of them got any.

**Two canonical rule shapes, not one.** Categorical marks resolve `var(--cat-N-texture, …)` by slot. **Semantic marks resolve by meaning** — `waterfall`'s `data-s` maps up / down / total onto slots 1 / 3 / 5, and a per-mark-class categorical rule cannot say that. Both shapes are written into the family stylesheet; a member declares which it uses.

A theme then opts in with **the eight (or twelve) declarations it already writes**, exactly as `onyx`, `concrete`, `a11y-base` and `section.print` do. That is what makes the channel universal: not "always on", but *reachable from every theme with one edit, and impossible for a new member to miss*, because the member paints the token rather than waiting for two other files to learn its class names.

**(c) The precondition is a hook every categorical mark emits.** `bar`, `stacked-bar`, `line`, `scatter`, `bullet` and `waterfall` already carry `data-cat` / `data-series` / `data-s`, and the legend swatches mirror `data-cat`. `piechart` and `funnel` are still matched by `:nth-of-type(6n+k)`, and `quadrant`, `map`, `matrix-grid`, `kanban` and `word-cloud` carry no slot attribute at all. Make it a family contract: **every categorical mark carries `data-cat`, every stroked series carries `data-series`, every semantic mark carries `data-s`, and every key row mirrors the same attribute.** This is the convention the seven cartesian members already landed with, and it is why their coverage is ten rules instead of seventy.

**(d) Universality is guaranteed by a gate, not by always-on hatching.** I considered firing a faint overlay on every theme whenever a mark set exceeds five color-alone slots, and rejected it: it changes the bytes of every brand deck to defend a case that can be caught at authoring time, and a hatch nobody asked for on a boardroom pie is exactly the "it looks accessible" tax that gets a11y work switched off. Instead:

> **`node tools/chart-mark-separation.js --strict` joins `build:check`**, over `chart.gallery.md`, `examples/**`, **and `tools/build-stress-deck.js --bucket chart`**, on `a11y-achromatopsia` and on each brand exemplar's print band.

Three fixes the earlier draft's version of this gate needed, because as proposed it could not enforce the laws it was offered for:

1. **Law 2's budgets are absolute; the tool's verdict is relative.** SWAMPED fires on self-range ≥ separation, so a 0.02 wash on a palette with 0.06 separation passes the tool and violates the stated budget. The tool gains an **absolute self-range assertion** — 0 for load-bearing marks, 0.06 for redundant ones — and the class comes from the member's declared rung, which the family stylesheet now states.
2. **COLLAPSED is not a failure for rungs 1–4.** The tool scores neither position nor shape, so every rung-1-to-3 member reports COLLAPSED; treating that as a gate failure would put most of the family on `SANCTIONED_COLOR_ALONE`, and an allowlist holding most of the family is not a gate. So: **the member's declared rung is an input.** A COLLAPSED verdict on a member declaring rung 1–4 is expected and passes; on a member declaring rung 5 it fails; a member declaring **no** rung fails outright, and *that* is what the allowlist is for — with a written justification, and a stale-entry check, the repo's own idiom (#3, #20, #26, #29).
3. **The gallery cannot show the ceiling.** Every gallery slide fits inside six categories, which is why `build-stress-deck.js` exists. The gate runs the stress deck too, and the ceiling rule (§2) is what it enforces there: an 11-slice pie against a 12-wide texture channel passes; against an 8-wide one it does not.

The author's fix menu when it fires is the ladder, in order: fewer categories, direct labels, value ordering, line style, texture opt-in.

**(e) And four members get color taken away instead of texture added** — §1.3. `quadrant`'s zones drop to a neutral value ladder; `matrix-grid`'s row hues drop to one ink with the cell state carrying the read; `word-cloud`'s rank rotation drops to the sequential ramp it already offers in `seq` mode; `kanban` is left alone. Every one of those is a *deletion*, which is the cheapest kind of coverage there is.

### Q8 — Tokens

**Three new, four retired. Net −1.** Nothing here is a color; every one is a *strength* or a *span*, so the palette stays exactly where the brief left it. The texture switch is **not** a new token — it is `--cat-N-texture`, which already exists (Q7(b)).

| token | what it governs | replaces |
|---|---|---|
| `--chart-fill-flat-labeled` | the flat categorical fill strength for a mark that carries text on itself — `light-dark(48%, 62%)` on cuoio's measurement, ~5.5:1 target with headroom, per-theme curated | the categorical use of the four wash constants; `--chart-cat-N-fill` is redefined as this applied to slot N, so `chart-contrast.test.js` keeps gating it |
| `--chart-fill-flat-bare` | the flat strength for a mark that never carries text — `light-dark(82%, 88%)` on cuoio. No text-on-fill constraint, so it goes as deep as separation wants | `stacked-bar`'s hard-coded 82% literal (§1.4), and it ratifies `funnel`'s existing 82% rather than lightening it |
| `--chart-sheen` | the **one** permitted ramp span for a redundantly-encoded mark, as a delta on the flat strength. A single governed number instead of a top/bottom pair per canvas — so the self-range is a value you can gate, not one you have to derive from four | `--chart-fill-top-l`, `--chart-fill-top-d`, `--chart-fill-bottom-l`, `--chart-fill-bottom-d` (**retired**) |

**What deliberately gets no token, and one thing that cannot have one.**

- Mark weight, grid weight and elevation are already expressible: `--chart-hairline` and `--chart-accent-lg` are the weights, `--chart-fill-edge` is the edge mix, `--chart-cat-N-ink` is the edge color, `--chart-text-min` is the type floor.
- **Texture scale cannot be a token, and the earlier draft's `--chart-texture-scale` was inert.** Tile geometry lives on the emitted `<pattern>` element — `patternUnits="userSpaceOnUse" width="8" height="8"`, hardcoded in `patternSet()` / `schemeAwarePatternSet()`, injected once at page level outside any `<section>`. A custom property cannot reach it, for the same reason the module's own comment gives about polarity: *"one `<pattern>` element paints identically at every reference, so it cannot render two polarities."* Same argument, same conclusion. The small-mark gap is real and stays **unsolved by design**: §2's rung-5 precondition bars texture below ~16 viewBox units and falls those marks through to rung 4, which costs nothing and needs no emission change. Emitting a second `-sm` scale variant per set is the alternative; it is a pattern-emission change with a byte-lock consequence and it is not worth it for one member.
- Motion timing is not mine to name beyond Q5's vocabulary. Corner radius is genuinely unowned and genuinely wants a token — I am leaving it to whichever track owns geometry, because it does not touch any channel in this document.

---

## 4. Does it hold?

| surface | how it holds |
|---|---|
| **cuoio / indaco** (hue-led) | rungs 1–3 carry every member; color stays the color it is today, at a flat strength that separates twice as well as the current tint |
| **onyx** (value-led) | Law 2 exists for onyx, and so does §2's rung-3 precondition. Removing the ramp gives the value channel back to the palette, which is the only channel onyx has — and no member is allowed to *spend* that channel as its rung, so the ladder lands onyx's nominal members on rung 4 or 5, not on a value ramp that would be the color channel wearing a second name. Measured: the grouped bar's wash swamps onyx at 4.5× |
| **a11y-achromatopsia** | rung 5 becomes reachable by the existing `--cat-N-texture` token instead of by two hard-coded files, and the three residual failures are fixed by deletion, not by hatching |
| **light + dark canvas** | every strength is a `light-dark()` pair; the pattern's ink polarity flips through the degradation shape `schemeAwarePatternSet` already proves, with pinned sets for per-slide scheme overrides |
| **screen** | flat marks with a categorical edge at `--chart-fill-edge` / `--chart-hairline`; the sheen survives where color is redundant, so the family does not go visually flat |
| **print (PDF)** | the print band already remaps `--chart-catN`, `--chart-catN-ink` and `--chart-state-*` to `--print-*` and points `--cat-N-texture` at the gray set. Measured: `color-mode: print` on cuoio takes 9 collapsing members to 3, and the language takes those 3 to 0 |
| **PPTX** | **the surface with the most exposure and the least evidence.** PPTX is shape-based, not raster: a `fill: url(#…)` pattern and a `currentColor` tile are exactly the constructs an export can flatten, drop, or resolve differently from the PDF path. Rungs 1–4 are geometry and text and survive by construction; **rung 5 through PPTX is UNVERIFIED** and must be rendered and inspected before the texture work merges, not after |
| **a monochrome photocopy of a color PDF** | no CSS mode reaches it. What reaches it is the ladder: rungs 1–2 and 4 survive a photocopier by construction. This is the case that makes the ladder better than texture-everywhere |

---

## 5. What it costs

**Members whose pixels move: 12 of 21.**

| change | members | how |
|---|---|---|
| dome → sheen | piechart, quadrant | fill shape |
| dome → constant alpha | radar | three stops → one |
| wash → flat (categorical) | bar | fill shape + strength |
| wash → tightened sheen | gantt, progress *(sheen on the categorical axis only; its `--pct` ramp is ordered and untouched)*, state-chart, timeline-list, waterfall | four token constants → one; a single edit |
| literal 82% → `--chart-fill-flat-bare` or `-labeled` | stacked-bar | one declaration; fixes the AA failure in §1.4 |
| `--chart-cat-N-fill` re-derived at 48%/62% | scatter, piechart, quadrant, matrix-grid, and every member consuming the alias | value change, no rule change |
| categorical color demoted | quadrant, matrix-grid, word-cloud | deletions |
| type face split fixed | quadrant (`axis-title`), radar (`tick`) | two declarations |
| gains a non-color channel | map (`highlight`) | new |
| **genuinely unchanged** | bullet, journey, kanban, line, roadmap, slope | — |

`funnel` is **not** unchanged in the earlier draft's sense — it keeps its 82% because `--chart-fill-flat-bare` ratifies it, which is a token swap with identical bytes, not an absence of work.

**Other churn.**

- `data-cat` / `data-series` hooks added to `piechart`, `funnel`, `quadrant`, `map`, and to `matrix-grid` if its rows stay distinguishable at all: **5 transforms**.
- `themes/a11y-base.css` and `lib/base/base.print-textures.css` each **shrink**, trading roughly sixty `!important` selectors for the token declarations they already write plus the status-glyph block, which stays exactly as it is.
- `lib/core/accessibility-textures.js` gains **two appended sets**; the golden byte-lock in `test/unit/core/accessibility-textures.test.js` re-blesses by construction, since appending is the documented-safe operation.
- `test/unit/palette/chart-contrast.test.js` gains a `--chart-fill-flat-bare` loop (`SLOT_DISTINCT` only). Without it the deepest strength in the language is ungated, which is how the 82% literal shipped at 2.58:1.
- **23 committed example PDFs re-render** (of 168), plus the six long-running galleries — which under HARD RULE #8 graduate in a separate post-review commit.
- One new gate step in `build:check`. That is a CI-contract change and therefore **not mine to add** under CLAUDE.md's second filter; it goes to the human with its measured cost.
- One **issue filed, not fixed**: `stacked-bar`'s 2.58:1 (§1.4), a pre-existing off-path defect under HARD RULE #18.

**What breaks, stated plainly.**

- **Every deck with a pie, a quadrant, a radar or a grouped bar changes its exported bytes.** That is the Quality Bar's export sign-off gate: render a representative deck in dark and light, **as PDF and as PPTX**, and get human sign-off before it ships. PPTX is not optional here — §4 says why it is the least-evidenced surface.
- **`quadrant` loses its four-color zone wash**, which is the loudest thing on that slide today. Some readers will call that a downgrade. It is the change the brief asks for and the change the numbers demand, and it should go to review as a before/after pair rather than as an assertion.
- **`radar` loses its dimensional read.** Flat translucent overlays are less pretty. The stroke, the dash and the polar web still carry the figure.
- **Labeled marks get *lighter*, not darker** (24% → 48%), and bare marks stay deep. If a rendered review says a labeled mark goes weak, the lever is `--chart-fill-edge`, not the fill — a stronger edge at the same fill.
- **Both flat strengths must be re-derived per theme**, not copied from cuoio's 48/62 and 82/88. The recipe is mechanical — deepest mix keeping `--text-heading` on the fill at ≥5.5:1 for `-labeled`, deepest mix keeping adjacent separation improving for `-bare` — and it belongs in `tools/derive-chart-cat-ink.js`'s neighborhood as two generated values, not hand-tuned thirteen times.

---

## 6. What I did not verify

Per HARD RULE #23, each of these is **UNVERIFIED** and named rather than assumed:

- **The wash at matched vertical pairing.** §1.1's 24× / 4.5× / 13.6× ratios are worst-case-pairing numbers from the current tool. The de-synchronization argument that carries the verdict is reasoning, not a measurement; the `--pairing matched` mode does not exist yet.
- **`map highlight`** — no gallery slide exists, so it was never measured. Its uncovered verdict is read from `map.transform.js` (`(i % CAT_SLOTS) + 1`, `CAT_SLOTS = 6`), not from a render. Add the slide first.
- **The `.cart-*` rendered type floor** at narrow stage widths. The role sizes are viewBox user units with no `max(--chart-text-min, …)` guard; I reasoned that they shrink with the plot box and did not measure it.
- **The 48/62 and 82/88 flat strengths on the other twelve themes.** Measured on cuoio only, by the stated method. The 48% row in Q1's table is interpolated between measured 29% and 58% rows, not measured directly.
- **`currentColor` inside a page-level `<pattern>` def, on any engine.** The whole hue-preserving mechanism rests on it resolving at the reference site. Chromium is the only engine reachable here and I did not test it even there; **real iOS Safari is unreachable**, and this is the same class of constraint that produced the all-black-pie regression.
- **PPTX rendering of any rung-5 pattern.** Not attempted. §4 marks it as the largest exposure in the design.
- **Nothing in this document has been rendered.** It is a spec, measured against the current tree with the repo's own tools; no pixel has moved.
