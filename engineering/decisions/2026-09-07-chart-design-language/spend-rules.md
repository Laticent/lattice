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
| **ramp** — fill *strength* is the magnitude | **held — see 1d.** The finish works the boundary and the field instead | map (`--mix` per region), journey |
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

## 1c. The hue count IS the texture count, so a rainbow costs more in monochrome

A corollary of the grouping rule that is easy to miss, and it bites hardest on
the audience the design is trying to protect.

On the a11y palettes the mark's fill is a `<pattern>` keyed off the same
categorical slot the hue uses, so **however many hues a chart spends, that is how
many textures a monochrome reader gets.** Measured on the achromatopsia render of
the prototype deck: `.bar-mark` resolves to one pattern (`latt-a11y-chart-tex-1`),
`.sbar-seg` to three, `.wedge` and `.funnel-band` to five each — exactly the
number of groups each chart has.

So giving a single-series bar chart four hues does not merely spend colour on
nothing. It hands a reader who cannot receive hue four different hatch patterns
for four measurements of one measure — and a texture reads as a *harder*
categorical boundary than a colour does, so the misinformation is worse in the
substituted channel than in the original. A rainbow single series is a
readability bug on the a11y palettes and in print, not only a taste failure.

## 1d. A ramp's fill is not the finish's to touch

"Scaled, never flattened" protected the wrong quantity, and the prototype caught
it. **A reader does not read a ramp's span. They read one region against its
neighbour.**

Measured on the eight-region choropleth, indaco light:

| | span ΔL | smallest gap between neighbours ΔL |
|---|---|---|
| `pigment` (full strength) | 0.292 | **0.0136** |
| `etching` at the drafted ramp × 0.45 | 0.131 | **0.0066** |

About 0.01 ΔL is the smallest step a reader separates *side by side*, and map
regions are scattered across a basemap rather than adjacent, so a choropleth
needs more than that, not less. 0.131 is obviously "not flattened" and the chart
was still broken.

Worse, the ramp has **no headroom to give**: at full strength its own smallest
step is 0.0136, barely over the floor, with eight regions. `map.docs.md` already
warns that "a choropleth past a dozen distinct values asks the eye to rank
colors it can't separate" — that limit is nearer than a dozen, and it is reached
before any finish touches it.

So the rule is not a gentler scale factor:

> **A ramp's fill is not the finish's to touch.** The finish works the two
> channels beside it — the **boundary** of a named region, and the **field** of
> the unnamed ones.

- `pigment` — hairline boundary, field as it ships.
- `etching` — every named region gains an inked boundary. On a choropleth that
  does real work rather than merely differing: it is how a named region becomes
  findable among a hundred unnamed ones, and it is what etching means anyway.
- `ground` — the **field** is raised. The basemap IS a choropleth's denominator,
  so this is ground's own story told in the one place a map has for it.

Measured after: neighbour gaps of 0.0136 / 0.0136 / 0.0137, and the map still
separates across the three (3.2% / 28.4% / 30.7% of the mark region moved).

**One implementation trap.** `--map-base` is declared on `.map-figure` and
`.map-svg`, not on the section, so an override on `section.map` is shadowed by
the descendant's own declaration and silently does nothing. The first attempt at
ground's field read 0.0% divergence for exactly that reason.

## 1e. Why the coloured map variant is not the default

`map highlight` gives each named region its own `--cat-N` hue. It is not the
default, and the reason is the grouping rule one level along rather than a
shortage of tokens.

**Hue cannot rank.** A choropleth's regions carry numbers, so they are one group
measured once — one hue, and its *strength* carries the magnitude. Make India red
and Nigeria blue and the reader learns nothing about which is larger; they go to
the legend and read digits, at which point the map is decoration and a `progress`
ranking would read faster. `highlight` is for a SET — the eight pilot states, the
four regions served — where each region is a singular that may own a hue because
there is no magnitude to rank. `map.docs.md` states it already: "Choropleth for
magnitude, highlight for membership."

