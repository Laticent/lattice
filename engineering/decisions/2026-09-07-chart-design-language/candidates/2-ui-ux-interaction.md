<!-- Design-competition candidate, 2026-09-07. Track 2 — ui-ux-interaction.
     Title: The Addressable Mark (revised)
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# The Addressable Mark

**A chart design language for all 21 chart-family members, written from the reader's and the author's side.**

---

## 0. The idea in one sentence

A chart is a set of **marks**, and the language is the contract every mark signs: **a shape you can see, a name you can read, a number you can take, and a handle you can reach.** Fill, furniture, type and the key exist to serve the first three. Motion, detail reveal and the non-color channel exist to serve the fourth. Every rule below is derived from *which of those four a given mark owes*, and that is decided by the data shape — never by the member's name.

The family does not read as one system today because each member decided independently which of the four it would honor. A bar chart that prints its values needs no gridlines; a bullet chart that draws both is not inconsistent with it — but nothing wrote that down, so it reads as two authors. The fix is to write it down as an obligation, and to make the fourth handle — reachability — uniform, because that is the one the family has never had a rule for at all.

**Two debts this draft pays up front.** First, the brief's § "Three defects reported in the first draft of this note do not exist" already corrected the radar `radar-ticks` census artifact, bar's missing furniture (`wantsValueAxis` deciding by measurement) and the quadrant furniture row, and credited the visual-designer track. §4 and §5 below reproduce those corrections because the rules depend on them, not because this document found them. Second, the brief's five *un-numbered* defects — corner radius, legend placement, the bar/stacked-bar pair, kanban's vertical composition, the legend face split — are the brief's evidence, not decoration; §5.5 answers each rather than letting the eight numbered questions stand in for the whole.

**The failure this language is designed against:** two charts on adjacent slides that look like siblings and behave like strangers. Today that happens four separate ways, all verified in the tree:

1. A chart where nobody authored a detail bullet is **completely inert** — `interactive()` in `docs/src/playground/chart-interact.js` returns `!!(chartEl && detailsEl)`, so hovering any mark does nothing at all. The same chart with one nested bullet somewhere becomes fully hoverable everywhere.
2. An **animated** chart gets popover-only reveal — `liftAndTilt` bails on `isAnimaChart()` — so `motion: on` silently removes the dim and the lift.
3. The 3D tilt fires on SVG sheets, is excluded for `gantt` **by name**, excluded for the `inline` state-chart variant, and never fires on HTML marks.
4. Keyboard reveal is bound to number keys `1`–`9` only (`handleKey`), so `state-chart` (11 marks in the gallery) has marks no keyboard can reach, and there is **no `tabindex` anywhere in `lib/components/chart/` or in the reveal layer**.

A design language that fixes fill and says nothing about that has fixed the picture and left the product.

---

## 1. The mark contract (what everything below is derived from)

Every data mark in every member declares five things. Four already exist as conventions; the language makes them obligations and adds one.

| Declaration | Attribute | Serves | Status today |
|---|---|---|---|
| **identity** | `data-mark="i"` | reveal, motion, key cross-light | **14 of 21** members emit it (bar, bullet, funnel, gantt, line, map, piechart, quadrant, radar, scatter, slope, stacked-bar, state-chart, waterfall) |
| **name** | `data-label` | the popover header, the a11y readout | most substrate members |
| **number** | `data-value` | the popover value, the lean chip | most substrate members |
| **slot** | `data-cat="0..5"` (filled) / `data-series="0..5"` (stroked) / `data-s` (semantic) | the non-color channel, the key | the seven Cartesian members + the legend swatches |
| **motion role** | `data-anima-role` | the choreography | declared by every SVG kernel |

**The one new rule:** whatever a member *prints* as its `category` and `value` text roles, it must also *carry* as `data-label` / `data-value` on the mark. One source, two surfaces. This is what lets the reveal, the key cross-light and the speaker-note fallback all read the same string without a per-member special case — and it retires the pie's exception, where `infoFor()` has to fall back to reading the SVG legend row by index because a wedge carries no text.

---

## 2. The data-shape taxonomy

Three questions decide every rule. They are questions about the data, not the drawing.

- **Q1 — what is the reader's job?** *Rank* (which is bigger), *Level* (what is the number), *Share* (part of a whole), *Position* (where does this sit), *Flow* (what happens in what order), *State* (what condition is this item in).
- **Q2 — is the mark's own geometry the datum?** If a mark's size, angle or position *is* the number, it is a **quantity**. If its size is layout and the datum rides inside it as text or status, it is a **surface**. If it is scenery the data is read against, it is a **reference region**.
- **Q3 — what is color carrying?** *Category* (a nominal set), *Magnitude* (a ramp), *Status* (a meaning), or *nothing* (a single series).

### The shape is derived per chart instance, not assigned per member

The table below is a **worked example, not the rule**, and that distinction is load-bearing. A member does not have one shape: `map` is categorical in one mode and a ramp in the other; `bar` with one series carries nothing in color and with a category set carries a nominal set — different non-color obligations from the same member; `stacked-bar` at two parts and at six parts are different key problems; `quadrant` with an emphasized zone is a different reference-region problem from one without. A static per-member table would resolve every downstream rule by member name with a shape column in between, which is the shape the brief said not to produce.

So the kernel **derives** the shape from the authored model, and the language names the inputs it reads:

| Derived input | Read from | Feeds |
|---|---|---|
| `seriesCount`, `categoryCount` | the parsed model | Q3, the key model (§6), the non-color channel width (§9) |
| `valuesPrinted` | whether the member emits `value` text at every mark | the furniture rule (§5) |
| `rampAuthored` | a magnitude ramp vs a nominal slot cycle | Q3, the scale key (§6), texture-vs-scale (§9) |
| `markKind` | quantity / surface / reference region | the fill test (§3), the choreography (§7) |
| `markArea` | the resolved mark box | the texture floor (§9) |

`bar.transform.js` `wantsValueAxis()` is the existing proof that this works: it *measures* rather than assumes, and §5 generalizes its posture rather than ratifying its result once per member.

All 21 members, answered for the gallery's authored data:

| Member | Q1 job | Q2 mark kind | Q3 color carries |
|---|---|---|---|
| bar | Rank / Level | quantity (length) | category or nothing |
| stacked-bar | Share within Rank | quantity (length) | category |
| bullet | Level vs target | quantity + reference band | nothing (value channel) |
| waterfall | Level (bridge) | quantity (length) | status (up/down/total) |
| funnel | Flow (drop-off) | quantity (width) | category (decorative) |
| piechart | Share | quantity (angle) | category |
| line | Level over time | quantity (path position) | series |
| slope | Rank change | quantity (path position) | series |
| scatter | Position | quantity (position) | category |
| quadrant | Position vs reference | quantity (dot position) + **reference regions** | category (dots); **zones spend it wrongly** |
| radar | Level on many axes | quantity (vertex radius), overlaid | series |
| map | Position (geographic) | quantity (region identity) | category **or** magnitude (two modes, two answers) |
| matrix-grid | Position (nominal 2-D) | surface (cell state is the datum) | category (row identity) — see §9's editorial finding |
| word-cloud | Rank by weight | quantity (type size) | emphasis tier, not data |
| gantt | Flow over time | quantity (start + duration) | status |
| roadmap | Flow over time | surface (cell) | status |
| timeline-list | Flow | surface (row) | status |
| journey | Flow + mood | surface (row) + quantity (curve) | status / mood |
| progress | Level | quantity (length) | status |
| kanban | State | surface (card) | status; lane accent is category |
| state-chart | Flow (graph) | surface (node) | status |

