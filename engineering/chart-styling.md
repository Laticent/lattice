# How to style a chart

The contract for anyone — human or agent — changing how a chart *looks*. Creating
a new chart member is a different job: that is `design/skills/chart-component.md`.
This is about paint, weight and spacing on the 21 members that exist.

**One sentence: structure belongs to the family, color belongs to the palette and
the finish, and neither is allowed to do the other's job.**

---

## 1 · The split, and why it is the whole discipline

| | who owns it | what it means |
|---|---|---|
| **Structure** | the chart family, globally | edge weight, corner radius, the gap between marks, spacing |
| **Colour** | the theme's palette, moved by the finish | which hue, how deep, which channel carries identity |

A chart member **never tunes structure for itself.** If a bar's outline looks too
heavy, the fix is the family token, not that member's stylesheet — because if it
looks wrong there it is wrong everywhere, and a per-member fix guarantees the set
stops reading as one system.

This is not a style preference. It is the lesson of the defect that made this
document necessary: the family's declared marks painted at **21 different
physical weights**, a 6.9× spread from 0.42px to 2.9px, every one of them a local
decision that looked right in isolation. Today it is **8** weights over 2.2× —
21 mark classes at exactly 1px, seven knockouts at their own role-correct widths,
and one sanctioned 2px emphasis.

Re-derive both with `node tools/chart-structure-census.js`, on the branch and on
`main`. Quote a commit when you quote the numbers: an earlier draft of this
paragraph said 16 weights over 13.1×, and a later one said 21 over 5.8× measured
against a stale build. The 13.1× came from a probe that
multiplied by `box.width / viewBox.width` where `xMidYMid meet` gives a UNIFORM
`min(sx, sy)`. Measured against a rendered control — viewBox 100×100 in a 400×100
box, `stroke-width: 2` — the x-ratio predicts 8px and the render paints 2.

## 2 · The coordinate-space trap — read this before touching any `stroke-width`

**An SVG `stroke-width` is in viewBox user units, not pixels.** The family's
viewBoxes range from 24 units (a journey mood face) to 1375 (a world map), and
they render into boxes from 32px to 1152px wide. So the same literal means a
different painted weight on every member, and a number tuned by eye on one chart
is meaningless on the next.

Measure it, never reason about it:

```
node tools/chart-structure-census.js          # every width, radius and gap, in PHYSICAL px
node tools/chart-structure-census.js --check  # is every outline mark actually pinned?
```

The census reports each width twice, `user` as declared and `px` as rendered, and
the physical column is the one to read. Its scale comes from `getScreenCTM()`,
never from the viewBox ratio — see above for what that mistake costs.

`--check` judges each element, not each class. A canvas-colored stroke is a separator
(it follows what it separates), so it is exempt; any other stroke on the same class must
still be pinned. `heatmap-cell` is the case: measured cells stroke in the canvas color,
empty cells carry the dotted family edge, and only the second is held to the rule.

