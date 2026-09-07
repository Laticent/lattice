<!-- Design-competition candidate (colour round), 2026-09-07.
     Track 3 — systems.  Judge score: 8.5/10.
     Title: Reach and Retreat — three chart finishes as one conservation law
     A PROPOSAL. The winner is track 3; the ranking and the grafts to
     fold into it are in ../judgement-colour.md. Brief: ../colour-brief.md. -->

# Reach and Retreat

**Three finishes: `pigment` · `etching` · `ground`. One law, three token blocks plus a small gated rule set, zero rules naming a chart.**

---

## The answer, in five sentences

1. **A finish declares which register holds a group's hue at FULL strength, and the other registers carry it at reduced strength.** The three registers are settled — MARK / BACKDROP / INK — so the three finishes are the three answers to "which one is the identity channel", not three volumes of the same design.
2. **Reach and depth trade, and the trade is forced by measurement, not taste.** Categorical separation is proportional to body depth: median adjacent-slot OKLab across 14 themes × 2 canvases is **0.125 at an 82% body, 0.076 at 50%, 0.047 at 30%**. A finish that takes pigment out of the body has *lost* separation and must buy it back — and the ink is where it is bought, because **`--chart-cat-N-ink` is hue-separable further than the fullest body (median 0.145 vs 0.125; min 0.025 vs 0.015)**. That number is area-blind; see §7 I4 for what it does and does not license.
3. **Two things never vary, because measurement makes them structural.** Every mark carries an ink EDGE in every finish — no body clears the 3:1 graphical floor against its own canvas at *any* depth (82% bottoms out at 2.45:1, concrete/light cat6; 30% clears it in 0 of 224 combinations) while the ink clears it everywhere (worst 4.65:1). And every NAME wears its group's hue in every finish — that is the floor, so no finish ever *removes* color; they differ only in how much further it goes.
4. **A text-bearing mark is capped at the measured AA ceiling for the ink it actually prints** — `52%` light / `62%` dark **for marks whose text is `--text-heading` or `--cat-on-fill`**, and today's tint for every other bearing mark until its own ceiling is measured. The cap repairs the family's one existing AA failure (the canonical fill's dark bottom stop at 64% measures 4.29:1) and it is *not* applied blind, because six HTML members print `--text-body` / `--text-secondary` / `--text-label` on bearing marks, where 52/62 would fail AA.
5. **The deliverable is three custom-property blocks plus one small per-finish rule set** on top of a slot-alias layer that ships once. Verified in the repo's own Chromium: an SVG mark inside `<g data-cat="2">` resolves `--cat-ink` from a `[data-cat="2"]` rule, and a CSS rule **beats** the `fill="url(#…)"` presentation attribute every transform emits — so the shared layer can re-point 19 of 21 members' fills without touching a transform. Also verified, and it shapes the architecture: a role token declared on the frame **cannot forward a slot-scoped value** (§2 Layer 1), and `light-dark()` **cannot carry a percentage** (§3).

---

## 1 · The law

> **THE INK LAW.** A finish spends one color budget on one group. Reach and depth trade: **the further a group's hue travels from its datum, the less of it the datum keeps.** Color is never added or removed between finishes — it is moved.

This is what makes three finishes that are all color-forward *also* all boardroom-ready. A finish cannot get louder by reaching further, because reaching further is paid for out of the mark. **All three blocks in §3 obey it, including `ground`:** the field is `ground`'s reach, so `ground`'s body retreats to pay for it. An earlier draft gave `ground` the same body as `pigment` plus a field, which is strictly more color at the same depth — the one block furthest from the default breaking the law the design is named after.

**Why the law is not a slogan.** Three measurements, taken this session with the resolver extracted from `test/unit/palette/chart-contrast.test.js` (the one that collapses `var()`, `light-dark()` and `color-mix(in oklab, …)`), over the 14 base themes × 2 canvases × 8 slots:

| channel | min adjacent OKLab | median | what it means |
|---|---|---|---|
| the committed **ink** (`--chart-cat-N-ink`) | 0.025 | **0.145** | the most hue-separable channel the family owns |
| raw hue | 0.021 | 0.154 | the ceiling (ink is within 6% of it) |
| body at 82% | 0.015 | 0.125 | today's solid |
| body at 50% | 0.010 | 0.076 | |
| body at 30% | 0.006 | 0.047 | **etching's body** |
| `--chart-cat-N-fill` (24%/40%) | 0.007 | 0.050 | today's tint |

On **onyx**, the theme that separates by value and therefore the stress case: ink min 0.058 / median 0.166; body82 min 0.049 / median 0.151; body30 min 0.019 / median 0.054. **The ink out-separates the fullest body on the hardest palette** — as a color distance. Whether a 1–2 unit stroke *reads* as strongly as a 200-unit area is a different question, and it is unmeasured (§7 I4).

And the second measurement is what makes the edge non-negotiable:

| channel | worst contrast vs its own canvas | 3:1 graphical floor |
|---|---|---|
| body 82% | 2.45:1 (concrete/light cat6) | **below** |
| body 50% | 1.23:1 (concrete/dark cat5) | below |
| body 30% | 1.00:1 (brina/dark cat6) | below — 0 of 224 pass |
| `--chart-cat-N-ink` | **4.65:1** (concrete/light cat3) | passes |
| raw hue | 3.04:1 (concrete/light cat4) | passes |

**A categorical body never guarantees that its mark can be seen against the slide. Its edge does.** So the ink edge is a correctness item, not a style, and it is constant across all three finishes. This also settles a question the flat-fill proposal left open: flattening the pie does not mean removing the wedge's stroke.

---

## 2 · The architecture — three layers, and only the middle one is a finish

### Layer 0 · SLOT — ships once, thirteen rules, no member named, identical under every finish

```css
:is(section.chart-frame, figure.chart-frame) [data-cat="0"] {
  --cat-hue: var(--chart-cat-1-hue);
  --cat-ink: var(--chart-cat-1-ink);
  --cat-tint: var(--chart-cat-1-fill);
  --cat-tex: var(--cat-1-texture);
}
/* × 8 slots, then × 5 for [data-s="pass|warn|fail|info|mute"] onto --state-*-* */
```

Every element carrying the attribute — a `<rect>`, a key swatch, a direct label, a row name, a plate — resolves the same four values. **Verified in Chromium:** a `<rect class="mark">` inside `<g data-cat="2">` computed `stroke: rgb(194,103,10)` from a `[data-cat="2"]{--cat-ink:…}` rule.

This is the whole of interaction #2 (naming × ink). A key entry and its wedge disagreeing is no longer a bug you can fix — it is **unrepresentable**, because they read one declaration. Today they are two hand-written mixes that have already drifted on their base (`var(--bg)` in funnel/map/pie-swatch vs `var(--chart-cat-base)` in stacked-bar — identical on light, two different colors on dark).

This layer also replaces roughly fifty per-slot rules that live in member stylesheets today: `bar.styles.css` has six `nth-of-type` ink rules, `line.styles.css` six `[data-cat]` ink rules, `matrix-grid.styles.css` eight row rules. **The shared layer is smaller than what it deletes.**

### Layer 1 · FINISH — custom properties for every LEVEL, and gated rules for every INK

An earlier draft claimed the entire finish fits in custom properties on the frame: *"a finish declares what a role's ink is; no gating is needed anywhere."* **That is not available in CSS, and the probe is unambiguous.** A custom property's `var()` references are substituted at computed-value time **on the element that declares it**. `--chart-value-ink: var(--cat-ink)` declared on `section.chart-frame[data-charts]` resolves `--cat-ink` *there*, where it does not exist, so it computes to the guaranteed-invalid value and inherits down invalid — including into the `[data-cat]` scope. Probed in Chromium 131 with the exact three layers: role token used in scope → `rgb(0,128,0)` (it fell back to the inherited `svg{fill}`); a direct `fill: var(--cat-ink)` in the same scope → `rgb(192,57,43)`; the role token **with a fallback** → the fallback won *even inside the scope*, because substitution already happened on the section; `getPropertyValue('--chart-value-ink')` on the section → empty string. So the obvious `var(--cat-ink, …)` patch makes it worse, not better: the fallback fires everywhere.

Six declarations were affected — `--chart-name-ink` and `--chart-edge` in the constants block (both floors, all three finishes), `--chart-value-ink` in etching and ground, `--chart-own-ink` in etching. As originally written, all three finishes would render names, edges and values in whatever fill the SVG ancestor happened to carry.

**The design takes option (b): rule-level gating for inks, custom properties for levels.**

```css
/* LEVELS stay properties — they are plain percentages, no slot scope needed. */
:is(section.chart-frame, figure.chart-frame)[data-charts="etching"] {
  --chart-body-bare-l: var(--chart-body-quiet-l);
  /* … */
}

/* INKS are rules. Still zero member names — only role classes and the slot scope. */
:is(section.chart-frame, figure.chart-frame)[data-charts="etching"] .cart-value { fill: var(--cat-ink); }
:is(section.chart-frame, figure.chart-frame)[data-charts="etching"] .cart-cat   { fill: var(--cat-ink); }
```

The architecture target survives — no selector inside a finish block names a chart — but §2's "no gating is needed anywhere" does not, and the cost changes with it (§10).

### Layer 2 · ROLE — ships once, and every shared rule reads a role class

```css
:is(section.chart-frame, figure.chart-frame) .cart-value { fill: var(--text-heading); }
:is(section.chart-frame, figure.chart-frame) .cart-cat   { fill: var(--text-body); }
:is(section.chart-frame, figure.chart-frame) .cart-tick  { fill: var(--text-muted); }
```

These are the DEFAULTS — today's shipping literals. A finish overrides the ones it re-points, by rule.

### The one substrate table (ships once, constant across finishes)

The finish speaks in **body**, **edge** and **ground**. What those are — and what the edge's width is measured in — is a property of the mark, not of the member:

| substrate | body (the interior) | edge (the boundary) | edge base + unit | its group's ground |
|---|---|---|---|---|
| AREA (SVG) | the fill | the stroke | member's own `stroke-width`, viewBox user units (0.7–1.8 today) | the mark's track along the measured axis |
| LINE | the area band | the stroke | user units (1.7) | the band |
| POINT | the disc | the ring | user units | a **clipped** concentric halo (see Rule O′) |
| CELL (HTML) | the cell fill | the cell border | `--chart-hairline` (a CSS length) | the row/column band the group occupies |
| CARD (HTML) | the card wash | the accent stripe (already full ink today) | `--chart-accent-lg` | the lane or column |
| GLYPH | none — a glyph has no interior | its **weight** | font weight, not a length | none: a mark that is text never plates itself |
| *tiled* (any substrate whose marks abut) | — | — | **edge width does not double — see below** | **its name's plate** — a tiled mark has no separate region |

Two things the edge column settles that the first draft left open. **The base is per substrate and the unit differs**: SVG members carry `stroke-width` in viewBox user units spanning 0.5 → 2.0 across boxes of 320×180, 420×348 and 300×300, while HTML members use `--chart-hairline: clamp(1px, 0.078cqi, 2px)`, which cannot be an SVG user-unit stroke at all. A bare "2×" would be a different visual weight on every one of the 21; the multiplier applies to *the substrate's own base in the substrate's own unit*.

**And a doubled edge does not apply to TILED marks.** SVG strokes are centered on the path, so doubling the edge on abutting pie wedges, matrix/roadmap cells or 175 map regions eats the neighboring mark and changes each mark's measured extent — which is `check:jank`'s subject, not review's. On a tiled substrate `etching` spends its extra weight on the name's plate ink instead. That is a rule, not an exception.

This table is interaction #4 (substrate × weight) resolved without an invented gain constant.

---

## 3 · The three finishes

Named for print and drafting, as the taxonomy's register naming already does. **`wash` is deliberately not used** — `chart-family.css` already means the canonical linear gradient by that word.

**Every canvas-aware percentage ships as an `-l`/`-d` PAIR, and `light-dark()` wraps whole colors — never a percentage.** `light-dark()` is defined over two `<color>`s only. Measured in Chromium 131: `CSS.supports('background','color-mix(in oklab, red light-dark(52%,62%), white)')` → **false**, and the element paints `rgba(0,0,0,0)` — a silent, total failure, a transparent mark. The same expression with `calc(40% + 12%)` → true. `chart-family.css` already demonstrates the shape at lines 442–461: `--chart-fill-top-l: 20%; --chart-fill-top-d: 48%;` are separate tokens for exactly this reason.

```css
/* Constants, declared once beside the canonical-fill block. */
:is(section.chart-frame, figure.chart-frame) {
  --chart-body-solid: 82%;                       /* canvas-independent */
  --chart-body-cap-l: 52%;  --chart-body-cap-d: 62%;    /* MEASURED AA ceiling, --text-heading / --cat-on-fill only */
  --chart-body-quiet-l: 30%; --chart-body-quiet-d: 40%;
  --chart-ground-str-l: 16%; --chart-ground-str-d: 22%;  /* progress's plate constant, generalized */
}
```

A shared rule that consumes a level writes the doubled form:

```css
fill: light-dark(
  color-mix(in oklab, var(--cat-hue) var(--chart-body-bare-l), var(--chart-cat-base)),
  color-mix(in oklab, var(--cat-hue) var(--chart-body-bare-d), var(--chart-cat-base))
);
```

The floors are rules, not properties (§2 Layer 1):

```css
:is(section.chart-frame, figure.chart-frame) [data-cat] .cart-cat,
:is(section.chart-frame, figure.chart-frame) [data-cat] .chart-key-label { fill: var(--cat-ink); }  /* every NAME */
:is(section.chart-frame, figure.chart-frame) [data-cat] [data-mark]     { stroke: var(--cat-ink); } /* every EDGE */
```

### `pigment` — full strength in the BODY. *The default.*

Levels: `--chart-body-bare: solid` (82%) · `--chart-body-bearing: cap` · `--chart-edge-w: 1` · `--chart-ground: 0%` · frame ground and edge absent.
Inks: values on the ladder (`--text-heading`), own chrome on the ladder.

The newspaper page. The mark is the statement; the denominator is not drawn. Color reaches the fill, the edge and every name. This is the smallest move from what ships, which is why it is the default — and it is still a real change, because today only three members color their names. **This is a settled call, not an open question** (see §12).

### `etching` — full strength in the LINE and the LETTER

Levels: `--chart-body-bare: quiet` (30/40) · `--chart-body-bearing: 22/32` · `--chart-edge-w: 2` (non-tiled substrates only) · `--chart-ground: 0%`.
Inks: `.cart-value`, `.cart-cat`, `.cart-tick` and the mark's own lane rule all re-pointed to `var(--cat-ink)` by rule.

The drafted sheet. Bodies retreat to a whisper and the identity moves into the boundary and the words. Shared furniture is drawn at full presence but stays on the neutral ladder. Filled marks become outlined ones: a scatter dot goes hollow with a doubled ink ring, a kanban card goes pale with a doubled accent stripe, a funnel band becomes a tinted outline with its stage name and its number in the band's own hue. **At a 30/40% body no mark clears the 3:1 graphical floor against its canvas anywhere (0 of 224, min 1.03), so under `etching` everything rests on the edge** — which is why the edge floor is a correctness item and why `etching` is the finish the rendered A/B in §11 exists to test first.

### `ground` — full strength in the FIELD, and the body retreats to pay for it

Levels: `--chart-body-bare: 50%` · `--chart-body-bearing: 40/48` · `--chart-edge-w: 1` · `--chart-ground: ground-str` (16/22).
Inks: `.cart-value` re-pointed to `var(--cat-ink)`; own chrome stays on the ladder.
Frame: `--chart-frame-bg`, `--chart-frame-edge` declared.

The body drop from 82% to 50% is what makes `ground` obey the law, and it is also what makes `ground` differ from `pigment` on **every** member rather than only on the ones `buildGround` can plate. At 50% the body still out-separates today's tint (median 0.076 vs 0.050) and the edge floor covers the canvas contrast, as it does at every depth.

**`ground` generalizes to the whole family what `bullet`, `quadrant` and `progress` already have.** Bullet paints qualitative bands its measure is read against; quadrant paints zones its dots sit in; `progress.styles.css` already carries a `.progress-track` element whose comment says *"NO rail. The track is a transparent positioning context only."* `ground` paints it — and gives every other mark the same thing.

**The ground is information, not decoration: it is the denominator.** A bar's track is its headroom; a funnel's is the intake; a progress row's is the work left.

**The figure ground is derived from the surface behind the figure, not from `--bg`.** F1's own motivations are a chart over a deck background image and a chart that must read as a separate object — exactly the cases where the paint behind the figure is *not* `--bg`. So `--chart-frame-bg` is a translucent overlay (`color-mix(in oklab, var(--text-muted) 5%, transparent)` over whatever is there) rather than a mix toward `--bg`, which would read as a mismatched rectangle on a `lift:` card or an image background. This also keeps F2 true — the Studio's "Download this chart as SVG" path passes no background today, so a flattened near-black-text SVG opened on a dark surface is illegible; `ground` is the finish an export can bake, and the bake resolves the overlay against the export's own background.

---

## 4 · Where color reaches, per finish

| destination | what the hue means there | `pigment` | `etching` | `ground` |
|---|---|---|---|---|
| mark body | which group this shape is | **82 / cap** | 30·40 / 22·32 | 50 / 40·48 |
| mark edge | *that the mark clears the canvas at all* (measured) | ink, 1× | **ink, 2× (non-tiled)** | ink, 1× |
| the group's ground | the denominator the mark is read against | — | — | **16 / 22** |
| the mark's NAME | which group this word belongs to | **ink** | **ink** | **ink** (or `--cat-on-fill` on its plate) |
| the mark's VALUE | which group this number belongs to | ladder | **ink** | **ink** |
| the mark's OWN chrome (its category label, its tick, its lane rule) | which group this furniture serves | ladder | **ink** | ladder |
| shared chrome (grid, bounds, axis titles) | nothing — no group owns it | ladder | ladder, full presence | ladder |
| the figure's ground and edge | "this is a separate object" | — | — | **declared** |

**The rule that stops decoration:** *ink belongs to whatever owns it.* Shared furniture is owned by no group, so it can never take a categorical hue — and that is why the chrome ladder resolves to neutrals without contradicting "color carries context". A gridline is not subordinate color; it is unowned. That distinction is what error #2 got wrong: it demoted labels along with gridlines, when a label *is* owned and a gridline is not.

---

## 5 · How the three stay apart on a member with no gradient

**The mechanism is that every adjacent pair differs on at least one axis that every member has.**

- **`pigment` ↔ `etching`** differ on the **mark body** (82 → 30, cap → 22·32), the **edge weight or the plate ink**, and the **value ink**. Every one of the 21 has a body-or-glyph, an edge-or-weight, and prints text.
- **`pigment` ↔ `ground`** differ on the **mark body** (82 → 50), the **value ink**, and — where the substrate has one — the **group's ground**. The body drop is what makes this pair separate on `word-cloud` and on any member `buildGround` cannot plate; it is the fix for a pair that otherwise rode entirely on one un-designed geometry.
- **`etching` ↔ `ground`** differ on all of the above at once. This is the widest pair by construction.

Worked on the two the brief names:

**`funnel`** (AREA, tiled bands, no grid, no ticks, no axis titles).
`pigment`: five bands at 82%, hairline ink edges, five stage names in their band's ink, values in heading ink.
`etching`: five bands at 30%. The bands are tiled, so the edge does **not** double — the extra weight goes to the stage-name plates, and the stage names and drop-off numbers are in band ink.
`ground`: five bands at 50% sitting on **full-width tracks at 16%** — the intake made visible behind every stage — on a declared figure ground with a hairline edge.

**`scatter`** (POINT, one or more entity groups, grid + ticks + axis titles).
`pigment`: filled discs at 82%, 1× ink ring, point labels in ink, ticks and axis titles on the ladder.
`etching`: **hollow discs** — body at 30%, ring doubled in full ink — with labels, values, ticks and category names all in the point's own ink.
`ground`: discs at 50%, each inside a **clipped 16% halo** (Rule O′), values in ink, on a figure ground with an edge.

Neither of these depends on a gradient existing anywhere. This is precisely where the previous attempt died: it varied furniture opacity (`.55` vs `1`) and corner radius, so on a member with no furniture there was nothing left.

### `buildGround` — specified per substrate, and NOT deferrable

`ground` is not shippable as a value-ink swap plus a panel; that is `finishes.spec.js`'s `plate` failure again. So the geometry is specified here, per substrate row, including the two rows where the answer is "none":

| substrate | the ground | construction |
|---|---|---|
| AREA | the mark's track along the measured axis | a rect from the axis origin to the scale maximum, behind the mark, same lane |
| LINE | the band under the series | the existing area band, repainted at ground strength when the series body retreats |
| POINT | a concentric halo | radius = 2.2 × the disc, **clipped to the plot region and to a single `<g>` per group** so halos of one group merge rather than compositing (Rule O′) |
| CELL | the row/column band the group occupies | one rect per band, drawn once per group, never per cell |
| CARD | the lane or column | the existing lane/column element, given a background |
| GLYPH | **none** | a glyph has no interior and never plates itself; `ground` differs on GLYPH members by body depth and figure ground only, and §11 says so |
| tiled | the name's plate | the key/label plate, already drawn |

The three the first draft left hardest and unnamed: a **scatter halo** is the POINT row (clipped, per group); a **slope chart** has no track — its marks are strokes between two label columns, so its ground is the label plate, the tiled row; **matrix-grid's "column band"** is the CELL row, one rect per column, behind all cells.

---

## 6 · The grouping rule applied — all 21

> **A group shares one hue. A singular may own one.**

And one corollary the 21 forced, because five members have *two* candidate color systems:

> **RULE G — one categorical system per figure.** Where two candidates exist, the system **nearer the datum** keeps hue; the other keeps its identity in **value** — a neutral light-to-dark ramp — never in a second hue set. **Which system is which is DECLARED by the transform**, as `data-ramp` on the secondary system's elements; the shared layer reads that attribute and paints the neutral ramp from it.

The attribute is what keeps Rule G a rule rather than a per-member decision table with a rule in front of it. Without it, §6's column below is member-keyed configuration — the exact failure the judgement quotes Track 2 naming. **A transform that omits `data-ramp` keeps both hue systems, which is the defect the rule exists to stop**, so the gate in §9 fails a member that emits `data-cat` on two nested scopes with no `data-ramp` on either. Emission is costed in §10.

Rule G **relocates** color instead of removing it: matrix-grid's rows stop spending six categorical hues (the axis a reader decides least from), keep an ordered neutral ramp so they are still told apart, and the hue moves to the marked cells — which is the half the failed correction dropped, leaving a filled cell and an empty one distinguishable only by their text.

| member | the group(s) | singulars? | body / edge | Rule G (`data-ramp` on) |
|---|---|---|---|---|
| `bar` single-series | one — the series | no | rect / stroke | — |
| `bar` grouped | one per series | no | rect / stroke | — |
| `bar` diverging | two — rise, fall | no | rect / stroke | — |
| `stacked-bar` | one per part, repeated across bars | no | segment / stroke | — |
| `waterfall` | three — rise, fall, total | no | step / stroke | — |
| `funnel` | each stage appears once | **yes** | band / stroke | — |
| `bullet` | the measure (one) + the band ramp (one, magnitude) | yes | measure / stroke; band = ground | the bands |
| `piechart` | each slice appears once | **yes** | wedge / stroke; tiled → ground is the key plate | — |
| `map` | one — the choropleth scale, 175 samples of it | no | region / stroke; tiled → key plate | — |
| `radar` | one per series | no | polygon alpha (no identity) / **stroke** | — |
| `quadrant` zones | four named regions, each once | **yes**, BACKDROP register | zone tint = the dots' ground | the zones, **when the dots are categorical** |
| `quadrant` dots | entities, or one named cohort | **yes** | disc / ring | — |
| `scatter` | entities → singulars; a named cohort → one group | **yes** | disc / ring | — |
| `line` | one per series | no | area band / stroke | — |
| `slope` | one per entity | **yes** | none / stroke; ground = label plate | — |
| `gantt` | status groups | no | bar wash / accent stripe; ground = lane | the lanes |
| `kanban` | status groups; columns are bins | no | card wash / accent stripe; ground = column | the columns |
| `progress` | status groups; rows name themselves | rows are singulars but take their own bar's status ink | fill wash / accent; **ground = the existing `.progress-track`** | — (rows take the bar's status ink) |
| `state-chart` | status groups | no | node wash / border; ground = label plate | — |
| `timeline-list` | status groups | no | item wash / accent; ground = the spine band | — |
| `roadmap` | status groups | no | cell / border; tiled → key plate | — |
| `matrix-grid` | **one** — the marked path through the grid | no | marked cell / border; ground = the column band | **the rows** — hue moves to the cells |
| `journey` | mood groups | no | stage card / mood stroke; ground = lane | the lanes |
| `word-cloud` | each word once, ranked by size | **yes** | none / **weight** | — |

