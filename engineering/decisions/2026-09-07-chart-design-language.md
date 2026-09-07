---
status: in-progress
summary: The chart family shares tokens, kernels and a frame and still reads as several authors — because the shared layer stops at COLOR. Census of what all 21 members actually paint (type register, fill finish, axis furniture, key model, interaction handles), and the brief for a single chart design language covering all 21 across cuoio / indaco / onyx / an a11y theme, light and dark, screen and print.
last-updated: 2026-09-07
companion:
  - ../../lib/components/chart/_chart-family/chart-family.style.md
  - ../../lib/components/chart/_chart-family/chart-family.docs.md
  - 2026-08-09-color-theme-ownership.md
  - 2026-07-16-universal-texture-channel.md
---

# A single design language for the chart family

**Date:** 2026-09-07 · **Status:** census settled; design brief open.

## Question

The chart bucket ships 21 members. They share a token layer (`--chart-cat*`,
`--state-*`), two render kernels (`cartesian.js`, the SVG builders), one frame
(`.chart-frame`) and one legend builder — and they still do not read as one
system. Charts.js, Datawrapper, Highcharts and the FT's chart doctrine all have
something Lattice does not: **a design language above the palette** that says how
a mark is filled, what furniture a plot draws, how a category is named, and how
the whole thing behaves when you touch it.

**What is the language, and what does every member owe it?**

This is the engine's self-owned diagramming feature. It is not a styling pass.

## What is already settled, and is NOT in scope

Three things are mature, gated, and must be *reused* rather than redesigned. A
track that proposes replacing any of them is answering a different question.

- **The categorical + semantic palette.** `--chart-cat1..8` and
  `--chart-state-{pass,warn,fail,info,mute}`, each a `light-dark()` pair, curated
  per theme against a documented recipe (`chart-family.style.md`), gated by
  `test/unit/palette/chart-contrast.test.js` and graded by `npm run scorecard`.
  All 13 themes are curated to standard. **The tokens are not the problem.**
