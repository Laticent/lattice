# The mark class belongs in the manifest

**A class that is inferred is a class that can be inferred wrongly, and every
time this one was inferred wrongly the render was wrong.** Each of the 21 chart
members now declares its data marks in `<member>.manifest.json` under
`kernel.marks`, with the three facts a chart finish is decided by.

```json
"kernel": {
  "figureClass": "gantt-chart",
  "marks": [
    { "class": "gantt-bar",           "paint": "fill", "encodes": "hue", "bears": true  },
    { "class": "gantt-legend-swatch", "paint": "fill", "encodes": "hue", "bears": false }
  ]
}
```

## Why it moved

A finish (`pigment` · `etching` · `tone`) is a stylesheet. Everything it may do
to a member is therefore decided before a single rule is written, by three facts
per mark: **how the mark takes paint**, **what its body encodes**, and **whether
it carries text**. Those facts lived in a hand-written `MARKS` table in the
finish prototype, and the table was wrong every time anybody measured it:

- **`funnel-band` was declared text-bearing.** It is not — a funnel's stage
  labels sit in the LEFT GUTTER, outside the band, and **0 of 5 bands** carry
  any text. The wrong register is the whole reason funnel rendered
  byte-identical under all three finishes. `spend-rules.md` §7's list carried
  the same error.
- **`cell-filled` carried no slot attribute**, so six categories collapsed to
  one hue — latent while nothing painted a presence body, visible the moment a
  finish did.

Neither is a coding mistake. Both are what happens when a fact about a rendered
mark is written down from reading the source.

## The two fields that were nearly one

`paint` and `encodes` describe different things and the family contains marks
that split them, which is why they are not a single "class" enum:

| | `paint` | `encodes` |
|---|---|---|
| asks | how does this mark take paint | what does the body carry |
| values | `fill` · `bg` · `none` | `hue` · `ramp` · `presence` · `layered` · `none` |
| decides | whether a finish may reach it at all | how it reaches it |

`paint: "none"` is the GATE, and the case that proves it is line's series path:
a finish that reached it stepped its stroke to 2.18:1 on light and 1.26:1 on
dark, because on a stroked mark the stroke IS the mark and there is no edge left
to carry identity. The dots declare a paint role; the path does not.

**`encodes: "none"` means the body carries no datum — which is two different
marks, deliberately one value.** A mark with no body at all (`paint: "none"`),
and a mark whose body is a deliberate constant. Three members were the second
kind when this was written; `state-chart` was the one that said why in its
stylesheet (the node fill was always neutral so status color lived only in the
index badge). *(Superseded for state-chart on 2026-09-24: a status now paints
the node itself, as it does a gantt bar, and the node declares `encodes: "hue"`
— `2026-09-24-state-chart-fit-and-paint.md`.)* To a finish both mean the same
thing — nothing here is load-bearing, set it freely.

An earlier revision of the validator made `paint: none ⟺ encodes: none` a
two-way rule and was wrong about all three. The rule runs **one way only**: no
body means nothing for an encoding to live in.

## What each gate can see, and what it cannot

Two arms, and the split matters because the last session was burned twice by a
gate that measured less than it appeared to.

**`checkChartMarks` (`tools/check-ownership.js`, via `build:check`) reads
source.** It fails on a declared class nothing under `lib/` writes — a rename
that left a row behind, a row invented from memory — and on a `data-paint` /
`data-encodes` value the manifest does not know. It is blind to geometry, and it
cannot tie a stamped value to the element it lands on.

It also cannot say that a class is written *by this member*: `matrix-grid`
emits no cell at all (the three `cell-*` classes are stamped at markdown-parse
time by `lib/core/matrix-grid-cells.js`), and `chart-key-swatch` comes from the
shared `_chart-family/svg-legend.js` and lands inside six different members'
sections. So the search widens to all of `lib/`, and a class one member emits
would satisfy another member's row. The per-member tie is made on the render,
where a mark's section is a fact rather than an inference.

**And it is weaker even than that.** `writesClass` asks whether the class appears
as a whole token in any string literal under `lib/` — which **6772 distinct
kebab tokens satisfy**, `border-radius` and `font-size` among them, and
`bar-marks` too, the `<g>` container this gate's own error message offers to
catch as "furniture". It reliably catches the failure it was built for — a class
NOBODY writes, from a rename or from memory — and it does not verify that a row
names a mark. Do not read it as more.