**Six members carry singulars** — funnel, piechart, quadrant (zones and dots separately), scatter, slope, word-cloud. Every one of them is a set of things that appear once, which is exactly the license the rule grants.

---

## 7 · The four interactions, each resolved by a rule

**I1 · Occlusion × hue.** Measured on onyx: `radar` scores nearest **0.023** against self-range **0.052** — SWAMPED. Its three fills genuinely do not separate, and no alpha setting fixes that, because compositing two 0.20 fills yields 0.36 and the fourth color is unavoidable.

> **RULE O — a mark that composites carries no identity in its body.** For a LAYERED mark the body is atmosphere; identity lives entirely in the stroke, the dash and the name. The depth knob therefore moves the **stroke**, never the fill.

> **RULE O′ — the ground register composites too, and is constructed not to.** A per-mark halo on a dense scatter overlaps and produces the fourth color nobody chose — the same defect on a member the taxonomy classifies SEPARATE. So a ground is drawn **once per group, clipped**, never once per mark: one `<g>` per group with a union halo, one rect per lane/column/band. Where two groups' grounds still abut (gantt lanes, kanban columns, stacked-bar tracks), they share a hairline edge rather than overlapping, so no third value appears.

Radar keeps its alpha exactly as settled, and it still differs across all three finishes — through stroke weight, stroke ink and label ink, none of which composite.