**The rule:** a data mark's edge comes from `var(--chart-edge)` and carries
`vector-effect: non-scaling-stroke`. That pairing is load-bearing in both
directions — `non-scaling-stroke` strips the viewBox scaling so the weight is
comparable across members, and `--chart-edge` resolves to the family's
`clamp(1px, 0.078cqi, 2px)` so it still grows with the container above HD (#180).
Use one without the other and you break one of the two properties.

`chart-mark-edge-census.test.js` ties the shared rule's class list to the marks
each manifest declares `paint: "fill"`, so a new member joins by declaring its
marks — not by editing CSS. It also fails on a class a member gives
`--chart-edge` that the shared rule does not pin, which is the leak worth knowing
about: the source text reads identically either way, and two radar marks took the
token, missed the list, and rendered at 1.24px and 1.29px beside a 1.00px
neighbor.

**A KNOCKOUT IS NOT AN OUTLINE, and the family has six.** `funnel-band`,
`line-dot`, `quadrant-dot`, `quadrant-trail-after`, `radar-dot`, `scatter-dot`
and `sbar-seg` stroke in `var(--bg)`. That stroke holds two touching marks apart
— a dot where two lines cross, a segment abutting the next in its stack — so its
correct weight follows what it separates, not the family's outline weight.
Flattening them into `--chart-edge` took quadrant's separator from 2.23px to
1.00px. The test re-derives the exemption from each member's own CSS, and a
`:hover` rule does not qualify.

### The structural tokens

| token | value | use |
|---|---|---|
| `--chart-edge` | `var(--chart-hairline)` → 1px @HD | every data mark's outline |
| `--chart-edge-strong` | `calc(… * 2)` → 2px | hero series and the active mark, nothing else |
| `--chart-hairline` | `clamp(1px, 0.078cqi, 2px)` | DOM borders, rules, separators |
| `--chart-fill-accent` | `clamp(4px, 0.31cqi, 7px)` | a mark's leading-edge accent stripe |
| `--chart-mark-radius` | `0.46875cqi` | a mark's corner |

**A text halo is not a mark edge.** `paint-order: stroke` on a label uses
`stroke-width` to fatten a readability outline around glyphs, in the CANVAS
color. Those are deliberate and must not be folded into `--chart-edge`. The
census test tells them apart by that canvas color, not by the presence of
`paint-order` — the pie's `.wedge` is a declared mark that carries `paint-order`
precisely so only the outer half of its edge shows, and a `paint-order` exemption
would have let it take any literal width and ship green.

**And a width can arrive as a presentation attribute**, where no CSS scan will
see it. A transform writing `stroke-width="1.2"` into the markup sets the same
property from a file none of the CSS arms opens; the census has an arm for that
too, with one sanctioned entry (`journey-face`, an icon on an `<svg>` wrapper).

## 3 · The three finishes

A finish moves color; it never adds or removes it, and it never touches
structure. A deck picks one with `marks:` (`lib/base/base.registers.docs.md`),
and a slide can pin its own with `_class: marks-<name>`.

### The solids — the base every finish styles

Every chart concept has **one flat solid**, curated per theme: a category is `--chart-cat-N-hue`
(seed `--chart-catN`), a status `--state-X-hue` (seed the base status FILL `--X-mark`), and a mark with
neither `--chart-neutral-hue` (seed `--chart-neutral-mark`).

**One ink.** Every chart fill, a category, the neutral or a status, is DEEP enough to carry white text
(`--chart-on-mark`, which is `--on-mark` on every one: one token, declared once on the frame and never re-pointed). At most two charts share a slide, and two text colors side by side read as two
systems, so the ink never changes with the kind. This replaced a scheme where a status was a BRIGHT fill under
near-black text ("text color carries the kind"); it kept the meanings apart, but a status chart beside a category
chart wore two inks, and on a light slide the bright fills were the quietest marks on it.

**A status is told apart by what it adds, not by its fill.** A status shares a lightness with the categories, so a
brand green bar and a "done" bar can look alike. Two things separate them:

- **the MARK.** Every status that names a state carries its drawn shape (`lib/core/status-marks.js`): a check for
  done, a dash for at risk, a cross for blocked, a slash for deferred. An SVG member inlines the path, an HTML member
  masks the `--mark-*-bold` token; live, pilot and decision carry none. The shape also reaches a reader who sees no
  color.
- **the SIGNAL ring.** The two exceptions, at risk and blocked, wear a ring in the classic hue (`--warn-signal-mark`
  amber, `--fail-signal-mark` coral-red; § THE SIGNAL RING in `chart-family.styles.css`), the status color at the
  opposite lightness to its fill. Nothing else rings, so a ring means "exception" on every chart. It is an outline
  that takes no space: 1.3 hairlines wide (`--chart-ring`), and 1.3 times the edge wherever a finish widens a
  status mark's edge (etch, tone; and etch's risk cells), so the ring is always the heavier line; drawn INSIDE the shape, so it never grows a mark or covers
  an arrowhead at the shape's edge. HTML boxes take an inset shadow (`!important`, because every finish paints a
  status member's edge with `!important`); an SVG member's kernel draws the shape's own outline clipped to the shape
  (`.chart-signal-ring`). A risk matrix rings its whole critical band once, inside the band, and marks each critical
  cell. A hub-spoke alarm halo stands apart from its disc, so its only neighbor is the slide: it wears the status ink.

The contract, held for every palette in both modes and both intensities by
`test/unit/palette/chart-solids.test.js` and `chart-one-ink.test.js`:

- white clears **7:1** on every light-face solid and **4.5:1** on every dark-face one, where a fill is the lightest
  tone of its hue white still clears (4.6:1 by construction), so it stands off the dark slide;
- every solid clears **3:1** against the slide (WCAG 1.4.11) by itself;
- a status LINE or status TEXT (a slope, a waterfall step, a kanban header: `--state-X-ink`) paints the theme's
  status ink `--pass` … `--mute`, the color that status is in every other component, so a deck has one color per
  status for text and one fill per status for a mark;
- each ring sits at the opposite lightness to its fill and clears **3:1** against the neighbor opposite it in
  lightness: a bright ring on a deep fill against the fill (light slide); a bright ring on a mid-tone fill against the
  slide, with a **2:1** step off the fill (dark slide; held to 3:1 off a mid-tone fill it washes out to near white); a
  deep ring on an `a11y-*` palette's bright dark-face fill against the fill.