**And the cap is real, at six rather than eight.** `map.transform.js` sets
`CAT_SLOTS = 6` and assigns `(i % CAT_SLOTS) + 1`, so a seventh named region
takes the first one's hue while the key still lists it separately. On a world map
that is the ordinary case, so `highlight` as a default would ship a key that lies
most of the time. Six is a perceptual cap rather than a token shortage, and it is
the same width as the a11y texture channel.

## 2. What a singular is — the two jobs, G1, and one system per figure

**The direct label LICENSES the hue. It does not obviate it.** An earlier draft
argued the reverse — that because a scatter's points are named in place,
adjacency already joins them and hue carries nothing. Two of the four colour
tracks state the opposite, and they are right about the licence.

> A group shares one hue. A singular may own one. **A singular takes a hue only
> when it is directly labelled** — that clause is what keeps a 40-point scatter
> from becoming confetti, and it is a rule, not a member exception.
> — `candidates-colour/1-colourist.md`

Without a name per mark, N hues is confetti: colours with nothing to bind to.
The label is the safety condition that makes per-mark hue affordable — but a
licence is not a reason, and the tracks' test for when to USE it does not hold.
That is the next section.

### G0 was a proxy, and it broke — the two-jobs test replaces it

Editorial derived a test, and recorded rejecting the framing that came before
it, which is the more useful half of the record:

> The earlier phrasing (*"does this mark's KIND recur?"*) gave the wrong answer
> on pie, funnel and scatter — a slice's kind is "a share", which recurs — so the
> test is restated on something the mark actually carries:
>
> **G0 — does this mark carry its own name, or does it share a label axis with
> its siblings?**
> — `candidates-colour/2-editorial.md`

**G0 reads well and it does not survive a `bar row` beside a `funnel`.** Rendered
with the same data, both put the stage name in a left gutter and the value in a
right one; one spends a single hue and the other five, and no clause in G0 says
why. Four candidate distinctions were tried against that pair and all four fail:

| candidate | verdict |
|---|---|
| G0's label position | falsified — both name the mark in a gutter |
| the marks touch | falsified — the census reads funnel as `tiled/separate (5)`; its bands have gaps carrying the conversion % |
| ordered vs unordered | cuts AGAINST the funnel: its stages are monotonically non-increasing by construction, and hue cannot rank |
| slivers need hue to stay countable | post-hoc — the bar's 670 stub is the same size and reads in one hue |

So the funnel's five hues and a rainbow bar chart were, under the rules as
written, equally justified. That is the inconsistency, and it is in the tree.

### The test that survives — hue has exactly two jobs

> **BIND** — the mark and its name are separated, so hue is what joins them: a
> detached legend rail, a leader line the layout engine had to draw, or an open
> path labelled at one end and read along its length.
>
> **SEPARATE** — the marks touch, overlap or interleave, so position does not
> tell them apart and hue does.
>
> **A mark with an adjacent label and clear space around it needs neither, and a
> hue spent there is decoration.**

This is `spend-rules.md` §3 one level up: §3 says which ELEMENT wears the hue at
a join; this says whether the figure has a join at all.

**It is measured, not asserted** — `tools/chart-hue-jobs.js` reads the rendered
gallery and reports both jobs per member beside what that member actually
spends. A legend rail is a gap by construction. A leader line is the layout
engine ADMITTING it could not place a name beside its mark (quadrant's own docs:
*"on a crowded plot 'beside' stops meaning 'nearest'"*). "Touching" is the median
nearest-neighbour gap between same-class marks in units of the median mark size,
so a pie wedge and a matrix cell are comparable.

**17 of 21 members agree with the test** on indaco and on cuoio alike. The four
that do not are the finding:

| member | key | leaders | gap | bind | separate | spends | reading |
|---|---|---|---|---|---|---|---|
| `funnel` | none | 0 | 0.44 | no | no | **5 hues** | no job, spends anyway |
| `timeline-list` | none | 0 | 6.62 | no | no | **4 hues** | no job, spends anyway |
| `roadmap` | legend-rail | 0 | 0.00 | yes | yes | 1 | a job, and under-uses it |
| `state-chart` | legend-rail | 0 | 0.65 | yes | no | 1 | a job, and under-uses it |

The two disagreements point in opposite directions, which is the reason to
believe the instrument rather than a rule that only ever confirms itself.