---

## 3. Answer 1 — Mark and fill

### The rule: one test, three finishes

> **A fill may vary across a mark only when the variation is the data. Otherwise the mark is flat, and a mark's backdrop is quieter than the mark by construction.**

Applied as one question in order:

1. **Does the fill's variation covary with the datum?** → **BOUND.** Keep it. Exactly one member qualifies: `progress`, whose horizontal gradient's leading-edge intensity scales with `--pct` (`chart-family.css` names this as the one sanctioned specialization). The gradient is an encoding, so it is not decoration.
2. **Is the mark a quantity — is its size, angle or position the number?** → **FLAT** *when the gradient axis runs along the encoding axis.* No radial dome, and no wash whose ramp direction shares an axis with the measure. The narrower form of this test is what §3.2 turns on.
3. **Is the mark a surface — a card, node, row, cell or pill whose size is layout, not data?** → **SEAT wash permitted.** The existing canonical recipe (`--chart-fill-top-l/-d`, `--chart-fill-bottom-l/-d`, `--chart-fill-edge`, `--chart-fill-accent`) is unchanged. This is a *permission*, not an obligation, so surfaces that are flat today stay flat and nothing churns for churn's sake.
4. **Is it a reference region, not a mark?** → **GHOST tint,** governed by §3.3's ladder, with a hard floor: *a reference region's contrast against the canvas must be lower than the data mark's contrast against that region* — **and** each step of the ladder must remain legible as a step at projector distance.

Radar is a fifth case that the language names rather than forces into one of the four: an **OVERLAY**. Its fill is translucent because you must see through it — alpha is functional, not decorative — and it stays as-is.

### 3.1 Kill the dome. It is the measured defect.

**Kill the radial dome on `piechart` and `quadrant`.** Keep `progress`'s bound gradient, keep the seat wash on the surface members, and reclassify `radar`.

The measured case, reproduced this session:

```
node tools/chart-mark-separation.js --theme onyx
  piechart   SWAMPED   nearest 0.097   self-range 0.286
  quadrant   SWAMPED   nearest 0.097   self-range 0.286

node tools/chart-mark-separation.js --theme a11y-achromatopsia
  quadrant   SWAMPED   nearest 0.030   self-range 0.278
```

A single pie wedge's own shading covers **2.9× more perceptual ground than the gap to the next category**. That is not a taste finding: somewhere inside category A there is a color that matches category B. And it lands hardest on **onyx**, the one theme whose whole identity is that categories differ by value rather than hue — the counter-example `chart-family.style.md` cites to prove the recipe survives without chroma. The dome is the thing that destroys the channel onyx depends on.

The stops make it concrete. The pie and the quadrant emit the **same** three stops — `42% → 58% → 82%` hue-mixed toward `--chart-cat-base` (`piechart.transform.js`, `quadrant.transform.js`). Radar's "dome" is not the same animal at all: `areaGradient()` in `radar.transform.js` emits `stop-opacity 0.10 → 0.14 → 0.20` on one hue, and its own comment records that the 12× rim-dense ramp *was already removed* and "compressed to a near-uniform low-alpha wash so the curves read flat, not bulging." **Radar is already flat in effect; it uses a `<radialGradient>` element only because an SVG `fill` cannot take a CSS gradient.** So the human's instinct — kill pie and quadrant, keep radar — is right, and the reason is not that radar is special: it is that radar already complies.

**Three further arguments nobody has put, one per surface the language must hold on:**

- **Print and a11y already flatten it.** `themes/a11y-base.css` and `lib/base/base.print-textures.css` both set `section.piechart .wedge:nth-of-type(6n+1) { fill: url(#latt-a11y-chart-tex-1) !important; }`. A `<pattern>` fill *replaces* the gradient. So the dome is already absent from the a11y theme and from every board printout — the finish the deck ships on screen is not the finish the board reads on paper. A design language whose top-line finish survives on exactly two of the four required surfaces is not one finish, it is two.
- **The dome is a false area cue on the two members that encode area.** A pie encodes share as angle and reads as area; the dome darkens the rim, which is where a wedge is widest, so a wedge appears to weigh more than its angle. Adding a shading cue that co-varies with the perceived magnitude of the encoding channel is the one gradient you must never draw.
- **The quadrant's dome is centered on the worst possible point.** Its `<radialGradient>` is `cx=splitX cy=splitY`, radius to the farthest corner, "so every region's outer corner reaches the rich end of the gradient." The corners are where the extreme performers sit — the whole reason to draw a 2×2. The backdrop is loudest exactly where the data matters most. This is the sharpest statement of the figure/ground inversion in the brief, and it is in the source.

### 3.2 The vertical wash: WITHDRAWN pending a measurement

An earlier draft of this language killed the top-to-bottom wash on `bar`, `waterfall` and `gantt` alongside the dome. **That recommendation is withdrawn, because the brief already measured the wash for the dome's defect and it passed.** The mark is identified by its **edge**, measured at 5.34:1 (bar), 10.06:1 (gantt), 11.93:1 (waterfall) against canvas on indaco dark, and `chart-family.css` states the recipe outright: *"Color rides the edge; the wash only tints."* Two arguments were offered against it and neither survives contact:

- *"Two bars of different length become two different materials — same top color, same bottom color, different rate."* This holds only where the gradient axis runs **along** the encoding axis. A horizontal bar under a vertical wash does not qualify, which is most of the affected geometry.
- *"A label on a bar has a range, not one contrast, to clear."* Pre-refuted in the brief: the labels are `--text-heading` and clear both stops on both canvases.

The brief's warning is the operative line — *"any proposal that retires both is spending a working mechanism to buy consistency."* So the language keeps the wash, and **files the removal as a measurement, not a recommendation**: re-run `chart-mark-separation` and the edge-contrast check on a flattened bar and show what improves. If nothing does, the wash stays permanently and this section becomes a ratification. That measurement is cheap and it removes three of the five changed members from the churn list, which is why it is worth doing before any of §11's gallery work.

### 3.3 Reference regions: derived from bullet, which already solved this

`bullet.styles.css` already implements §3's rule 4 exactly, and better than a new token would: reference zones painted in **one neutral** (`--state-mute-hue`), mixed toward `--bg` on **both** canvases, in a **four-step ladder** — 36 / 22 / 10 / 4 on light, 40 / 26 / 13 / 5 on dark. Its comment records the measurement that produced those numbers: the quieter first cut (26/16/8/4) measured **1.13:1 and 1.10:1** between adjacent zones and *"at projector distance the row read as one flat gray strip."*

Two consequences, and HARD RULE #15 makes both mandatory rather than optional:

- **Bullet is the reference implementation and changes nothing.** §2 classifies it as "quantity + reference band"; its bands are governed by this section and are already conforming. Read literally, an earlier "ghost floor" would have collapsed four measured zones into one — the exact direction bullet measured as failing.
- **The token is a ladder, not a scalar.** `--chart-ref-strength` as one number cannot carry a per-canvas direction or a step count. It becomes `--chart-ref-ladder`: a comma-separated step list with a `light-dark()` pair, defaulting to bullet's measured values, so a theme re-tunes the whole family's reference regions in one place and bullet's own numbers are the default rather than a special case.

And the quadrant's flattened zones must be **re-checked against bullet's projector-distance floor** before "the crosshair and the labels do the separating" is asserted. That is the same claim bullet's first cut made and lost.

### The quadrant test, answered directly

A mark out-ranks its backdrop when three things hold, and the language requires all three:

1. The backdrop is **flat** (test 2 removes the dome).
2. The backdrop spends the **reference** ladder, not the categorical spectrum. Today `quadrant.transform.js` paints its four zones from `--chart-cat-1-hue` … `--chart-cat-4-hue`. Four zones are not four categories — they are one region divided by a crosshair, named by four zone titles. **The language says a reference region spends one neutral ink at the `--chart-ref-ladder` steps, never a categorical slot.** This matters beyond aesthetics: flattening the zones alone would move the quadrant from SWAMPED (0.278 self-range) to COLLAPSED (0.030 separation, below the 0.15 floor), because those four categorical hues are near-identical grays under achromatopsia. One neutral ladder removes the question — there is nothing left to separate by hue, and the ladder plus the crosshair and the labels do the separating, *if* the ladder clears bullet's floor.
3. The **contrast floor** holds: the mark-vs-region contrast exceeds the region-vs-canvas contrast. `tools/chart-mark-separation.js` already resolves paint per mark after the cascade, so this is checkable by the tool that exists.

**One free zone of emphasis is allowed and is authored, not automatic:** a deck may raise a single zone one ladder step while the other three sit at the quiet end. Emphasis on "the winners quadrant" is a real authorial act; four competing tints is not.

### 3.4 What flattening the pie costs — MEASURE IT, do not assume it

An earlier draft asserted that flattening to "the existing 82% stop" is free because `test/unit/palette/chart-contrast.test.js` already scores that stop. That is half true and it hides the visual half. **82% is the DEEPEST stop**, reached today only at the rim; flattening every wedge to it makes the whole pie the heaviest ink it currently touches anywhere, on all 13 themes. That is a much larger change than "the palettes keep the value they were graded against" implies, and the number the whole section turns on — whether a flattened pie clears the **0.15 adjacent-slot floor** on onyx, where today's nearest separation is 0.097 — was never re-derived, though the equivalent number *was* derived for the quadrant.

**So the recommendation is conditional and the measurement is named:** flatten to each candidate stop (**58%**, the mid stop, is the obvious alternative and the one that leaves the pie's overall weight closest to today's; 82% is the one already graded), and report separation + self-range per theme plus a rendered pie on cuoio, onyx and indaco, both canvases. If 82% fails the floor on onyx, the recommendation changes to 58% and the contrast test is re-blessed with the PR justifying it. The zone ladder is the one value that moves regardless, and it moves *down*, away from every contrast bar.

---

## 4. Answer 2 — Type

### The five roles stand; three measured conventions get named