**Two intensities** (`marks: … muted | vivid`, `lib/core/resolve-marks.js`). Muted is `--X-mark`, the
default: done a quiet SAGE, the exceptions carrying the color as a burnt orange and a crimson. Vivid is
`--X-vivid-mark`, which `base.tokens.css` swaps in under `.marks-vivid` (§ THE STATUS FILL ON THIS SLIDE):
every status rich, done an emerald, for a deck that celebrates its wins. Both keep white text, and the rings are
shared. The register sets every status fill on the slide, so a checklist disc, a kpi pill or a policy badge takes
the same intensity as the chart beside it (`engineering/decisions/2026-10-24-status-is-one-system.md`).

**Each theme's status set is its own.** The hues are the theme's own status inks (`--pass` …), each held to its band
(`HUE_BAND` in `lib/theme/chart-solids.js`): warn a burnt orange (an amber deep enough for white text turns brown),
fail a crimson, pass short of teal, info in the cyan band. Pass and fail lean 20% toward the theme's accent, at most
18 degrees, so a leather palette's green is olive-sage and a frost palette's red a cool rose; warn does not lean.
Saturation follows the theme's own categories, held to 0.75-1.2 of typical. Done sits a step deeper than the
exceptions (`STATUS_BAR`): a settled status should be the quietest mark on the slide.

**Colorblind readers.** The marks carry status by shape for every reader. The deep band is narrow, so the statuses
are spread across it: on the light face at risk and info sit at the white bar, blocked a step deeper, done deepest
(`STATUS_BAR`); on the dark face each takes a fixed position across the band between 4.6:1 under white and 3:1 off
its slide (`DARK_SPREAD`). Measured across the brand palettes against the bright scheme this replaced, the
worst-separated pair holds or rises under every condition (protanopia 0.008 to 0.020, deuteranopia 0.003 to 0.003,
tritanopia 0.057 to 0.064, achromatopsia 0.019 to 0.018; the p10 rises under all four), while the median falls under
protanopia and achromatopsia. A brand palette is held to that record (`test/fixtures/status-fill-cvd-baseline.json`).

**The `a11y-*` palettes are the answer for a colorblind reader, and they share one design.** On the light face they
follow the scheme above. On the dark face the deep band under white is too narrow for three statuses a colorblind
reader can tell apart (achromatopsia needs 0.22 of lightness; the band holds 0.10), so every chart fill there, a
category or a status, is BRIGHT under a near-black ink (`DARK_INK` in `lib/theme/chart-solids.js`): still one ink per
slide, and the bright band holds 0.3. A ring is always the status color at the opposite lightness to its fill, so
there it is deep. Every `a11y-*` trio clears its own condition's floor outright, in both modes and both intensities
(`cvd-trio-floor.test.js`).

**Status has two jobs** (`base.tokens.css` § STATUS, IN TWO JOBS). `--pass` … `--mute` are the status as INK on
the slide (text, a rule, a mark), and the CVD trio gate holds `--pass` `--warn` `--fail` as before. The FILLS are a
separate set. The first cut used one color for both jobs and pushed the trio apart by lightness alone, which turned
red near-black and green near-white. A later cut gave charts a third set, an EDGE per status (the fill's hue at
4.6:1 off the slide) for status lines and text. It was retired: solved to one contrast, the three edges shared one
lightness, so 568 of 672 brand-theme pairs fell under the colorblind floor (the slide inks: 142), and it made a
deck say each status in two text colors. Charts now paint lines and text in the slide ink.

`tools/curate-chart-solids.js` seeds the values with the solvers in `lib/theme/chart-solids.js`
(`solveStatusSet` for the status set), the same ones the Studio's generator (`lib/theme/derive.js`) calls: it keeps
each seed's hue, moves lightness (and chroma only down, where the gamut runs out), and writes every solid, signal
and ink. It is not part of the build, so a hand-tuned seed
stays tuned as long as it clears the gates. A gray category keeps its light-face order on the dark face (a deeper
gray stays deeper), and onyx's olive sits between two grays, because two adjacent grays under white cannot stay
0.06 OKLab apart (`chart-contrast.test.js`). A solid is
flat: no chart grades, mixes or filters its fill, and a finish styles the solids rather than inventing colors.

| | identity lives in | choose it for | body | edge |
|---|---|---|---|---|
| **`pigment`** | the body's **hue** | you want color | the flat solid | ink, 1× |
| **`etch`** | the **line and the letter** | a modern look | 30/40% | ink, 2× (3× on a text-bearing mark) |
| **`tone`** | the body's **value**, one hue | a conservative, restrained look | 92…9% of one hue, the same ladder on every chart | one ink for every mark, 1× (2.5× on a text-bearing mark) |

