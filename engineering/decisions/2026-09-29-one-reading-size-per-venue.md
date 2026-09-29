---
status: shipped
summary: At every venue a deck sets its reading text (list rows, card bodies, table cells, glossary, code) at four different sizes, because each component picks its own role (`--fs-body-compact`, `--fs-body`, `--fs-message`, or `--fs-meta`), and a venue scales every role by the same factor. `npm run audit:reading-size` measures it. At laptop, 13 components read at 13.5pt, 30 at 16pt, 7 at 21pt and 3 at the 11.25pt chrome size (bare samples). At hall, a table cell (20.2pt) is smaller than its own label (21.9pt). Four options are costed by re-measured venue budgets. The recommendation is one reading size, `--fs-body` (16 / 18.5 / 20.9 / 24.1pt), with display text and charts as named exceptions. It costs 4% of the summed laptop budget and 15% of the summed huddle budget across the 16 components that move. The owner picked A on 2026-09-29, with code kept at `--fs-body-compact` and lead sentences kept display-sized (§7).
builds-on: 2026-09-25-font-scale-fit.md
---

# One reading size per venue

**Status:** accepted 2026-09-29 (option A, §7) and shipped (§6) · **Owner:** Sharmarke · **Code:**
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
exception E4 below.

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
there is one per slide, and it is not read as a list. Every exception is named here and in
`EXCEPTIONS` / `HERO` in `tools/audit-reading-size.js`, which lists them apart so each
venue's reading line holds one value:

- **E1 · Display components.** big-number, closing, divider, quote, stats, title, topic.
  Their sentence or number is the slide. (`stats` reads as its `--fs-h1` numbers, with
  chrome-sized labels.)
- **E2 · Display registers of reading components.** `list principles`,
  `list-steps ghost` (documented as "hero body"), `q-and-a solo`, `quote bare`,
  `topic fact`, `citation-card pull-quote`, `citation-card margin`, `image statement`. The
  author picks them to make one statement big, and the variant exists for that purpose.
- **E3 · One lead statement per slide.** The `split-panel` claim, the `premise` lead,
  policy-recommendation's impact line and quote, inventory's callout band and pull line,
  and the caption of `scene` and `video`. Each is a single sentence that frames the slide,
  the same job `--fs-emphasis` does for a Key Insight. (Owner ruling: stay display-sized.)
- **E4 · Text a chart draws.** SVG labels scale with the chart's box, so no role sets
  them, and the audit leaves them out. The HTML keys and legends of `flowchart`,
  `journey`, `state-chart` and `roadmap` are chart chrome and stay at
  `--fs-body-compact`.
- **E5 · Label boards.** `kanban`, `logo-wall` and `obligation-matrix`. Their words are
  labels (a card title, a logo name, a regime name over status marks), not prose.
  Obligation-matrix first moved to body with everything else. That cost a row and clipped
  six gallery pages, and its cells hold no prose, so it went back (§6).
- **E6 · Fixed cards.** `contact` and `wifi`: a fixed set of fields around a QR code.
- **Code** (owner ruling). `code` and `compare-code` read at `--fs-body-compact`, because a
  line of code cannot wrap without changing what it says (§5.2).
- **E7 · Support lines** (owner ruling, 2026-09-29). A line that supports the row above it
  reads one step below the row, at `--fs-body-compact`: a `list` item's detail line,
  `content`'s nested sub-bullets, and split-panel `proof` / `capstone` supporting lines. The
  step keeps a visible main-versus-support hierarchy. A second column of a row (a
  list-tabular gloss, a table cell) is not a support line and reads at `--fs-body`.

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

## 6 · What shipped (step 3)

- **Reading roles moved to `--fs-body`.** From `--fs-message`: `list` rows
  (`--list-row-fs`; the detail line under a row stays one step down, E7), `agenda` rows and the circle counter, `q-and-a`
  questions (and the `01` index, which keeps its 0.8 ratio to the question),
  `policy-recommendation` rows, and `image gallery` captions. From
  `--fs-body-compact`: the base layer's universal table (every plain markdown table),
  `list-tabular` (every look but the `metric` pill), `glossary`, `actors`, `verdict-grid`,
  `pricing` features, `team-profile` notes and `bench` names, `roadmap` rows,
  `matrix-2x2` quadrant lines, `inventory timeline` items, and the `premise` ladder.
- **`compare-code`** moved from `--fs-meta` up to `--fs-body-compact`, the same size as
  `code`.