**I2 · Naming × ink.** Resolved by Layer 0: the name and the mark read one declaration.

> **RULE N — a name resolves its color from the same slot scope as the thing it names.**

**I3 · Text-bearing × saturation.** R0 says a bearing mark takes the quiet register; the open question was always *how quiet*.

> **RULE B — a bearing body is capped at the measured AA ceiling FOR THE INK IT PRINTS, and each finish declares its bearing pair explicitly rather than computing a displacement.**

The cap of `52% / 62%` is measured against `--text-heading` (0 of 224 fail, min 4.53 at concrete/light cat5) and holds for `--cat-on-fill` (0/224) — **and only for those two.** Bearing marks print more inks than that, and applying 52/62 blind is a self-inflicted AA regression across six HTML/hybrid members. Measured, today's 24/40 tint → the proposed cap:

| ink on a bearing mark | fails at 24/40 | fails at 52/62 | worst |
|---|---|---|---|
| `--text-heading` | 117/224 | **0/224** | 4.53 |
| `--cat-on-fill` | — | **0/224** | — |
| `--text-body` | 8/224 | **83/224** | 1.97 (cuoio/light cat3) |
| `--text-label` | 72/224 | **132/224** | 1.86 |
| `--text-secondary` | 60/224 | **224/224** | 1.54 |
| `--text-muted` | 135/224 | **224/224** | — |