**A finish is always on, and `pigment` is the default.** `marks:` is a look
like `icon:` and `spark:`, not a layer that can be absent: a deck that names none, or names
a word that is not a finish, wears `pigment`, and every `<section>` is stamped with its
finish (including a chart inside a pane, where the section never names the chart). There is
no `off`. It used to be the default, and it meant "each chart as its own stylesheet draws it",
which made the default look differ from chart to chart. That own paint still exists in each
member's CSS, and it is what `tools/chart-finish-reach.mjs` measures a finish against: the
tool swaps the finish class for none on a real render and compares. Two things hold in
**all three**, and they are floors, not style:

1. **Every mark carries an ink edge.** Measured: no body clears the 3:1 graphical
   floor against its own canvas at any depth — 82% bottoms out at 2.45:1, and 30%
   clears it in **0 of 224** theme × mode × slot combinations — while the ink
   clears it everywhere (worst 4.65:1). A body never guarantees the mark can be
   seen. Its edge does.
2. **Every element that NAMES a mark wears that mark's ink.** No finish removes
   color. Under `tone` there is one hue, so a name wears the ink — the same
   channel the edge uses. Sending names to a neutral is a floor violation, and it
   is an easy one to write by accident because it looks like an accommodation.

A third floor binds the **default** only, because it is the one every deck gets:

3. **No finish may push a text run under its threshold that the unfinished paint cleared.**
   This is the floor the finish design always stated, and it is now measured on every text run of
   every chart (66,000 per state, 96 theme × mode combinations) with the repo's own contrast probe:
   `node tools/chart-finish-reach.mjs --all-themes --check`, arm RUNS. Measuring it found what the
   per-finish numbers had hidden: the radar's scale ticks, small muted text on the overlap of every
   series polygon, fell to 3.20:1 (pigment), 4.18:1 (etch) and 1.60:1 (tone) on indaco, and a state
   tile's index numeral fell from 5.95:1 to 4.31:1 on cuoio once its body went darker than its shipped
   tint. A finish may not trade text legibility for a flatter body.

   A second floor binds the **default** only, because it is the one every deck gets: **it never takes
   a ramp's magnitude away.** A heatmap's top step against its empty cell is the datum. Pigment's ramp
   once took a shorter band than the member ships (3.54:1 fell to 1.92:1 light and 3.03:1 to 1.51:1
   dark on indaco), an acceptable trade for an opt-in look and a silent loss on every deck once it
   became the default. Pigment now carries the member's own span, which is the member's own paint, so
   it emits no heatmap rule at all and the theme's hand-solved cell inks stay. Etch and tone keep their
   quieter bands; that is their identity, and it is reported, not gated.

   **The reference is frozen.** A comparison with "the unfinished paint" is only a reference while each
   member keeps that paint. The numbers are committed in `test/fixtures/chart-finish-baseline.json`
   (`--freeze` rewrites them, as a deliberate act), the span gate measures against them, and a live
   baseline that has moved is reported as DRIFT instead of followed. So converging a member onto a
   finish cannot turn the gate into pigment measured against pigment.

A related floor on the body: **a finish owns the body.** A mark that keeps its own gradient
beside flat siblings reads as two looks in one chart (an unstated gantt bar, a progress bar with
no status). The census arm `KEPT` in the same tool fails on any reached mark that still shows a
gradient, and `REACH` lists every mark no finish reaches with its reason.

### How the engine applies them

`tools/build-marks-css.js` generates the rules from each manifest's
`kernel.marks`; its header is the long form. Each choice below was settled by
measurement, and most undo a defect a render or the adversarial review found:

- **A finish is a block of values, the way `dark` is.** Each finish sets about 90 `--finish-*` values on its
  section (`section.marks-etch, figure.marks-etch { … }`): the base it mixes toward, the text ink, the edge
  weights, a body level and a text-bearing level per category slot (light and dark), a status level, a ramp band,
  a layered alpha, and `--finish-border` (0 where an ink edge is an inset ring, so a pill, a bar or a key tile
  drops its border). **One set of mark rules reads them and names no finish.** A mark's slot picks its own
  values once (`--finish-mark-body`, `--finish-mark-text`, `--finish-mark-edge`, set on every `[data-hue="N"]`),
  and the rules after it say which KIND of mark paints with them, so there is no rule per slot. Only a
  treatment one finish owns is written under its name (tone's containers, pigment's neutral regions, etch's
  heavier line), in the generator's `ONLY` blocks. **A member stylesheet never names a finish**
  (`marks-css.test.js` fails on one): what differs between finishes is a value the member reads
  (`var(--finish-border, 1)`), or a rule in the generator. Adding a finish is a new block of values; adding
  a mark is a manifest row, not three rules. Measured on the generated file: 194 KB raw and 9.8 KB gzipped
  before, 79 KB and 5.9 KB after, with every computed fill, stroke, edge, shadow and ring on the chart gallery
  unchanged under pigment and etch (1.17M property reads, five themes, light and dark) and under tone changed
  only in the edge, below.
