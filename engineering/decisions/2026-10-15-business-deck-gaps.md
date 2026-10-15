---
status: proposed
summary: An audit of the catalog against pitch, sales, board, marketing and reinsurance decks. Most business slides already have a component; four do not (a canvas grid, market-sizing circles, a native sankey, a pyramid), and the larger gap is a plugin, since every chart number is still typed by hand. The owner put a reinsurance beta first (§7): global number formats, a reinsurance tower, a risk matrix, a histogram with a log axis.
---

# Business-deck gaps: what startups, sales and boards reach for that we lack

**Scope**: the component catalog (`dist/docs/components.pick.md`, 75 rows) and the
plugin host (`lib/plugins/README.md`), read against the slides that pitch, sales,
board, marketing and investor decks use. No code changes; this note proposes work.

---

## 1. The answer

Lattice already covers most business slides. Four shapes are missing, and one
plugin matters more than any of them:

| Rank | Gap | Who needs it | Kind |
|---|---|---|---|
| 1 | **No data binding.** Every chart number is typed into the Markdown by hand | Finance, sales ops, board decks rebuilt each quarter | plugin |
| 2 | **Canvas grid**: Business Model Canvas, Lean Canvas, Value Proposition Canvas | Startups, strategy, accelerators | component |
| 3 | **Market sizing**: TAM / SAM / SOM as nested circles | Every VC pitch | component (chart) |
| 4 | **Native `sankey`**: revenue flows, budget allocation, ARR movements | Finance, board decks | component (chart) |
| 5 | **Pyramid**: strategy pyramids, hierarchy of needs, the value stack | Consulting, executive decks | variant or component |

**Superseded on order:** the owner put a reinsurance beta first; §7 has that build list.

**Recommendation (for after §7):** build canvas (2) and market sizing (3) first. They are the most
visible gaps in a pitch deck, each is a small self-contained component, and neither
waits on anything. The data plugin (1) has the largest payoff but needs its own
design note before code, because it adds a file ingest (§4).

## 2. What is already covered

Each row names the component that answers the slide today, so nobody builds a
duplicate.

| Business slide | Component |
|---|---|
| SWOT, BCG growth-share, Eisenhower, risk × impact | `matrix-2x2` (its docs name all four) |
| Positioning map, effort × impact | `quadrant`, `scatter` |
| Pricing tiers | `pricing` |
| Competitive feature table with "us" highlighted | `<!-- _class: table state-cells -->` with `[x]` / `[-]` / `[!]` alone in a cell, plus `<!-- _focus: col 2 -->` (`lib/base/base.docs.md` § `state-cells`, § Focus & highlighting). Without `state-cells` the markers render as literal text |
| "Trusted by" logos | `logo-wall` |
| Team, account team, QBR roll-call | `team-profile` |
| The hardest investor questions, answered ahead | `q-and-a` |
| Sales or conversion funnel | `funnel` |
| EBITDA or ARR bridge, budget to actual | `waterfall` |
| Actual against plan or quota | `bullet` |
| Revenue growth, the "hockey stick" | `line` |
| Revenue mix, cap table, use of funds | `stacked-bar`, `piechart` |
| OKRs, KPI dashboard | `kpi`, `stats`, `progress` |
| Org chart | `flowchart` in `tb` direction |
| Product roadmap, project plan | `roadmap`, `gantt` |
| Cohort retention grid | `heatmap` |
| Customer case study (logo, quote, outcome) | `columns` with a `quote` pane beside a `big-number` pane |

**One docs fix falls out of this table.** The competitive feature table is fully
buildable, but no doc says so: the word "competitive" appears in only one component's
docs (`radar`), so an author or agent searching for it does not find `table`. A line in
`table.docs.md` § When to use, plus a gallery slide, closes it. The line must name
the `state-cells` modifier: a marker alone in a cell is drawn only when the slide's
class carries `state-cells` or `obligation-matrix` (`lib/integrations/markdown-it/plugins.js`,
the cell-marker decode). That needs no new component.

## 3. The four component gaps

### 3.1 Canvas grid (rank 2)

**The claim:** a business model is nine named blocks in a fixed arrangement, and the
arrangement itself carries meaning. In the Business Model Canvas, partners,
activities and resources sit left of the value proposition and customers sit right.

**Why nothing covers it:** the grid has uneven cell sizes (the value proposition
spans two rows, cost and revenue span the full width), and no component holds nine
cells. `cards-grid` maxes out at 4 items, `matrix-2x2` at exactly 4, and `matrix-grid`
needs two ordered axes, which a canvas does not have.