- **Who owns color.** `2026-08-09-color-theme-ownership.md` settles engine vs.
  theme vs. deck. The language is palette-blind; it spends `var(--token)` only
  (HARD RULE #3).
- **The texture channel.** `--cat-N-texture` already exists as the non-color
  channel for themes that cannot separate by hue (`2026-07-16`). The gap is
  coverage, not mechanism — see below.

## The census — what each member actually paints

Measured, not read off the source: `tools/chart-language-census.js` opens the
rendered gallery in a real browser and reads `getComputedStyle` on every text
node and every data mark inside each `section.chart-frame`, after the cascade,
after `light-dark()`, after `color-mix()`. Re-run it to reproduce any number
here; run it again after the work to see what moved.

```
node tools/chart-language-census.js --json /tmp/census.json
```

### Type — coherent in seven roles, split in two

This is the axis that *looks* broken and mostly is not, which is why it needed
measuring — and why the first measurement of it was wrong. **Two of the three
splits originally reported here were bugs in the census, not defects in the
family**; correcting them surfaced a different split that had been missed, and a
seventh role nobody had named.

The corrected picture. Seven roles, each resolving to ONE face across every
member that prints it:

| Role | Face | Members |
|---|---|---|
| `value` — the primary figure | Playfair (display) | bar, bullet, funnel, slope, stacked-bar, waterfall, word-cloud |
| `value-2nd` — a rate / target / part | JetBrains (label) | bullet, funnel, stacked-bar |
| `category` | Outfit (body) | 16 members |
| `tick` | JetBrains (label) | bullet, gantt, line, quadrant, radar, scatter, stacked-bar, waterfall |
| `series` | Outfit (body) | line |
| `heading` | Outfit (body) | roadmap |

**`value-2nd` is a role the family already uses and had never named.** funnel's
conversion rate, bullet's plan marker and stacked-bar's segment part are all the
label face at 6.5px against the primary's display face at 9px — three members
that arrived at the same convention independently. A census that lumps it with
`value` reports a deliberate distinction as a split; the language should ratify
it as the sixth role rather than flatten it.

Two splits are real:

1. **`axis-title`.** quadrant paints `.quadrant-axis-name` in Outfit bold;
   scatter, slope and stacked-bar paint `.cart-axis-title` in JetBrains,
   uppercase and tracked. One of the two is wrong.
2. **`legend`.** gantt, journey, roadmap and state-chart paint Outfit; map,
   piechart, radar and word-cloud paint JetBrains. **The split tracks the
   SUBSTRATE, not the design** — the SVG-native legend builder
   (`_chart-family/svg-legend.js`) sets the label face, while the HTML members
   each style their own key. That makes it the most visible incoherence in the
   family, because the legend is its most repeated element, and the most clearly
   accidental: nobody chose it.

**Three defects reported in the first draft of this note do not exist.** They
were artifacts of the census, and they are recorded here because two of them were
load-bearing evidence and "fixing" them would have been a regression chasing a
tool bug:

- **The radar `tick` split.** The census matched class names as SUBSTRINGS, so
  `<g class="radar-ticks">` — a container, which carries no font rule and
  reports whatever it inherited — matched the `radar-tick` role. Every painted
  radar tick is one face.
- **"`bar` draws neither a gridline nor an axis."** `bar` draws a zero rule
  (`.cart-zero`), deliberately: `buildAxisRule` draws at the plot EDGE, which is
  only zero while every value is positive. The census had no pattern for it.
- **"quadrant draws no furniture."** It emits `.quadrant-bounds` and
  `.quadrant-split`; neither matched the detector's patterns.

The family is **more** coherent than the first census said, and three members
already implement data-keyed furniture rules it could not see (`bar.wantsValueAxis`,
`bar.referenceLines`, line's `ax.lo === 0 ? buildAxisRule(…) : ''`). **The
language's job is to generalize rules the tree already has, not to impose new
ones.** Credit: the visual-designer track found all three by reading the source
against the census output.

### Fill — genuinely incoherent, on two incompatible axes

| Paint shape | Members |
|---|---|
| flat | 17 |
| linear-gradient (vertical wash) | bar, gantt, progress, state-chart, timeline-list, waterfall |
| **radial-gradient (dome)** | **piechart, quadrant, radar** |
| none (unfilled mark) | journey, line, slope |

Nine members carry a gradient, against a flat majority of 17 — and the nine are
split across two axes that cannot be reconciled by eye: a **vertical wash** on
the bar/tile family and a **radial dome** on the solid-area family. Eight members
mix two shapes *within one chart* (gantt, state-chart, waterfall, piechart,
quadrant, radar, line, slope).

`chart-family.style.md` § Fill finish already documents this as deliberate — the
dome is "the base: charts that radiate from a center take a center-out fade" —
**and already records the counter-proposal as prototyped and held**:

> A flatter top→bottom wash for the solid-area pair (matching the bar family)
> was prototyped — it reads cleaner / more uniform, at the cost of the
> dimensional read. It is held as a future opt-in variant, not shipped: when
> built it should apply family-wide to the pie *and* quadrant together.

So "kill the gradient on pie and quadrant" is not a new idea in this repo; it is
a shelved one. The brief's job is to decide it on the merits, family-wide, rather
than per member — and to decide it for the **vertical wash too**, which the held
variant never questioned.

**Measured, the dome defeats the value channel on every theme.**
`tools/chart-mark-separation.js` scores each rendered mark twice: its SEPARATION
from the nearest other category, and its SELF-RANGE — how much perceptual ground
the mark's own shading covers. A mark whose self-range exceeds its separation has
painted over its own categorical read, and no palette work can fix it.

| Theme (seen as achromatopsia) | member | self-range | nearest separation | ratio |
|---|---|---|---|---|
| a11y-achromatopsia | quadrant | 0.278 | 0.030 | **9.3×** |
| cuoio | piechart | 0.255 | 0.027 | **9.4×** |
| cuoio | quadrant | 0.161 | 0.003 | **54×** |
| indaco | piechart | 0.210 | 0.000 | ∞ |
| onyx | piechart | 0.286 | 0.097 | **2.9×** |
| onyx | quadrant | 0.286 | 0.097 | **2.9×** |

The onyx row is the one that settles it. Onyx's whole identity is that categories
differ by **value, not hue** — it is the counter-example the palette recipe cites
to prove the system survives without chroma. The dome spans three times more
value than the step between two of its categories, so on the one theme built to
rely on the value channel, the dome is the thing that destroys it.

The two gradient axes are therefore not equivalent and must not be decided
together on aesthetics: the **radial dome measurably breaks a channel the palette
depends on**, while the vertical wash on the bar/tile family has not been shown
to. That is an argument about mechanism, not taste.

**The quadrant is the sharpest case.** Its four zone tints are the loudest thing
on the slide while carrying the least information — the zones are *reference
regions*, the dots are the data. Whatever the language says about gradients, a
mark must out-rank its own backdrop.

### Furniture — incoherent

| Member | gridlines | axis line | polar web |
|---|---|---|---|
| bullet, scatter, stacked-bar, waterfall | ✓ | ✓ | |
| line, matrix-grid | ✓ | | |
| radar | | | ✓ |
| **bar** | | | |
| quadrant, funnel, gantt, map, piechart, slope, … | | | |

A **bar chart that draws neither a gridline nor an axis** sits beside a bullet
chart that draws both. Nothing in the current system says which a member owes.

### What the census cannot see — found by looking

A census reads properties it was told to look for. These came from rendering the
gallery and examining every member, and each is a coherence defect the numbers
above do not name.

**`bar` and `stacked-bar` are the exhibit.** They sit adjacent in the gallery,
share the `cartesian.js` kernel, and disagree on every axis at once:

| | `bar` | `stacked-bar` |
|---|---|---|
| mark fill | pale vertical wash | fully saturated flat |
| mark edge | 1px dark outline | none |
| gridlines | none | five |
| key | none | direct labels at right |

The same categorical token renders as a pale tint in one and a saturated block in
the other. If the language fixes nothing else, it has to fix this pair.

**Legend placement is a fifth divergence the census scored as one.** "Legend
rail" covers at least three physically different treatments: a right rail with a
vertical hairline (piechart, radar, map), a centered row *below* the plot
(gantt), and an inline bottom-left caption in mono italic (matrix-grid). Add
direct labels and "nothing" and the family has five ways to name a category.

**Corner radius is unowned.** Gantt bars and kanban cards are pill-rounded; bar
and stacked-bar bars and quadrant zones are square. No token governs it.

**`matrix-grid` repeats a mistake this repo already fixed.** It spends six
categorical hues on its ROW LABELS and cell outlines — the axis a reader decides
least from. That is precisely the defect
`2026-06-22-kanban-chart-redesign.md` records fixing for the kanban: *"colour was
spent decoratively on CATEGORY, the card's least decision-relevant axis."* One
member learned it; a later member re-introduced it. A design language is what
stops that recurrence — the principle existed and nothing held the new member to
it.

**`kanban` has a vertical composition defect.** Its board top-aligns in the
stage, leaving roughly half the slide empty below. That is a layout bug, not a
palette one, and no color decision reaches it.

### Key — three models, no rule

- **legend rail** (8): gantt, journey, map, matrix-grid, piechart, radar, roadmap, state-chart
- **direct labels** (4): line, scatter, slope, stacked-bar
- **nothing** (9): bar, bullet, funnel, kanban, progress, quadrant, timeline-list, waterfall, word-cloud

`chart-family.css` already states the principle — "Direct labels beat a legend
whenever they fit, so this is a first-class register, not a fallback" — but no
member is held to it. The language should make the choice a *rule keyed on the
data shape*, not a per-member accident.

### Interaction handles — uneven, and the contract doc is stale

| | Members |
|---|---|
| mark-detail popover wired | 14 of 21 |
| **no popover** | journey, kanban, matrix-grid, progress, roadmap, timeline-list, word-cloud |
| **cannot animate** | journey, kanban, matrix-grid, progress, roadmap, timeline-list |

**Six cannot animate, by two different mechanisms** — which matters, because the
fix differs. Five (kanban, matrix-grid, progress, roadmap, timeline-list) emit no
`<svg>` at all. **journey** emits eight, and still gets no scene: `chartToScene`
reads only the FIRST `<svg>` in the section, and journey's first carries neither
an anima role nor a `<text>`. Restructuring to SVG would fix the five and do
nothing for journey, which needs its animatable content moved into the first
`<svg>` — or the kernel taught to look past it.

**A measurement note that cost a wrong number.** Reading the exported HTML source
and reading the live DOM disagree, and only one of them is right. `state-chart`
carries no `data-anima-role` in the emitted markup and twenty in the live
document, because its measuring pass paints the overlay in the browser. Counting
roles by grepping the export therefore reports state-chart as unanimatable, which
it is not. Every number in this section comes from the live DOM
(`chart-language-census.js`); a grep over the HTML is not a substitute.

`chart-motion` (`docs/src/lib/chart-anima.ts` `chartToScene`) animates the first
`<svg>` in the section, so **a member with no SVG is not "mostly supported", it
is silently skipped** — the chart looks right and never moves.
`chart-family.docs.md` § "Motion + mark-detail support, by member" documents this
correctly but **lists none of the eight cartesian members added since**, so the
one table an author would consult is stale.

### Accessibility + print — 9 of 21 covered

`themes/a11y-base.css` and `lib/base/base.print-textures.css` texture the same
nine members: bar, funnel, line, piechart, radar, scatter, slope, stacked-bar,
waterfall. The two surfaces agree with each other — the gap is that **twelve
members have no non-color channel at all**.

Some of the twelve are defensible: gantt, progress, state-chart and timeline-list
encode *status*, and onyx's curation argues meaning there is carried by value
plus the pill's text label rather than by hue. **Six are not defensible** —
quadrant, map, matrix-grid, kanban, word-cloud and bullet all encode
**categories** in large color areas with nothing behind the color. On
`a11y-achromatopsia` or a monochrome board printout, those charts lose their
categorical read entirely.

## The brief

Design **one chart design language** — a spec layer above the existing palette —
that all 21 members implement, and that holds up across cuoio, indaco, onyx and
an a11y theme, on light and dark canvases, on screen and in print.

It must answer, as *rules keyed on data shape*, not per-member preferences:

1. **Mark & fill.** One fill finish system. Does a gradient survive at all; if
   so on which axis, at what strength, and why is it not decoration? How does a
   mark stay louder than its own backdrop (the quadrant test)?
2. **Type.** Ratify the five roles; fix the `axis-title` and radar `tick` splits;
   state which roles each member is *obliged* to print.
3. **Furniture.** Which members owe gridlines, an axis line, a baseline, tick
   marks — keyed on whether the reader must compare magnitudes, read a level, or
   only rank.
4. **Key.** When direct labels, when a rail, when nothing.
5. **Motion.** One vocabulary of build behaviors keyed on chart archetype
   (a pie reveals whole, a funnel staggers top-down, a line draws along its
   path), plus what the five non-SVG members do — restructure to SVG, or get a
   declared, documented CSS build.
6. **Detail reveal.** Which members owe a popover, on what authored grammar, and
   what the print fallback is for members that gain one.
7. **The non-color channel.** How texture, value and shape carry category for
   the six uncovered categorical members, on a11y themes and in print.
8. **The token question.** The palette layer exists. Does the language need
   *new* primitives (mark weight, grid weight, fill strength, elevation, motion
   timing) aliased over what ships — and if so, what is the smallest set that
   makes every rule above expressible in `var(--token)` (HARD RULE #3)?

### Constraints a proposal must respect

- **HARD RULE #1** — transforms land in the shared kernel, never one render path.
- **HARD RULE #3** — no hex literals in layout CSS; every color via `var(--token)`.
- **HARD RULE #4** — typography is the 12-token `--fs-*` role scale; the chart
  family's `--chart-text-min` floor is a minimum, not a new role.
- **HARD RULE #20** — no `margin` in engine layout CSS; `padding` / `gap` only.
- **HARD RULE #29** — no typed shape glyphs on a rendered surface; the
  `--mark-*` / `--shape-*` SVG mask tokens carry shapes.
- **Print renders the final frame**, always. No motion design may change the
  PDF/PPTX bytes of an existing deck.
- **The palette is not up for redesign** (see "already settled" above).

### How a proposal is judged

- Does it read as **one system** across all 21 members, or only across the
  members it chose to discuss?
- Does every rule key on **data shape** rather than on a member's name?
- Does it survive **onyx** (value, not hue) and **a11y-achromatopsia** (no hue at
  all), not just cuoio and indaco?
- Does it survive **print** (no motion, no hover, possibly no color)?
- Is every rule expressible in existing or proposed **tokens**, so a theme can
  still curate?
- What does it **cost** — how many members change, how much of the gallery
  churns, what breaks?

## Status

Census complete and reproducible (`tools/chart-language-census.js`). Design
brief open; candidate languages to be generated, judged and picked before any
implementation.
