<!-- Design-competition candidate, 2026-09-07. Track 5 — leverage-existing.
     Title: Three Registers (revised)
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# One chart language: three registers plus a plate, eight roles, one ladder

**Perspective:** maximum reuse. Every rule below names the token, kernel or gate
it rides on. The language adds **one strength constant, eight derived aliases,
one kernel line and one new shape cycle**. Everything else is a rule that names
paint the tree already ships.

---

## The answer, in four sentences

1. **Every pixel of ink on a chart sits in one of three registers — BACKDROP,
   MARK, INK — and which register it takes is decided by the job it does for the
   reader, not by which member drew it.** The three registers already exist as
   three token levels in `chart-family.css`; they have never been named, so
   members pick a level by hand and drift.
2. **The data mark always takes MARK, and a MARK always out-ranks its own
   BACKDROP.** That is the quadrant test, stated as a token relation instead of a
   taste, and the token math satisfies it on both canvases by construction.
3. **Text never sits on a MARK unless it brings its own plate.** Measured:
   `--text-heading` on the MARK level falls below AA in **117 of 224** theme x
   mode x slot combinations (worst 2.27:1); on the BACKDROP level it fails in **0
   of 224**. Three separate comments in the tree already state this rule; nobody
   had the number.
4. **Furniture, key, motion, detail and the non-color channel each key on one
   question about the data**, not on the member's name — and in every case the
   question is one the newest members already answer correctly.

The reference implementation already ships: **`bullet` paints all three
registers on one chart** — a band wash (BACKDROP), a solid measure (MARK), a
target tick and ink edge (INK). `themes/a11y-base.css` says why in its own words:
*"Its three layers are separated by VALUE, not hue — a light band wash, a solid
measure bar, a dark target tick — and value is exactly what survives grayscale."*
The language is bullet, generalized.

---

## The three registers, the plate, and the tokens they already are

| Register | What it is | Token that already carries it | Text-safe? |
|---|---|---|---|
| **BACKDROP** | Reference material the reader measures *against* — a zone tint, a qualitative band, a lane box, a card — **and any data mark that must carry its own text**. | `--chart-cat-N-fill` / `--state-X-fill` (24% light, 40-50% dark), and the canonical rectangular fill (`--chart-fill-top-*` -> `--chart-fill-bottom-*`, 20->38% light / 48->64% dark) | **Yes** — 0/224 below AA for the tint, 1/224 for the wash |
| **MARK** | The datum itself, where the datum carries no text inside it: a wedge, a segment, a region, a bar's fill, a band. | the `82%`-into-`--chart-cat-base` mix that funnel, stacked-bar, map, the pie legend swatch and the quadrant legend swatch already paint — **untokenized** | **No** — 117/224 below AA |
| **INK** | Anything that *names* a mark — its edge, its direct label, its value, its key swatch border — **and any mark that IS text**. | `--chart-cat-N-ink` (committed per palette, solved to AA on both surfaces), `--chart-cat-N-hue`, `--state-X-ink` | Yes, by construction |
| **PLATE** *(composition, not a register)* | A quiet fill laid *under* a number so the number may sit over a register that is otherwise text-hostile. | progress's readout plate, 16% light / 22% dark (`progress.styles.css`) | Yes — that is its whole job |

**Rule R0 — the register of a data mark is decided by one question: does the mark
carry text inside it?** No -> MARK. Yes -> BACKDROP, because the mark is
text-bearing by construction and cannot be MARK. That single test decides the
pair the census exhibits: **bar and stacked-bar both take MARK, both at 82%**,
and the same categorical token stops rendering as a pale tint in one and a
saturated block in the other. It also decides waterfall (MARK — its steps carry
no inner text) against gantt, kanban, timeline-list, state-chart and progress
(BACKDROP — caption, card text, item text, state word, row label). **The
semantic-mark corollary is the same rule seen from the other side**, which is why
the language still needs no `--state-X-solid`.

**The cost of R0, stated rather than dodged: `bar` loses its vertical wash.** The
wash becomes a BACKDROP-only finish. That is exactly what F1's justification below
claims it already is; ratifying the wash on a data mark while arguing it is
backdrop material would be the contradiction. bar keeps its cross-axis gradient
*axis* rule only insofar as any surviving BACKDROP box uses one.

**How the three numbers were measured, and how to reproduce them.** I extracted
the resolver from `test/unit/palette/chart-contrast.test.js` (everything above
its `describe(`) — the same `resolve()` that collapses `var()`, `light-dark()`
and `color-mix(in oklab, …)` — and scored `--text-heading` against each register
over the 14 base themes (`test/helpers/palette` `baseThemeNames()`) x light/dark
x 8 slots = 224 combinations:

```
BACKDROP tint  --chart-cat-N-fill              0 / 224 below AA 4.5:1
BACKDROP wash  canonical fill, bottom stop     1 / 224   (onyx/dark cat4, 4.29:1)
MARK    solid  color-mix(hue 82%, cat-base)  117 / 224   (worst onyx/dark cat4, 2.27:1)
progress bar head (20%+pct*0.52 / 38%+pct*0.58)
                                             145 / 224   (worst onyx/dark cat4, 1.48:1)
```

That table decides most of what follows. It says the family has two text-safe
levels, one text-hostile one, and one member — progress — that runs *past* the
hostile level and prints a number on it anyway. Progress does not get away with
it by luck: it lays a 16%/22% plate under the readout. **The plate is the
family's answer to "text over a hostile register", and progress is its reference
implementation the way bullet is the three registers'.**

**Rule R1 — MARK out-ranks BACKDROP.** On both canvases the MARK level is a
higher proportion of the hue than either BACKDROP level (82% vs 24-38% light,
82% vs 40-64% dark), so the ordering holds without per-theme tuning. On **onyx**,
where categories differ by value rather than hue, that ordering *is* the
categorical channel's headroom — which is exactly what the radial dome was
spending (below).