- **Kept:** E1–E6 and code (§4). Labels that sit beside reading text keep their role:
  agenda's page reference, the table `split-cards` field label, the pricing tier name and
  inventory's editorial titles.
- **`--fs-body-compact` stays a token.** Code and chart keys use it. It is no longer a
  reading role, and `typography.md` §1.1 and §7 ("One reading size") say so.
- **Markers follow their row.** A counter or dot sized off its row's role moved with it:
  agenda's circle, list-tabular's `::before` ordinal, inventory's timeline dot, and
  q-and-a's `01` index (0.8 of the question, floored at the label role so a venue's label
  lift never puts it under a pill).
- **Budgets re-measured** with `calibrate-capacity` for every component whose role moved.
  That covers its `byWords` rows, `list`'s `takeaway` and callout rows, `q-and-a compact`
  and `compare-code`'s line budget. They are written to the manifests' `venueCapacity`
  and flow into the "By venue" lines, `components.pick.md` and `lint:deck`. Pane budgets
  too (`calibrate-capacity --pane`): glossary side 12 → 5 and stacked 4 → 3, list-tabular
  side 7 → 6. `compare-code`'s column budget in `lint-core.js` is 47 (was 57). The §5.1
  table is the option simulation (the type scale patched); the numbers that shipped are
  the manifests'.
- **One regression found and fixed before shipping.** Six people no longer fit on a
  `team-profile` slide (a 17px overrun) once each note read at body. The portrait went
  from 7 to 6.25cqi, the row gap from `--sp-lg` to `--sp-md`, and `bench`'s from `--sp-sm`
  to `--sp-xs`. Spacing may change under the one-size rule, and a type role may not. The
  re-measured laptop budget is back to `main`'s.
- **The check.** `npm run audit:reading-size` prints one value per venue for all 185
  reading rows (221 rows minus 36 SVG-only charts): 16 / 18.5 / 20.9 / 24.1pt. Its SECOND
  SIZES section lists any other non-chrome size carrying more than 10% of a reading slide's
  text, so a size the dominant one hides still shows: today card and ledger titles at
  heading roles, the E3 lead lines, chart legends, and split-panel `proof` / `capstone`
  supporting lines (§7). Whether it becomes a CI step is a separate owner
  call (CLAUDE.md second filter, row 2). Until then it is on-demand.

### 6.1 · What it costs, measured

- The #2361 talk at `venue: laptop` renders with an empty OVERFLOW line. At `huddle` it
  clipped nothing before and clips two `list-tabular` slides now (5 rows, one name wrapping
  to two lines). `lint:deck` does not warn on them, because its budget assumes one-line
  names. That accuracy gap is already tracked in
  `followups.d/2361-p2-venue-lint-accuracy-on-real-decks.md`.
- All 71 component galleries render with no clipped page (checked page by page against
  `main` with the emulator's overflow report).

### 6.2 · Found along the way, not caused by this change

- `kanban`'s and `timeline-list`'s committed `venueCapacity` do not reproduce with
  `calibrate-capacity --max 20`, on `main` as on this branch (kanban at huddle: committed 4,
  measured 20). They were left untouched.
- `team-profile`, `pricing` and `inventory` declare a `capacity.hard` above their measured
  laptop ceiling, on `main` as on this branch. The per-venue numbers are correct; the
  editorial `capacity` blocks are stale.

## 7 · Owner decision

Asked on 2026-09-29. All three answered.

- **Code:** keep code one step down at `--fs-body-compact`, and raise `compare-code` to
  it (§5.2). Tracked in `followups.d/2361-p2-compare-code-code-at-chrome-size.md`.
- **One-per-slide lead sentences (E3):** stay display-sized.
- **Support lines (E7):** stay one step below their row (asked after the review surfaced
  them; the list detail line, which this change had moved to body, went back).
- **The shared reading size (§5):** option A, `--fs-body` (16 / 18.5 / 20.9 / 24.1pt).

Resolved by this change: the P1 item, the hall defect (§3.3.1, cells now read above their
labels at every venue) and compare-code (§3.3.2). Their follow-up files are deleted.
Still open: `followups.d/2361-p3-citation-card-margin-ignores-venue.md` (§3.3.3) and
`followups.d/2361-p3-stale-venue-and-capacity-budgets.md` and `2378-p3-capacity-hard-above-measured.md` (§6.2), `2361-p2-guard-the-reading-role.md`, `2361-p2-laptop-lint-for-list-tabular-and-glossary.md` and `2361-p3-authority-chain-branching-at-chrome-size.md` (from the review).