*(An earlier revision of this section named `gantt-legend-swatch` as the second
example of a mark emitted outside its member. That was false: gantt writes it in
its own transform. The widening is still warranted on the `matrix-grid` and
`chart-key-swatch` cases; one of the two examples given for it was not.)*

**`node tools/chart-language-census.js --check` reads the render.** It is the
only arm that can fail on a wrong `bears`, because bearing is geometry: an SVG
rect's label is a SIBLING, so no amount of reading a transform says whether a bar
carries a task name. It covers only what a given deck renders on a given theme.

### Three measurement rules, each bought with a wrong number

**A bounding box lies on a non-rectangular mark.** A pie wedge's box is a
rectangle over its arc, a funnel band is a trapezoid, a radar polygon is a star.
So for an SVG mark the label's center must also land inside the real fill
(`isPointInFill`, through the inverse of `getScreenCTM` — without it every test
is against unscaled user units). Driven directly against the gallery, the guard
evaluates on all 7 box-passing pairs and short-circuits on none, which is how we
know it is live rather than quietly returning true.

**A visually hidden label is not text on a mark, and a mark's own text is.**
`matrix-grid` clips a `.cell-sr-label` ("reachable") to a 1px box behind
`clip-path: inset(50%)`; counting it scored `cell-outlined` — a mark with no body
at all — 10 of 10 text-bearing. And `<span class="cell cell-filled">Distinguished</span>`
has no child element to measure, so excluding the element itself reported the
filled cells as bare when they carry the grade name. **Both directions were wrong
in the same member.** With both fixed, `cell-filled` measures 6 of 6 — matching a
number the prototype reached independently.

**One labelled mark is enough, and the test only runs one way.** `bears` is a
CAP, so the question is not what most marks do. A body level that is safe for
eight bars and unsafe for four is unsafe: an earlier revision asked for a 60%
majority and called `journey-actor-dot` bare at 4 of 12, which is twelve dots
whose initials a finish would then paint over. And a deck showing no label does
not refute a `true` — the bucket gallery renders radar with ring ticks over the
polygons (3 of 3), radar's own gallery renders a variant without them (0 of 4),
and both are honest. A deck can prove a mark bears text and can never disprove
it. That asymmetry is also the safe one: a wrong `true` under-reaches a finish, a
wrong `false` paints over a label.

**`bears` is not measured on a body-less mark, and that is the instrument's
limit rather than a waiver.** `isPointInFill` answers against a path's fill
geometry whether or not the path is filled, so an open stroked path reports a
label as inside a region with no ink in it — `state-edge` failed exactly that
way, on one transition label sitting under a curve. Skipping it costs nothing,
because `paint: "none"` already tells a finish there is no body to set.

## What the render found that the hand table did not

The declarations were written from four independent source reads of all 21
members. The render-side check then disagreed with them **six times**, and every
disagreement was the declaration's fault:

| | declared | measured | what it is |
|---|---|---|---|
| `state-chart` / `state-node-shape` | bears false | 5 of 5 | `state-label-t` is drawn ON the node's SVG twin |
| `state-chart` / `state-index-disc` | bears false | 2 of 2 | the numeral sits on the disc |
| `state-chart` / `state-edge` | bears false | 1 of 7 | a transition label — and the case that showed the hit test cannot see a stroked path |
| `quadrant` / `quadrant-bubble` | bears false | 6 of 6 | the bubble variant prints its value on the bubble |
| `radar` / `radar-sector` | bears false | 1 of 4 | a ring tick over a tinted sector |
| `radar` / `radar-poly--hero` | bears false | 1 of 1 | the same ring tick, over the benchmark variant's hero polygon |

One more contradiction ran the other way — the manifest was right and the engine
was wrong. (It is not a seventh row of the table above: those six are the
declarations' fault, this one is the engine's.) **`scatter` stamped `data-encodes="hue"` on its bubbles.** A bubble is
`color-mix(… var(--chart-cat-1-ink) 42%, transparent)` on purpose, because two
overlapping bubbles should deepen where they cross; that is the `layered`
encoding, and stamping `hue` would have told a finish it could hand a translucent
mark a gradient — which reads as a third color where two bubbles overlap. The
transform now splits the stamp with the class.