**State-keyed members are not judged by it.** `gantt`, `progress` and
`waterfall` paint from `--chart-state-*`: their hue encodes a nominal variable
(rise / fall / total; done / at-risk / blocked) that no other channel carries.
That is a THIRD job the test does not model, and holding `waterfall` to a
categorical standard flagged it as decoration until the split was added.

**Neither `funnel` nor `timeline-list` is changed by this note.** They are
recorded as flagged; collapsing either one changes a shipped member and every
deck that uses it, which is a decision for the repo's owner and not a
consequence of a doc.

### G1 — the cap, and what to do past it

> Above six singulars a member does **not** cycle: the marks become **one group
> at one hue**, and identity moves entirely to the direct label. Where a member
> has a natural ranking, the top six take slots and the tail takes a single
> neutral.
> — `candidates-colour/2-editorial.md`

This is the missing rule behind §1e's finding. `map.transform.js` sets
`CAT_SLOTS = 6` and assigns `(i % CAT_SLOTS) + 1`, so a seventh named region
takes the first one's hue while the key still lists it as its own row. G1 says
the cap is right and the *wrap* is the defect: **past six, stop pretending.**

Two members were checked against G1 rather than taken on the track's word:

- **`timeline-list` already obeys it** — `nth-child(6n+1..6)` cycles
  `--chart-cat-1-ink` … `-6-ink` on the dot. It cycles at six, as G1 requires.
- **`word-cloud` is NOT the 7-slot cycle editorial reported.** Its
  `WORD_PALETTE` is six slots, and slot 7 is a *magnitude tier* —
  `weight >= 2.5` takes `--chart-cat-7-ink` (`word-cloud.transform.js:284`). So
  G1's categorical cap is respected. The real issue there is a different one:
  slot 7 means "big" on this member and "the seventh category" everywhere else,
  which is two categorical systems in one figure — RULE G below, not G1.

### RULE G — one categorical system per figure

> Where two candidates exist, the system **nearer the datum** keeps hue; the
> other keeps its identity in **value** — a neutral light-to-dark ramp — never in
> a second hue set.
> — `candidates-colour/3-systems.md`

Eight slots cannot carry two meanings at once. This is what resolves
`word-cloud`'s slot 7, and it is what will resolve the deck-wide entity palette
in §2b.

### What the earlier commentary got half right

An earlier draft of this section offered "hue separates what position does not"
as commentary under G0, and noted it under-predicted on `timeline-list`. It was
half of the surviving test — the SEPARATE job — and the half it was missing is
BIND, which is what carries pie, map, radar and the legend-rail members. Adding
it turns the commentary into the rule and retires G0's label clause.

`timeline-list` is no longer the exception that embarrassed the commentary. With
both jobs stated it is a FINDING: a 6.62 nearest-neighbour gap, no key, no
leaders, and four categorical hues on its dots.

## 2b. When a bar chart DOES need colour

Five cases. Two ship; three do not, and all three are author decisions the
component cannot make for itself.

**Shipping**

1. **`grouped`** — bars inside a group touch, so position stops separating them
   from each other. One hue per series, repeated across categories.
2. **`diverging`** — two hues by sign. `slotFor()` returns slot 2 for a negative
   and slot 1 for a positive, and sign is a channel length alone does not isolate
   at a glance.

**Not shipping — costed**

3. **A second categorical dimension over the bars.** Ranked by value, coloured by
   segment or by above/below plan. Note this is *not* per-bar confetti: it is a
   group encoding, and it obeys the same rule — a group shares one hue. Cost: a
   transform change to accept a per-category group token and stamp the slot, plus
   a key. Governed by RULE G: if the bar chart is already grouped, the series
   system is nearer the datum and this one goes to a value ramp.
4. **Emphasis — one bar lifted** because it is the subject of the slide. This is
   contrast doing argumentative work, not categorical colour, and today there is
   no per-bar hook for it: `accent` is a slide-level universal variant and
   `data-s` is emitted only under `diverging`. Cost: one attribute on the marked
   category, one rule per finish. The finish interaction is the interesting part —
   under `etching` the emphasis is the one bar that keeps its body.
