---
status: proposed
summary: At every venue a deck sets its reading text (list rows, card bodies, table cells, glossary, code) at four different sizes, because each component picks its own role (`--fs-body-compact`, `--fs-body`, `--fs-message`, or `--fs-meta`), and a venue scales every role by the same factor. `npm run audit:reading-size` measures it. At laptop, 13 components read at 13.5pt, 30 at 16pt, 7 at 21pt and 3 at the 11.25pt chrome size (bare samples). At hall, a table cell (20.2pt) is smaller than its own label (21.9pt). Four options are costed by re-measured venue budgets. The recommendation is one reading size, `--fs-body` (16 / 18.5 / 20.9 / 24.1pt), with display text and charts as named exceptions. It costs 4% of the summed laptop budget and 15% of the summed huddle budget across the 16 components that move. The owner's choice is recorded in §7.
builds-on: 2026-09-25-font-scale-fit.md
---

# One reading size per venue

**Status:** proposed, waiting on the owner's pick (§7) · **Owner:** Sharmarke · **Code:**
`tools/audit-reading-size.js` (the audit); after the pick, the component stylesheets named in §6

## 1 · The answer

The venue already sets one type step for the whole deck (`typography.md` §7). But the
step multiplies every role by the same factor, so it keeps each component's choice of
role. That choice differs: a `list` row reads at `--fs-message`, a card body at
`--fs-body`, and a `list-tabular` row or a table cell at `--fs-body-compact`. One deck at
one venue therefore shows reading text at three sizes. The talk from #2361, rendered at
`venue: laptop`, shows `list takeaway` rows at 21pt, card bodies at 16pt and
`list-tabular` rows and tables at 13.5pt.

**Recommendation: option A.** All reading text uses one role, `--fs-body`. That is
16pt at laptop, 18.5 at huddle, 20.9 at conference and 24.1 at hall. Text that is bigger
on purpose (display text, §4) and text inside a chart's SVG keep their own sizes as named
exceptions. Lists and agendas get smaller and hold more items. Tables, glossaries and
tabular lists get bigger and hold fewer. Across the 16 components that change, the summed
budget falls 4% at laptop, 15% at huddle, 6% at conference and 7% at hall (§5).

## 2 · What the audit measures

`npm run audit:reading-size` (`tools/audit-reading-size.js`) renders every component's
manifest `sample` through the emulator, bare and once per declared variant, at each of the
four venues (a per-slide `venue-*` class). In Chromium it walks every visible text node and
sums the characters by computed font-size. It leaves out the text that is not reading text
by construction:

- the slide title (`h1`/`h2`) and the eyebrow;
- the running header and footer;
- a Key Insight or below-note coda;
- screen-reader-only labels;
- text inside an SVG (a chart's labels scale with its viewBox, not with a role).

It renders a probe for each `--fs-*` role on the same slide and matches each size to its
role. `--fs-meta` is the chrome role (labels, pills, captions), so the **reading size** is
the size that carries the most characters at any other role. A slide whose only visible
text sits at meta is flagged `META-ONLY`.

The run covers 71 components and 275 component-and-variant rows per venue. The 10 charts
that draw all their text in SVG report no reading size, which is correct, and they are
exception E2 below.

## 3 · What it found (main, 2026-09-29)

### 3.1 · Four reading sizes at every venue

Rows are component-and-variant pairs; hero components (§4) are left out.

| Role | laptop | huddle | conference | hall | Rows |
|---|---|---|---|---|---|
| `--fs-meta` (chrome, flagged `META-ONLY`) | 11.3pt | 12.9 | 16.8 | 21.9 | 8 |
| `--fs-body-compact` | 13.4 | 15.5 | 17.5 | 20.2 | 47 |
| `--fs-body` | 16.0 | 18.5 | 20.9 | 24.1 | 124 |
| `--fs-message` | 21.0 | 24.2 | 27.3 | 31.5 | 39 |
| `--fs-h3` · `--fs-h2` · `--fs-emphasis` | 23 · 28 · 30 | … | … | … | 5 |

(pt at the 1280×720 slide the emulator renders, the unit `typography.md`'s tables use.)

### 3.2 · Which component reads at which role (laptop, bare sample unless named)

- **`--fs-message` (21pt):** agenda, list (every variant but `principles`), q-and-a,
  policy-recommendation, stats, scene, video, `image gallery`, `image statement`,
  `list-steps ghost`.
- **`--fs-body` (16pt):** authority-chain, cards-grid, cards-stack, checklist,
  citation-card, compare-prose, content, cycle, decision, gantt, heatmap, image,
  inventory, kpi, line, list-steps, math, matrix-2x2, matrix-grid, piechart, progress,
  quadrant, redline, regulatory-update, scatter, split-compare, split-panel, state-chart,
  statute-stack, timeline-list.
- **`--fs-body-compact` (13.5pt):** actors, code, contact, flowchart, glossary, journey,
  list-tabular, obligation-matrix, pricing, roadmap, table, team-profile, verdict-grid,
  `inventory timeline`, `roadmap horizons`, `team-profile bench`, **and every plain
  markdown table** (the base layer's universal table treatment).
- **`--fs-meta`, the chrome size (11.25pt):** `compare-code` (its code), `kanban`
  (its cards), `logo-wall` (labels only; it has no reading text).
- **Bigger roles on purpose:** `list principles` and `q-and-a solo` (`--fs-emphasis`),
  `citation-card pull-quote` and `wifi` (`--fs-h3`), `citation-card margin` (`--fs-h2`).

### 3.3 · Three defects the audit surfaced along the way

1. **At `hall`, a table cell is smaller than its own label.** The label lift raises meta
   1.3x on top of the 1.5x step, so meta lands at 21.9pt and a table cell at 20.2pt. A
   column header and a pill read bigger than the data they label. Option A removes it,
   because cells move to body (24.1pt). Options B and "keep today" leave it as is.
2. **`compare-code` sets its code at the chrome size** (`--fs-meta`, 11.25pt), one step
   below `code` (13.5pt). Two code panes side by side read smaller than one.
3. **`citation-card margin` sets its quotation in `--fs-h2`.** `--fs-h2` is deliberately
   exempt from the venue step (`typography.md` §7, "`--fs-h1` and `--fs-h2` are exempt"),
   so this text stays 28pt at every venue while everything around it grows.

## 4 · Reading text and display text

The rule covers **reading text**: text an audience reads line by line, several items to
a slide. Display text is bigger on purpose: the slide *is* the sentence or the number,
there is one per slide, and it is not read as a list. The proposal names every exception:

- **E1 · Display components.** big-number, closing, divider, quote, title, topic. Their
  sentence or number is the slide.
- **E2 · Display registers of reading components.** `list principles`, `q-and-a solo`,
  `quote bare`, `topic fact`, `citation-card pull-quote`, `citation-card margin`,
  `image statement`. The author picks them to make one statement big, and the variant
  exists for that purpose.
- **E3 · One lead statement per slide.** The `split-panel` claim, the `premise` lead, and
  the caption of `scene` and `video`. Each is a single sentence that frames the slide, the
  same job `--fs-emphasis` does for a Key Insight.
- **E4 · Text a chart draws in SVG.** A chart scales its marks and labels to its box, so no
  role sets that text. It is out of scope, and the audit already leaves it out.
- **E5 · Chrome.** `--fs-meta` labels, pills, column headers and captions. The `kanban`
  card and the `logo-wall` label are chrome-sized boards, and the kanban column holds 12
  cards at laptop only because each card is a label, not a paragraph.
- **Question for the owner: code.** Code is reading text, but it has a *column* budget as
  well as a line budget: a line of code cannot wrap without changing what it says. §5.2
  measures both choices.

## 5 · The options, costed

Every number below is a budget measured the way the committed `venueCapacity` numbers are.
`tools/calibrate-capacity.js <c> --family wide --words <authored length> --max 20
[--scale l|xl|2xl]` at each option. For each option, the type scale
(`lib/typography/scale.js`) was patched, the CSS rebuilt, the 16 components measured, and
the patch reverted. The baseline column reproduces the committed manifests.

- **A · one size, `--fs-body` (16pt at laptop).** `--fs-message` and `--fs-body-compact`
  reading text move to `--fs-body`.
- **B · two sizes: `--fs-body`, plus `--fs-body-compact` for dense reference cells.** Only
  the `--fs-message` readers move. Tables, glossaries, tabular lists and the other
  compact readers keep 13.5pt as a standing exception.
- **C · one new middle size, 18pt at laptop (1.875cqi).** Every reading role moves to it,
  so card bodies grow too.
- **D · one size at `--fs-message` (21pt at laptop).** Every reading role moves up to
  today's list size.

### 5.1 · Item budgets (laptop / huddle / conference / hall)

| Component (words per item) | Reads at today | Today | A · 16pt | C · 18pt | D · 21pt |
|---|---|---|---|---|---|
| agenda (10) | message | 6 / 5 / 3 / 2 | 7 / 6 / 6 / 5 | 6 / 6 / 5 / 3 | 6 / 5 / 3 / 2 |
| list (14) | message | 3 / 3 / 3 / 2 | 7 / 6 / 3 / 3 | 6 / 3 / 3 / 3 | 3 / 3 / 3 / 2 |
| q-and-a (12) | message | 4 / 3 / 3 / 3 | 4 / 4 / 4 / 3 | 4 / 4 / 3 / 2 | 3 / 3 / 2 / 2 |
| policy-recommendation (20) | message | 3 / 3 / 2 / 2 | 3 / 3 / 2 / 2 | 3 / 3 / 2 / 2 | 2 / 2 / 1 / 1 |
| list-tabular (12) | compact | 7 / 6 / 6 / 5 | 6 / 6 / 5 / 3 | 6 / 5 / 3 / 3 | 5 / 3 / 3 / 2 |
| table (12) | compact | 11 / 10 / 9 / 7 | 10 / 8 / 7 / 3 | 9 / 8 / 3 / 3 | 8 / 3 / 3 / 2 |
| glossary (16) | compact | 10 / 9 / 4 / 3 | 9 / 4 / 3 / 3 | 4 / 4 / 3 / 3 | 4 / 3 / 3 / 1 |
| actors (12) | compact | 8 / 7 / 3 / 3 | 7 / 6 / 3 / 3 | 6 / 5 / 3 / 2 | 5 / 3 / 2 / 1 |
| pricing (12) | compact | 3 / 3 / 3 / 3 | 3 / 3 / 3 / 3 | 3 / 3 / 3 / 3 | 3 / 3 / 3 / 3 |
| team-profile (12) | compact | 6 / 3 / 3 / 3 | 3 / 3 / 3 / 3 | 3 / 3 / 3 / 3 | 3 / 3 / 3 / 0 |
| verdict-grid (12) | compact | 6 / 5 / 4 / 4 | 5 / 4 / 4 / 4 | 4 / 4 / 4 / 2 | 4 / 4 / 2 / 2 |
| obligation-matrix (2) | compact | 7 / 6 / 5 / 5 | 6 / 6 / 5 / 4 | 6 / 5 / 4 / 4 | 5 / 5 / 4 / 3 |
| roadmap (12) | compact | 20 / 20 / 10 / 6 | 20 / 10 / 6 / 5 | 10 / 9 / 5 / 5 | 9 / 5 / 4 / 3 |
| cards-grid (15) | body | 5 / 4 / 3 / 2 | 5 / 4 / 3 / 2 | 4 / 3 / 2 / 2 | 3 / 2 / 2 / 2 |
| compare-prose (20) | body | 5 / 4 / 3 / 3 | 5 / 4 / 3 / 3 | 4 / 3 / 3 / 2 | 3 / 3 / 2 / 1 |
| list-steps (14) | body | 5 / 4 / 4 / 3 | 5 / 4 / 4 / 3 | 4 / 4 / 3 / 2 | 4 / 3 / 2 / 2 |
| **Sum of all 16** | | **109 / 95 / 68 / 56** | **105 / 81 / 64 / 52** | **82 / 72 / 52 / 44** | **70 / 53 / 42 / 29** |

Option B is today's column with the four `message` rows taken from A: **114 / 100 / 72 /
60**. It gains budget at every venue, but it keeps two reading sizes per venue and the hall
defect (§3.3.1).

The roadmap's `20` is the measuring cap. Its manifest caps it at 12.

What the table says:

- **A** is roughly budget-neutral: −4% / −15% / −6% / −7%. Lists and agendas more than
  double at laptop and huddle. Tables pay: 11 → 10 rows at laptop, 10 → 8 at huddle, and
  7 → 3 at hall (a 12-word cell wraps to a second line at that size). Glossary at huddle
  drops 9 → 4 for the same reason.
- **C** costs every component, including the 31 that read at body today and are fine.
  The sum falls 25% at laptop.
- **D** makes the whole deck list-sized. The sum falls 36% at laptop and 48% at hall, and
  team-profile cannot hold one row at hall.

### 5.2 · Code (lines / columns in the pane)

| | laptop | huddle | conference | hall |
|---|---|---|---|---|
| `code` today (`--fs-body-compact`) | 15 lines | 13 | 11 | 10 |
| `code` at `--fs-body` | 12 | 11 | 9 | 8 |
| `compare-code` today (`--fs-meta`) | 20 | 17 | 13 | 10 |
| `compare-code` at `--fs-body-compact` | 17 | 14 | 13 | 11 |
| `compare-code` at `--fs-body` | 14 | 12 | 10 | 9 |

Columns follow the size: the pane holds `floor(102 / s)` columns at `--fs-body-compact`
(`typography.md` §7), which becomes about 86 at `--fs-body`. A 100-column line that fits
today would wrap. The recommendation is to keep code one step down, at
`--fs-body-compact`, as a named exception, and to raise `compare-code` to it (defect
§3.3.2). That keeps the code column budget and makes both code components agree.

## 6 · What step 3 changes, if A is picked

- **Reading roles to `--fs-body`.** `list` (`--list-row-fs`), `agenda`, `q-and-a`,
  `policy-recommendation`, `stats` (its caption), `list-steps ghost`, `image gallery`.
  From `--fs-body-compact`: the base layer's universal table, `table`, `list-tabular`,
  `glossary`, `actors`, `pricing`, `team-profile`, `verdict-grid`, `obligation-matrix`,
  `roadmap`, `journey`, `flowchart`'s HTML labels, `contact`, and the compact variants in §3.2.
- **Kept, with the reason in the stylesheet:** E1–E5 and code (§5.2).
- **`--fs-body-compact` stays a token.** Code keeps it, and so do chrome that must sit
  between meta and body. It stops being the dense-cell reading role. `typography.md` §1.1
  rewrites that role line.
- **Re-measure and re-state the budgets.** `calibrate-capacity` for every component whose
  role moved. Then the manifests' `venueCapacity`, each `.docs.md` "By venue" line,
  `dist/docs/components.pick.md`, and `lib/authoring/venue-capacity.generated.js` for
  `lint:deck`.
- **A gate so it stays true.** Re-run `audit:reading-size` and show one reading value per
  venue apart from the named exceptions. Whether it becomes a CI step is a separate owner
  call (CLAUDE.md second filter, row 2). Until then it is on-demand.

## 7 · Owner decision

*Pending.* Put to the owner in one `AskUserQuestion` round on 2026-09-29: which option
(A / B / C / D), whether code keeps its step-down exception, and whether the E3 lead
statements stay display-sized.
