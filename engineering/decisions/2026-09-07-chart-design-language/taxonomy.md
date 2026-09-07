# Classifying a chart by its nature, its use, and its reception

**Status:** proposed. This extends the winning candidate (`candidates/5-leverage-existing.md`)
rather than replacing it — see § Why this is a superset of R0.

---

## The problem with one question

Three Registers decides a mark's finish from a single test:

> **R0 — does the mark carry text inside it?** No → MARK (full strength). Yes →
> BACKDROP (quiet, because text has to be readable on it).

That is a good rule, and the reason it is good is worth naming, because it is the
philosophy the whole candidate rests on: **a mark's finish is a claim about what
the reader is supposed to do with it.** A mark you read *on* is a surface and must
be quiet. A mark you read *as a value* is a datum and may be loud. R0 is derivable
by looking — no lookup table of member names — and it is anchored to a hard number
rather than to taste: `--text-heading` on the 82% level fails AA in **117 of 224**
theme × mode × slot combinations, while the two quiet levels fail 0 and 1. "Quiet
enough to read on" is a contrast floor, not an opinion.

**But one binary question can only carry one distinction, and charts differ along
several.** R0 has no way to say *"bar is bare, AND its marks never overlap, AND its
wash runs across the axis the reader measures"* — so it flattens bar on a
technicality. The rule is clean and under-dimensioned. That is the honest weakness
in the winner, and it is the one the judge flagged: its gradient section is its
weakest part.

What follows keeps R0 and gives it two neighbours.

---

## The three questions

Every rule in the language keys on one of these. Nothing keys on a member's name.

| | Question | Decides |
|---|---|---|
| **Nature** | What is this mark, and how does it sit against its neighbours? | the FINISH — flat, translucent, or shaded |
| **Use** | What is colour *doing* here, and how is a mark named? | where colour is SPENT, and the key model |
| **Reception** | What survives when colour is gone? | the REDUNDANT channel, and its width |

---

## NATURE — three axes, and the one that was missing

### A1 · Substrate — what the mark physically is

`AREA` a filled region · `LINE` a stroked path · `POINT` a positioned dot ·
`CELL` a grid square · `CARD` a box that holds text · `GLYPH` the mark *is* text

### A2 · Occlusion — do the marks overlap each other? **← the missing axis**