## Coverage, stated rather than implied

**85 mark rows across 21 members. "Verified" needs splitting, because one word
was doing four jobs.** An independent checker re-derived every number in this
file; all of them reproduced except this one, which overstated what the render
actually holds each row to.

| | rows |
|---|---|
| declared | 85 |
| observed on some render | 78 |
| `bears: true` PROVED by a label on the render | 25 |
| `bears: false` — a deck can never disprove it (see the asymmetry above) | 56 |
| `paint` / `encodes` compared against a stamped attribute | **7** |

**The last line is the honest headline: `paint` and `encodes` are checked against
the render on 7 rows, because only 6 of 21 members stamp the attributes at all.**
For the other 15, those two fields are held up by a source read and by review —
not by the static gate, which only checks that *stamped* values are declared, and
not by the render check, which has nothing to compare. That is the gap the
migration of the remaining 16 members to the mark contract closes, and until it
does, "verified" in this file means *observed*, not *held to*.

Getting the observed count up took two more fixes to the instrument, and the
first was the same trap a third time. A mark usually carries a base class AND a modifier —
`class="map-region map-region--on"`, `"radar-poly radar-poly--target"`,
`"slope-dot slope-dot-from"` — and both are selectors a finish can name, with
different declarations behind them (`map-region` encodes nothing; `--on` is the
choropleth ramp). Taking the first matching class filed every one of them under
the base and reported **fourteen rows as exercised by no deck at all**,
`map-region--on` among them, on a gallery that renders 175 of them. A mark now
counts toward every declared class it carries. `radar-poly--hero` — the sixth row
in the table above — was only visible once it did.

**The second fix was the undeclared-mark arm, which was dead code.** An
independent checker deleted `scatter-bubble` from scatter's declarations and the
check still reported OK: an element carrying no *already-declared* class exited
the loop before the branch that reports it could ever run, so the one arm that
walks emitted→declared never walked. Repaired, it found `chart-key-swatch` —
the family-wide legend swatch, emitted inside **six** members' sections by the
shared `_chart-family/svg-legend.js` — declared by none of them, plus
`quadrant-tint` and `scatter-size-ring`. That took the roster from 77 rows to 85.

`scatter-size-ring` is the one that stings: it is the size-key legend FOR the
bubble, painted from the same translucent recipe, and it was still stamping
`hue` after the bubble had been corrected to `layered`. A legend declaring a
different encoding from the mark it names is the exact defect this file's own
schema text calls the worst version of the problem. **The fix was half-applied
and nothing caught it, because the arm that would have was dead.**

One filter had to come with it. On an SVG `<text>` the `fill` property IS the
type color, so every label carrying a categorical slot — `cart-series`,
`cart-value`, `quadrant-dot-label`, `waterfall-delta`, `state-index-t` — reported
as an undeclared painted mark on the first run. Nine did. Type is excluded by
tag: a label taking a categorical ink is the family's own convention, and `bears`
is how a label enters this contract, from the mark's side.

**What no deck exercises is not verified**, and the seven that remain match what
the source inventories independently named as unreachable: `bullet-offscale` (no
deck clips a bar or authors a Floor row), `gantt-bar--unscaled` (no deck has an
unparseable span), `journey-vstage-name` and `journey-vtask` (portrait only),
`kanban-lane` (body-less, so `bears` is not measurable on it either),
`quadrant-hull` (every shipped cohort group has exactly two items, so the
two-point line is drawn instead of the polygon), and `slope-dot-via` (every
shipped slope has exactly two columns). Those rows are declared from source and
measured by nothing.

Slots 7 and 8 remain untested by observation, as they were after #2148.

## What this does not do

It does not implement a finish. `grep -rn "chart-finish" lib/ themes/` still
returns nothing, and `--mark-retreat` — how far a finish may pull a body back —
is still designed rather than built. What changed is that the numbers it will be
built on are now declared, gated, and re-measured off a render, instead of being
re-derived by hand each time somebody needs them.