Those are the inks actually on bearing marks today: kanban card title and gantt bar label in `--text-body`; state-chart, timeline-list and journey secondary text in `--text-secondary`; kanban and gantt eyebrows in `--text-label`. §9 promises the AA floor is constant across finishes, so HARD RULE #18 applies: this would be a window the change creates.

**So the design re-points bearing text rather than lowering the cap for everyone.** Every bearing mark's text moves to `--text-heading` (primary) or `--cat-on-fill` (on a plate), and the cap then applies family-wide. Six member stylesheets pay for it, and that re-point is costed in §10. A bearing mark whose text has *not* been re-pointed keeps today's 24/40 tint until its own ceiling is measured — an explicit, temporary two-tier state, not a silent one.

Two consequences worth stating. The cap still **more than doubles today's pigment** on a re-pointed bearing mark (24% → 52% light, 40% → 62% dark), so it remains the most color-forward move in the design. And it **repairs an existing defect**: the canonical fill's dark bottom stop is 64%, and `--text-heading` on it measures 4.29:1 — below AA; the cap pulls it to 62% and 4.61:1. **The headroom is thin** — 4.53 is 0.03 above AA on a family-wide constant, so a future theme re-curation breaks it. `chart-contrast.test.js` gets an arm at the new level either way.

**I4 · Substrate × weight.** Resolved by the substrate table in §2 — body, edge, edge base *and unit*, and ground are named per substrate, so a stroke member's full strength lands on its stroke and an area member's on its fill. No gain constant is invented and none is needed.