`TILED` marks abut, never overlap (pie wedges, quadrant zones, map regions) ·
`SEPARATE` marks are spatially disjoint (bars, dots, funnel bands) ·
`LAYERED` marks overlap by design (radar's series polygons)

**Measured, not declared** — `tools/chart-language-census.js` samples real fill
containment (`isPointInFill`) between same-class marks. A bounding-box test lies
twice here: adjacent pie wedges' boxes overlap while the shapes only abut, and a
quadrant dot "overlaps" the field it is supposed to sit on.

**The result is a category of one:**

| Occlusion | Members |
|---|---|
| **LAYERED** | **`radar` — alone** |
| TILED / SEPARATE | bar, funnel, piechart, quadrant, scatter, stacked-bar, waterfall |
| partial | gantt, map (marks share edges) |

**This is the axis that answers "are radar and quadrant doing the same thing?"**
They both paint a `<radialGradient>`, so every reading that keys on the element
name buckets them together. They are opposites:

|  | quadrant | radar |
|---|---|---|
| stops | three **different colours** — 42% → 58% → 82% hue-mix | the **same colour** three times |
| what ramps | pigment, travelling 40 mix-points | **opacity**, 0.10 → 0.14 → 0.20 |
| marks | **tile** — four rectangles, no overlap | **layer** — three polygons over one web |
| what the ramp buys | dimension | *the ability to see the series underneath* |
| measured self-range | **0.214** | 0.055 |

So radar is an outlier **by nature** and quadrant only **by accident**.
Radar's translucency is the mechanism that makes a layered chart readable; the
quadrant's dome is decoration on a chart that tiles exactly like the pie.

> **Rule N1 — only a LAYERED member may be translucent.** For a TILED or SEPARATE
> mark, transparency buys nothing and costs contrast. Radar is the only member
> this admits today, and any future one must show overlap to claim it.

> **Rule N2 — a finish may vary across a mark only when the variation is the data,
> or when the mark is LAYERED and the variation is alpha.** The first clause keeps
> `progress` (its ramp scales with `--pct`); the second keeps radar. Everything
> else is flat. This is where the dome dies — on both pie and quadrant, by a rule
> neither one is named in.

### A3 · Text-bearing — R0, kept intact

`BARE` no text sits on the mark · `BEARING` text sits on the mark ·
`GLYPH` the mark is itself text (word-cloud — a third state R0 has no room for)

> **Rule N3 — a BEARING mark takes the quiet fill; a BARE mark may take full
> strength.** Unchanged from the winner, and still anchored to the 117/224
> measurement.

---

## USE — what colour is actually doing

### B1 · What colour encodes

`CATEGORY` which thing this is · `STATUS` how it is going · `MAGNITUDE` how much ·
`NOTHING` colour identifies nothing (a single-series bar)

This axis decides **whether a non-colour channel is owed at all**. A STATUS member
always prints a word — "at risk", "shipped", "blocked" — so its colour is already
redundant to text and needs no texture. A CATEGORY or MAGNITUDE member has no such
backup and owes one.

> **Rule U1 — colour is spent on the axis the reader DECIDES from, never on row
> identity.** `2026-06-22-kanban-chart-redesign.md` records this being fixed once;
> `matrix-grid` re-introduced it, spending six categorical hues on its row labels.
> A design language is what stops the recurrence.

### B2 · How a mark is named

`DIRECT` the label sits at the mark · `KEYED` a legend rail · `AXIS` position on a
labelled axis names it · `SELF` the mark contains its own name

> **Rule U2 — direct beats keyed whenever it fits.** Already stated in
> `chart-family.css`; no member is currently held to it.

---

## RECEPTION — what is left when colour goes

One ordered ladder. **A member owes the strongest rung it can support, not a
texture by default.**

| | Rung | Available when |
|---|---|---|
| 1 | **Position** | the mark's location carries its identity (scatter, quadrant dots) |
| 2 | **Direct label** | the name can sit at the mark |
| 3 | **Value printed** | the number is on or beside the mark |
| 4 | **Shape / line-style** | the mark has a stroke or a symbol to vary |
| 5 | **Texture** | *nothing above is available* |

Texture is **last**, not first. That re-diagnosis is Track 4's, and it halves the
work: of the six members the brief called uncovered, four already carry a stronger
rung the tool could not score, one only needs colour taken away, and exactly one
(map's highlight) genuinely needs a new channel.

> **Rule R1 — a redundant channel must be at least as WIDE as the channel it backs
> up.** The categorical palette is 8 slots; the engine emits 8 chart textures; the
> a11y themes wire **6**. So categories 7 and 8 silently wear the textures of 1 and
> 2, and at the pie's own documented 11-slice ceiling, slices 7–11 repeat 1–5. A
> redundant channel narrower than the channel it backs up is not redundancy — it is
> a silent merge, and it must be gated against `--chart-cat1..8` rather than left
> to a hand-written `6n` cycle no test compares to anything.

---

## The 21 members, classified

| Member | Substrate | Occlusion | Text | Colour encodes | Naming | Strongest rung |
|---|---|---|---|---|---|---|
| `bar` | AREA | separate | BARE | NOTHING¹ | AXIS | position |
| `stacked-bar` | AREA | separate | BARE | CATEGORY | DIRECT | direct label |
| `waterfall` | AREA | separate | BARE | STATUS | AXIS | value |
| `funnel` | AREA | separate | BARE | CATEGORY | DIRECT | direct label |
| `bullet` | AREA | separate | BARE | STATUS | DIRECT | value |
| `piechart` | AREA | **tiled** | BARE | CATEGORY | KEYED | **texture** |
| `map` | AREA | tiled | BARE | MAGNITUDE | KEYED | value |
| `radar` | AREA | **LAYERED** | BARE | CATEGORY | KEYED | line-style |
| `quadrant` zones | AREA | tiled | BEARING | **NOTHING**² | SELF | — furniture |
| `quadrant` dots | POINT | separate | BARE | CATEGORY | DIRECT | **position** |
| `scatter` | POINT | separate | BARE | NOTHING | DIRECT | **position** |
| `line` | LINE | separate | BARE | CATEGORY | DIRECT | direct label |
| `slope` | LINE | separate | BARE | CATEGORY | DIRECT | direct label |
| `gantt` | CARD | partial | BEARING | STATUS | KEYED | text label |
| `kanban` | CARD | separate | BEARING | STATUS | SELF | text label |
| `progress` | AREA | separate | BEARING | STATUS | SELF | value |
| `timeline-list` | CARD | separate | BEARING | STATUS | SELF | text label |
| `state-chart` | CARD | separate | BEARING | STATUS | KEYED | text label |
| `roadmap` | CELL | tiled | BEARING | STATUS | KEYED | text label |
| `matrix-grid` | CELL | tiled | BEARING | MAGNITUDE² | AXIS | position |
| `journey` | CARD + LINE | separate | BEARING | MAGNITUDE | KEYED | value |
| `word-cloud` | **GLYPH** | separate | *is* text | NOTHING | SELF | size |

¹ `bar` is single-series in its default form; its grouped variant is CATEGORY.
² Both are corrections the classification forces: the quadrant's zones are
*reference regions* and should encode nothing, and `matrix-grid` should encode
magnitude on its cells rather than category on its rows (Rule U1).

**What the table shows at a glance:** eleven members are BEARING and thus already
constrained to the quiet register; only **one** is LAYERED; and only **piechart**
falls all the way to texture, because it is the one categorical member with no
position, no room for a direct label at eleven slices, and no stroke to vary.

---

## Why this is a superset of R0, not a replacement

R0 *is* axis A3. The classification keeps it, keeps its 117/224 anchor, and keeps
the winner's whole token layer. What it adds is two axes R0 could not express:

- **A2 (occlusion)** justifies radar's translucency on mechanism instead of
  exempting it by name, and condemns the quadrant's dome without needing the
  self-range measurement at all.
- **B1 (what colour encodes)** is what makes the accessibility work finite: STATUS
  members are already redundant to their own text, so the non-colour channel is
  owed by far fewer members than the brief assumed.

**And it reopens `bar` on better grounds than "the wash is measured clean".** Under
the classification, bar is `AREA / SEPARATE / BARE / NOTHING / AXIS`. Its wash runs
*across* the mark, never along the measured length — `bar.transform.js` already
rotates it for exactly that reason. Rule N2 as written still flattens it (the
variation is not the data and bar is not layered), so the wash question stays a
genuine decision rather than being quietly resolved by a rule that never considered
it. That decision is the human's, and the rendered A/B is at the prototype.

## The two layers above the mark

Everything above classifies a **mark**. Two layers sit above it and neither is
governed today: the CHROME that surrounds a mark, and the FIGURE the whole thing
is. Both were found by asking what a chart looks like when it leaves the slide.

### Layer 1 · The chrome ladder — measured, and incoherent

The census measured type FACES and found seven roles each resolving to one face.
It never measured type COLOUR, and colour is where the same roles come apart.
Measured on indaco light:

| Role | Distinct values in use | Values |
|---|---|---|
| axis / baseline / bounds / polar web | **5** | `#898e94`, `#898d94`, `#1d395f`, `#6b7e99`, `#697d9b` |
| category label | **3** | `#1e3a5f`, `#0a1628`, `#0c466e` |
| tick | **2** | `#5c6f8a`, and gantt's `#006fa8` |
| axis title | **2** | `#5c6f8a`, and quadrant's `#0a1628` |
| value | 1 | `#0a1628` |

Only `value` is coherent. Two findings are worth naming because they are not
near-misses of one token — they are different tokens:

- **`bar` paints its zero rule in `--text-body`** (`#1d395f`) while every other
  member's axis is border-gray. A reference line drawn in body ink out-ranks the
  labels it is supposed to sit behind.
- **`gantt` paints its ticks in `--accent`** (`#006fa8`), the one colour in the
  theme reserved for emphasis, on the quietest text in the figure.

The fix is not new colour — every value above is already a theme token. It is an
ORDER, declared once and spent by role rather than by member:

> **Rule C1 — chrome is one ladder, weakest to strongest, and a member picks a
> rung rather than a colour:**
> `grid` → `rule` (axis, baseline, bounds, web) → `tick` → `label` → `title` →
> `value`. **No chrome rung may be louder than the data mark it frames**, and no
> rung may use `--accent`, which belongs to emphasis and not to furniture.

### Layer 2 · The figure frame — missing entirely

`section.chart-frame` sets `background: var(--bg)` and `border-top: none`. So a
chart has **no ground and no boundary of its own** — it is a transparent region
that happens to sit on the slide. That is invisible on a plain slide and matters
in three places:

**1. Export — the strongest reason, and a live defect.** The Studio has two
standalone-SVG paths and they disagree:

```
"Download this chart as SVG"   finalizeStandaloneSvg(markup, { fontFaceCss })
image-set / zip export         finalizeStandaloneSvg(markup, { fontFaceCss, background: svgBg })
```

The one **a human clicks** is the one with no background. And `flattenSvgStyles`
inlines COMPUTED colour, so that file carries near-black text literals with no
ground under them: opened on a dark surface — Slack, Notion, a dark deck — it is
illegible. The chart cannot state what it needs to be read on, because nothing in
the chart declares a ground.

**2. A slide whose canvas is not flat.** A deck can set a background image
(`lib/engine/background-image.js`). A chart with no ground sits directly on the
photograph.

**3. The BACKDROP register needs something to be quiet AGAINST.** The
classification demotes quadrant zones to reference regions — but "quiet" is
relative to a ground, and the figure currently has none of its own.

> **Rule F1 — a figure declares its own ground, always; it draws its own edge,
> rarely.** The ground (`--chart-frame-bg`) defaults to the canvas, so nothing
> changes on a plain slide — but it is DECLARED, which means the export path can
> bake it and a chart on a background image can opt to sit on it. The edge
> (`--chart-frame-edge`) is **off by default**: our reference set (FT, Economist,
> Datawrapper) sets charts frameless on the page, and boxing every figure would
> be a bigger visual change than anything else in this language. It becomes a
> modifier for the cases that need "this is a separate object" — a chart among
> dense prose, a chart over an image, a chart exported to an unknown surface.

> **Rule F2 — an exported figure is self-sufficient.** Both export paths bake the
> ground. A file whose legibility depends on where it lands is not an export; it
> is a fragment. This is the one place the frame is not optional.

**The smallest token set this needs** — four, and three of them alias what
already exists:

| Token | Default | Why it exists |
|---|---|---|
| `--chart-frame-bg` | `var(--bg)` | so export can bake it; invisible on-slide |
| `--chart-frame-edge` | `transparent` | opt-in boundary, off by default |
| `--chart-frame-radius` | `0` | corner radius tracks the register (Rule F2 of the winner) |
| `--chart-chrome-*` | the ladder above | one rung per role, replacing five rule colours |

## Open

- **N2 and `bar`.** Does the rule get a third clause — *a finish may run across an
  axis the reader does not measure* — or does bar flatten? Both are coherent; only
  one is cheap.
- **Where the classification lives.** Six of these seven properties are derivable
  from the rendered output, which argues for a gate over a manifest field. The
  seventh (what colour encodes) is a design intent and has to be declared.
- **Does the frame edge ever default ON?** Rule F1 says no, on reference practice.
  The counter-argument is that Lattice charts are read in board packs where a
  figure competing with dense prose benefits from a boundary. This is a
  house-style call, not a measurement.
- Verify the winner's ratification of the legend split: it argues the four Outfit
  legends name `--pill-font` status pills, but `gantt` and `journey` use that token
  zero times.
