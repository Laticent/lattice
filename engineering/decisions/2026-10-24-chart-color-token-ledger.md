---
status: proposed
summary: >
  A ledger of the chart color tokens every theme now declares (+16 per brand theme on #2887): the concept each
  belongs to, its job, who reads it, whether pure CSS could derive it, and whether it bears load. Seven concepts
  (ink, solid, intensity, edge, signal, neutral, seed) cover all 21 additions. 17 bear load; on-status repeats
  on-solid in all 18 themes and is retired; the a11y children inherit their vivid aliases; info and mute are solver
  seeds that nothing renders. The edge stays: the slide inks cannot stand in for it. Status is one concept painted
  two ways (charts read the solids, eleven components read the inks), which is the reuse question.
---

# The chart color tokens: what each is for, and which bear load (2026-10-24)

## 1. The question

The owner, on PR #2887: every theme file grew by 16 tokens (about 1.1 KB). How many of them bear load, and can
the set be leaner without reaching for run-time JavaScript color math (the Mermaid route)? And, more than the
count: each token has to belong to a CONCEPT that is clear enough to reuse in future capabilities, not a one-off
for the chart family.

## 2. What changed per theme

Measured against the branch's merge base, with comments stripped, every brand theme declares 21 new tokens and
drops 5, a net of +16 (concrete +14, which already declared two of them). Each `a11y-*` child also nets +16, and
the shared `a11y-base` partial +20.

| Dropped (5) | Added (21) |
|---|---|
| `--chart-state-pass` … `--chart-state-mute`: the chart's private status colors | `--on-solid`, `--on-status`, `--chart-neutral`, `--info`, `--mute`, `--pass-solid` … `--mute-solid` (5), `--pass-solid-vivid` … `--info-solid-vivid` (4), `--pass-solid-edge` … `--mute-solid-edge` (5), `--warn-solid-signal`, `--fail-solid-signal` |

## 3. The concepts

Every added token belongs to one of seven concepts. The concept is the unit to reason about; the token is how a
theme fills it in.

| Concept | Meaning | Tokens | Bar it holds |
|---|---|---|---|
| **Ink** | the one text color on every chart fill, per slide | `--on-solid`, `--on-status` | white on brand themes; near-black on an `a11y-*` dark face |
| **Solid** | a concept's one flat fill: a category, a status, or neither | `--chart-catN` (already declared), `--X-solid`, `--chart-neutral` | the ink clears 7:1 light, 4.6:1 dark; 3:1 off the slide |
| **Intensity** | how loud the status fills are, picked per deck | `--X-solid-vivid` | the same bars as the solid |
| **Edge** | a status drawn as a LINE or TEXT (a slope, a waterfall step, a kanban header) | `--X-solid-edge` | 4.5:1 off the slide |
| **Signal** | the ring that marks an exception, and only an exception | `--warn-solid-signal`, `--fail-solid-signal` | 3:1 against the neighbor opposite it in lightness |
| **Neutral** | the solid for a mark with no category and no status | `--chart-neutral` | as a solid |
| **Seed** | an input the solver reads a hue from, not a color anything paints | `--info`, `--mute` | none of its own |

How a component uses them: a mark that shows a status paints its **solid**, writes its label in the **ink**,
draws its shape (`lib/core/status-marks.js`), and, if it is an exception, wears the **signal** inside its edge. A
status that is a line or text paints the **edge**. A deck picks the **intensity**.

## 4. The ledger

"Readers" counts `var(--token)` in `lib/` and `docs/src`, excluding generated files. "Derivable" asks whether
plain CSS (`var()`, `light-dark()`, `color-mix()`) could compute it from another token. Solving a contrast bar is
not plain CSS, so a token whose value is the answer to a contrast bar is not derivable.

| Token | Concept | Readers | Repeats another token? | Derivable in plain CSS? | Bears load |
|---|---|---|---|---|---|
| `--on-solid` | Ink | 1 (chart-family) | no | no | **yes** |
| `--on-status` | Ink | 14 (chart-family, roadmap) | equals `--on-solid` in 18 of 18 themes, both faces | yes: `var(--on-solid)` | **no**: retired (section 8) |
| `--chart-neutral` | Neutral | 1 | no | no (solved for contrast) | **yes** |
| `--info`, `--mute` | Seed | 1 each: base aliases `--status-info`/`--status-mute`, which nothing reads | no | n/a | **not as paint**: the solver reads their hue |
| `--X-solid` (5) | Solid | 1 each (chart-family) | no | no (solved for contrast) | **yes** |
| `--X-solid-vivid` (4) | Intensity | 1 each; fail also 3 in risk-matrix | equals muted on the light face in 36 of 72 (16 of them the a11y aliases; the rest a gamut ceiling) | only with relative color syntax (`oklch(from …)`), which keeps neither contrast nor gamut and failed the finish gates once already | **yes** |
| `--X-solid-edge` (5) | Edge | 1 each | equals its fill on the light face in 68 of 90; on the dark face only in the 18 a11y bright fills | no: the dark arm is a lifted tone solved off the slide | **yes** |
| `--warn/fail-solid-signal` | Signal | 1 each | no | no | **yes** |
| `--on-solid-shade` (a11y-base only) | Ink | 4 | no | no | **yes** |

So: of the 21 added, **18 bear load as paint**, **2 are seeds** the solver needs but nothing renders, and **1**
(`--on-status`) repeats another in every theme.

## 5. Ways to be leaner, all in plain CSS

None of these changes a pixel.

1. **`--on-status` becomes an engine alias.** `base.tokens.css` declares `--on-status: var(--on-solid)`, and the
   themes stop declaring it. A palette that ever needs a different status ink still can. Saves 1 token per theme;
   the contract goes from 114 to 113.
2. **The `a11y-*` children inherit their vivid aliases.** Each child declares `--X-solid-vivid: var(--X-solid)`;
   `a11y-base` can declare those four once. Saves 4 per child.
3. **The dead aliases `--status-info` and `--status-mute` go.** Engine side only; nothing reads them.
4. **`--info` and `--mute` get a job or leave the theme files.** Today they complete the status vocabulary
   (pass, warn, fail, info, mute) as inks but paint nothing. Either a component paints them (section 6), or the
   solver takes the info and mute hues from somewhere else and the theme files stop declaring them.

Not recommended: deriving vivid or edge with relative color syntax, or any run-time JavaScript. Either trades a
token for a color the gates can no longer certify.

## 6. Reuse: status is one concept painted two ways

The chart family reads the solids. Eleven other components that show a status (kpi, checklist, verdict-grid,
redline, roadmap, obligation-matrix, policy-recommendation, regulatory-update and others) read only the slide
inks `--pass`, `--warn` and `--fail` (about 40 reads each) and mix their own 12% tints. So a "blocked" pill on a
chart and a "blocked" row in a checklist are colored by two different rules.

The concepts in section 3 are the contract a non-chart component would adopt to say "status" the same way: the
solid, the ink, the mark, the signal. That is the capability these tokens are for beyond the chart family, and the
reason to keep the vocabulary whole (all five statuses, both intensities) rather than trim it to what charts read
today. Adopting it is separate work, one component at a time; the open choice is in section 7.

## 7. Open choices (the owner's)

- Whether the slide inks and the edges become one token (section 8, "The edge").
- Whether `--info`/`--mute` get a paint job or leave the theme files.
- Whether the non-chart status components move onto the solids (section 6), and in what order.

## 8. What #2887 took (2026-10-24)

**`--on-status` is retired, not aliased.** An engine alias at `:root` (`--on-status: var(--on-solid)`) computes once,
at `:root`, so it does not follow a later `--on-solid` override on a section: the print band resets `--on-solid` on
`section.print`, and the alias would have kept the screen value there. Every future override would have walked into
the same trap. The token never shipped on `main`, so retiring it costs nothing. The chart family declares
`--chart-solid-ink: var(--on-solid)` once on the frame, and its five private `--state-X-on` hooks and the five rules
that re-pointed the ink per status are gone too: each resolved to the same color. `chart-one-ink.test.js` now
asserts the frame declares `--chart-solid-ink` exactly once. The contract goes from 114 to 113.

**The `a11y-*` children inherit their vivid aliases** from `a11y-base`. Both files declare on `:root`, so the alias
`var(--X-solid)` resolves against the child's own fill. `tools/curate-chart-solids.js` writes the aliases into
`a11y-base` only, and `solveTheme` leaves them out of a child.

Both changes are pixel-identical: 180 slides (`status-markers` and `chart-finish`, vivid, in `a11y-protanopia`,
`a11y-tritanopia` and `indaco`, light and dark) render byte for byte the same PNGs before and after.

**The edge.** The plan was to merge the edge into the slide ink (`--state-X-ink: var(--X)`) and retire the five
`--X-solid-edge` tokens. Measured, the slide inks are not a stand-in. On the dark face every brand theme's `--pass`
is a neon green (indaco `#a0ff7f`, 14:1, 0.30 OKLab away from its edge, the sage `#689a7a` that matches the pill
fill); on the light face `--fail` is near-black maroon (indaco `#550014`, 15:1) where the edge is crimson. Swapping
them puts neon lines beside sage pills. The edge stays, and the real question is the other direction: a deck now
says "pass" in TEXT in two colors, `--pass` in a KPI or a checklist and `--pass-solid-edge` in a chart. Making
them one token (the slide inks take the fill-matched edge values, and the edge name retires) changes the status text
of eleven non-chart components in every brand theme, so it is the owner's call, with section 6.

| Per brand theme | Before #2887 | After |
|---|---|---|
| Added | 21 | 20 |
| Dropped | 5 | 5 |
| Net | +16 | +15 |
| Net per `a11y-*` child | +16 | +11 |