- **Pigment and etch outline a mark in its own category ink; tone outlines every mark in one ink.** Tone has
  ONE ladder of eight shades of one hue (92…9%), and a category is told apart by its depth, the same shade on a
  tower, a matrix grid and a pie. So tone's outline needs no hue: a tone chart is one color plus status
  (`engineering/decisions/2026-09-07-chart-design-language/tone-is-the-third-finish.md`). Until 2026-10-26 a
  text-bearing mark took a second, paler ladder (30…9%) so one fixed text ink could stay readable, which made
  category 2 a different shade on a tower (closest pair of bodies 0.017 OKLab) than on a pie (0.072), and the
  outline had to carry the category. A text-bearing tone mark now picks black or white from its own body
  (`inkOn`, at least 4.58:1 on any body), so its text level IS its body level. A status mark keeps its status
  ink for its edge.
- **Specificity (0,1,1), on purpose.** Every rule is
  `section.marks-X :where(<mark>)` (X one finish, or an `:is()` of several, which takes a class's
  specificity) with `!important`. That beats every
  member's paint (no member marks paint `!important`) and loses to an a11y
  theme's texture fill, which is `!important` at (0,3,1) and loads later. So a
  finish never strips the pattern channel from a colorblind reader. The `--finish-*` values themselves are plain
  declarations: nothing in a block paints, and a deck may re-point one.
- **Etch and tone mix toward the canvas; pigment mixes toward
  `--chart-cat-base`.** That base is black in dark mode, which is right for
  pigment's shipped body tier. A whisper mixed toward black lands darker than the
  slide and reads as a hole.
- **A ramp scales from its own member's empty end** (`--heatmap-base`,
  `--map-base`). Tone's ramp is one band, 10% plus 0.82 of the step, whether or not it prints its value.
  It used to take a shorter band when it printed (70% on light, near 50% on dark) because a fixed ink had
  to clear the top step; each value now picks its own ink, which clears 4.58:1 on any body, so the band
  no longer protects the text. Measured on the heatmap gallery (5 themes), the contrast of the top step
  against the empty cell under tone went from 3.10 to 4.19 at its worst on light and from 1.67 to 2.64 on
  dark (pigment 4.78 and 6.32). Etch's ramp is 6% plus 0.82 of
  the step (6→82%): at the prototype's 6→28% a dark heatmap read as one flat navy, and at today's earlier 6→43% the
  top step beat an empty cell by only 1.5 to 2.3:1 on dark. 0.82 reaches about 2.5:1 worst case on 8 themes; 1.0
  would reach 3:1 but looks like pigment, which erases what makes etch etch.
- **A heatmap value picks its own ink, under etch and tone.** The theme solves each step's
  ink against the shipped fill, and a finish that changes the fill leaves no fixed ink that
  holds (the strong ink fell to 3.34:1 on the a11y themes). The value's fill is its cell's
  body taken through relative-color syntax to black above CIE luminance Y 0.1791 and white
  below it. **Pigment changes nothing here**: it carries the member's own span, so it emits no
  heatmap rule and the theme's hand-solved inks stay on the cells they were solved for. The
  luminance switch replaced an OKLCH-lightness one (L 0.565): lightness is not luminance for a
  saturated hue (a red cell at L 0.571 took black at 4.31:1 where white gives 4.87:1), and its
  blend zone returned a near-invisible grey (1.003:1 on `rgb(210 40 70)`). The luminance
  switch is never worse than 4.582:1, the point where black and white contrast are equal,
  measured over 140,608 sRGB bodies and in Chromium 131, Firefox 142 and WebKit 26. A
  canvas-colored halo was tried first and dropped: it reads as outlined stickers, and the PDF
  export lost it.