**But the table is a naming move, and the ΔE argument is area-blind.** The brief's I4 states the objection in advance: *"A 1px stroke and a 200px area at the same hue are not the same color experience."* Nothing in this design area-weights. So the claim in §1 is held to what the measurement supports: **the ink is a hue-separable channel, further apart between adjacent slots than the fullest body; whether it READS as strongly at stroke scale is unmeasured.** A rendered A/B is therefore a **precondition of adopting `etching`**, not a follow-up (§11, §12).

---

## 8 · The a11y and print substitution, per finish

Texture is the **last** rung of the reception ladder, and the substitution falls out of the finish rather than being bolted onto it:

> **RULE A — the redundant channel rides whichever register the finish spends at full strength.**

| finish | full strength in | the substitution | why it is the right one |
|---|---|---|---|
| `pigment` | the body | **texture on the body** | an 82% body is a large, opaque surface; a `<pattern>` reads cleanly on it |
| `etching` | the edge | **dash pattern on the doubled stroke** | a pattern on a 30% body is faint, but a 2× stroke is the widest stroke the family ever draws, and dash is a *higher* rung than texture |
| `ground` | the field | **texture on the ground, body left plain** | a pattern reads better on a pale field than on saturated pigment |
| all three | POINT marks | **shape** — an 8-slot drawn `<path>` cycle keyed to the same 0-based `data-cat` | a `<pattern>` on a 3-unit dot is illegible; shape is the only channel that works, and it is the one genuinely new mechanism |

