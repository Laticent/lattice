---
status: proposed
summary: An audit of the catalog against pitch, sales, board and marketing decks. Most business slides already have a component; four do not (a canvas grid, market-sizing circles, a native sankey, a pyramid), and the larger gap is a plugin, since every chart number is still typed by hand. Ranks them and recommends canvas and market sizing first.
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

**Recommendation:** build canvas (2) and market sizing (3) first. They are the most
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
| Competitive feature table with "us" highlighted | `table` with `[x]` / `[-]` / `[!]` cell markers and `<!-- _focus: col 2 -->` (`lib/base/base.docs.md` § State markers, § Focus & highlighting) |
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
`table.docs.md` § When to use, plus a gallery slide, closes it. That needs no new
component.

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
- **Number formatting.** Business charts need `$4.2M`, `12%` and `1.3×` on axes and
  labels. Whether the chart kernel formats these today is unchecked; the note should
  measure it first.
- **Live sources.** Google Sheets or an API needs network access and credentials at
  render time. Recommend CSV only for v1.

## 5. Deliberately not building

`2026-09-06-cartesian-chart-expansion.md` §2 already rejected `gauge`, `marimekko`,
`candlestick` and `radial bar`, with reasons. This audit found nothing that changes
those calls.

## 6. Next steps

1. Docs fix for the competitive table (§2). Small, and it can ride any PR that
   touches `table`.
2. `canvas` component with the `bmc` preset first, then `lean` and `value-prop`
   (§3.1). It owes a demo deck (HARD RULE #9).
3. Market-sizing chart (§3.2). It owes a demo deck.
4. A design note for the data plugin (§4) before any code.
5. `sankey` and pyramid stay on the list. Revisit after 2–4 land.

**Caveat:** this audit reads the catalog, the docs and the plugin README. It renders
nothing, so "covered" in §2 means a component's docs claim the shape. A slide-level
check of each row (for example, a SWOT with five items per quadrant) is UNVERIFIED.