- **A text-bearing mark** (the manifest's `bears`) wears the tier the family curates for text, and
  its text is `--text-heading` under every finish. The chart family has one curated text pair that
  holds in both modes: a `-fill` tier with `--text-heading` on it (`chart-contrast.test.js`: at least
  6.9:1 on every category fill and 5.46:1 on every status fill, median 13:1). Pigment paints a
  text-bearing mark at exactly that tier (`--chart-cat-N-fill`, and the `--state-*-fill` recipe for a
  status: 24% over the canvas on light, 50% toward black on dark), so in light mode it is a tint and
  in dark mode a deep fill, and a mark with NO text (a bar, a wedge, a dot) is where pigment is solid.
  Etch paints a quieter text tier and keeps the same ink; tone paints its one ladder and picks the ink per mark
  (above). A solid text-bearing body was tried
  and dropped: no ink clears a mid-tone well (black or white picked per body had a median of 5.6:1
  and read as mud), the text changed color from chart to chart, and `--text-heading` on a solid body
  fell under 4.5:1 on 104 of 320 gantt bars across the palettes (worst 1.37:1, concrete). A key
  follows the tier of the marks it keys: the tower's swatches are tints because its shares carry text.
- **Text waits for the engine that can pick its ink.** Choosing black or white
  from a mark's own color needs relative-color CSS with math on a channel, and
  the guard tests exactly that expression:
  `@supports (color: color(from red xyz-d65 calc(0.95047 * clamp(0, (0.1791 - y) * 1000000, 1)) …))`.
  A bare `color(from red xyz-d65 x y z)` guard would let an engine that parses relative color
  but not the clamp apply the body and drop the ink. No fixed ink clears every
  theme: measured in WebKit with the guarded blocks removed, `--text-body` read
  3.54:1 on concrete's status pill and `--text-heading` 3.34:1 on an a11y heatmap
  step. So every rule that moves text, or the ground under it, waits behind the
  guard: the text-level categorical rules, text-bearing statuses and the keys
  that follow them, a heatmap's text band and its values, the quadrant's zone
  tints and zone-name ink, kanban columns and flowchart groups under tone, and a
  roadmap's phase color. An engine that fails the guard keeps those as designed,
  with the ink each theme's gates already hold, while marks without text still
  take the finish.
  Measured on HTML player exports of heatmap, matrix-grid, progress, flowchart,
  quadrant and kanban slides, on indaco, carbone, concrete and a11y-deuteranopia
  in both schemes and all three finishes. In WebKit 26, on both paths, and in a
  real old engine, Chrome 118, which fails the guard, nothing reads below 4.5:1
  (worst 4.62, the same as the decks with no finish). In Chrome 118, all 744
  text-bearing marks and tints paint exactly as in the no-finish decks, and all
  192 marks without text take the finish. Chrome renders the demo deck
  pixel-identical to before. Separately, the finish's own light and dark values
  are written with `light-dark()` (Chrome 123, Safari 17.5, Firefox 120), as the
  engine's are; the HTML player export rewrites those for older browsers, and
  the plain HTML render does not.
- **Layered bodies are a light alpha** (0.35 under pigment): at 0.55 three radar
  polygons stacked to a near-opaque mass that buried the grid.
- **A status keeps its own hue, under `tone` too.** The prototype sent a status
  body to the one hue and left the status on a 1px edge. On the render, a gantt
  key's done, live, at-risk and blocked swatches came out identical. A status is
  a meaning the reader decodes, not one of the categories tone collapses, so it
  keeps its hue at tone's quiet level. Every member that paints a status reads it
  from the one table (`STATUS_MARKS`): gantt, progress, the status pill, waterfall,
  the state chart and hub-spoke. A status KEY takes the level of the text-bearing marks it
  keys (`keysText`), or under tone a gantt key sat a step louder than its bars. A
  state chart's `deferred` HTML tile and key dot are left out, because their
  hollowness is a background a finish would fill; its SVG tile keeps `deferred`
  hollow through `fill-opacity`, which a finish never sets. Measured on indaco,
  carbone, concrete and a11y-deuteranopia in both schemes, every state label
  clears 4.5:1 (worst 4.72, concrete light).
- **The key follows the marks.** A legend swatch carries the mark contract, so a
  tone finish cannot leave a key of five categorical colors beside tonal wedges.
  A key takes the level of the mark it keys (`KEY_FOLLOWS`). A key whose marks the
  a11y themes do not texture names its hue as `data-key-hue`, never `data-hue`:
  a11y-base textures `figure.chart-frame .chart-key-swatch[data-hue]`, and a
  `data-hue` on radar's key textured it in Read·Article while its polygons stayed
  plain, on a deck that set no finish.
- **The `--player` export ships only the finish rules the deck's marks match.** A
  finish repaints through `light-dark()`, and the player lowers every such rule
  into its `#lattice-dual-mode` block once per scheme scope, a block the CSS prune
  never touches. Carried whole, the rules outweighed the deck stylesheet (1.37 MB),
  and the prune, which then chose its target by size, pruned the wrong block.
  `dropUnusedMarksRules` (`lib/export/player-core.mjs`) cuts them against
  the rendered DOM first, so a deck without the key exports the bytes it did
  before, and `examples/marks.md` exports at 847 KB. The prune now skips
  the dual-mode block by id.

**What a finish does not reach, on purpose.** `line`, `ep-curve`, `slope` and `word-cloud`
paint with strokes and type (`paint: "none"`): a stroke is all edge and no body. Tone's one
hue is for bodies, and a name keeps its category ink, so tone leaves these whole,
their dots and bands too, since a tonal dot on a line that kept its hue no longer matches its
series (`STROKE_MEMBERS`). Etch draws a line or ep-curve series heavier (2.6), because under
etch the line is the identity, and gives its dots, areas and bands etch's whisper body and ink
edge like any other mark. The family slot table is
never re-pointed; an earlier cut did, under tone, and washed line's series 5–8
out to near-white. A finish also never repaints a CONTAINER as a mark (a slotted
flowchart group, a tinted kanban column): that buried a group's title under an 82%
body. Under tone a container's own hue property is re-pointed to the one hue
instead, so it keeps its faint level and its key still matches. A hub-spoke group's
connector band, arrowhead and name are too: they read `--hs-group-hue` /
`--hs-group-ink`, which tone re-points, while the discs and key take the finish
as marks. A roadmap's phase
color is one of these: each phase column, workstream lane and horizon card sets
`--phase-accent`, which its pill, stripe and card rule read. Under tone it joins
the one hue, and the pill takes black or white from its new ground, because its
shipped `--cat-on-mark` read 1.54:1 there on the a11y themes' dark faces. Swept
over all 18 themes in both schemes, every pill and phase label clears 4.5:1
(worst 4.65).

**Where `tone` is weakest.** On a mark that CARRIES TEXT, tone has only the quiet
top of its ramp to spend (30% down to 9%), so adjacent categories sit about three
points apart and roughly four separate by eye, not eight. Their key takes the same
level, so it still matches. And on overlapping layered series, three radar polygons in one hue separate by value in the key, the
dots and the edges, but their composited fills converge, and on a dark canvas the
steps compress further. Measured, not tuned away: a finish that claims one hue
cannot also keep three.

**`etch` and color vision.** Etch carries identity on a thin ink edge over
a whisper of a body, and thin strokes are where hues are hardest to tell apart.
The a11y themes and print keep their patterns under it; on an ordinary theme, a
deck read by colorblind viewers is better served by `pigment` or an a11y theme.

Full philosophy: `engineering/decisions/2026-09-07-chart-design-language/` —
`tone-is-the-third-finish.md` for the trio, `finish-render-defects.md` for what
goes wrong.

## 4 · Contrast — what to measure, and against what

**Against everything on the slide, not against the canvas.** A mark sits on
whatever is painted behind it, which may be a card, a panel, a tint, another mark,
or several of those composited.

```
node tools/chart-contrast-solve.js <rendered.html> [screen|print]
```

**It samples; it does not model.** The solver shoots the slide twice — once as
rendered, once with only the glyph FILL removed — and the pixels that differ are
the pixels a glyph covers. Shot B at those pixels is the backdrop, with
gradients, stacking order, opacity and the family's canvas-colored halos all
already resolved by the renderer. The INK still comes from computed style,
because Chromium antialiases a body-size stem across two or three pixels with
subpixel fringing and no pixel on it ever holds the pure color: a `#111`-on-white
control measured 4.02:1 from its darkest pixel against a true 18.1:1.

Each row carries a **`share`** — the fraction of the glyph's covered pixels at the
reported ratio. `share: 1` is a color choice. `share: 0.001` is a connector
crossing one corner of the label, and sending a color change after it fixes
nothing.

Floors: **4.5:1** for text, **3:1** for large (≥24px, or ≥18.66px bold) and for
any graphical object carrying information (WCAG 1.4.11). A mark passes on **either**
channel — body-vs-backdrop or edge-vs-backdrop — because `etch` leans on the
edge by design.

### Six ways a contrast measurement lies

Every one of these produced a wrong number in this repo before it was fixed. If
you write a new instrument, check it against all six.

1. **The presentation attribute is not the paint.** `fill="url(#g)"` still reads
   `url()` after CSS has overridden it. Read computed style, always.
2. **SVG text paints with `fill`, HTML text with `color`.** Reading `color` first
   scores an SVG label with an ink it is not drawn in.
3. **A color carries its own alpha — the INK's as much as the backdrop's.**
   `color(srgb 0 .4 .6 / 0.1)` is a 10% wash; dropping the fourth channel on a
   backdrop turns it into a saturated fill and invents failures, and dropping it
   on the ink hides them: `color: color(srgb 0 0 0 / 0.18)` on white renders at
   1.53:1 and scored as pure black. Two elements in the shipped chart gallery
   carry a translucent ink.
4. **A gradient resolves through `getComputedStyle(stop).stopColor`** — the
   attribute still carries `var()`, which a canvas cannot resolve.
5. **A bounding box lies.** Use `isPointInFill` for SVG, and a `Range` for text —
   a table cell's *box* reaches the row rule its *glyphs* never touch.
6. **`<text>`, `<tspan>` and `<g>` do not paint.** Counting them as surfaces makes
   every label its own backdrop and scores it at exactly 1:1.
7. **A gradient backdrop has two ends and the glyph sits on ONE of them.** Scoring
   against the flattering end passes white text over a black-to-white ramp;
   scoring against the worse end fails every label in the family. Sample where the
   glyph actually is.
8. **Document order is not paint order.** `z-index` and `position` reorder it, and
   this family has both. SVG has no `z-index` at all — there, later in the document
   IS on top, which is why radar's scale rungs used to be dimmed by the series
   polygons painted after them.

And one that is not about measurement at all: **contrast and distinctness are
different questions.** A chart whose five categories all painted one color passed
every contrast audit in this repo, because one color is perfectly legible. If you
change how marks take paint, run the flattening detector too:

```
node tools/chart-mark-separation.js  # is one category still distinguishable from the next?
```

## 5 · The order to verify in

Nothing here is optional, and the order matters — a later step is meaningless if
an earlier one moved.

1. `npm run build` — the CSS you edited is not what renders until you do.
2. **Re-render**, then measure. Measuring a stale render is the single most common
   way to report a fix that did not happen.
3. `node tools/chart-structure-census.js --check` — is every outline still pinned?
   Then without `--check` — did the structural spread move?
4. `node tools/chart-contrast-solve.js … screen` **and** `… print`. `@media print`
   is live in the CLI vector PDF path, so a screen measurement does not prove the
   PDF. Neither does either of them, strictly: both are `emulateMediaType` in
   headless Chromium, not the vector PDF itself (HARD RULE #23).
5. `node tools/chart-mark-separation.js` — did an encoding collapse?
6. `npm run lint`, `npm run build:check`, `npm test`.
7. **Look at it.** Rasterize and open the pages. Every instrument above has a blind
   spot; your eyes are what catch a mark that is legible, distinct, correctly
   weighted and still ugly.

**Themes are part of verification, not a follow-up.** Light and dark for every
theme the change can reach, plus the five `a11y-*` themes and print. An `a11y`
theme replaces the categorical palette with textures and greys, so a change that
assumes hue is available breaks there and nowhere else.

## 6 · Traps this family has already paid for

- **A `:not()` fallback at equal specificity, emitted last, overrides everything
  it was meant to back up.** One line collapsed an entire finish.
- **`:nth-of-type` counts same-tag siblings.** One `<span>` per `<td>` means every
  element is position 1, and per-slot rules silently become one rule.
- **A `var()` fallback chain takes the first DEFINED name.** One early name defined
  globally shadows every per-slot name after it.
- **A CSS rule beats a `fill=` presentation attribute**, so a finish can overwrite
  a correct per-category paint with a constant and the legend beside it will still
  show the truth.
- **`build:galleries --check` compares render inputs against HEAD.** Commit a CSS
  change and it reports "no change" while every PDF is stale. Rebuild on the
  strength of what you changed, not on what it says.
- **A mark that carries no datum is ground, not figure.** Painting it at body depth
  made a choropleth's no-data countries darker than its data.
- **An export loses whatever the flattener does not carry.** `flattenSvgStyles`
  inlines a curated list of computed properties and omits any value equal to the
  CSS initial. `stroke-width: 1px` IS the initial — so a mark pinned with
  `vector-effect: non-scaling-stroke` on the slide arrived in the PDF, PPTX and
  standalone SVG with neither property, and fell back to one viewBox USER unit:
  measured over the same live SVGs, a pinned 1px edge came back at 0.84px on a map
  region and 2.46px on a scatter bubble. A stroked element now never drops either
  property. The cost is bytes: +2.7% to +8.2% per exported SVG, and on the Mermaid
  path — where nothing carries `non-scaling-stroke` — every one of those extra
  declarations is a no-op.
- **An INHERITED custom property loses to the element's own declaration**, and no
  specificity beats that. A palette declares in `:root`; anything `chart-family.styles.css`
  declares on `.chart-frame` itself is out of a palette's reach that way. That is why a
  palette curates the chart SOLIDS through seeds the family READS (`--chart-catN`,
  `--pass`…`--mute`, `--chart-neutral-mark`, `--on-mark`) and never sets the consumed
  token. The gradient wash this note used to describe (`--chart-fill-top-*`, overridable as
  `--palette-fill-*`, and flattened by concrete because no ink cleared its mid-tone canvas)
  is retired: every fill is a flat solid with its own curated ink.