`.cart-value` (display), `.cart-cat` (body), `.cart-series` (body), `.cart-tick` (label/mono), `.cart-axis-title` (label/mono, uppercase, tracked). All five live in `chart-family.css` under `:is(section.chart-frame, figure.chart-frame)`. No new `--fs-*` tokens (HARD RULE #4), `--chart-text-min` stays a floor.

**But the brief asked for seven, and it was right about three of them.** `value-2nd` is a role the family already uses and had never named — funnel's rate, bullet's plan marker, stacked-bar's part — and an unnamed convention used by three members is exactly what this language exists to stop. The same argument applies to `legend` and `heading`, which are set by every keyed member and governed by nobody. **All three are ratified as named roles**, mapped onto the type tokens they already resolve to; naming them costs one class each and no new scale.

### The radar tick split is a measurement artifact — as the brief already recorded

I re-ran the census (`node tools/chart-language-census.js --json /tmp/census.json`) and read the JSON, confirming the brief's own correction. Radar's two reported tick faces are `JetBrains Mono 9px 600` and `Outfit 21.4px 400`. Radar emits exactly one tick element, `.radar-tick`, styled `font-family: var(--font-label, var(--font-body))` at `var(--radar-tick-size)` = 9px. The Outfit entry at **21.4px** is the `<g class="radar-ticks">` **wrapper group**: the census's `roleOf()` does a substring match, `"radar-ticks"` contains `"radar-tick"`, and the group has `textContent`, so it is scored. The same artifact appears as `Outfit 21.4px 400` in quadrant's `category` bucket (its `<g class="quadrant-labels">`).

**Recommendation:** fix the census — skip an element whose text lives entirely in element children — and re-baseline.

### The two real splits

**Split 1 — `axis-title`.** quadrant paints `Outfit 14px 600`; scatter, slope and stacked-bar paint `.cart-axis-title`. **The family class wins**, for a reason already written in `chart-family.css`: the axis caption is uppercase and tracked "matching the chart eyebrow's register so the plot's captions belong to the same typographic system as the frame's." An axis title is chrome that names a dimension; it belongs with the eyebrow, not with the data. Quadrant adopts `.cart-axis-title`. One member, one class swap.

**Split 2 — the legend face**, which the brief calls *"the most visible incoherence in the family, because the legend is its most repeated element, and the most clearly accidental: nobody chose it."* Outfit on gantt / journey / roadmap / state-chart; JetBrains on map / piechart / radar / word-cloud. It is not a type decision at all — **it tracks the SUBSTRATE**, because the first four build their own key and the rest call `svg-legend.js`. So the fix is not a class swap: **the self-keying members move onto the shared builder**, and the face follows. That is the same piece of work §6 needs for the key row to become a reachable target, and the two are proposed together (§6.2) rather than one being claimed free and the other going unmentioned.

### Which roles a member owes — keyed on the job

Two obligations, and they are the whole rule:

> **O1 — Every mark is nameable.** A reader must be able to say which mark is which without leaving the figure. The member owes `category` text at the mark, or a `series` label at the mark, or a `legend` row that names it. Never none.
>
> **O2 — Every number the chart is *for* is readable.** If the reader's job is Level or Share, the member owes `value` at the mark, **or** `tick` + `axis-title` in the gutter. Never neither, and only both when the ticks carry a unit the values cannot.

Job-keyed consequences:

- **Rank** jobs owe O1 and may skip O2 (word-cloud, kanban, matrix-grid).
- **Level / Share** owe both.
- **Position** owes O1 plus `axis-title` on both axes — a scatter or quadrant point means nothing until the axes are named.
- **Flow** owes O1 plus a time reference (gantt's quarter header, roadmap's column labels).
- **State** owes O1 plus the status word, which the `.chart-status` pill already prints.

Only `value`, `value-2nd` and `series` may take a categorical ink; `tick` and `axis-title` are always `--text-muted`, and `category` is always `--text-body`. That keeps the categorical spectrum on the data and off the furniture — which is what makes the palette survive being drawn from twice.

---

## 5. Answer 3 — Furniture

### The rule is already implemented in one member; the language just makes it the family's

`bar.transform.js` `wantsValueAxis()` decides furniture by *measuring* whether a direct value label fits in the band a mark has, and its docblock states the principle: "Direct labeling wins whenever it fits… the axis is not the default that direct labels replace; it is the FALLBACK for when the labels will not fit." That is the correct rule, it is measured rather than guessed, and the brief's correction section already records that the census reading it as "a bar chart that draws neither a gridline nor an axis" was reading a decision as an accident.

> **Furniture is what a reader needs to recover a number the chart did not print.** Print the number and you owe nothing. Fail to print it and you owe the whole apparatus.

| Reader's job | Owes |
|---|---|
| **Read a level off a scale** (the number is not printed at every mark) | value ticks + gridlines at the tick positions + an axis rule bounding the plot |
| **Read a level, number printed at every mark** | nothing — no grid, no axis |
| **Compare magnitudes that can cross zero** | the **zero rule** (`.cart-zero`), independent of gridlines and never softened with them |
| **Read a position in two dimensions** | gridlines on both axes + both axis rules + both axis titles |
| **Read a position against a reference** | the region's **bounds** rule; the region *is* the grid, so no gridlines |
| **Read a level on many axes at once** | the polar web — radar's rings and spokes are its gridlines |
| **Read order or nominal position** (flow, state, geography, a word cloud) | no value furniture; a **time** or **column** rule where the horizontal axis is measured (gantt, roadmap) |

The rule is read against the **derived** `valuesPrinted` input from §2, not against a per-member row — which is what generalizes `wantsValueAxis` instead of ratifying its result once.

Applied, this ratifies almost everything: bullet, scatter, stacked-bar, waterfall keep grid + axis; line keeps grid and correctly has no axis rule (its zero is not the plot edge); radar's web is its grid; matrix-grid's table rules are its grid; quadrant gains an explicit bounds treatment it already draws (`.quadrant-bounds`). The furniture chapter is mostly a *ratification*, and that is a feature.

Weights stay as they are and are already right: `.cart-grid` mixes off `--border` at 62% ("deliberately the quietest mark on the plot"), `.cart-axis` at 88%, `.cart-zero` off `--text-body` at 42%. Three weights, one ordering, palette-blind.

### 5.5 The brief's five un-numbered defects

The eight numbered questions are the brief's skeleton; these five are its evidence. Answering only the skeleton is what lets a proposal read as complete while leaving the pair the brief singled out still disagreeing.

1. **Corner radius is unowned.** `chart-family.css` hard-codes `2.25cqi` (line 880) and `0.859375cqi` (line 947) with nothing naming either. **Fix:** one `--chart-radius` scale (two steps: mark, surface) in §10's token set, resolved from those existing values so no pixel moves on adoption. This is exactly the kind of question §10 exists to answer and it was cheaper than any other item here.
2. **Legend PLACEMENT** — right rail vs centered row below vs inline mono-italic caption — is a real fifth divergence and §6 answered only rail-vs-direct-vs-nothing. **Fix:** placement becomes a rule keyed on the diagram's aspect ratio, which `svg-legend.js` already implements (`PORTRAIT_LABEL_COL_R`, `buildPortrait`): a tall box gets the key below, a wide box gets the rail. Keyed, not chosen per member.
3. **The bar / stacked-bar pair**, of which the brief says *"if the language fixes nothing else, it has to fix this pair."* Three things divide them, not one: the wash (now §3.2, withdrawn pending measurement), **bar's 1px dark mark outline vs stacked-bar's none**, and their divergent key models. **Fix:** the mark edge is a family constant — one `--chart-mark-edge` weight, applied to both or neither (recommend both: it is the mechanism §3.2's measurement says identifies a quantity mark); and the key model is resolved by §2's derived `categoryCount` rather than by member, which lands both on the same answer for the same data.
4. **kanban's vertical composition.** Cards stack without a rhythm the other surface members share. **Fix:** it inherits the same `--chart-radius` surface step and the seat wash it already has; the spacing is a `gap` question (HARD RULE #20 — never `margin`) and is scoped to the kanban redesign record rather than reopened here. Recorded, not ignored.
5. **The legend face split** — answered in §4 as a substrate problem, with the fix in §6.2.

---

## 6. Answer 4 — The key, and the key as an addressing surface

### 6.1 When each

> **A key is a lookup the reader pays for. Charge it only when the mark cannot pay for itself.**

| Condition on the data | Key model |
|---|---|
| Every mark can carry its own name at readable size | **direct labels**, no rail |
| The mark cannot hold text — too small (a 5% wedge, a map region, a matrix cell, a dot) or its color repeats across many marks (a series across a line's points) | **rail** |
| Color carries a **ramp**, not a set (choropleth map, heat cell, weight tier) | **scale key** — a continuous or stepped ramp with end labels, not a swatch list |
| One encoded set, named in the heading or subtitle | **nothing** |

The third row is a genuinely missing model. A choropleth is not eight categories and a swatch list misrepresents it as one; today `map` shows a rail of rows for a magnitude ramp. A scale key is also the *non-color channel* for a ramp, which is why it appears again in §9.

Applied: pie, map, radar, matrix-grid, gantt, roadmap, state-chart, journey keep rails (state and geography cannot self-label). Line, slope, scatter, stacked-bar keep direct labels. Bar, funnel, waterfall, bullet, progress, timeline-list, kanban, word-cloud keep nothing. Quadrant's dots take direct labels — which it already prints (`.quadrant-label`). Placement within "rail" is §5.5's aspect-ratio rule. The census's "three models, no rule" becomes three models with one rule, and only the map's choropleth variant actually changes.

### 6.2 The rail is also the touch target — and it costs one unification, not one file

**Every key row carries the `data-mark` of the mark it names, and hovering, tapping or focusing the row reveals that mark.** The reverse holds too: revealing a mark lights its key row.

This is not decoration. It is the answer to a problem no amount of tuning fixes: **a 5% pie wedge and a small map region are not tappable at 44 px on a phone.** A key row is a full-width, text-height target, always. It is also where keyboard reach lives (§8.4), because the rail is DOM the reader's assistive tech can actually walk.

**The mechanism is not one file, and an earlier draft's "eight rail members in one builder" was wrong by roughly half.** `svg-legend.js`'s own header says it serves *"the four KEYED chart-family charts (piechart · radar · map · cohort quadrant)"*; its actual `buildSvgLegend` callers are **bar, line, map, piechart, quadrant, radar, stacked-bar** (scatter and word-cloud call `buildSpine` only). **gantt, journey, roadmap, state-chart and matrix-grid each build their own key** — which *is* the legend face split of §4, and it tracks the substrate.

So the work splits honestly in two:

- **What one edit to `svg-legend.js` buys:** wrapping each row in `<g class="chart-key-row" data-mark="i">` gives cross-light to the members already on the shared builder. The pie doc recorded "legend cross-light" as a future; this closes it for those members.
- **What each self-keying member owes to join:** moving onto `buildSvgLegend`. That is the prerequisite for the key row being a reachable target there, and it is the same change that fixes the legend face split — one piece of work, proposed once.

**Three implementation traps, all real:**

- `markEls()` is `chartEl.querySelectorAll('[data-mark]')`, so key rows join the mark set — `markCount()` de-dupes by index so counts stay right, `infoFor()` takes `marksFor(i)[0]` and the diagram precedes the key in DOM order so the mark still wins, but `liftVec()`'s centroid-of-all-marks hub would be skewed by key rows. §8.3 removes the lift, which removes the trap; if the lift is kept instead, `liftVec` must filter to the diagram group.
- **gantt emits its key as `<g class="gantt-legend" aria-hidden="true">`** (`gantt.transform.js:584`). A focusable, tappable row inside an `aria-hidden` subtree is worse than none. Joining the shared builder means dropping that attribute and giving the rows real accessible names.
- A wrapping `<g>` with no transform paints identical pixels, so PDFs are unaffected, but the **exported SVG bytes change** for keyed charts.

---

## 7. Answer 5 — Motion

### Four choreographies, keyed on how the mark is read

The existing model is close: `docs/src/lib/chart-anima.ts` has five roles (`bar`, `sector`, `point`, `region`, `label`), three styles (`build`, `together`, `rise`), and one role-aware branch — sectors reveal synchronized because a staggered wedge leaves a hole. The language names four choreographies and keys each on the data shape rather than leaving it as one branch:

| Choreography | Keyed on | Members |
|---|---|---|
| **assemble** — every mark reveals together | the marks are parts of one closed figure; a gap reads as missing data | piechart, map, matrix-grid, radar polygons, quadrant zones, scatter, state-chart nodes |
| **build** — staggered reveal in the reading order of the data | the *order* is the story | funnel (top→down, the drop-off), bar and waterfall and stacked-bar (left→right), gantt (by start date), roadmap, timeline-list, kanban (by column) |
| **rise** — build, plus each mark slides in from its baseline | the mark grows *from* a reference the reader can see | bullet, progress, bar when the axis is drawn |
| **trace** — the mark draws along its own path | the mark *is* a path; its shape is the datum | line, slope, radar overlay, journey's mood curve, state-chart edges |

`assemble`, `build` and `rise` are expressible today in `reveal` + `slide` + `highlight`. **`trace` is specified and deliberately not shipped in this pass, and the reason is a bundle boundary, not laziness.** `MARKS_CAPS` in `docs/src/lib/anima/backends/marks.ts` declares `draw: false`, and `svgRendererFor()` in `registry-svg.ts` returns **null** for a scene carrying a draw verb — so a line chart that emitted `draw` today would silently not animate at all. Shipping it means routing charts through `drawable.ts`, which imports `animejs` and `animejs/svg`; `svg-paint.ts`'s own header records that the split exists precisely so "a chart-only bundle omit[s] the drawing library entirely." That is a cost on **every deck with a chart**, animated or not, and it belongs to the human, not to this document.

**The interim assignment, so no member is left without a motion answer:** line and slope **build** left-to-right by point; radar's overlay **assembles** with its polygons; journey's mood curve and state-chart's edges **assemble** with the rows and nodes they belong to. Each is the fallback that `trace` would replace, and each is expressible today. Recommendation: ship three choreographies plus those fallbacks now; put `trace` behind a measured bundle delta.

### The five non-SVG members: a declared CSS build, not a restructure

`kanban`, `matrix-grid`, `progress`, `roadmap` and `timeline-list` have no `<svg>`, so `chartToScene` skips them silently. **Restructuring them to SVG is the wrong answer for four of the five** — they are text that must wrap and reflow (a kanban card title, a timeline row, a roadmap cell), and an SVG viewBox is exactly where text stops reflowing.

Give them a CSS build in the **shape the engine already ships for narrative builds**, which is `lib/base/base.build.css` (HARD RULE #15 — do not reinvent):

- the kernel stamps each mark `data-chart-build-step="N"` (engine tags);
- one shared sheet hides and reveals (CSS treats), palette-blind, `opacity`/`transform` only — **no `margin`**, HARD RULE #20;
- **the zero-pixel guarantee is inherited verbatim**: without the driver attribute on the `<section>`, nothing applies and every mark shows. Print renders the final frame, the un-driven preview renders the final frame, and every existing PDF stays byte-identical.
- `prefers-reduced-motion` reduces rather than removes, matching the family's stated behavior in `chart-family.docs.md`.

The honest caveat: a CSS build is invisible to the anima scene model, so the `player-motion:` opt-out has to be honored by a class on the section rather than by not emitting a scene. That is a one-line consumer change, and it must be built, not assumed.

**And fix the stale table.** `chart-family.docs.md` § "Motion + mark-detail support, by member" lists none of the eight members added since. The language's answer is not to update the prose — it is that the table should be **generated from the manifest's `render` field**, which is already gated against the rendered export by `npm run check:render-nature`. A prose table is a claim; a generated one is a measurement.

---

## 8. Answer 6 — Detail reveal, and the affordance vocabulary

This is where the family is furthest from being one system, and it is the cheapest place to buy the most.

### 8.1 Who owes a popover

> **A mark owes a reveal when it is discrete, addressable, and carries something the slide does not already print.**

**Owes it (17):** bar, bullet, funnel, gantt, kanban, line, map, matrix-grid, piechart, quadrant, radar, roadmap, scatter, slope, stacked-bar, state-chart, waterfall.

**Does not (4), each for a shape reason:**
- `progress` and `timeline-list` render their nested sublist **inline on the slide already** — there is no hidden detail to reveal, and a popover that repeats the slide is noise. (This ratifies the Tier-3 call in `2026-06-20-chart-detail-reveal-family.md`.)
- `journey`'s inline SVG is decorative and its board is prose the reader can already read.
- `word-cloud` — the older assessment calls a per-word popover "a gimmick, not a presenter tool," and the language defers to it. **I record a disagreement rather than hide it:** `word-cloud.transform.js` already emits `data-weight` and `data-rank` on every `.wc-word`, and a word cloud is the one chart where the *quantity* is invisible — tapping a word to read "34 mentions, rank 3" is the only quantitative read it has. Cheap to reverse later; not proposed here.

Gaining marks: **kanban, matrix-grid, roadmap** (new `data-mark` + `data-label` + `data-value`) — **conditional on §8.5's table grammar**, because two of the three are table-authored and the list grammar cannot reach them — and **line**, which is a subtler case: `line.transform.js` emits its `.line-hit` band **only where the author wrote a detail bullet** (`model.marks.map((m, i) => (m.detail ? … : ''))`). That is exactly option C from `2026-06-21-chart-reveal-lean-tooltip.md`, which the family rejected on hidden-affordance grounds, surviving inside one member. Line emits the hit band unconditionally.

### 8.2 The chart-level gate goes

Today `interactive()` requires `detailsEl` — the `.chart-details` wrapper that only exists when someone authored a detail bullet. So the industry-standard promise the family settled on in June ("hovering *any* mark shows its identity and value") is conditional on an author having written a nested bullet **somewhere else in the same chart**. Two identical bar charts on adjacent slides behave differently, and nothing on either slide says why.

**Bind whenever the chart has at least one `[data-mark]`.** Authored detail upgrades the lean chip to the full card, exactly as the two-depth model already specifies. This is a one-line gate change plus the `data-label`/`data-value` obligation from §1 — and it is the single change that most makes the family feel like one product.

### 8.3 The affordance vocabulary — four states, one set, all 21 members

| State | Means | Paints |
|---|---|---|
| **rest** | default | the mark's own fill |
| **candidate** | pointer or focus is on it, nothing open | a hairline halo ring in `--chart-mark-halo`; no dim, no lift, no tilt |
| **active** | this is the revealed mark | `.chart-mark-active` + the popover |
| **muted** | a sibling of the active mark | recedes by `--chart-mark-dim` |

Two things change so this can be *one* vocabulary rather than four:

**The tilt goes.** It is the only affordance that cannot be uniform: SVG sheets tilt, `gantt` is excluded by name because "a `rotateX` would skew the time axis," the `inline` state-chart variant is excluded because a rotate on a flat row reads as skew, and HTML marks never tilt. Its own exclusion list is the argument — the reasons it is wrong for gantt (a 7° `rotateX` foreshortens the axis a reader is taking a value off) are true of every chart with a measured axis, which is most of them. Removing it deletes three special cases from `chart-interact.js` and makes the vocabulary identical on all 21. **This is a recommendation, not a fiat, and it undoes a flourish the repo likes** ("It reads beautifully"): the reversible alternative is to keep the tilt as an opt-in deck register rather than the default, so a pie-led narrative deck can still have it and a board pack cannot get it by accident.

**Muted paints with `filter`, not inline `opacity`.** This is the mechanism that removes the animated-chart exception. The anima painter (`docs/src/lib/anima/backends/svg-paint.ts`) writes exactly three channels per frame — transform, opacity, stroke-width — which is why `liftAndTilt` has to bail on `isAnimaChart()`: the reveal's inline `opacity` would fight the renderer's baked frame. `filter` is untouched by the painter, so a class-driven `filter` on a muted sibling **composes** with an inline opacity instead of colliding with it.

**The function has to be named, because the choice decides whether it works.** `--chart-mark-dim` resolves to a **`saturate()` + `brightness()` pair with a `light-dark()` value**, not a bare number: a brightness amount recedes in opposite directions on light and dark canvases, so one scalar cannot be correct on both. `opacity()` is explicitly **rejected** — it multiplies with the painter's inline opacity, so the dim strength would vary frame-to-frame during a build, which is the exact coupling this mechanism exists to avoid. The token ships with its resolved value shown on a light and a dark canvas.

### 8.4 Input verbs — extend the doctrine to the mark layer, without stealing the deck's verbs

`2026-08-10-input-verb-parity.md` set the rule for slides: *every surface takes keyboard, wheel and touch at every breakpoint, with no gating on device class.* The mark layer has never had that rule, and it shows.

> **The deck-verb collision rule.** Before the language claims any input verb for the mark layer, it is checked against `PRESENT_KEYMAP` in `lib/core/present-transport.mjs`. A verb the transport owns is either left alone or taken only inside an explicit, exited chart focus state. This check applies to **every** key, not only the wheel — an earlier draft applied it to the wheel, got it right, and then bound `←`/`→` one row later, which `PRESENT_KEYMAP` maps to `prev` / `next`.

| Verb | Rule |
|---|---|
| **Pointer** | hover-follow on fine pointers, tap on coarse. Exists. |
| **Touch** | every mark reachable by tap; where a mark is smaller than a comfortable target, **its key row is the target** (§6.2). |
| **Keyboard** | Tab moves focus to the **chart**, not to 21 marks. `Enter` **enters** the chart: only then do `←`/`→` walk marks, and `Enter`/`Space` pins the reveal. `Esc` **exits**, handing `←`/`→` back to the deck. Outside the entered state the chart binds no transport key. Number keys `1`–`9` stay as an un-owned shortcut. |
| **Wheel** | **deliberately unbound**, entered or not. The wheel is the deck's navigation verb (`createWheelGate`); a chart that swallowed it would strand the reader mid-deck with no exit gesture, which the `Esc` exit does not cover for a pointer-only user. |

**Where the walking lives, and the `role="img"` conflict.** `buildSvgRoot` sets `role="img"`, which is children-presentational and **prunes the whole subtree** — `cartesian.js` states it outright, and it is why `desc` is a required argument there rather than an option. A roving tabindex on marks *inside* that subtree would take a focus ring and announce nothing: worse than no keyboard reach, because it looks like it works. The language resolves this rather than citing both halves:

> **Keyboard reach lives on the key rail, which is DOM outside the pruned subtree** — the same element §6.2 already makes the touch target. `role="img"` and `<desc>` stay exactly as they are, `desc` stays required, and no mark inside the SVG becomes focusable. A member with no rail either gains one under §6.1's rule or its marks are reachable only by pointer and by the number-key shortcut, and the language says so instead of implying otherwise.

Screen readers are the fifth verb. **Whatever the popover would say, the `<desc>` already says in aggregate**, and `data-label`/`data-value` (§1) are the same strings — so a per-mark accessible readout is a serialization of data the marks now carry, not new authoring. Members whose `<title>` is a bare noun ("Pie chart", "Map") should name the subject instead.

### 8.5 The authored grammar — two forms, keyed on the authored substrate

Today the grammar is one rule with four member-specific depths: `splitDetail` takes the first nested `<ul>`; quadrant needs one level deeper; gantt's is one below the task; state-chart reuses a prose bullet that used to be dropped; kanban's cards already sit three levels down. An author cannot hold that.

**One sentence is not enough, because two of the three members §8.1 adds are TABLE-authored.** `matrix-grid.docs.md` declares its `matrix` slot as a markdown table whose cells carry the positional grammar; `roadmap.transform.js` scans `<td>`s via `splitTable`. A table cell has no nested list to hang detail from, so a list-only grammar reaches 1 of the 3 new members — on exactly the surface meant to prove the "one system" claim.

> **List-authored members:** the nested bullet list under a mark's own item is its detail. The first bullet is the body; the rest are meta.
>
> **Table-authored members:** a cell's detail is its **trailing inline-code payload** — text in backticks at the end of the cell. The first payload is the body; a second is meta.

Both are depth-relative and both are stated in the frame the author has (their own list item, their own cell) rather than the frame the parser has. Two constraints carry forward into the author-facing docs: **bullet lists only** for the list form (`splitDetail` captures the first nested `<ul>`; a nested `<ol>` leaks into the label — a maker-checker finding), and **detail renders nowhere on the printed chart face**, which is the mistake `funnel.docs.md` already lists first under Common mistakes. If the table form is not built, matrix-grid and roadmap drop out of §8.1's "gaining marks" list and the doc says so.

### 8.6 Print fallback for members that gain a popover

Free, and already built. `_chart-family/mark-detail.js` `detailNote(marks)` folds per-mark detail into one Marp-faithful `<!-- … -->` comment that notes-core lifts into the slide's note channel and strips before render, so the chart pixels stay byte-identical. It is pure HTML-string-in / string-out with no DOM, so it works for the HTML members gaining marks exactly as it does for the SVG ones. **The rule: any member that gains `data-mark` also calls `detailNote`.**

### 8.7 Where the reveal lives — the one gap I am not closing

The reveal exists on the Studio Playground and the frozen Drawing Board only. The **exported `--player` HTML carries motion but not reveal**: `data-mark` appears in `lib/export/anima-player-bundle.generated.mjs` (inlined from `chartToScene`) but `chart-detail` and the popover do not appear anywhere in `lib/export/`. So the artifact that leaves the building animates and cannot be touched.

The language's position is that **a mark is addressable wherever the deck is interactive**, and the honest cost is that `chart-interact.js` depends on `@floating-ui/dom` for collision-aware anchoring, which the player bundle does not carry. That is a bundle decision of the same kind as `trace`, and it goes to the human with a measured delta, behind a `player-detail:` key alongside the existing `player-motion:`. Until then the speaker-note fallback (§8.6) is the offline reader's channel.

### 8.8 One roster to delete

`CHART_SVG_SEL` in `chart-interact.js` is a hand-maintained string of 15 selectors, and `design/skills/chart-component.md` already lists it under "SILENT — no gate, no red test, just a capability your chart quietly lacks." Adding three members means editing it by hand and hoping. **Have the chart frame emit one attribute — `data-chart-root` — on every member's figure root, and bind on that.** One roster gone, one class of silent failure gone, HARD RULE #1 satisfied.

---

## 9. Answer 7 — The non-color channel

### The rule is keyed on the mark's size, not only on what color carries

Texture is a channel for **areas**. A 6 px scatter dot cannot hold a hatch, and hatching it produces mud. So the language has four channels and a floor:

| Condition | Channel | Mechanism (all exist) |
|---|---|---|
| Filled mark, area above the texture floor | **texture** | `data-cat="N"` → `url(#latt-a11y-chart-tex-N)` in `themes/a11y-base.css` + `lib/base/base.print-textures.css` |
| Stroked series mark | **dash pattern** | `data-series="N"` → `stroke-dasharray` in the same two files |
| Semantic / status mark | **shape + word** | the `.chart-status::before` glyph set, plus the pill's own text label |
| Filled mark **below** the texture floor | **direct label** | the mark names itself; §6 already requires this when a mark can hold text |
| Color carries a **ramp** | **value + a stepped scale key** | §6's third key model; a texture cannot order |

The fourth row is what keeps this proposal from inventing a token family. A mark too small to hold a texture is also too small to be found in a legend by color — so the correct remedy is the one the family already has a class for, not a new `--chart-cat-N-shape` set.

### 9.1 The channel is NARROWER than the cycle it backs up — and that is the finding

**This is the brief's general rule and it was unanswered:** *"a redundant channel that is narrower than the channel it backs up is not redundancy — it is a silent merge… its width has to be declared against the categorical cycle's width and gated."*

Measured: the categorical palette is **8 wide**; the a11y/print chart texture wiring is **6 wide** — `nth-of-type(6n+…)` at `themes/a11y-base.css:279–298` and `lib/base/base.print-textures.css:67–85`. So **categories 7 and 8 silently wear the textures of 1 and 2**, while `tex-7` and `tex-8` sit emitted and unused. The pie's documented ceiling is 11 slices; `matrix-grid.docs.md` confirms it colors up to eight rows. On the gallery's 3–5 categories none of this is visible, which is exactly why it was missed.

> **The rule: the non-color channel's declared width equals the categorical cycle's width, and a gate compares them.** Widen the `Nn+` cycle in both texture files from 6 to 8, and add a test asserting the cycle length against the count of `--chart-cat-1..8` so the two cannot drift apart again.

**And every coverage number in this section is re-derived against the stress deck, not the gallery.** `tools/build-stress-deck.js --bucket chart` renders each member at its ceiling; any claim about how many members lose the categorical read is measured there first. The numbers below are the gallery run and are labeled as such.

### 9.2 What the gallery run shows, and what it cannot see

```
node tools/chart-mark-separation.js --theme a11y-achromatopsia   # GALLERY sample
  → 3 members lose the categorical read: kanban, matrix-grid, quadrant
  → bullet: "single category" · word-cloud, map: "no categorical marks"
  → piechart, funnel, stacked-bar: "textured — colour not load-bearing"
  → line, slope, radar: "line-styled — separated by stroke dash pattern"
```

- **quadrant** — SWAMPED, and it is a **fill-finish** defect, exactly as the tool's own docblock says: "no theme can separate categories that a mark's own shading paints over." §3 fixes it by making the zones one reference region instead of four categories. Flattening alone would not have: it would land at 0.030 separation, below the 0.15 floor.
- **kanban** and **matrix-grid** — COLLAPSED at 0.000 and 0.012. Both are HTML, where an SVG `<pattern>` `fill: url(#…)` cannot apply at all — so texture was never available to them. **Both already name their category in text beside the mark:** kanban paints the lane name in `<span class="kanban-lane">` with `--lane-color` from `--chart-cat-N-ink`, and matrix-grid's first body column *is* the category axis. **The language's rule: where a mark's category is named in text adjacent to the mark, the text is the non-color channel and the hue is redundant identity.** That is the accepted remedy for "color is not the only visual means," and it also explains why `bullet` is *deliberately* untextured — `base.print-textures.css` says so in the file: "its three layers are separated by VALUE… texturing the band would fight the measure bar."
- **map** and **word-cloud** are **UNMEASURED, not cleared.** The tool's own header says map is skipped as a choropleth and that "word-cloud's categorical read, if it has one, is unmeasured here." An earlier draft converted both non-answers into passes. Word-cloud's encoding is type size, which survives grayscale — but that is an argument, not a measurement, and the two are labeled differently now. `map.transform.js` does have a categorical mode (`style = --region-hue:var(--chart-cat-${slot}-hue)`): **map regions get `data-cat`** and the two texture files gain one selector each. The choropleth variant instead takes §6's stepped scale key plus a printed value where the region can hold one.

### 9.3 The a11y answer is not the editorial answer

Clearing matrix-grid on redundancy grounds says nothing about **whether the categorical spectrum should be spent on that axis at all** — and that is the question the brief actually raised. matrix-grid re-introduces the exact defect `2026-06-22-kanban-chart-redesign` records fixing: *"colour was spent decoratively on CATEGORY, the card's least decision-relevant axis."* `matrix-grid.docs.md` confirms the hue carries category, not state. "Redundant identity" is a defense of a *channel*, not of a *spend*.

> **The editorial rule, stated separately: the categorical spectrum is spent on the axis the reader decides from.** In a matrix the reader decides from the **cell state**, not the row's name — so matrix-grid's row hue goes the way kanban's card hue went, and the state channel takes the color. That is a second change to matrix-grid, distinct from the a11y one, and it is what stops the recurrence the brief says a design language exists to stop.

### 9.4 The corrected cost

Given §9.1, the honest cost of Answer 7 is: **widen both texture files' cycle from 6 to 8 and gate the width** (the finding that actually matters, invisible at gallery size); **`data-cat` on map**; **§3's quadrant fix**; **§9.3's matrix-grid respend**; plus a written rule that ratifies what kanban, bullet and word-cloud already do. Smaller than "six members of new work," larger than the one-attribute claim an earlier draft made from a sample that could not show the defect.

---

## 10. Answer 8 — Tokens: five new, no new palette

Everything above is expressible in existing tokens except five things (HARD RULE #3 — every color still `var(--token)`; HARD RULE #4 — none of them is an `--fs-*`).

| Token | What it governs | Why it must be a token |
|---|---|---|
| `--chart-mark-halo` | the candidate-state ring | must clear 3:1 against the canvas *and* against every categorical fill; onyx and an a11y theme need a value, not a hue. Defaults to a mix off `--text-heading`. |
| `--chart-mark-dim` | how far a muted sibling recedes | a `saturate()`+`brightness()` pair in a `light-dark()`, so it recedes correctly on both canvases and composes with the anima painter's inline opacity (§8.3). Today's hard-coded `0.45` informs the default; `opacity()` is rejected. |
| `--chart-ref-ladder` | reference-region tint steps | a step list with a `light-dark()` pair, defaulting to bullet's measured 36/22/10/4 ÷ 40/26/13/5 (§3.3). A scalar cannot carry a per-canvas direction or a step count. |
| `--chart-radius` | mark and surface corner radius | today's `2.25cqi` / `0.859375cqi` are hard-coded and unowned (§5.5); resolved from those values so nothing moves on adoption. |
| `--chart-build-step` | per-mark stagger for the CSS build | ms; lets a theme or a deck calm the build on the five non-SVG members without touching the sheet. |

A sixth, `--chart-mark-edge`, is proposed **conditionally** in §5.5: it exists only if the bar/stacked-bar edge is unified, which §3.2's withdrawn-wash measurement decides.

Everything else reuses what ships: `--chart-fill-top-l/-d`, `--chart-fill-bottom-l/-d`, `--chart-fill-edge`, `--chart-fill-accent` (the seat wash, unchanged); `--chart-hairline` and `--chart-accent-lg`; `--chart-rule`; `--chart-cat-N-hue/-fill/-ink` and `--chart-state-*`; `--cat-N-texture`; `--chart-text-min` as a floor. **No token is deleted and no palette value moves.**

Deliberately **not** proposed: a grid-weight token (grid strokes are viewBox user units that scale with the SVG — `check-chart-responsiveness` exempts SVG-context rules for exactly this reason); an elevation token (the tilt goes); a categorical *shape* token family (§9's fourth row removes the need).

---

## 11. What it costs

**Members whose painted pixels change: two confirmed, three conditional.**

| Member | Change | Status |
|---|---|---|
| piechart | radial dome → flat, at the stop §3.4's measurement picks (58% or 82%) | confirmed; stop pending measurement |
| quadrant | four categorical domes → one neutral `--chart-ref-ladder`; `.cart-axis-title` adopted | confirmed |
| matrix-grid | row hue → state hue (§9.3) | confirmed |
| bar · waterfall · gantt | vertical wash → flat | **withdrawn** pending §3.2's edge measurement |

`radar` is **reclassified with zero pixel change**. `bullet` is the reference implementation of §3.3 and changes nothing. `progress`, `state-chart`, `timeline-list`, `kanban`, `roadmap` keep their fills.

**Members that gain behavior without changing a painted pixel: seven.** line (unconditional hit band), kanban, matrix-grid, roadmap (marks + reveal + CSS build — the latter two conditional on §8.5's table grammar), progress and timeline-list (CSS build only), map (`data-cat`). `data-mark`, `data-label`, `data-value` and `data-anima-role` are invisible attributes; `<template class="chart-detail">` renders nothing.

**Shared files touched:** `chart-family.css` (the five tokens, the four mark states, the reference-region ladder, radius), `_chart-family/svg-legend.js` (the key-row `<g>`, plus five members migrating onto it), `_chart-family/mark-detail.js` (unchanged API, new callers), `docs/src/playground/chart-interact.js` (gate, enter/exit focus model, filter-based dim, tilt removal, cross-light, `data-chart-root`), `docs/src/lib/chart-anima.ts` (the choreography map), `themes/a11y-base.css` + `lib/base/base.print-textures.css` (cycle 6→8, plus map), and a new build sheet in the shape of `lib/base/base.build.css`.

**Gallery churn.** The changed members' `<name>.gallery.{light,dark}.pdf`, plus `chart.gallery.{light,dark}.pdf`, plus any `examples/*.pdf` carrying them. HARD RULE #8 keeps gallery graduation in a separate post-review commit. Exported SVG bytes change for every keyed chart even where the PDF pixels do not.

**What could break, ranked:**

1. **`test/unit/palette/chart-contrast.test.js`** resolves "the full token chain incl. each chart's deep gradient stop." Removing the pie's and quadrant's gradient stops changes what that chain resolves *through*. Highest-probability red, and red by construction rather than by regression — check it first, and re-bless only with §3.4's measurement in the PR.
2. **`npm run check:jank`.** The candidate-state halo must not move anything. An `outline` grows no box; an SVG `stroke` near the viewBox edge **can clip**.
3. **`tools/check-viz-render.js` `CANVAS_TEXT`** — text on the newly-flat quadrant zones gets a lighter backdrop.
4. **`test/unit/components/cartesian.test.js`** reads `chart-family.css` and fails when the `FS` table drifts from `cartesian.js`. Type work must not touch those sizes.
5. **The census itself** needs the `<g>`-wrapper fix before it can be an after-baseline.

**What has NO coverage — the larger risk.** The proposal's interaction surface is essentially unguarded: there is one chart-related Playwright spec in `docs/e2e` (`state-chart-export-layout.spec.ts`). Removing the tilt, changing `interactive()`'s gate, and letting key rows join `markEls()` all change Playground behavior and **nothing would go red**. HARD RULE #23 requires an artifact from the real Playground anyway, so the arms are named now rather than discovered at review:

- reveal binds on a chart with **no** authored detail;
- a muted sibling recedes on an **animated** chart (the `filter` path);
- a key row cross-lights its mark, and `Esc` returns `←`/`→` to the deck;
- gantt's key rows are reachable after the `aria-hidden` drop.

**No new dependency** — `trace` and the player-side reveal are the two places one would enter, and both are deferred to a measured decision.

---

## 12. If only one thing ships

Ordered by what each unblocks:

1. **The mark contract (§1) plus the gate removal (§8.2).** Cheapest, invisible in print, and it is what makes the family feel like one product. Everything in §6, §8 and §9 stands on `data-mark` / `data-label` / `data-value` / `data-cat` being universal.
2. **The non-color channel width (§9.1).** One number in two files plus a gate, and it closes a silent merge that no gallery run can see. Cheaper than anything else here and the only item that is currently *wrong* rather than *inconsistent*.
3. **The fill test (§3), pie stop measured first (§3.4).** Fixes the measured dome defect and the a11y gap for quadrant, with bullet's ladder as the reference region rule.
4. **The affordance vocabulary (§8.3) and the keyboard enter/exit model (§8.4).** Removes three special cases and one silent behavior change (`motion: on` turning off the dim), without stealing a deck verb.
5. **Furniture, the key, and the legend unification (§5, §5.5, §6).** Mostly ratification, except the five self-keying members moving onto `svg-legend.js` — which is one piece of work paying for the face split, the placement rule and the reachable key row together.
6. **Motion (§7).** Real work, and `trace` is a bundle decision that is not mine.

The reason to sequence it that way: everything else in this language is a rule about how a mark *looks*, and rules about looking can be argued. The mark contract is a rule about what a mark *is*, and once it holds, the rest is enforceable by the tools that already exist — `tools/chart-language-census.js` for the paint, `tools/chart-mark-separation.js` (run against `tools/build-stress-deck.js`, not the gallery) for the channel, `npm run check:render-nature` for the motion table.