5. **Deck-wide entity identity.** Four business units that recur on six slides:
   hue joins them *across* slides, a join position cannot make because position
   changes from chart to chart. The reader learns "EMEA is orange" once and reads
   three charts faster.

**Case 5 is the one the component structurally cannot decide** — a chart cannot
see its deck — so it belongs in the author register layer, not in a component
default. It is also the case RULE G exists for: if EMEA is always orange
deck-wide, then on a stacked-bar-by-region slide orange *also* means "Services".
Two categorical systems, eight slots. The system nearer the datum keeps hue; the
other goes to a neutral value ramp. So a deck-wide entity palette is not a
free-for-all — it yields wherever an in-chart categorical system already exists,
and that yielding has to be automatic rather than the author's problem.

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

7. G1 replaces the silent wrap: past six singulars a member collapses to one
   group at one hue (or top-six-plus-neutral where it has a natural ranking)
   rather than cycling. `map highlight` is the live instance.

All seven sit downstream of the slot contract in `scoring.md`. None is buildable
until a mark can be addressed on every member.

The three bar cases in §2b are separate work, and only case 3 touches a
transform's data model. Case 4 (per-bar emphasis) and case 5 (a deck-wide entity
palette) are author-register work — case 5 needs RULE G implemented as an
automatic yield, not as a warning, because an author cannot be expected to notice
that orange now means two things on one slide.

---

## 7. What applying the grouping rule, G1 and the register changed

Four findings from making the prototype the final language rather than the
current tree plus finishes. Each is implementation-shaping.

**The slot contract carries the mark's OWN resolved ink, not a slot index.**
`gantt`, `progress` and `waterfall` colour by state, and the member has already
mapped `data-s` to an ink in its own stylesheet (`--fill-ink`). An earlier draft
mapped every status onto slot 1 and silently flattened three gantt statuses to
one hue. So a state-keyed mark stamps `--slot-hue: var(--fill-ink)` and the
finish mixes from that: **one rule, and no second status-to-slot mapping to keep
in sync.** A finish never needs to know whether a member is categorical or
semantic.

**The register guards a text-bearing mark, and the guard is now verified rather
than promised.** §5 says mark depth and on-mark ink are coupled and the register
is the guard; the prototype was violating it — `gantt`'s bars carry their task
name and were being pushed to an 82% body, the level measured to fail AA in
117 of 224 combinations. A BACKDROP mark now keeps its wash under every finish
and takes the finish on its edge, the same answer `layered` gets and for the same
reason. `register-check.js` reports **4 of 4 text-bearing mark classes pinned**
across the three finishes (`funnel-band`, `gantt-bar`, `progress-fill`, `cell`).

**The presence FLOOR is subsumed by the register.** `matrix-grid`'s filled cell
carries text, so it is a BACKDROP mark, so its wash is pinned and "never to zero"
holds by construction. The floor stays in the rule for a presence mark that is
not text-bearing; none ships today.

**Ground raises what is already there.** Where a member draws its own denominator
— `progress`'s track, `bullet`'s range — ground raises THAT rather than inserting
a second one. Where the denominator is the unmarked part of the field —
`matrix-grid`'s empty cells, the map's unnamed regions — it raises that instead.
Only the EMPTY state: `.cell-outlined` is a state of its own, and raising it
would blur the presence distinction the register exists to protect.

**And G1 applied moves two members off today's tree**, both the rule biting
rather than an exception: `scatter`'s six named entities gain a hue each, and
`quadrant`'s eight named dots collapse to one. Same rule, opposite outcomes.

**§2's two-jobs test now questions the first of those.** Measured on the gallery
deck, `scatter` draws NO leaders and its dots sit 5.06 mark-widths apart — so on
an uncrowded scatter neither job applies and the per-entity hue the prototype
adds is not earned. `quadrant`, on the same deck, draws two leaders. The verdict
is therefore DECK-DEPENDENT for those two members, which is a real result and
not a defect in the test: a sparse scatter needs no hue and a crowded one does.
Whether the emitter can decide that at render time, from the leaders it actually
had to draw, is an open question for the implementation.

Measured after all of it: **11 of 11 members show all three finishes as
distinct**, on indaco, indaco dark and achromatopsia alike.

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