**Rule R2 — text never lands on MARK unless it brings a plate.** Three places in
the tree already state the separation form: `funnel.styles.css` (*"Labels +
values sit on the canvas, never on a band, so the fill never affects text
contrast"*), `.cart-tick` in `chart-family.css` (*"in the gutter, ON THE CANVAS —
never on a mark, so its contrast is a property of the slide background"*), and
`buildValueLabel`'s docblock in `cartesian.js` (*"Always on the canvas side of
the mark, never inside it"*).

**One member violates R2 today: quadrant.** Its four corner labels sit inside the
zone tint whose rim stop is 82%, and `quadrant.styles.css` says so in its own
words — `--quadrant-label-ink: light-dark(black, white)` with the comment *"On-field
labels sit on the vivid pie-matched zone fills, so they take maximum-contrast
ink."* Maximum-contrast ink is what you reach for when the fill underneath is the
problem. **Flattening the zone to BACKDROP is what fixes it**, which strengthens
the Q1 verdict below rather than sitting beside it. Progress is not a violation:
it is the plate, used correctly.

---

## Q1 — Mark and fill finish

### The gradient verdict: two survive, one dies, and the third was never what the census called it

The census sorts fills by *element type*. The language sorts them by *measured
perceptual range*, and that reclassifies one of the three radial members.

**Rule F1 — three clauses:**

1. **A gradient may never run along an axis the reader measures** — unless
2. **its stops are a function of the encoded value**, so the shading is a
   redundant encoding of the length rather than an independent one; and
3. **a mark's own shading may never cover more perceptual ground than the gap to
   the next category.**

Clause 1 is already written in `bar.transform.js`: *"THE WASH RUNS ACROSS THE
BAR'S THICKNESS, NEVER ALONG ITS LENGTH … a column shaded dark-at-the-top to
light-at-the-bottom puts a second, meaningless gradient on the axis the reader is
measuring."* Clause 2 exists so **progress passes by rule instead of by
paragraph**: its `linear-gradient(90deg, …)` runs along the measured length, and
its leading-edge intensity scales with `--pct`, so a future member wanting the
same exemption has to show the same coupling. Clause 3 is what
`tools/chart-mark-separation.js` measures. Together they decide all nine gradient
members with no aesthetics involved:

**The vertical wash SURVIVES, as BACKDROP material** (gantt, progress,
state-chart, timeline-list, kanban, and any card or lane box). Four independent
reasons, none of them taste:

- *It never crosses a measured axis.* A gantt bar's measured axis is time
  (horizontal) and the wash is vertical. kanban cards, state nodes and
  timeline items carry no magnitude at all, so there is no axis to confound.
- *The one member that runs its gradient along the measured axis passes clause 2.*
- *Its range is half the dome's.* 20% -> 38% into `--bg` on light, 48% -> 64%
  into black on dark: 18 and 16 mix-points, against the dome's 40.
- *It is the text-safe register.* 223 of 224 combinations clear AA. That is not a
  coincidence — the wash is worn by exactly the boxes that carry text (kanban
  card, gantt bar caption, progress row, state node, timeline item). **The
  vertical wash is the material of the BACKDROP register**, and R0 is what keeps
  it off data marks that carry no text.

**The radial dome DIES** on piechart and quadrant. `chart-mark-separation.js` on
onyx, reproduced this session:

```
piechart   SWAMPED   nearest 0.097   self-range 0.286
quadrant   SWAMPED   nearest 0.097   self-range 0.286
```

A wedge's magnitude is its *angle*; the dome runs along the *radius*. It does not
confound the measured axis — it does something worse, which is cover 2.9x more
perceptual ground inside one category than the gap to the next one. On **onyx**,
the theme whose entire identity is that categories differ by value, the dome is
the thing that spends the value budget the palette depends on. The quadrant is
worse still: its dome is on the **BACKDROP**, and its brightest end sits at the
plot corners where the dots are sparsest, so the loudest ink on the slide carries
the least information. That inverts figure and ground, which is R1 stated
backwards — and it is what puts the corner labels on an 82% fill (R2).

**Radar keeps its radial gradient, and the reason is a mechanism, not a
measurement.** `radar.transform.js` `areaGradient` is `stop-opacity 0.10 / 0.14 /
0.20` in **one color**: an alpha ramp of 0.10, not a hue ramp. Its own comment
records the compression: *"the fade was a 12x rim-dense ramp (0.03->0.36) — the
same hub->rim dome removed from pie. Compressed to a near-uniform low-alpha wash
so the curves read flat, not bulging."*

**Do not cite `chart-mark-separation`'s 0.000 for radar.** The tool reads only
`getComputedStyle(stop).stopColor || stop.getAttribute('stop-color')` and never
reads `stop-opacity`, so an alpha ramp of *any* depth — including the 0.03->0.36
one the same comment says was removed for being too strong — scores 0.000 by
construction. That is the census-artifact failure class this language exists to
stop repeating, so the number is withdrawn rather than leaned on. **Radar's fill
survives on the argument that holds without it: it is a translucency, bounded by
design at 0.10->0.20, and the translucency is functional because radar overlays
polygons you must see through.** The census's "radial-gradient" bucket is a
syntactic classification; F1 is a perceptual one, and under F1 radar files under
flat. *(If the tool is extended to composite `stop-opacity` against the resolved
canvas, radar should be re-scored and the real number quoted here.)*

So: **gradients survive on two of the three axes, and neither survivor is
decoration.** The wash survives because it is the material of a text-bearing
backdrop and never crosses a measured axis. Radar's wash survives because it is
bounded alpha that buys legibility of overlap. The dome dies because it is the
only gradient whose own range exceeds the gap between two categories.

### What replaces the dome — both changes are deletions

**piechart wedge -> flat MARK (82%).** Not a new value: it is the dome's own
outer stop, and it is *exactly* what `piechart.transform.js` already paints into
its own legend swatch (`swatchFill: color-mix(in oklab, var(--chart-cat-N-hue)
82%, var(--bg))`). Today the swatch is flat 82% and the wedge ramps 42->82, so
**the key does not match the mark it names.** Flattening fixes that for free. The
pie prints no text on a wedge — all its text is in the key — so R2 holds.

**quadrant zone -> flat BACKDROP.** `quadrant.styles.css` already declares
`--cell-fill: var(--chart-cat-N-fill)` per cell (lines 74-77) and already paints
`.quadrant-tint { fill: var(--cell-fill); fill-opacity: 0.6; }` with a comment
that states the language's own rule: *"fill-opacity drops the four tints ~40% into
the family's quiet register so identity is carried by the vivid white-ringed dots
at the edge, not by shouting region blocks."* The only thing overriding it is the
inline `style="fill:url(#q-tint-N)"` the transform emits. **Deleting
`quadrantTintDefs`' gradient and the inline fill lands on a stylesheet that
already says what should happen and already says why.** The dots stay
`--cell-ink` (saturated), so figure and ground invert back by construction, and
the corner labels land on a 24%/40% tint instead of an 82% rim — which is the R2
violation closing.

### The axis rule: color is spent where the reader decides

**Rule F3 — a member spends its categorical hue, and its non-color channel, on
the axis the reader DECIDES from — never on row identity.**
`2026-06-22-kanban-chart-redesign.md` records this being fixed once already.
**matrix-grid re-introduces it**: `matrix-grid.styles.css` sets `--row-hue` /
`--row-ink` / `--row-fill` per `tbody tr:nth-child(8n+N)`, spending six
categorical hues on row labels and cell outlines — the axis a reader decides
least from. A design language is what stops that recurrence, so F3 is stated
before N1 and N2 reach matrix-grid: **applying `data-cat` and a texture to its
rows as written would make the least decision-relevant axis the loudest channel
on the a11y and print surfaces.** matrix-grid moves its categorical channel to
the cell value axis; its rows take neutral chrome.

### Corner radius

**Rule F2 — corner radius tracks the register, not the member.** BACKDROP is
square (a reference region has no object-ness); MARK takes a small radius. Today
the family carries nine distinct raw `cqi` radii plus `--radius-sm`/`--radius-md`
and a kernel `barRx: 3`. The engine token already exists
(`--radius-sm/md/lg`, `lib/base/base.tokens.css`), so CSS members spend it.
SVG `rx` is in viewBox user units and cannot take a `cqi` token, so SVG members
take a **ratio of the mark's cross-thickness**. The evidence range is gantt's own
two geometry blocks — `barRx 3 / barH 15` = 0.2 and `barRx 3 / barH 20` = 0.15 —
so the ratio is a **deliberate pick, not a derivation from one sample**: 0.2, and
**gantt's wider variant changes** as a result. It is listed as a cost, not folded
into "no member changes".

---

## Q2 — Type: eight roles, one real split

The brief's item 2 says "ratify the five roles"; the note's own corrected census
lists six in its table plus the two it calls split. The measured answer is
**eight**, and I ratify all eight as named:

| Role | Face (token) | Case / weight | Members printing it today |
|---|---|---|---|
| `value` | `--font-display` | 700 | bar, bullet, funnel, slope, stacked-bar, waterfall, word-cloud |
| `value-2nd` | `--font-label` | — | bullet, funnel, stacked-bar |
| `category` | `--font-body` | 400 | 16 members |
| `tick` | `--font-label` | tabular-nums | bullet, gantt, line, quadrant, radar, scatter, stacked-bar, waterfall |
| `series` | `--font-body` | 600 | line (`.cart-series` is the rule) |
| `axis-title` | `--font-label` | uppercase, 0.12em | scatter, slope, stacked-bar |
| `legend` | **follows what it names** — see below | | 8 members |
| `heading` | `--font-body` | 600 | roadmap (kanban + state-chart in the detector, not on the gallery slide) |

**A role fixes face, case, tracking and ink. Size is per-substrate, and the split
is explicit:**

- **SVG members take size per-viewBox**, from the kernel's `FS` table, which
  mirrors `chart-family.css` and is gated against drift by
  `test/unit/components/cartesian.test.js`. The same user unit is a different
  physical size in a 320x180 box and a 320-tall quadrant; getting this wrong would
  render the quadrant's 14px axis name at 6.5.
- **The five HTML members take size from the `--fs-*` scale** (HARD RULE #4).
  They already carry 51 `--fs-*` uses across kanban, progress, matrix-grid,
  roadmap and timeline-list, so each of the eight roles names its `--fs-*` slot
  for that substrate. That closes the one HARD RULE the register model does not
  otherwise reach, and it is the mechanism by which matrix-grid joins the role
  system at all.

**The `axis-title` split is the one real split, and quadrant is the member that
moves.** Three of four members paint `.cart-axis-title` in `--font-label`,
uppercase, tracked 0.12em; quadrant paints `.quadrant-axis-name` in `--font-body`
bold. Three reasons for the majority: `.cart-axis-title`'s own comment
(*"matching the chart eyebrow's register so the plot's captions belong to the same
typographic system as the frame's"*); the whole gutter/chrome register is already
`--font-label` (`tick`, `value-2nd`); and `checkLabelVoiceFont` in
`tools/check-ownership.js` states the repo's own answer in its error text:
*"Use `var(--font-label)` for eyebrows, column heads, chips, counters, captions
and chart values."* quadrant adopts the register (face, case, tracking, ink) and
keeps `--quadrant-axis-size`.

**The `legend` split is NOT a defect — it tracks data shape, and I ratify it.**
The brief reads the split as substrate accident ("nobody chose it"). Substrate
and semantics co-vary perfectly across the eight members, so the census cannot
tell them apart — but the semantic reading is the better one:

- `--font-body` legends: **gantt, journey, roadmap, state-chart** — every one of
  them is a **status key** (gantt's swatches carry `data-s`; roadmap's is
  literally `aria-label="Status key"`; journey's is the mood scale; state-chart's
  entries are state pills, set in `--pill-font`, which resolves to
  `var(--font-body)`).
- `--font-label` legends: **map, piechart, radar, word-cloud** — every one of
  them names **categories or scale steps**, through `svg-legend.js`'s
  `.chart-key-label`.

**Rule T1 — a key entry wears the register of the thing it names.** If the entry
restates an on-chart status pill, it is a pill and keeps `--pill-font`; if it
names a color-only categorical swatch, it is chrome and takes `--font-label`.
Forcing the four status keys to `--font-label` would break the match between the
key and the pills it names — a worse incoherence than the one it fixes. **Zero
members change on legend type.** What *does* change is that the four HTML keys
adopt the shared `.chart-key-*` class names so one stylesheet arm governs swatch
size, row rhythm and label ink across both substrates; the face then falls out of
T1 rather than out of which file the CSS lives in.

**Rule T2 — which roles a member owes, keyed on data shape:**

- **O1.** A member whose marks sit on a **quantitative scale** owes `tick` and
  `axis-title` per scaled axis, **or** prints `value` on every mark. Never
  neither. (This is the furniture ladder's type shadow — see Q3.)
- **O2.** A member with **more than one category** owes `category` *or* `legend`,
  never both, never neither. (Q4's rule, seen from the type side.)
- **O3.** A member printing a **ratio, target or part** beside a primary figure
  owes `value-2nd` for the secondary — never a second `value`. Three members
  arrived at this independently; it is ratified, not invented.
- **O4.** A member that **bins** its marks (columns, lanes, phases, states) owes
  `heading` for the bin name.
- **O5.** Every text a member prints belongs to exactly one of the eight roles.
  **`matrix-grid` prints none of them** — measured: its `<td>` text carries no
  role class, so it sits outside the type system entirely. It owes `category`
  (row and column names) and `heading` (column headers), sized from `--fs-*`. It
  is the only member that fails O5.

---

## Q3 — Furniture: one ladder, keyed on whether the mark floats

**Rule G1 — a mark whose *position*, not just its *length*, carries value owes a
scale to read that position against: gridlines plus exactly one reference rule.
A mark anchored to the baseline owes a printed `value` instead.**

The reference rule is `.cart-zero` when the domain crosses zero and `.cart-axis`
(via `buildAxisRule`) when it does not — **never both**. That is not new either:
`buildAxisRule`'s docblock says drawing both *"paints a second, false baseline at
the bottom of the plot."*

G1 explains the census's furniture table instead of flattening it, and it
**ratifies every existing choice except one**:

- Baseline-anchored, prints values, no grid: **bar** (the census's "a bar chart
  that draws neither a gridline nor an axis" is *correct* — bar prints `value` on
  every mark and draws a zero rule), **funnel**, **piechart**, **progress**.
- Floating marks, owe a grid: **stacked-bar** (a segment does not start at zero),
  **waterfall** (a step floats on the running total), **bullet** (a measure is
  read against banded zones), **scatter**, **line**, **matrix-grid** (cells are
  bins), **radar** (the polar web *is* the grid), **quadrant** (its split lines
  are its reference).
- Floating marks that print their values instead: **slope** prints `value` at both
  endpoints, so it passes without a grid.
- **The one violation: `gantt`.** Its bars float on a time axis, it prints a tick
  ladder, and it drops no gridlines from it, and its bar labels are names rather
  than dates. Under G1 gantt owes period gridlines. `buildGrid({axis:'x'})`
  exists in the kernel for exactly this shape.

**Rule G2 — a magnitude encoded in a channel with no axis (size, area, opacity)
owes a key for that channel.** word-cloud's size key and scatter's bubble-size
key already exist; G2 names why.

---

## Q4 — Key: three models, one rule

**Rule K1, keyed on category count and label room:**

- **<= 6 categories AND each mark has room for its own name -> direct labels.**
  `chart-family.css` already states the principle on `.cart-series` (*"Direct
  labels beat a legend whenever they fit, so this is a first-class register, not a
  fallback"*); K1 is what holds a member to it. line, scatter, slope, stacked-bar
  already comply.
- **> 6, or marks too small or too many to label -> a rail**, through
  `svg-legend.js`. map's 175 regions, the pie's thin wedges, radar's overlapping
  polygons, word-cloud's size scale.
- **Exactly one category, or the category *is* the row label -> nothing.** bar
  (single series), bullet, funnel (stages are the rows), progress, timeline-list,
  waterfall (semantic, labelled), quadrant (its categories are the four named
  corners), kanban (columns are headed), word-cloud (its marks are the words).
- **Never both.** A rail whose entries a direct label already names is a
  duplication, not a key.

**Rule K2 — one rail geometry.** The census's "at least three physically
different treatments" collapse to `svg-legend.js`, which **already implements both
placements**: a right rail with the accent spine at landscape (`LABEL_COL_R`) and
a full-width row below the diagram at portrait (`PORTRAIT_LABEL_COL_R`). gantt's
centred row-below and matrix-grid's mono-italic bottom-left caption are the two
that diverge. gantt's key is SVG and can call the builder; matrix-grid is HTML by
declared manifest choice, so it takes the **HTML mirror of the same ratios**
under the same `.chart-key-*` classes.

---

## Q5 — Motion: the vocabulary already exists, but it is seven roles, not five

`docs/src/lib/chart-anima.ts` `chartToScene` reads `data-anima-role` and already
derives choreography from it: sectors reveal synchronized (*"a staggered wedge
leaves a visible wedge-shaped gap mid-build, so the disc reads as 'missing a
slice'"*), everything else staggers.

**Fix the role vocabulary before writing any motion rule.** `isRole()` accepts
five — `bar | sector | point | region | label` — but the kernels **emit seven**:
`line.transform.js` writes `data-anima-role="line"` and `data-anima-role="area"`.
Those are silently rejected, `roleForNode` returns null, and only the `?? 'bar'`
default keeps line staggering. Writing M1 and M2 over the five the *validator*
accepts rather than the seven the *kernels emit* is how the two rules destroy each
other: satisfying M1 by admitting `line`/`area` would, under a five-role M2,
synchronize them and stop the line drawing along its path — the exact behavior the
brief names as what motion should key on.

**Rule M0 — the role set is the set the kernels emit: `bar | line | area | sector
| point | region | label`.** `isRole` is extended to seven. (The alternative —
deleting the two emissions and calling line's paths `bar` — is a legitimate
choice, but it must be made explicitly, and it forfeits path-draw.)

**Rule M1 — every geometry mark declares a role.** Already gated in
`chart-anima.test.ts`. Three emissions ride a fallback rather than declaring:
**line's `line` and `area`** (rejected by the validator, saved by the `?? 'bar'`
default) and **word-cloud**, which emits `<text class="wc-word">` with no role and
animates only because `chartToScene` sweeps every `<text>` into the label pass.
Measured: 0 `data-anima-role` in word-cloud's live DOM. Its marks *are* text, so
the fallback happens to be right — it should say so rather than depend on it.

**Rule M2 — ordered roles stagger; unordered roles synchronize.**
Ordered: `bar`, `line`, `area` — a funnel's drop-off, a gantt's time order, a
waterfall's bridge, a ranked bar, and a line drawing along its path.
Unordered: `sector`, `region`, `point` — a map's regions, a matrix's cells and a
scatter's dots have no order, and a stagger across 175 regions reads as a page
loading. In `chartToScene` this is `isUnordered = !ORDERED.has(role)` replacing
`isSector`, over the seven-role set from M0.

**Rule M3 — journey is a kernel bug, not a restructure.** `chartToScene` reads
the *first* `<svg>` in the section; journey emits **8**, and its first carries
neither a role nor a `<text>`. The fix is to pick the first `<svg>` that contains
a role-declaring node. One line, in the shared kernel.

**Rule M4 — the five HTML members get a declared CSS build, not an SVG rewrite.**
`render` is a declared, justified, gated manifest field
(`npm run check:render-nature`), and each of the five renderNotes gives a real
reason: *"A board is a set of text cards in named columns with no geometry to
draw"*; *"a real `<table>` … nothing is positioned by numeric value."* Rewriting
them to SVG would trade real text selection, wrapping and reflow for a build
animation.

**The build rides `lib/base/base.build.css`, the engine's existing
progressive-disclosure reveal contract** — do not mint a chart-only keyframe set.
That sheet already carries the exact guarantee this needs: *"THE 0-PIXEL
GUARANTEE: without `data-build-at` on the section, NOTHING here applies … the
final-state PDF are byte-identical to a deck with no build,"* and it already
hides with `opacity`/`visibility` rather than `display` so the slide assembles
with no reflow. **The one coupling to name honestly:** that sheet is driven today
by an *authored* step index (`lib/transformers/build.js`), and chart motion is
automatic, so the chart's rows must be stamped by the kernel rather than by the
author, and the timing belongs to that sheet's own planned "Increment 4 adds a
typed `build` transition" rather than to the chart family. Until that increment
lands, the five carry a documented "reveal-only build" — which is still a
declared behavior instead of today's silent skip.

**Q5 changes no exported bytes.** Print renders the final frame; the reveal sheet
is inert without `data-build-at`; `player-motion:` already separates the exported
file from the Playground.

---

## Q6 — Detail reveal: the grammar and the print fallback both already ship

`_chart-family/mark-detail.js` is the whole answer. One authored grammar — a
nested sublist under the mark's list item (`splitDetail`) — becomes two surfaces:
an inert `<template class="chart-detail" data-mark="i">` for the live reveal, and
`detailNote()`, which folds the same detail into a Marp speaker-note comment that
notes-core lifts into a PDF text annotation and strips before render, *"so a
detail chart's PDF gains the notes WITHOUT touching the chart pixels."* **The
print fallback is not a design question; it is built and proven.** 14 of 21
members already call it.

**Rule D1 — a member owes a popover when its mark is an *entity* that can carry
more than its own label and value, and does not already print prose.**

- The 14 wired members are entities: a company, a region, a task, a stage, a
  point.
- **kanban, roadmap, timeline-list, matrix-grid, journey and word-cloud already
  print prose in the mark itself.** A popover there duplicates visible text. Six
  of the seven unwired members are retired by the rule, not by an exception.
- **progress is the one member that owes one and lacks it.** A progress row is an
  entity with a real story (owner, blocker, next milestone). It is HTML — and
  that is not a blocker, because `chart-interact.js` binds on `[data-mark]`,
  which is substrate-neutral: an HTML `<li data-mark="i">` binds exactly as an
  SVG `<rect>` does. **One member changes, with no new mechanism.**

**Rule D2 — emit `data-mark` only where the author wrote detail.** `line` already
does this (*"a chart without detail is byte-identical to one that never had the
feature"*); the other 13 emit unconditionally. Adopting line's guard keeps a
detail-free deck byte-identical, which matters because D1 adds a member.

**Q6 changes no exported PIXELS, and it does change exported BYTES.** A member
that gains a popover gains PDF text annotations wherever an author wrote detail —
that is the existing, gated behavior of the 14 wired members, quoted approvingly
above. So the progress change falls under CLAUDE.md's export sign-off gate ("the
bytes of an exported artifact") and owes a dark-and-light render for inspection,
even though no chart pixel moves.

---

## Q7 — The non-color channel: the mechanism is settled; coverage and WIDTH are the gaps

The channel exists (`--cat-N-texture`, `2026-07-16-universal-texture-channel.md`)
and `themes/a11y-base.css` and `lib/base/base.print-textures.css` agree with each
other. Two gaps, and the second is the one the brief generalized into a rule.

**Rule N1 — coverage: the family's emitter contract.** Every categorical mark
carries `data-cat`, every stroked series `data-series`, every semantic mark
`data-s`. Measured by grep this session: **quadrant, map, matrix-grid, kanban,
word-cloud and piechart emit zero `data-cat`**; bullet emits 2; radar carries
`data-series`. The a11y block covers the seven Cartesian members in **ten rules**
because they share this convention, while piechart and funnel take **six rules
each** because they are matched by `nth-of-type`. The stylesheet says so: *"every
categorical FILLED mark carries `data-cat="0..5"` … That is why this block is ten
rules instead of seventy."* Once N1 holds, a11y and print coverage is one rule per
slot for every member at once, and a mark textures identically to its own key
swatch for free. **F3 binds here**: matrix-grid gets `data-cat` on the axis the
reader decides from, not on its rows.

**Rule N3 — WIDTH: every non-color channel is as wide as the categorical cycle,
and that is the gated part.** The categorical palette is **8** wide
(`--chart-cat1..8`); the engine emits **8** chart textures
(`latt-a11y-chart-tex-1..8`); the a11y themes wire only **6**, via
`nth-of-type(6n+…)` and `data-cat="0..5"`. So categories 7 and 8 silently wear the
textures of 1 and 2 — **a redundant channel narrower than the channel it backs up
is not redundancy, it is a silent merge.** N1 alone does not fix this: the pie
key-swatch rules already key on `data-cat="0..5"` and stop at 5.

- The 6-wide cycles widen to 8, in `a11y-base.css` and `base.print-textures.css`
  alike.
- A test asserts **channel width == categorical cycle width** for texture, dash
  and point shape — the shape of check `tools/check-ownership.js` already runs
  inside `build:check`, so it changes what a gate *finds*, not what the pipeline
  *runs*.
- **Past 8 the channel wraps, and a wrap is still a merge — just a rarer one.**
  The pie's documented 11-slice ceiling is where it first bites. The honest
  statement is that the family supports 8 distinguishable categories and degrades
  by documented wrap beyond that; a member exceeding 8 owes direct labels (K1)
  rather than relying on the channel.

**Rule N2 — the channel keys on the mark's geometry, and two of the three already
ship:**

| Mark geometry | Channel | Status |
|---|---|---|
| **AREA** (wedge, band, region, cell, zone, card) | texture (`--cat-N-texture` / `url(#latt-a11y-chart-tex-N)`) | ships — widen to 8 (N3) |
| **STROKE** (line, slope, radar polygon, trendline) | dash pattern | ships — six patterns, widen to 8 (N3) |
| **POINT** (scatter dot, quadrant dot, gantt milestone) | **shape** | **the one genuinely new thing — 8 wide from day one** |

A `<pattern>` on a 3-unit dot is illegible, so shape is the only channel that
works for points. It is an **8-slot** `<path>` cycle in the shared kernel keyed to
the same 0-based `data-cat`, drawn — never typed (HARD RULE #29). It is the last
slice, because it is also the smallest measured need: the gallery's scatter and
quadrant are single-category today.

**Two corrections to the brief's "six not defensible."**

1. **bullet is defensible and already covered.** `a11y-base.css` says so
   deliberately: *"BULLET is deliberately untextured. Its three layers are
   separated by VALUE, not hue … Texturing the band would fight the measure bar
   that has to read against it."* Bullet has a non-color channel; it just is not
   texture. The uncovered list is **five**: quadrant, map, matrix-grid, kanban,
   word-cloud.
2. **word-cloud's channel is not texture either.** Its marks are text (INK
   register, below), and text cannot take a texture without becoming unreadable.
   Its channels are **weight and size**, which it already carries, plus dropping
   to one hue on an a11y palette. Saying that is better than inventing a channel
   that would not survive rendering.

---

## Q8 — Tokens: one constant, eight aliases, and nothing else

**New (2 declarations of new *kind*, 9 lines total), in `chart-family.css`
beside the canonical-fill block:**

```
--chart-fill-solid: 82%;                       /* joins --chart-fill-top-*/bottom-*/edge/accent */
--chart-cat-N-solid:                           /* x8, same shape as -fill and -ink */
  color-mix(in oklab, var(--chart-cat-N-hue) var(--chart-fill-solid), var(--chart-cat-base));
```

That is the **only new value in the language, and it is not new** — it is the
level six members already paint. Tokenizing it collapses hand-written mixes that
have already drifted on two axes:

- **strength**: 82% (funnel, stacked-bar, map, pie swatch, quadrant swatch, radar
  swatch, the dome's rim stop) vs **88%** (`.bullet-measure`);
- **base**: `var(--bg)` (funnel, map, and the piechart, quadrant and radar legend
  swatches) vs `var(--chart-cat-base)` (stacked-bar, the domes). On light these
  are identical; on **dark** `--bg` is the theme canvas and `--chart-cat-base` is
  black, so the same "82% solid" renders two different colors today. The token
  pins the base to `--chart-cat-base`, the documented canvas-aware target the
  canonical fill already uses.

**`--chart-fill-solid` is also a theme hook** — a theme whose identity needs a
different solid (onyx, which separates by value) can re-point one percentage and
move every categorical mark in the family.

**The plate keeps its own constants** (16% light / 22% dark, progress). It is a
composition device, not a fourth categorical level, and a second member wanting
text over a hostile register reuses those two numbers rather than inventing a
third pair.

**No other token is needed, and here is why for each candidate the brief names:**

- **mark weight** — `--chart-hairline` and `--chart-accent-lg` already exist and
  are already resolution-clamped.
- **grid weight** — `.cart-grid` / `.cart-zero` / `.cart-axis` carry 0.5 / 0.6 /
  0.7 in **viewBox user units**, which scale with the SVG. A `cqi`-clamped CSS
  token would be the wrong unit there. Leave them literal.
- **fill strength** — that is `--chart-fill-solid` above, plus the four constants
  already shipped.
- **elevation** — the three registers *are* the elevation model; they need no
  fourth token.
- **motion timing** — `chartToScene` takes `duration` / `buildSpan` as numbers,
  and the HTML build rides `base.build.css`'s own timing when that sheet gains
  it. Minting a chart-only timing token now would fork it.
- **corner radius** — `--radius-sm/md/lg` exist for the CSS members; the SVG
  members take a *ratio* of thickness, which is not a token at all.
- **`--state-X-solid`** — deliberately absent. Semantic marks are text-bearing by
  construction, so R0 puts them in BACKDROP. Adding the tier would invite a
  regression R2 exists to stop.

---

## The 21-member obligation table

`R` = register the data mark takes, under R0. `chg` marks a member the language
moves.

| Member | Data shape | Mark R | Furniture (G1/G2) | Key (K1) | Anima role | Popover (D1) | Non-color (N2) | chg |
|---|---|---|---|---|---|---|---|---|
| bar | baseline-anchored magnitude | **MARK flat 82%** (loses the wash) | zero rule + `value` | none | bar | yes | texture | ✓ |
| bullet | measure vs bands + target | BACKDROP band / **MARK 82%** / INK target | grid + axis | none | bar | yes | **value** (deliberate) | ✓ |
| line | float on a scale | INK stroke, BACKDROP area | grid | direct | **line / area** | yes | dash | ✓ |
| radar | overlaid float, polar | INK stroke + bounded alpha wash | polar web | rail | region | yes | dash | ✓ (swatch base) |
| slope | float, two endpoints | INK stroke | prints `value` instead | direct | bar | yes | dash | — |
| stacked-bar | float within a stack | MARK | grid + axis | direct | bar | yes | texture | — |
| waterfall | float on a running total | **MARK** (was wash) | grid + axis | none | bar | yes | texture | ✓ |
| scatter | float in 2D | INK dot | grid + axis + size key | direct | point | yes | **shape** | ✓ |
| piechart | part of a whole | **MARK flat 82%** | none | rail | sector | yes | texture + `data-cat` | ✓ |
| quadrant | 2D position in named zones | **BACKDROP zone / INK dot** | split lines | none (corners name it) | point | yes | texture + `data-cat` | ✓ |
| funnel | baseline-anchored rate | MARK (base -> `--chart-cat-base`) | prints `value` | none | bar | yes | texture | ✓ |
| map | choropleth over geography | MARK (base -> `--chart-cat-base`) | none | rail | region | yes | texture + `data-cat` | ✓ |
| gantt | float on a time axis | BACKDROP wash (caption inside) | **+ gridlines** | rail (status) | bar | yes | `data-s` | ✓ |
| progress | one magnitude per row | BACKDROP wash + **PLATE** under the readout | prints `value` | none | *(build)* | **+ popover** | `data-s` | ✓ |
| state-chart | states + transitions | BACKDROP wash (state word inside) | none | rail (status) | region | yes | `data-s` | ✓ |
| timeline-list | dated items | BACKDROP wash (text inside) | none | none | *(build)* | no — prints prose | `data-s` | ✓ |
| kanban | text cards in bins | BACKDROP wash (card text) | none | none (columns headed) | *(build)* | no — prints prose | texture + `data-cat` | ✓ |
| roadmap | table of state markers | BACKDROP | none | rail (status) | *(build)* | no — prints prose | `data-s` | ✓ |
| matrix-grid | table of bins | BACKDROP | gridlines | rail | *(build)* | no — prints prose | texture + `data-cat` **on the value axis, not rows (F3)** | ✓ |
| journey | stages x lanes + mood curve | none (unfilled) | none | rail (status) | region *(kernel fix)* | no — prints prose | `data-s` | ✓ |
| word-cloud | rank by size | **INK on text** | size key (G2) | size key | label *(declare it)* | no — the mark is the word | weight + size | ✓ |

**word-cloud is INK, not MARK, and that is the general rule for a mark that IS
text.** Its words are `fill: var(--wc-color)` with `--wc-color` baked as
`var(--catN-ink)` — already the ink register, already AA-solved. Repainting them
at `--chart-cat-N-solid` would move solved text onto the level measured as failing
AA in 117 of 224 combinations. **When the mark is text, the mark takes INK, and R2
is satisfied by construction rather than by separation.** Q7's word-cloud answer
follows from the same line instead of reading as an exception.

**18 of 21 change. The three that do not are slope, stacked-bar and
matrix-grid's furniture** — and only slope and stacked-bar are untouched
outright. The earlier draft claimed "the Cartesian core is untouched" as evidence
that the language is descriptive rather than imposed; that claim rested on bullet
and bar, both of which this document changes, and it is withdrawn. **The honest
evidence is narrower and still real: `bullet` already implements all three
registers on one chart, `progress` already implements the plate, `line` already
implements D2's guard, and `svg-legend.js` already implements both K2 placements.
The language names four things the newest kernel had already built; it does not
claim to leave the family untouched.**

---

## Survival: four themes, two canvases, two media

- **cuoio / indaco (hue-separated).** Unchanged behavior; the dome's removal
  raises pie separation from 9.4x-swamped to flat (cuoio piechart today: 0.255
  self-range vs 0.027 separation).
- **onyx (value, not hue).** The rule that *only* onyx needs is R1, and R1 is what
  the dome broke: onyx's pie and quadrant both measure self-range 0.286 against
  separation 0.097. Flattening returns the whole value budget to the categorical
  channel. `--chart-fill-solid` gives onyx a curation lever if 82% is still too
  close to its ramp.
- **a11y-achromatopsia (no hue at all).** Color carries nothing, so N1 and N3 are
  the whole answer — an *attribute* contract plus a width contract, not a paint
  one. The six members that gain `data-cat` join a ten-rule block that already
  exists; widening 6 -> 8 is what stops categories 7-8 merging into 1-2.
  On the quadrant specifically, four zones at `--chart-cat-N-fill` x 0.6 opacity
  will be four near-identical pale grays on onyx and a11y — and that is correct:
  a reference region names itself in **words** (`quadrant-label` at the corners,
  now legibly, per R2), and the dots carry the data.
- **Dark canvas.** Every register is a `light-dark()` pair or mixes into
  `--chart-cat-base`, which is `--bg` on light and `black` on dark, so warm hues
  stay hue-true on a navy canvas. R1's ordering holds on both because it is a
  proportion of the hue, not an absolute lightness.
- **Print.** No motion rule changes a rendered frame. The detail reveal's print
  surface is the speaker note, which is stripped before render — pixels unchanged,
  annotations added where an author wrote detail. N1/N3 extend
  `base.print-textures.css` by pointing at the same slot attributes and widening
  the cycle to 8.
- **Screen.** The 82% MARK level is text-hostile in 117/224 combos; R0 keeps
  text-bearing marks off it and R2 keeps loose text off it, so the language
  *reduces* the family's contrast exposure rather than adding to it — and it
  closes quadrant's existing violation.

---

## Cost

**Members that change: 18 of 21.** Broken out by rule: register/fill 8 (bar loses
its wash; waterfall moves wash -> solid; piechart and quadrant lose the dome;
funnel, map and bullet re-base on the dark canvas; radar's legend swatch re-bases);
type 2 (quadrant's axis title, matrix-grid joining the role system at `--fs-*`);
axis 1 (matrix-grid's categorical channel moving off its rows, F3); furniture 2
(gantt gains gridlines, gantt's wider bar variant's radius under F2); key 2
(gantt, matrix-grid); motion 8 (five HTML builds, journey's kernel fix,
word-cloud declaring its role, line's two roles admitted to `isRole`); detail 1
(progress); non-color 6 (`data-cat` emitters) + the 6 -> 8 widening + 1 new
channel (point shape).

**Kernel edits: four lines and two deletions.** `chartToScene`: `isSector` ->
`isUnordered` over the seven-role set (M0/M2), `isRole` extended to seven (M0),
and the first-SVG selector (M3). `piechart.transform.js`: delete the
`<radialGradient>` and paint the flat solid. `quadrant.transform.js`: delete
`quadrantTintDefs`' gradient and the inline `style="fill:url(…)"` — the
stylesheet underneath already does the right thing.

**Committed artifacts that churn (measured this session):**

- **19 committed `examples/*.pdf`** contain a piechart or quadrant — i.e. the
  gradient decision alone re-renders 19 of the 168 committed example PDFs.
- **47 committed `examples/*.pdf`** contain at least one of the members the
  earlier 14-member count covered; the count is now larger, because bar and
  waterfall changed register. That number should be re-measured against the
  18-member list before the PR quotes it.
- The chart bucket gallery (`chart.gallery.light.pdf`, `chart.gallery.dark.pdf`)
  plus the cross-bucket showcase decks (`npm run build:showcase-galleries`).
- **HARD RULE #8 applies**: the six long-running galleries graduate in a separate
  post-review commit, not in the feature commits.
- **HARD RULE #9 applies**: this is visible on a slide, so it owes
  `examples/<slug>.md` + a committed PDF, 6-10 slides, showing the three
  registers, the plate, and the flat pie/quadrant in both modes.

**What breaks, stated plainly:**

1. **`bar` loses its vertical wash.** This is the register model's largest visual
   cost and the price of deciding bar vs stacked-bar by rule instead of by
   accident. The wash is not deleted — it becomes BACKDROP material, worn by
   exactly the boxes that carry text.
2. **Every deck with a pie or quadrant reads flatter.** That is the point, and it
   is the change most likely to draw "it looks less rich." The counter is the
   measurement, not the taste: on onyx the dome spends 2.9x more perceptual
   ground inside one category than exists between two.
3. **The dark canvas shifts for funnel, map, bullet, and the piechart, quadrant
   and radar legend swatches** when the solid re-bases from `--bg` to
   `--chart-cat-base`. Small each, but it is a visible change to three members and
   three key rails nobody asked to change; it is the price of one token instead of
   seven mixes.
4. **`.bullet-measure` moves 88% -> 82%.** A 6-point change on one mark, and
   bullet's second change. If the bullet's measure genuinely needs to out-rank the
   funnel's bands, the honest answer is a second constant, not a silent 88.
5. **gantt gains gridlines** — the single most visible furniture change, and the
   one most likely to be argued. G1 is what justifies it; if the human rejects
   G1, gantt keeps its ticks and the rule needs a "time axes are exempt" clause I
   would rather not write.
6. **The MARK register cannot be gated the way BACKDROP is.** Extending
   `chart-contrast.test.js`'s `TEXT_ON_FILL` arm to `--chart-cat-N-solid` would
   fail 117 of 224 combinations on day one. The correct gate is the *inverse*:
   assert that no `.chart-frame` rule sets a text `fill` on an element whose
   background is the solid **and which carries no plate** — a structural check,
   not a contrast one. Naming this now stops someone adding the obvious gate and
   re-tuning 14 palettes to satisfy it.
7. **quadrant's axis title must keep its own size.** Adopting `.cart-axis-title`
   wholesale would render a 14px name at 6.5px in a much larger viewBox.
8. **`chart-mark-separation.js` cannot score an alpha ramp.** Any future gradient
   verdict that leans on its self-range number for an opacity-varying fill is
   reading a constructed zero. Either extend the tool or do not cite it there.

**How it is held, without a new CI step.** Every gate this needs is the *shape*
of one `tools/check-ownership.js` already runs inside `build:check`:
`checkLabelVoiceFont` is the model (budget + allowlist + staleness) for "each of
the eight roles resolves to one face"; `checkHexLiterals` and
`checkMarginDiscipline` are the model for "no `color-mix(… 82% …)` outside the
solid token"; and N3's width assertion is the same shape again. Adding a check to
an existing gate changes what a gate *finds*, not what the pipeline *runs* — so it
does not touch the CI contract. **I am not proposing a new CI job or step**; if
one is ever wanted, that is the human's call.

---

## What this language deliberately does not do

- **It does not touch the palette.** Every rule spends `var(--token)` on the
  existing `--chart-cat*` / `--chart-state-*` sets (HARD RULE #3), and the only
  new value is a percentage.
- **It does not restructure any member.** The five HTML members keep their
  declared `render: html` and the renderNote that justifies it.
- **It does not redesign the legend builder, the frame, the cartesian kernel, the
  texture channel or the motion scene builder.** It adds one line to two of them
  and widens one cycle.
- **It does not resolve `kanban`'s vertical composition defect.** The census is
  right that it is a layout bug and that no color decision reaches it; it is
  off-path for this language and belongs in a tracked issue (HARD RULE #18).
- **It does not fix the two engine-JS typed shapes** (`matrix-grid`'s axis arrows,
  `state-chart`'s transition chips, pinned by content in
  `test/unit/core/shape-glyphs.test.js`). The point-shape cycle in N2 is where
  they would eventually get drawn properly; that is a note, not a commitment.

## Open questions for the human

1. **Is bar losing its wash acceptable?** It is the price of R0 deciding bar vs
   stacked-bar by rule. The alternative is keeping the wash on data marks and
   defending the divergence explicitly.
2. **Is gantt gaining gridlines in scope?** It is the only furniture change that
   costs work rather than ratifying an existing choice.
3. **88 or 82 for `.bullet-measure`?** One token or two.
4. **M0: extend `isRole` to seven, or delete line's two emissions?** Extending
   keeps path-draw, which the brief asked for by name; deleting is cheaper and
   forfeits it.
5. **Does the point-shape channel land in this work or after?** It is the only
   genuinely new mechanism, and its measured need is the smallest — though under
   N3 it must be 8-wide whenever it lands.