**Proposed shape:** one `canvas` component with presets (`bmc`, `lean`,
`value-prop`), not three components. Each preset is a fixed grid template and a list
of slot names. The author writes nested `- Block` / `  - item` lists (HARD RULE #5),
and the preset places each block by name. Capacity is per block (about 3 short items)
because the cells are small at a wide size. The open design question is mobile and
portrait decks: a nine-cell grid does not fit on a phone, so the preset needs a
stacked fallback, the way `table` has its portrait card reshape.

### 3.2 Market sizing, TAM / SAM / SOM (rank 3)

**The claim:** the market we can serve sits inside the total market, and the share we
can win sits inside that. The circles NEST; they do not split one whole.

**Why nothing covers it:** `piechart` makes the wrong claim (slices of one total),
`funnel` implies a process that people drop out of, and `stats` loses the nesting.

**Proposed shape:** a chart-family member drawn on the shared chart kernel, three
(at most four) nested circles, each labeled with its name, value and one-line
definition. Two decisions to settle in the build: whether circle areas scale to the
values (honest, but SOM often renders as a dot) or use fixed steps with the values
as labels (readable, but not to scale), and whether the circles sit concentric or
share a bottom tangent (the common pitch-deck form).

### 3.3 Native `sankey` (rank 4)

**The claim:** this total splits and flows into these destinations, and the widths
show how much goes where.

**Today:** reachable only through Mermaid's `sankey-beta` in a `diagram` slide.
Dark-mode sankey is a documented limitation:
`2026-08-18-mermaid-non-text-contrast-and-levers.md` §8.5 records that the fix for
invisible dark ribbons washed the node labels below AA and was reverted.

**Prior decision:** `2026-09-06-cartesian-chart-expansion.md` §2 already calls it
"a real gap" and deferred it because its layout (node ranking, crossing minimization,
ribbon routing) shares nothing with the Cartesian kernel. That still holds: it is a
project of its own, which is why it ranks below the two cheaper components.

### 3.4 Pyramid (rank 5)

**The claim:** these tiers stack, and the base supports the top.

**Today:** `authority-chain` has a `pyramid` variant, but it is a legal component
(statute down to case), and its tiers narrow downward by legal force. `funnel` also
narrows, but it claims drop-off through a process, which a pyramid does not.

**Proposed shape:** first check whether the `authority-chain pyramid` geometry can be
lifted into a general variant (of `list-steps` or `premise`) before building a new
component. That is the cheaper path, and it keeps one pyramid drawing in the engine
(HARD RULE #15).

## 4. The plugin gap: data binding (rank 1)

**The problem:** a quarterly board deck shows the same twelve charts with new
numbers. Today an author re-types every value into the Markdown, and a transcription
error in a board deck is expensive. A search of `lib/plugins/` and the chart docs
finds no CSV, spreadsheet or Google Sheets ingest.

**Proposed shape:** a plugin that lets a chart fence name a CSV file (and a column
mapping) instead of carrying inline values, resolved at render time on the CLI and
in the desktop app. Before code, it owes a design note that answers:

- **Ingest rules.** A file read is an ingest, so it falls under
  `2026-08-04-line-endings-lf-boundaries.md` and `SANCTIONED_EOL_BOUNDARIES`.
- **The browser surfaces.** The docs-site Playground has no file system. Either the
  data travels inside the deck, or the browser shows a clear placeholder.
- **Number formatting.** Inline values already parse it: `line` and `bullet` read
  `1.2M` as 1 200 000 and carry an affix every value shares (`$`, `%`) onto the axis
  (`line.docs.md` § points, `bullet.docs.md` § rows). A CSV holds raw numbers, so the
  plugin must say where the unit and magnitude come from: a column header, or the
  fence.
- **Live sources.** Google Sheets or an API needs network access and credentials at
  render time. Recommend CSV only for v1.

## 5. Deliberately not building

`2026-09-06-cartesian-chart-expansion.md` §2 deferred `gauge`, `marimekko`,
`candlestick` and `radial bar`, with reasons that amount to rejections. This audit found nothing that changes
those calls.

## 6. Next steps

1. Docs fix for the competitive table (§2). Small, and it can ride any PR that
   touches `table`.
2. `canvas` component with the `bmc` preset first, then `lean` and `value-prop`
   (§3.1). It owes a demo deck (HARD RULE #9).
3. Market-sizing chart (§3.2). It owes a demo deck.
4. A design note for the data plugin (§4) before any code.
5. `sankey` and pyramid stay on the list. Revisit after 2–4 land.

**Order changed by the owner on 2026-10-15:** a reinsurance / broking beta comes first,
so §7's build list runs before items 2–5 here.

## 7. Insurance and reinsurance: the beta build

**Why:** the first beta tester is a VP in reinsurance and broking, with clients
worldwide. The owner chose the build list below on 2026-10-15; it runs before §6.

### 7.1 Covered, and rendered

Each row was rendered through the CLI to PDF (`node lattice.js`) and inspected:

| Insurance slide | Component | Rendered result |
|---|---|---|
| Loss development triangle | `heatmap` | blank cells draw as an unshaded, dashed "not measured" corner, so the triangle reads correctly |
| Sensitivity / tornado | `bar diverging row` | signed bars off a centered zero |
| Key risk indicators against appetite | `bullet` | measure, target tick and derived zones per row |
| Combined-ratio bridge, plan to actual | `waterfall zoom` | readable only with `zoom`; the default zero-based axis squashes a 94 → 95.5 walk into slivers |
| Bow-tie (causes → event → consequences) | `flowchart lr` | renders; a diamond marks the event |
| Capability comparison against other brokers | `table state-cells` + `_focus: col 2` | drawn marks, "Us" column ringed |
| Gross written premium trend | `line` | `$` and `B` carried onto the axis |

### 7.2 Two defects the render surfaced

- **A ratio walk colors backwards.** `waterfall` colors every increase with the pass hue
  and every decrease with the fail hue. A combined or loss ratio is lower-is-better, so a
  +4.5-point cat overrun draws green and a 2-point reserve release draws red.
  `waterfall.docs.md` offers no way to flip it. Fix: a polarity modifier (working name
  `lower-is-better`) that swaps the two hues. The same flip serves cost walks outside
  insurance.
- **A long step label is dropped.** "Prior-year release" printed as "Prior-ye…" and the
  CLI reported `CHART LABELS DROPPED` with four steps (six bars) on a wide slide. Minor; a shorter
  label avoids it.

### 7.3 Number formats for global clients (measured)

Values rendered through `lib/engine` in a `line` chart, three points each:

| Authored value | Axis ticks | Verdict |
|---|---|---|
| `$4.2M` | `$4.5M $5M $5.5M $6M` | correct |
| `€4.2M`, `£4.2M`, `¥420M` | `€4.5M …`, `£4.5M …`, `¥450M …` | correct |
| `4.2M €` (currency after the number) | none: no chart draws, the values print as text | **fails** |
| `4,2` (decimal comma) | `4.5 5 5.5 6` | parses, but the axis switches to a decimal point |
| `1.234,5` (European thousands) | `1500 2000 2500 3000 3500` | parses, but the axis prints US style |

A wider probe of the value reader (`isValuePill` and `parseValue` in
`lib/core/chart-values.js`) found more forms a global client writes that do not count as
a value, so a chart built from them does not draw:

| Authored value | Read as a value? | Number read |
|---|---|---|
| `EUR 4.2M`, `CHF 4.2M` (ISO code first) | no | 4 200 000 |
| `US$4.2M`, `R$4,2M` (multi-character symbol) | no | 4 200 000 |
| `4200€`, `4.2M EUR`, `4,2 M€` (currency after) | no | correct |
| `4 200 €` (space-grouped, currency after) | no | 4, wrong |
| `4,2 Mio. €` (German million abbreviation) | no | 42, wrong |
| `₹4.2Cr` (Indian crore) | yes | 4.2, wrong: a crore is 10 000 000 |

Currency after the number is the common form in French, German and Italian decks, and
ISO codes are the norm in reinsurance slips, so these charts silently fail to draw. The
whole-value test is Segno's `NUMERIC` grammar (`docs/src/lib/segno`), which the charts,
the narrator and every inline-code slot share, so the fix there has a wide blast radius
and owes a checker (MAKER-CHECKER). The parse and the tick formatter both
live in `lib/components/chart/_chart-family/cartesian.js` (`affixOf`, `axisFormatter`).

### 7.4 The decided build, in order

Ordered by how much each one unblocks: the number-format fix touches every chart, and
the tower is on almost every reinsurance renewal deck.

1. **Global number formats** (§7.3), in the shared chart kernel, plus the `waterfall`
   polarity flip (§7.2) if the owner agrees to add it.
2. **Reinsurance tower.** Layers stacked by attachment point and limit
   (`$10M xs $5M`), each layer split by reinsurer share. `stacked-bar` can fake a
   layer's limit as a segment height, but not the attachment notation or the shares.
3. **Risk matrix.** 5 × 5 likelihood × impact, cells shaded by a severity rule, risk IDs
   placed in the cells. `heatmap` shades by number but cannot place names; `matrix-grid`
   places labels but shades by row category; `quadrant` splits only 2 × 2.
4. **Histogram and log axis.** Loss distributions, and exceedance-probability curves
   whose return periods (1-in-10 to 1-in-250) need a log scale. `line.docs.md` documents
   no log axis.

Each new component owes a demo deck (HARD RULE #9) and a design pass before code.

**Caveat:** §2 rows were checked by rendering the SWOT (`matrix-2x2`), service tiers
(`pricing`), cap table (`stacked-bar`), pipeline (`funnel`) and case study (`columns`
with `quote` and `big-number` panes) to PDF, plus the competitive table in §7.1. All
render as described. The rest of §2 rests on each component's docs. Every render used
the `indaco` theme in light mode at the default wide size.