Everything drawn, never typed (HARD RULE #29).

**The a11y and print sheets currently override any finish, so this table is not free.** `themes/a11y-base.css` paints textures as `fill: url(#latt-a11y-chart-tex-N) !important` on member-named selectors (e.g. `section.piechart .wedge:nth-of-type(6n+1)`, 46 such arms), and those beat anything the shared layer or a finish declares. As the tree stands, textured members would render **identically** under all three finishes on an a11y palette. The fix is not three copies of 46 member-named `!important` arms — that would triple the sheet and contradict the zero-member-names target. **The a11y and print sheets move onto the `data-cat` slot layer first**, which the design already needs for the eight non-emitting members; the substitution then keys on `[data-charts]` × `[data-cat]` with no member named. That restructure is costed in §10, and it sequences *before* the finishes.

**Until it lands, §8's monochrome claim is UNVERIFIED.** The intuition — that on the a11y palettes and in monochrome `etching` is the strongest of the three, because its identity is already in a stroke, the one register that keeps its weight when hue is gone — is worth testing in the rendered A/B, not asserting.

**And the width contract binds in all three.** Measured: `lib/core/accessibility-textures.js` emits `latt-a11y-chart-tex-1..8`, and `themes/a11y-base.css` / `lib/base/base.print-textures.css` wire **six** — `nth-of-type(6n+…)` cycles and `[data-cat="0..5"]` swatch rules against an eight-slot palette. Categories 7 and 8 silently wear the textures of 1 and 2. A redundant channel narrower than the channel it backs up is a silent merge, so the cycles widen to 8 and a test asserts *channel width == categorical cycle width* for texture, dash and shape.

---

## 9 · What a finish may never reach — the correctness layer

Constant under all three. *A preset changes how a chart looks; it may never change whether it can be read.*

- the palette, and the contrast floors (AA on text, 3:1 on graphical marks);
- the ink edge on every mark, and the ink on every name — both floors, both measured;
- the bearing cap, and the ink each bearing mark prints under it (Rule B);
- the chrome ladder's ORDER (`grid → rule → tick → label → title → value`), and the ban on `--accent` in furniture (today `bar` paints its zero rule in `--text-body`, out-ranking the labels it sits behind, and `gantt` paints its ticks in `--accent`);
- the redundant rung each member owes, and the channel width;
- Rule G — color spent on the axis the reader decides from — and the `data-ramp` declaration that makes it machine-readable;
- the dead radial dome, on pie and quadrant.

**The gate.** One check in the shape of the ones `tools/check-ownership.js` already runs inside `build:check`, with three arms: *no selector inside a `[data-charts]` block may name a member class*; *every `--chart-*` level token a finish declares must be read by at least one shared rule*; and *a transform emitting `data-cat` on two nested scopes must emit `data-ramp` on one of them.* That changes what a gate finds, not what the pipeline runs, so it does not touch the CI contract.

---

## 10 · Cost

### Ships once — the shared layer

| item | file | size |
|---|---|---|
| slot alias block (8 `[data-cat]` + 5 `[data-s]` + frame defaults) | `chart-family.css` | ~40 lines |
| role defaults — ~20 shared rules pointed at today's shipping literals | `chart-family.css` + the HTML mirrors | rewrite, not growth |
| substrate table (7 rows, incl. edge base + unit) | `chart-family.css` | ~10 lines |
| level constants as `-l`/`-d` pairs (`cap`, `quiet`, `ground-str`, `solid`) | `chart-family.css` | ~7 lines |
| **the three finish blocks** — levels as properties, **plus ~6 gated ink rules across etching and ground** | `chart-family.css` | ~3 × (6 level decls + 2–4 rules); larger than the "9 declarations × 3" an earlier draft costed, because §2 Layer 1's property-forwarding does not work |
| **doubled `light-dark(color-mix(…l…), color-mix(…d…))` form** in every shared rule that consumes a level | `chart-family.css` | each such rule roughly doubles in length |
| **re-point bearing text to `--text-heading` / `--cat-on-fill`** (Rule B) | 6 member `.styles.css` (kanban, gantt, state-chart, timeline-list, journey, + progress) | small each, plus a `chart-contrast.test.js` arm at the new level |
| `data-cat` / `data-s` scope around a mark's own labels and values | `cartesian.js` — **one kernel edit shared by eight members** | small |
| `buildGround` — track / band / clipped halo / plate, per §5's table | `cartesian.js` | **the one new geometry** |
| `resolveCharts` — the fifteenth front-matter register, stamping `data-charts` on **both** `section.chart-frame` and the projected `figure.chart-frame` | `lib/core/resolve-charts.js` | ~120 lines (`resolve-corners.js` is 119) |
| **a11y / print sheets restructured onto the slot layer**, then texture / dash cycles 6 → 8, plus the 8-slot POINT shape cycle | `themes/a11y-base.css` (46 member-named `!important` arms), `lib/base/base.print-textures.css`, kernel | **not mechanical — sequences before the finishes** |
| the four chrome-ladder tokens (`--chart-rule-ink`, `--chart-tick-ink`, `--chart-label-ink`, `--chart-title-ink`) | `chart-family.css` | **new — they do not exist today** |
| teach `chart-colour-reach.js` the five `--state-*-ink` values | `tools/chart-colour-reach.js` | one loop |

Two entries deserve their own line.

**The chrome ladder is not "leverage existing."** Grep across `lib/`, `themes/` and `tools/` returns zero hits for `--chart-tick-ink`; it appears only in `finishes.spec.js`, the failed attempt the brief hands over as what *not* to do. The ladder is still a taxonomy proposal (Rule C1) with four unbuilt tokens and two named defects to fix with them. So `pigment` and `ground` point their own chrome at **today's shipping literals** (`--text-muted` for `.cart-tick`, `--text-body` for `.cart-cat`), and the ladder is a separate, sequenced change that the finishes do not block on.

**The reach tool's blind spot is a gap in the instrument, not the design:** it matches only the eight categorical inks, so the nine status members can never score above their incidental matches (measured on indaco today: `progress` 17%, `timeline-list` 20%, `kanban` 25%, `state-chart` 25%). Without the fix, the finishes will appear to do nothing on nine of the 21.

### What the members pay

**The admission price is the slot attribute, and most of it is already paid.** Measured by grep this session over the 21 transforms: **six emit `data-cat`** (bar, bullet, line, piechart, scatter, stacked-bar), **nine emit `data-s`**, and **eight emit neither** — funnel, journey, map, matrix-grid, quadrant, radar, roadmap, word-cloud. Those eight need the emission; several of the nine need their labels brought inside the mark's scope.

**Seven transforms additionally emit `data-ramp`** for Rule G — bullet (bands), quadrant (zones), gantt (lanes), kanban (columns), matrix-grid (rows), journey (lanes), and any future member with two candidate systems. That was missing from the first draft's cost table, and it is what turns Rule G from a per-member decision table into something the shared layer reads.

**Two transforms change beyond attributes, and both changes are deletions the settled decision already requires.** `piechart.transform.js` and `quadrant.transform.js` are the *only* two that emit `style="fill:…"` inline — verified in Chromium, an inline style beats a stylesheet rule while the `fill="url(#…)"` presentation attribute every other member emits **loses** to one. So once the dome is deleted, **19 of 21 members' fills are re-pointable by the shared layer with no transform edit at all.**

**One consequence of that: the gradient defs go dead in exported bytes.** The 19 transforms keep emitting the `<linearGradient>`/`<radialGradient>` elements those `url(#…)` fills point at, and nothing then references them. `prunePlayerCss` prunes CSS, not SVG defs, so every exported SVG, every `--player` bundle and every PDF carries them. The def deletion folds into the two transforms already being edited, and a follow-up covers the rest; the byte delta is measured and reported in the export sign-off, since the sign-off is being requested anyway.

**Member stylesheets shrink.** The per-slot ink rules that exist today — six in `bar.styles.css`, six in `line.styles.css`, eight row rules in `matrix-grid.styles.css`, plus bullet, piechart, progress, quadrant, scatter, stacked-bar, timeline-list, word-cloud — are deleted and inherited from Layer 0.

### Artifacts that churn

- **48 of the 168 committed `examples/*.pdf`** carry a chart member (measured by `_class:` / `class:` grep). Every one re-renders, because the name floor alone changes them under any finish.
- `chart.gallery.light.pdf` + `chart.gallery.dark.pdf`, plus the cross-bucket showcase decks.
- **HARD RULE #8**: the six long-running galleries graduate in a separate post-review commit.
- **HARD RULE #9**: this is visible on a slide, so it owes `examples/chart-finishes.md` + a committed PDF, 6–10 slides, showing all three finishes across a gradient-less member and a gradient-carrying one, in both modes.
- **The export sign-off gate applies.** Chart pixels change in an exported artifact, so a representative deck renders in dark *and* light for inspection before this ships. `ground` additionally changes what an exported standalone SVG contains, because it is the finish whose figure ground exists to be baked; the dead-def byte delta is reported in the same sign-off.

### What a NEW chart pays

Stamp `data-cat` or `data-s` on its marks; wrap each mark's own labels in that scope; declare its substrate; declare `data-bearing` if text sits on the mark, and print `--text-heading` / `--cat-on-fill` in it; declare `data-ramp` if it has a second categorical system; use the shared `.cart-*` / `.chart-key-*` classes. **It then inherits all three finishes with zero new rules.** It pays more only if it introduces a substrate or occlusion class the table has no row for.

---

## 11 · Survival, and what I did not verify

- **onyx** (value, not hue). `etching`'s 30% bodies genuinely compress the categorical read there — measured, onyx/light body30 min 0.019 against the repo's own 0.06 slot-distinctness floor. `etching` answers by putting identity in the ink, where onyx measures min 0.058 / median 0.166. Whether that answer *reads* at stroke scale is the unmeasured question of §7 I4.
- **achromatopsia.** Hue carries nothing, so the answer is entirely Rule A plus the width contract — and Rule A is blocked behind the a11y-sheet restructure (§8, §10), which is why that restructure sequences first.
- **Dark canvas.** Every level ships as an `-l`/`-d` pair and every color mixes toward `--chart-cat-base` (`--bg` on light, `black` on dark), so warm hues stay hue-true on a navy canvas. The bearing cap was measured per canvas.
- **`word-cloud` is the weakest member under this design, and I will not pretend otherwise.** Its mark, its name and its label are one glyph, so it has no body to vary and no ground to sit on. It separates `pigment` from `ground` by glyph color depth and the figure's ground, and `etching` by glyph weight. The honest fix — a plate behind every word — would be worse design on a forty-word cloud, so it is not proposed.
- **Not verified — and two of these gate adoption, not follow-up:**
  - I have not rendered these three finishes. Everything numeric above is a token-resolution measurement, a Chromium mechanism probe, or a grep of the tree.
  - **`etching`'s central claim is unfalsified**: that ink-at-stroke-scale reads as strongly as a full body. One rasterized slide settles it, and it is a precondition of adopting `etching`.
  - **§8's monochrome claim is withdrawn pending the a11y restructure**, since as the tree stands all three finishes render identically on a textured a11y palette.
  - A rendered A/B across all 21 in both modes is the `raise it by:` line on any merge ask for this.

## 12 · The one decision I would put to a human

**Does the a11y/print restructure land in this work, or does it gate it?** Rule A is the redundant-channel contract for all three finishes, and it cannot be expressed while `themes/a11y-base.css` overrides every finish with 46 member-named `!important` arms. Restructuring those onto the `data-cat` slot layer is real work the design needs anyway (eight members must emit the attribute regardless), but it is a separable change with its own blast radius. Sequencing it first means the finishes ship complete; sequencing it after means shipping three finishes that collapse to one on the a11y palettes, which §9 lists as a correctness item.

*(Two questions the first draft asked are now settled inside the diff. `pigment` is the default — smallest move from what ships, matches the FT/Economist/Datawrapper reference set. And `buildGround` is not deferrable: §5 specifies it per substrate, because without it `ground` is a value swap plus a panel, which is `finishes.spec.js`'s `plate` failure again.)*