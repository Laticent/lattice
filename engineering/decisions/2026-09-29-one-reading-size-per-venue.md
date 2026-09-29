---
status: shipped
summary: At every venue a deck sets its reading text (list rows, card bodies, table cells, glossary, code) at four different sizes, because each component picks its own role (`--fs-body-compact`, `--fs-body`, `--fs-message`, or `--fs-meta`), and a venue scales every role by the same factor. `npm run audit:reading-size` measures it. At laptop, 13 components read at 13.5pt, 30 at 16pt, 7 at 21pt and 3 at the 11.25pt chrome size (bare samples). At hall, a table cell (20.2pt) is smaller than its own label (21.9pt). Four options are costed by re-measured venue budgets. The recommendation is one reading size, `--fs-body` (16 / 18.4 / 20.8 / 24.0pt), with display text and charts as named exceptions. It costs 4% of the summed laptop budget and 15% of the summed huddle budget across the 16 components that move. The owner picked A on 2026-09-29, with code kept at `--fs-body-compact` and lead sentences kept display-sized (§7).
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
16pt at laptop, 18.4 at huddle, 20.8 at conference and 24.0 at hall. Text that is bigger
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
| `--fs-body` | 16.0 | 18.4 | 20.8 | 24.0 | 124 |
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
   because cells move to body (24.0pt). Options B and "keep today" leave it as is.
2. **`compare-code` sets its code at the chrome size** (`--fs-meta`, 11.25pt), one step
   below `code` (13.5pt). Two code panes side by side read smaller than one.
3. **`citation-card margin` sets its quotation in `--fs-h2`.** `--fs-h2` is deliberately
   exempt from the venue step (`typography.md` §7, "`--fs-h1` and `--fs-h2` are exempt"),
   so this text stays 28pt at every venue while everything around it grows.

## 4 · Reading text and display text

The rule covers **reading text**: text an audience reads line by line, several items to
a slide. Display text is bigger on purpose: the slide *is* the sentence or the number,
there is one per slide, and it is not read as a list. Every exception is named here. In the
code, `SANCTIONED_READING_ROLE` in `tools/check-ownership.js` is the list of record: it
names, per stylesheet, each use of a smaller role and the exception it falls under, and
`build:check` fails on an unnamed use (§9). `EXCEPTIONS` / `HERO` in
`tools/audit-reading-size.js` sort the audit's report by the same classes:

- **E1 · Display components.** big-number, closing, divider, kpi, quote, stats, title, topic.
  Their sentence or number is the slide. (`stats` and `kpi` read as their big numbers, with
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
  `content`'s nested sub-bullets, split-panel `proof` / `capstone` supporting lines, and a
  `timeline-list` milestone's description under its title (§9). The
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
  reading rows (221 rows minus 36 SVG-only charts): 16 / 18.4 / 20.8 / 24.0pt. Its SECOND
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
- Every committed deck was rendered on this branch and on `main` with the emulator's
  overflow report: 71 component galleries and 302 decks (examples, exemplars, baseline
  decks). Six came out clipping where `main` did not, and each was fixed here:
  - the `pricing` and `list-tabular` ceiling specimens now show what fits (5 features,
    6 rows);
  - `system-design-foundations` had five slides with long table cells and glosses, now
    tightened;
  - its generated glossary now pages itself, which was an engine fix: `glossary: auto`
    never paginated;
  - the baseline gallery's two glossary slides and one gloss were trimmed, keeping its
    116 pages;
  - `inline-pills` merges its seventh row into its first;
  - `debug` has a shorter lead, with the dropped option moved to the footer.
  The pages still clipping (`list` gallery page 9, `overflow-fix-me`,
  `retire-automatic-scale-fit`, `marker-corner`) clip identically on `main`. A first pass
  of this check missed single-page clips, because its pattern matched only "pages"; the
  review caught it, and the numbers above come from the corrected pass.

### 6.2 · Found along the way, not caused by this change

- `kanban`'s and `timeline-list`'s committed `venueCapacity` do not reproduce with
  `calibrate-capacity --max 20`, on `main` as on this branch (kanban at huddle: committed 4,
  measured 20). Resolved in §9.
- `team-profile`, `pricing` and `inventory` declare a `capacity.hard` above their measured
  laptop ceiling, on `main` as on this branch. Resolved in §9.

## 7 · Owner decision

Asked on 2026-09-29. All three answered.

- **Code:** keep code one step down at `--fs-body-compact`, and raise `compare-code` to
  it (§5.2). Tracked in `followups.d/2361-p2-compare-code-code-at-chrome-size.md`.
- **One-per-slide lead sentences (E3):** stay display-sized.
- **Support lines (E7):** stay one step below their row (asked after the review surfaced
  them; the list detail line, which this change had moved to body, went back).
- **The shared reading size (§5):** option A, `--fs-body` (16 / 18.4 / 20.8 / 24.0pt).

Resolved by this change: the P1 item, the hall defect (§3.3.1, cells now read above their
labels at every venue) and compare-code (§3.3.2). Their follow-up files are deleted.
The items this left open (§3.3.3, §6.2 and three from the review) are resolved in §9, and
their follow-up files are deleted.

## 8 · Amendment 2026-09-29 — the whole ladder, per venue

With one reading size in place, the owner asked what the full type ladder looks like per
venue. Measured from a render, it had four problems. The owner ruled on each: "fix them all
here".

1. **The reading sizes above laptop were double-rounded.** The audit rounded to 0.1px, then
   to 0.1pt. The true values are **16.0 / 18.4 / 20.8 / 24.0pt**, not 18.5 / 20.9 / 24.1. The
   audit now rounds once, and every doc carries the true values.
2. **Display text outranked the slide title at conference and hall.** `h1` and `h2` held
   48 / 28pt while every other role scaled, so at hall a 34.5pt `h3`, 31.5pt lead lines and
   a 45pt Key Insight sat over a 28pt title. Three options were put to the owner:
   - cap display text under the title (no extra wraps);
   - let titles scale;
   - leave it.

   **Ruling: titles scale.** `NO_FS_SCALE` is empty, and every role multiplies by the
   venue step. Measured cost on the #2361 talk at hall: titles wrapping to two lines went
   from 5 to 58 of 83, and clipped pages from 49 to 54.
3. **At hall, labels read bigger than code and support lines.** The label lift put labels at
   21.9pt, above code and support lines at 20.2pt. **Ruling: lift code and support too.**
   `--venue-compact-lift` scales the body-compact role: 1.15 at conference, the label lift.
   At hall it is 1.14, not the label's 1.3, because 1.3 would put code at 26.2pt, above
   24.0pt body text. 1.14 is the most that stays below body.
4. **`h6` did not take the label lift** it is tied to. It does now.

The ladder that shipped, measured (pt at the 1280×720 slide):

| Role | laptop | huddle | conference | hall |
|---|---|---|---|---|
| hero | 86.0 | 98.9 | 111.8 | 129.0 |
| h1 | 48.0 | 55.2 | 62.4 | 72.0 |
| emphasis | 30.0 | 34.5 | 39.0 | 45.0 |
| h2 (title) | 28.0 | 32.2 | 36.4 | 42.0 |
| h3 | 23.0 | 26.4 | 29.9 | 34.5 |
| message / h4 | 21.0 | 24.2 | 27.3 | 31.5 |
| **body / h5** | **16.0** | **18.4** | **20.8** | **24.0** |
| body-compact | 13.4 | 15.5 | 20.1 | 23.0 |
| meta / h6 | 11.2 | 12.9 | 16.8 | 21.9 |

**What it cost, re-measured.** Laptop is unchanged. Every budget above laptop was
re-measured with `calibrate-capacity` at the venue: 37 of 82 rows changed, almost all down
by one, because bigger titles take stage height. The code pane (bare) holds 15 / 12 / 9 / 8
lines (was 15 / 13 / 11 / 10), and its columns shrink by the code lift too (`CODE_LIFT` in
lint-core). The split-panel line geometry now scales its heading row. kanban and
timeline-list were left as before (§6.2).

**Decks.** Only five committed decks set a venue or a scale step. One new clip,
`retire-automatic-scale-fit` page 4, was fixed by trimming its step text. Its page 3 clips
on purpose, as on `main`.

## 9 · Amendment 2026-09-29 — nothing left open

The owner asked for no jank, no broken windows and no tech debt, so every follow-up this
change had logged was done here, and each fix found more.

1. **A static guard.** `checkReadingRole` in `tools/check-ownership.js` (run by
   `build:check`) counts each stylesheet's uses of `--fs-message` and `--fs-body-compact`
   against `SANCTIONED_READING_ROLE`, which names the exception each use falls under (§4). It
   fails both ways, on an unsanctioned use and on a stale sanction. Writing its allowlist found
   reading text the audit had missed, because the audit sweeps only the wide family and the
   default finish: portrait `decision` and `compare-prose` (`--fs-message`), portrait `roadmap
   horizons` (`--fs-meta`), `video` captions, and the `sketch` finish's split-panel
   (`--fs-body-compact`). All read at `--fs-body` now. Each was rendered at its family or
   finish, and clips no more than it does on `main`. The sketch finish's own `list` rule
   stepped rows from `--fs-message` down to `--fs-body`. Plain rows are at body now anyway, but
   the rule also beat `list principles`, a display register (E2), and set its declarations at
   body beside display-size numerals. It is gone: under sketch, principles reads at its display
   size and the list gallery clips the same pages as on `main` (rendered).
2. **Reading text at the chrome size.** The audit takes the reading size to be the biggest
   share of text at any role but `--fs-meta`, so text SET at meta never showed. It now lists
   slides with most of their text at meta (MOSTLY AT THE CHROME SIZE). That list found
   `list-steps timeline` (step text at meta in fixed 14cqi columns, wrapping a word a line at
   hall) and `timeline-list` (descriptions at meta under a fixed 220px measure, so one 16-word
   milestone clipped at conference and hall). The first reads at `--fs-body` in equal
   columns; the second's description is a support line at `--fs-body-compact` (E7), with its
   measure in `em`. `authority-chain branching`'s branch lines, the follow-up this started
   from, read at `--fs-body` too, and its branch boxes no longer run past the row's border.
   The rest of the list is chrome by design: chart keys, label boards, fixed cards, `kpi`
   (now named with `stats` as a display component), `state-chart` (chart text),
   `statute-stack`'s citation columns and `team-profile bench`'s role labels.
3. **Laptop lint** (`LAPTOP_JUDGED` in lint-core) for `list-tabular` and `glossary`, which
   have no `capacity` block, and for `premise` and `timeline-list`, whose laptop rows sit
   below `hard`. Each row was checked against a render (it fits, and one more clips). Only on
   a 16:9 deck, the stage the rows were measured on. `compare-prose` is left out: its measured
   rows are the rig's shape, and a two-side slide they count as over renders whole. Every
   committed deck lints the same before and after.
4. **The rig read only one of the engine's two clip lines.** A kanban lane clips inside its
   own box, which the engine reports as CONTENT CLIPPED, so kanban's laptop row was stored as
   "at least 12" and its hall row one too high. `parseProbeLog` now returns box clips apart,
   and `countClipped` counts them once they start with the element count. A box clip already
   on page 1 is an ellipsis, the same at any count, and is left out. Only `calibrate-capacity`
   reads box clips this way (`renderProbe`'s `countBox`): `calibrate-density` grows words and
   `check-jank` reads its own axis, and both behave as before. Re-measuring every stored
   row with it moved only kanban, timeline-list (whose CSS changed) and premise.
5. **A regression this change had caused.** At hall, the scaled title widened premise's claim
   rail, and the ledger's `nowrap` rows cut their term to "Clear con…" and ran the framing
   question past the card. Rows wrap now. A row that fit its track places as before (the
   premise gallery, whose rows are short, renders pixel-identical at laptop); a long row wraps
   to a second line. Premise's 14-word laptop row fell from 9 to 6, because the old number
   counted rows whose text was being cut, so premise joined the laptop lint (item 3).
6. **`capacity.hard` above the measured ceiling** (`2378-p3`). Settled per component in
   `2026-07-28-capacity-basis.md`'s amendment: six stay, with the shape that reaches them
   recorded; `pricing` was fixed in the component (four tiers go four across without `four`);
   `inventory` holds five at 16:9 and its wide `hard` is now 5.
7. **The Studio's welcome deck** clipped three slides at hall, on `main` too. Picking Hall in
   Present is one click, so its copy is tightened and the deck fits every venue; the
   list-steps timeline fix above freed the third.
8. **CodeQL.** The four alerts on untouched lines are cleared without changing an exported
   byte (the demo deck's HTML export is identical): an attribute escaper for `lang`, a
   fixed-point runtime-script strip, and static regexes where two were built from input.

Verified on the real Studio (the docs dev server, driven with Playwright): Present's venue
switch sets title / body at 28 / 16, 32.2 / 18.4, 36.4 / 20.8 and 42.0 / 24.0pt.
`check-jank` over the moved components at laptop and hall: no drift, no collision.
