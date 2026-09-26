---
status: in-progress
summary: >-
  Panes put two components' body content on ONE slide — a list beside a table, an image beside
  prose, a chart over a stat row — while the slide keeps its one title, eyebrow, subtitle, Key
  Insight, below-note, header, footer and page number. The engine renders each pane as an
  ordinary one-slide deck of its component, then embeds its body in a `<lat-pane>` Cell; a deck
  WITH panes assembles its stylesheet with a `section lat-pane` twin beside every rule arm that
  reaches one of its panes (scoped to the components its panes hold: +18 KB, not +305), in the
  same rule, so no component is edited and every other deck keeps its exact bytes. Each
  component declares in its manifest whether it goes in a pane and how much one pane holds —
  budgets measured where the export can find a ceiling, judged and explained where it cannot —
  and `lint:deck` checks every pane against it. A proof of concept ships with
  `examples/panes.md`; this note records the audit, the design, the measured costs and the gaps
  that stand between the proof and a v1.
---

# Panes — two components, one slide

**Answer first.** Yes, Lattice can put content from two components on one slide without
writing a new component for each pairing, and it can do it without touching a single
component. The author writes a normal slide and marks where each component's body begins:

```markdown
`Pipeline review · Q3`

## EMEA carried the quarter while APAC held flat.

<!-- panes: 40/60 -->
<!-- pane: list -->

- EMEA closed three late deals
- APAC renewals slipped

<!-- pane: table -->

| Region | Q2 | Q3 |
|---|---|---|
| EMEA | 4.1 | 5.3 |

> EMEA's three late deals are the whole quarter's growth.
```

The eyebrow, title, subtitle, Key Insight, below-note, header, footer and page number all belong
to the slide exactly as they do today. Only the body splits. A proof of concept ships in this PR:
`lib/core/panes.js`, the `pane` Cell (`lib/forms/cell/pane/`), the selector widening
(`tools/lib/pane-selectors.js`) and the demo deck `examples/panes.md`.

This is the build the 2026-06-18 note deferred "until a real deck needs it"
(`2026-06-18-frame-recursion-cells.md` §4): one flat split, depth one, a real component in each
cell. It is not the recursion that note rejected.

---

## 1. The authoring contract

| Marker | Meaning |
|---|---|
| `<!-- pane: <component> -->` | Starts a pane. Two per slide in v1; everything before the first marker is the slide's own masthead. |
| `<!-- panes: 40/60 -->` | Optional split. 25–75 in 5% steps; default 50/50. |
| `<!-- panes: stack 35/65 -->` | Stack the panes top-to-bottom instead of side by side. |
| `<!-- panes: 50/50 no-rule -->` | Drop the spine between the panes (on by default). |

**A spine marks the seam.** Between the panes the engine draws the chart family's diagram|key
rule (`buildSpine` in `lib/components/chart/_chart-family/svg-legend.js`) in CSS: an accent fade,
transparent at both ends, horizontal when the panes stack. It is placed from the ratio, never from
the content, so it cannot move. **The gutter is proportional and sized so the spine never hugs a pane.** `--sp-2xl` side by side
(64px at 1280: 32 either side of the spine, where the first cut's `--sp-lg` left 16 and the spine
read as stuck to whichever pane had a hard edge) — the step compare-prose and kpi already use
between side-by-side panels. A stacked pair spends height, which a 16:9 slide has least of, so it
takes `--sp-xl` (48px, 24 either side). A component with no hard edge (a chart's own whitespace, a
centered number) sits further off; the gutter is the minimum. It is on by default because it is the family's existing answer to
"two things share this box"; `no-rule` drops it where a pane's own edge already separates the two
(a photo).

**The trailing coda belongs to the slide.** After the second pane, the engine peels the trailing
run of blockquotes (Key Insight), `— ` paragraphs (below-note) and comments back onto the host
slide — unless the second pane's component claims that element for its own anatomy in its
manifest's `coda.claims` (a `quote`'s attribution, a chart's caption). Then it stays where the
component alone would keep it, so a pane reads exactly as the component's own slide does.

**One title.** A `#` or `##` written inside a pane, with an eyebrow or subtitle pill beside it, is
lifted to the slide.

**Each component declares how it behaves in a pane** — its manifest's `pane` field, required of
every built-in component by a test so a new one has to decide:

```json
"pane": {
  "fit": "half",
  "budget": {
    "axis": "item", "basis": "measured",
    "side": { "sweet": 4, "hard": 5 },
    "stack": { "sweet": 2, "hard": 3 },
    "note": "hard = the measured ceiling at 7 words per item; …"
  }
}
```

- **`fit`** — `half` reads in a pane of any share; `wide` needs 65% or more side by side, or a
  stack (a table, a gantt); `none` opts out (a title, a divider, a split panel). **`form`** names
  what a pane renders it AS when that differs (`image` renders through `content`). **`stack:
  false`** marks a component that does not fit a stacked band: `kpi` and `pricing` clip one
  element in a 50/50 stack (measured, §3.2).
- **`budget`** is how many elements one pane holds, on the same axis `capacity` counts: `side` at
  the fit's basis share (50% `half`, 65% `wide`), `stack` at 50/50. A smaller pane scales it down
  in proportion, never below the component's own `min` (a 2x2 is always four — a correct pane is
  never warned); a larger one keeps it. `basis: measured` means `hard` is the ceiling
  `tools/calibrate-capacity.js --pane` found; `editorial` means judgment, with the reason in
  `note` (a chart scales instead of clipping, so it has no ceiling to measure). A component with
  nothing to count — one number, one quotation — says so in `noBudget` instead.
- **It warns and never refuses** — the linter's posture. The carve renders an opted-out component
  as `content`; `lint:deck` reports `pane-fit` (opted out, too narrow, stacked when it cannot be),
  `pane-overflow` (past `hard`) and `pane-crowd` (past `sweet`). The carve and the linter share
  ONE contract, `lib/core/pane-spec.js` — the marker patterns, the layout parser and the fit rule.
  They find markers differently (the carve on parsed tokens, the linter line by line, following
  the same block rules: fence length, indent, HTML blocks, list content), and a test renders each
  block-level edge case through the engine to prove they name the same panes. At export, the overflow probe marks a pane that really clips — it already
  treats a pane's stage as a clipping cell.

**The ratio range is 25–75 in 5% steps.** Past 75/25 the narrow pane is too thin to hold a line of
body type. Snapping keeps each pane's shape predictable, so the four shape families (§3.3) still
decide layout and the gallery can cover every step. An out-of-range ratio falls back to 50/50;
`lint:deck` reports it as `pane-layout` (§1).

---

## 2. How it renders

1. **Carve** (`installPanes`, a markdown-it core rule in `lib/core/panes.js`). It runs INSIDE the
   host's own parse, right after the engine has split slides (`---` and `split: headings`) and
   applied directives, and BEFORE every component body rule. So where a slide ends, whether a
   marker sits inside a fence, and which directive a comment sets are the engine's own answers.
   The order matters: the body rules (glossary tables, checklist states, matrix cells, table row
   labels, badges) key on the slide's class, and while the carve ran after them a `_class:
   glossary` written on a panes slide put a letter-range pill on the slide's title and cut the
   pane's entries — and hid the pane's clip from the export's overflow probe. A second rule strips
   any component class the deck-class rule hands back before the default-component rule runs. The rule keeps the masthead, any `#`/`##` heading written inside a pane, the
   trailing coda and the running header/footer tokens on the host; cuts each pane's blocks back
   out of the source by their line maps; replaces the pane region with one placeholder; and gives
   the section the `lat-pane-host` class (which keeps `content`, and any component class, off it).
   A deck with no marker is untouched: the rule returns before it reads a token.
2. **Render each pane as an ordinary slide**, after the host's transforms. The engine renders the
   pane's markdown as a one-slide deck of its component (`renderPane` in `lib/engine/index.js`)
   through a parser built for the PANE's box. Every transform — the chart kernels, the table
   row-label ruler, the list rulers — sees a normal whole section, so none of them changes. The
   pane's `data-family` and `data-orientation` describe the pane, not the slide. Its SVG ids are
   pinned to the host slide's number (`pinRenderSlide` in `lib/core/render-ids.js`), so a slide's
   ids never depend on a later slide's panes, and a slide rendered alone at its offset matches its
   deck render.

   **The pane's box.** `stageBox` in `lib/engine/index.js` models the host's stage from
   measurements in Chromium on a 1280x720 panes slide: a title alone leaves 1152x438, and an
   eyebrow, a subtitle, a Key Insight and a below-note take 38, 45, 103 and 68px of height (all
   four together measured 192 against 184 summed). Each deduction is a fraction of the slide
   WIDTH, because type and spacing scale with it. The carve records which of the four the host
   carries (`chrome` on `env.latticePanes`). A title long enough to wrap is not modelled; the
   runtime measurement is gap 1 in §6.

   **Charts draw for the pane.** A chart slide draws on a fixed canvas (320x180 units landscape,
   320x300 portrait) that CSS scales to the stage, so a chart that drew that same canvas in a
   45% pane printed its labels at under half size. `renderPane` now stamps the pane's section
   with `data-pane-view="W H"`: the pane's box in the units a title-only chart slide gets, so one
   unit is one unit's worth of px on a full slide. The chart family reads it
   (`chart-family.js` → `ctx.paneView`) and lays out for that canvas:
   - the cartesian kernels (bar, line, waterfall, stacked-bar, heatmap, slope, scatter, bullet)
     take it through `viewFor(orientation, paneView)` in `cartesian.js`, floored at 140x72;
   - the keyed kernels (piechart, map, quadrant) call `fitKeyToPane` in `svg-legend.js`, which
     tries the key beside and below the diagram at a range of type sizes and scores each by what
     PRINTS: it takes the largest key text that keeps at least 75% of the unscaled diagram. A
     bigger key is also a wider one, so where the pane's width binds, it prints no larger and
     only shrinks the diagram; the unscaled key then wins.
   - radar is left out: its axis labels belong to the diagram, so shrinking the diagram for a
     bigger key made the labels a reader needs smaller (5–6px from 10 at 50/50). A radar pane
     draws as a radar slide does, scaled into the pane.
   - a Key Insight or note that stays inside pane B (a pie claims its note; a blockquote above a
     claimed note cannot be peeled past it) comes off that pane's canvas height.

   Cartesian labels therefore print at the slide's size and the plot gives way; a pie's key
   prints larger where the pane has the room, and never at the diagram's expense past 25%. No ordinary slide carries
   the attribute, so every non-pane chart draws exactly as before (the 304-deck HTML comparison
   in §4). **Mermaid is not sized this way**: it lays itself out and the SVG scales into the pane,
   so a flowchart in a 60% pane draws small, and nothing warns. That stays gap 2 in §6.

   **A pane stays a size container** (`container-type: size`), so a bare `cqi` inside it resolves
   against the pane. Resolving it against the slide kept progress bars and timeline dots at
   slide thickness, but it grew every `cqi`-sized avatar and gap too, and a six-person
   team-profile at 65% (its comfortable budget) clipped its bottom row; the budgets were measured
   with the pane as the container. The one component whose card ran past a narrow pane, the
   quote, gets a pane-scoped `box-sizing: border-box` and `max-width: 100%` in `pane.css` (its
   64cqi reading measure is a slide's; in a pane it left a 45% quote at 64% of the pane and
   clipped the attribution). The quote component's own sheet is unchanged, so no quote slide
   moves. Progress bars and timeline dots thin with the pane; that is the cost of keeping the
   container the budgets were measured in.
3. **Embed** (`panes.embed`). The pane section's body moves into
   `<lat-pane class="<component classes>" data-family=…>` inside the host's stage. The pane's
   stand-in masthead is dropped: the host owns the only title. The placeholder carries a nonce
   hashed from the source, so author HTML shaped like one is never filled.

### 2.1 Why the component CSS needs no copy — and the one thing it does need

Component CSS reaches its content through the slide: `section.list > .cell-stage > ul`. Measured
over all 70 component stylesheets, 2,850 selectors start at `section.<component>`, and about 91% of
them style body content; 97 set properties on the section itself, 95 style the stage box, 68 style
the title, coda or footer. So the rules are already written for "the body of a list". The only
problem is the first word: `section` asks "which component is this SLIDE?", and a slide with two
panes can only give one answer.

**Why the selector has to name the pane.** A browser matches `section.list > …` only on an element
named `section`, so something has to say "this pane counts". Every way to avoid naming it was
checked and fails:

- **Make the pane a `section`.** The engine scopes every rule to `article.lattice > section…` (a
  CHILD combinator), so a nested section matches nothing in the Studio, Playground or player; and
  everything that counts slides — pagination, page count, present mode, export, the overflow
  probe's `section[data-lattice-slide]` — would count the pane as a slide.
- **Edit the component CSS at the source** (`:is(section, lat-pane).list`). That is the build-time
  option of §2.2: it changes the bytes every deck ships and left 111 selectors Export-to-Marp
  cannot scope.
- **An iframe or shadow root per pane.** Two style scopes per slide, and neither reaches the PDF
  export's single document.

So the pane is named in the selector — and only in the selector: the DECLARATIONS are never
duplicated, the rule count is unchanged (3,760 rules in Chromium's CSSOM with and without panes,
measured), and only a deck with panes gets it, scoped to the components its panes hold.

Each rule arm that reaches one of the deck's panes gets a TWIN rooted at the pane, in the same rule
(`lib/core/pane-css.js`):

```css
section.list > .cell-stage > ul { … }                                   /* as shipped */
section.list > .cell-stage > ul, section lat-pane.list > .cell-stage > ul { … } /* a deck with panes */
```

- **Nothing is copied.** The twin sits in the same rule, so it keeps the rule's source order and
  its declarations.
- **A pane rule wins a tie against the slide it sits in.** The twin carries one more type
  selector than its slide rule, the same in the CLI's raw sheet and the engine's packed one. That
  edge is load-bearing: `section:not(.math) :is(.katex-display)` matches a math pane's equations
  through the HOST section, and ties `section.math :is(.katex-display)`. The first cut twinned to
  a bare `lat-pane.math …`, which lost that tie on source order in the CLI and gave a math pane's
  equations 16px of padding a math slide does not have (measured in Chromium; 0px now).
- **Only a deck with panes pays, and only for what its panes hold.** The twins are added where a
  deck's stylesheet is assembled — the engine's `composeCss` (Studio, Playground, player) and the
  CLI's inlined sheet — and only when the rendered deck holds a `<lat-pane>`. They are SCOPED to
  the classes the deck's panes carry (`paneClasses`): an arm is twinned only when every plain class
  on its root compound is one of them, so a list-and-table deck gets no `kpi` twin and no
  `section.print` twin. On the demo that is 183 twins instead of 3,403 (−95%). Verified exact: every
  computed property of every element inside every pane is identical with scoped and full twins, on
  the demo, the a11y theme and sketch mode (370 elements each; the same comparison between two
  different decks reports 367 differing, so it can fail). The engine keeps at most 8 pane-scoped
  sheets, so an editing session that mints a new pairing per keystroke cannot grow its cache
  without bound. The shipped `dist/lattice.css` is never widened, so every other deck, and the
  Export-to-Marp bundle, gets exactly the bytes it had.
- **Themes and base defaults are covered by the same pass.** An arm is twinned when it is rooted
  at `section` and either names a component (or the chart family's `chart-frame`) in its first
  compound — the component sheets, and theme rules such as the a11y texture channel — or reaches
  THROUGH `.cell-stage` — the base stage defaults every body gets (table rules, list rhythm, code).
  A class inside `:not()` is an exclusion, not a component. Slide-level rules (padding, backdrop,
  pagination) never reach a pane. Coverage: 2,971 of the 3,042 component-sheet arms rooted at
  `section`; the 71 left are `section .functionplot` descendants (which already reach a pane) and
  the auto-split cover/points pages (slide-level).
- **A leading `:is(section.x, figure.x)` is split only to find its arms**, so every arm is judged,
  and twinned, on its own. The authored selector stays byte for byte.
- **Quoted strings are text.** The walker skips `content: "/*"`, `[data-x="a;b"]` and an unquoted
  `url(data:…'…)`, and ends an unterminated string at its newline as a browser does, so a brace,
  comment opener or `;` inside a string never splits a rule and one bad string in author CSS cannot
  swallow the rules after it.
- **Nothing that counts slides can see a pane.** Pagination, page count, present mode and export all
  look for `section`; a pane is not one.
- **Shape stamps resolve per pane.** The 234 `data-family` rules and the 105 `:has()` gates sit on
  the root compound, so they read the pane's own stamps. Deck-wide classes (`mode: sketch`, a deck
  `class:`) reach the pane because the pane renders with the deck's front matter.

**The invariant, tested:** strip the twins back out of a widened sheet and every rule is the rule it
was — same arms, same order, same block — over the real bundle and all 33 themes
(`test/unit/core/panes.test.js`). A kernel bug found while building this (a `;` inside a comment split
a prelude and broke the rule that defines `--sketch-ink`, on every slide of a panes deck) fails it.

### 2.2 The options this replaced

| Option | Why not |
|---|---|
| **Nested `<section>` for a pane** | Component CSS would work untouched, but about 100 code sites query every `section` (lib, docs, tools) and 48 CSS counters count them. Any one of them could count a pane as a slide: an extra PDF page, a second page number, a present-mode stop. The risk lands on export, the surface every deck depends on. |
| **Copy each component's rules for a pane `<div>`** | Correct, but it duplicates 2,938 selectors (+28% minified if always shipped) to express what one word already says. The owner's objection — "why copy anything?" — was right. |
| **Hand-migrate component CSS off `section`** | The cleanest end state, but it touches all 70 components for no behavior the widening doesn't already give. |
| **Widen the shipped bundle at build time** (this PR's first design) | Shipped first and reviewed by the adversarial trio. It broke Export-to-Marp for EVERY deck: the base pass left `:is(section,lat-pane)` in the second position of a selector list, which the Marp scoper reads as a slide descendant, so ~107 rules (every table's rules among them) could never match there. It never reached themes, which the CLI reads raw at render time, so a11y chart textures dropped out of panes. And it cost every deck +15.3% gzipped CSS (about 14 KB) and tipped the Playground's first-paint snapshot over its 240K-unit cap. |

---

## 3. The audit — what can go in a pane

All 70 components, classified by the shape their content needs, and now RECORDED in each manifest's
`pane` field (§1) rather than in this table, so a new component has to decide and a test fails if
it does not. **Fits a half** (`fit: half`) reads in a ~50% cell. **Wide share** (`fit: wide`) needs
65% or more side by side, or a full-width stacked band. **Whole slide** (`fit: none`) is a frame
that claims the canvas.

| Class | Count | Components |
|---|---|---|
| **Fits a half** | 44 | every SVG chart — bar, bullet, funnel, heatmap, line, map, piechart, progress, quadrant, radar, scatter, slope, stacked-bar, state-chart, waterfall, word-cloud; diagram; math; code; list, checklist, cards-stack, list-tabular, glossary, inventory (ledger), actors, agenda, logo-wall, q-and-a; kpi, stats; big-number, quote, content; matrix-2x2, cycle; video; contact, wifi; authority-chain, citation-card, policy-recommendation, regulatory-update; image (as `content`) |
| **Wide share or stacked band** | 17 | table, gantt, journey, kanban, matrix-grid, roadmap, timeline-list, compare-prose, decision, pricing, redline, verdict-grid, cards-grid, team-profile, obligation-matrix, statute-stack, list-steps |
| **Whole slide** | 9 | title, divider, closing, topic, premise, split-panel, split-compare, compare-code, scene |

**`image` has a pane form** (`pane.form: content`): an image pane renders through `content` and
`pane.css` makes the picture cover its Cell. **`scene`** could follow the same pattern.

**The 65% line for `wide` is judgment, not a measurement.** A four-column table of short numbers
reads at 60%; a wide text table does not at 70%. It is the audit's call, stated as such, and the
demo follows it (its list-and-table slide is 35/65).

### 3.1 What was already in place

- **Charts scale.** Every chart is an SVG with a `viewBox` and `preserveAspectRatio`, sized off a
  size-container `.chart-body`. Mermaid fills any flex box.
- **Components already reflow by shape.** About 315 component rules key on the four shape families
  (wide, square, tall, strip, from `lib/adaptive/families.js`). `families.js` itself anticipated a
  nested cell stamping its own family. Capacity budgets in the manifests are already per family.
- **Type is pinned to slide pixels.** The `--fs-*` and `--sp-*` tokens compute through
  `--_sec-1cqi`, which the engine writes as px, so both panes set type at the same size as the rest
  of the deck. Only bare `cqi`/`cqh` in component CSS re-anchor to the pane (the pane is a size
  container), which is the behavior a box-relative length wants.
- **The overflow probe is cell-aware.** `CLIP_CELL_SELECTOR` in `lib/core/overflow-probe.js`
  matches `.cell-stage`, and each pane holds one, so a pane that overflows tags the slide. The
  proof's own first draft hit this: the export flagged the clipped list pane on page 1.


### 3.2 The budgets, and how they were set

**Measured where the rig can build content.** `tools/calibrate-capacity.js --pane side|stack`
renders a graded run of panes slides — the component in the first pane at its basis share, one line
of `content` in the second — and reads the export's own overflow probe, which already treats a
pane's stage as a clipping cell. It holds each element at HALF the component's `density.soft`: a
pane's content is written tighter than a whole slide's, and at full slide density a list pane
clipped at its fourth 14-word item, which would have warned on every well-written deck. 23
components have an element builder; each `hard` is the measured ceiling (capped at the slide's own
`capacity.hard`), and `sweet` sits one or two below.

| Component (fit `half`, side 50%) | side | stack | | Component (fit `wide`, side 65%) | side | stack |
|---|---|---|---|---|---|---|
| list | 6 | 4 | | cards-grid | 4 † | 2 |
| checklist | 9 | 4 | | verdict-grid | 5 † | 2 |
| actors | 7 † | 3 | | team-profile | 8 | 3 |
| inventory | 5 | 2 | | compare-prose | 5 | 5 |
| list-tabular | 7 | 3 | | decision | 5 | 5 |
| glossary | 12+ | 4 | | list-steps | 5 | 5 |
| stats | 3 | 5 | | timeline-list | 12+ | 6 |
| kpi | 3 | **none** | | pricing | 3 | **none** |

† capped at the slide's own `capacity.hard`; the pane measured more. "12+" never clipped up to the
rig's 12. The rest of the 23 — agenda, cards-stack, q-and-a, matrix-2x2, authority-chain,
regulatory-update, statute-stack — are in their manifests.

(The full set, with the words-per-element each was measured at, is in each manifest's
`pane.budget.note`.) **`kpi` and `pricing` do not fit a stacked band at all** — one KPI tile, one
pricing card already clips in a 50/50 stack — so they carry `pane.stack: false`, and a stacked pane
of either is a `pane-fit` warning.

**Judgment where it cannot measure** (`basis: editorial`, with the reason in `note`). A chart
scales rather than clipping, so the export has no ceiling to find: a 30-category bar pane truncates
its labels to "Region…" and overprints its values, and neither the overflow probe nor the TYPE
FLOOR probe says a word (measured — see §6). The chart budgets (bar 8, line 12, piechart 6, …) are
the readable limit by eye. Tables, gantt, kanban and the other wide components have no element
builder yet, so theirs are judgment too. Ten components have nothing to count and say so in
`noBudget` (one number, one quotation, one picture, one Mermaid diagram).

**The calibration found an engine bug.** Its first run put `glossary` at "fits 9+" — the rendered
slide plainly clipped. The rig writes `<!-- _class: <component> -->` on each slide, and the
component body rules ran on the whole panes slide before the carve (§2 step 1). Fixed in the carve;
every number above is from the run after the fix.

---

## 4. What the proof verified

| Claim | Surface | Evidence |
|---|---|---|
| Existing decks render the same markup | engine, every committed deck | 303 decks (every `examples/*.md`, component gallery and baseline deck; `panes.md` excluded): byte-identical HTML between `origin/main` (5a12c74) and this branch, each rendered from its own worktree — re-run after the carve moved ahead of the component body rules |
| Existing decks get the same stylesheet, plus only the pane cell's own rules | engine `render().css` | the same 303 decks: every composed sheet differs from `main` by exactly +3,011 bytes, all of it `lib/forms/cell/pane/pane.css` (keyed on `section.lat-pane-host` / `lat-pane`, which no normal slide carries); zero lines removed |
| The data-viz showcase gallery is unchanged | CLI PDF, both modes | 23 pages light + 23 dark, 0 differing pixels vs `main`'s committed PDFs, built by `tools/build-showcase-galleries.js` on the rebased branch (an earlier build before the rebase differed on two state-chart pages; that was the older base, not this change) |
| Scoped pane CSS equals the full widening | CLI export, computed styles in Chromium | every computed property of every element inside every pane identical, scoped vs full, on the demo, the a11y theme and sketch mode (370 elements each); the same comparison between two different decks reports 367 differing |
| A clipped pane is reported | CLI export | an overfull list pane and an overfull 25-row table pane each print `OVERFLOW … page N` and draw the export's clip tag — the probe reads a pane's stage as a clipping cell |
| A `_class` on a panes slide no longer runs that component on it | engine + CLI export | `<!-- _class: glossary -->` over a glossary pane: no range pill on the title, and the pane's clip reported (it was hidden before the carve moved) |
| Each component's pane budget | CLI export, `tools/calibrate-capacity.js --pane side\|stack` | 23 components measured at half their slide density (§3.2); `kpi` and `pricing` clip one element in a stacked band |
| The linter agrees with the carve | unit | `test/unit/core/pane-contract.test.js`: the carve and lint share the layout parser and fit rule; `splitPaneMarkdown` is a CommonMark block scanner (the seven HTML block types, list-item containers, lazy continuation, setext underlines, fences closed by their list item, tabs) and names the same panes as the carve on 37 edge cases and a seeded 400-slide fuzz (0 disagreements over 18,000 slides by hand before the test was pinned); `pane-layout`, `pane-fit`, `pane-overflow`, `pane-crowd`, counted per pane and scaled with the share |
| The Studio's live lint runs the pane rules | the real Studio, Playwright | `docs/e2e/pane-lint.spec.ts`: `pane: kpi` stacked and a crowded `pane: list` draw `.cm-lintRange-warning` marks in the editor. The Studio's vocab carries no manifests, so lint-core falls back to a table generated into the lint bundle (`lib/authoring/pane-lint.generated.js`, built by `tools/build-stage-catalog.js`). Mutation-checked: without the fallback the test fails |
| A chart in a pane prints slide-size labels | CLI PDF export, light and dark | a 17-slide review deck (bar, line, waterfall, pie, map, radar, quadrant, heatmap, Mermaid, tables, lists, stats, quotes, images, 25/75 to 75/25, stacked) and `examples/panes.pdf`: bar values, axis ticks and pie and map keys print at the size of a chart slide's; the export's overflow probe flags one page, a stats pane 13px too wide for its content |
| Existing decks render the same pixels | CLI PDF export | 81 pages vs a `main` build, 0 differing pixels: `examples/a11y.md`, `sketch.md`, `finish-backdrops.md`, the legal and progression galleries |
| Export-to-Marp is unchanged | `marpScopableCss` over the shipped `dist/lattice.min.css` | 4 selectors still start with `:is(` (as on `main`; the build-time design left 111), 0 twin arms (the only `lat-pane` selectors are the pane cell's own 14 in `pane.css`) |
| Two components on one slide, chrome kept | CLI PDF export | `examples/panes.pdf` (light, committed) and a dark render reviewed alongside it, not committed — list+table 40/60, bar+list 55/45, image+text 50/50, table+big-number 70/30, stacked line over stats, piechart+list 45/55 |
| Themes, sketch and finishes reach a pane correctly | CLI export, computed styles in Chromium | a11y-deuteranopia: a pie pane's wedge fills `url(#latt-a11y-chart-tex-1)` like a pie slide; `mode: sketch`: a cards pane's card computes the same 2px hand-drawn border as a cards slide; `class: dark` + `finish: atrium`: panes paint no background and no padding |
| The Studio previews a panes slide | the real Studio (`/studio/`, docs dev server built from this branch), 1440px desktop | the demo deck typed into the editor: one host section, two `lat-pane` cells, list pills and table rules computed as on the CLI, no page errors. An earlier run found the preview's sanitizer **dropping** `<lat-pane>`; `lat-pane` joined `ADD_TAGS` in `lib/core/sanitize-slide-html.mjs` (which also covers the self-contained `.html` export) |
| A pane is never a slide; slides around it survive | engine | `test/unit/core/panes.test.js`: one `<section>` and one `<h2>` per panes slide; `---` directly under a table, list or comment, and `split: headings`, keep every later slide |
| Slide ids don't depend on later panes | engine | the same test: a piechart slide's ids are unchanged by a panes slide after it, and a panes slide's ids match between the deck render and a render alone at its offset |
| Studio / Playground smoke | Playwright `@smoke` | 59/59 locally on `e70c7bb`; CI `studio-smoke` green on `3118e15` (not re-run on the budget commit yet) |

**Not verified:** the Studio at tablet and phone widths; the Playground UI with a panes deck; the
PPTX, image-set and player exports; Export-to-Marp OF a panes deck (marp-core cannot carve; §6).
A Mermaid diagram in a pane renders (review deck) but draws small, unsized (§2). They share the engine, but "shares the engine" is not verification
(HARD RULE #23). Each is a `followups.d/2376-*` item.

---

## 5. The measured cost

Measured on the demo (7 slides, 6 of them panes) against the SAME content written as 19 ordinary
slides, one engine, same machine, median of 15 warm renders (`panebench`, three runs each).

| | ordinary slides | panes | cost |
|---|---|---|---|
| engine composed CSS | 869 KB | 887 KB | **+18 KB (+2%)** — was +305 KB before the twins were scoped |
| pane twins in the sheet | — | 183 | 3,403 unscoped |
| warm render | 10.7–11.4 ms | 13.2–13.5 ms | +~2 ms: each pane is its own one-slide render |
| first render (cold) | 167–209 ms | 264–275 ms | +~80 ms: the widening (~50 ms) and a second composed sheet, then memoized |
| engine heap after render | 3.8 MB | 5.0 MB | +1.2 MB, most of it the second composed sheet |
| Studio eager JS (route budget) | 723,577 B gz (`main` 03730a1) | 727,069 B gz | **+3,492 B**, all `authoring-core`: the pane lint rules, the block scanner and the baked pane table (~1.1 KB), measured as a pair; budget 723,700 → 728,200 |
| CLI `.html` export | 3,271,933 B | 3,275,887 B | +4 KB raw, +1.7 KB gzipped (0.1%) |
| browser style recalc · layout | 8–10 ms · 117–146 ms | 4 ms · 106–109 ms | none; the rule count is unchanged (3,760), twins sit inside existing rules |

- **CSS: 0 bytes for a deck without panes** beyond the pane cell's own 3 KB of rules.
- **Memory is bounded.** The engine keeps at most 8 pane-scoped sheets (`PANE_SHEETS_KEPT`), so an
  editing session that mints a new pane pairing per keystroke evicts the oldest.
- **Render time:** one extra markdown-it parser per distinct pane shape (orientation × family),
  memoized. Decks without panes pay one substring test (`pane:`) per render, inside the parse.
- **The Playground's first-paint snapshot** keeps pane arms only when the captured slide holds a
  pane, so a pane later in the deck does not push slide 1's snapshot past its 240K-unit cap.

---

## 5a. What the independent reviews changed

**Maker-checker on the first cut** (HARD RULE #25) reproduced three blockers and nine smaller
defects, all fixed and each pinned by a test in `test/unit/core/panes.test.js`:

- **A debug line crashed the browser engine on any panes deck** (`process.env` in the bundle).
- **The first carve was a text pre-pass with its own idea of a slide break**, which dropped slides
  after a `---` under a table or with `split: headings`, mis-closed a 4-backtick fence, and lost
  directives, titles and the host class. The carve moved into the parse (§2).
- **Quote attribution was taken as the slide's below-note.** Now governed by `coda.claims` (§1).
- **A chart pane painted the slide's background**; a pane is transparent now.
- **Pane ids depended on later slides; a forged placeholder could be filled; a comment holding
  `<div>` could swallow a pane.** Pinned ids, a nonce, and a div matcher that skips comments.

**The adversarial trio on the full PR** (owner's request before merge) found three blockers — the
build-time widening's Marp regression and its theme blind spot (now §2.2's rejected row), and a
cubic-time `panes:` regex a 3 KB deck could hang on — and fixed-in-PR should-fixes: a pane's first
code-only paragraph was deleted with the chart stand-in heading (the stand-in is now chart-only and
hands a lifted pill back), a `_class` inside a pane replaced its component (a directive the engine
applied stays on the slide), a pane anywhere in the deck cost slide 1 its Playground snapshot,
deck-wide classes never reached a pane, `lint:deck` read pane markers as narration, plus
`Object.hasOwn` on the pane-form lookup and the id pin released in a `finally`. The design was upheld:
normal slides match exactly the rules they matched before (3,712 rules compared), the sanitizer
change opens nothing, and embedding held across 361 modifiers and 18 registers.

**An independent checker on the rework** (`4def515`) confirmed its claims and found four more: a
math pane styled wrong in the CLI (a slide rule reaching in through the host won the tie — §2.1), a
twin one type selector lighter in the CLI than in the engine, a front-matter `style:` block that
never reached a pane, and a walker that was not string-aware. `3118e15` fixed all four. **A second
checker on `3118e15`** found no defect in shipped CSS and three walker edge cases on author CSS (a
`;` in a quoted value, an unterminated string, an apostrophe in an unquoted `url()`), plus pane-cell
rules the new twins could outrank; all fixed with the budget work. **A third checker on the budget
work** found no defect in the scoping (every dropped twin matches no element, across 11 deck
classes) or the carve reorder (219 decks byte-identical), and three in the new data: 14 budgets
whose comfortable count sat below the component's own minimum (a four-quadrant 2x2 pane was
warned), a linter that found markers the carve does not (inside a nested fence, a list item, an
HTML block), and doc claims that contradicted the manifests. All fixed and pinned by tests.

**The owner then asked for components to opt out, for a pane budget, and for the memory and render
cost to be justified** — "I question copying". That round added the `pane` manifest contract (§1),
the measured budgets (§3.2), the scoped twins and the reason a selector twin cannot be avoided
(§2.1), and the cost table (§5). Measuring the budgets found the `_class` carve-order bug (§2).

**A fourth checker on the lint** found the line-level splitter and the carve disagreeing on 17 of
37 block-level cases (a marker in a lazy paragraph continuation, after an HTML block of type 7,
under a setext heading, inside a list item's fence). The splitter became a CommonMark block
scanner and a seeded fuzz pins the agreement (§4).

**A fifth checker on the chart sizing** found three blockers, all fixed and pinned by tests in
`test/unit/core/panes.test.js`: a radar pane printed its axis labels at half size (radar left
out of `fitKeyToPane`); a pie in a narrow pane gave up two thirds of its disc for no larger text
(the key is now scored by printed size, the unscaled key always a candidate, with a 75% floor on
the diagram); and resolving `cqi` against the slide clipped an in-budget team-profile (reverted,
§2). It also found three contrived scanner cases (a bare `>`, a heading or an HTML block opening
a list item) and an empty vocab table silencing the Studio fallback; both fixed. One contrived
disagreement remains in its fuzz (1 in 2,549: an empty `1)` item after `1. x`, where the carve
finds no panes at all).

**The owner then reviewed a 17-slide deck of common pairings** and asked for two things before
merge: charts sized to their pane, not shrunk into it, and the pane lint in the Studio's live
editor. Both landed (§2, §4). Rebasing onto `main` moved the CLI onto the engine's packed flat sheet (`lib/export/cli-deck-sheet.js`), where the post-hoc widening found no `section.<component>` to twin and a stats pane exported unstyled; the CLI now asks the engine for the pane twins before it packs (`cliDeckSheet({ panes })`), `tools/palette-sweep.js` reads the pane classes from the export so its identity check still holds, and `test/unit/export/cli-deck-sheet.test.js` pins it. The Studio's eager bundle grows by the baked lint table; the route
budget was re-measured as a pair (§5).

---

## 6. The gaps between the proof and a v1 (ranked by what they unblock)

Panes ship **experimental**: the syntax may change until these close. Each has a `followups.d/`
file (`npm run followups`), so none lives only in this note.

**Closed in this PR:** the P1 this list used to lead with — "a pane that clips is silent, and the
carve's warnings go nowhere". Its first half was wrong: the export's overflow probe always read a
pane's stage as a clipping cell (§3.1), and flags an overfull list or table pane like a clipped
slide (measured). What was missing was the authoring-time half, and `lint:deck` now reports all of
it through the carve's own spec: `pane-layout` (a ratio off the grid, a third marker), `pane-fit`
and the per-pane budget (§1).


1. **Measure the pane, don't estimate it** (`2376-p2-measure-…`). The engine sizes a pane from
   `stageBox`, a model measured once per piece of host chrome (§2). It does not see a title that
   wraps, a theme with a taller masthead, or an image that changes the coda. The runtime should
   re-stamp each pane from its laid-out box.
2. **Finish sizing charts to the pane** (`2376-p2-size-chart-…`). The SVG chart kernels draw for
   the pane's canvas now (§2). Still open: Mermaid, which lays itself out and scales into the pane;
   the HTML-drawn charts' reflow in a small box; a TYPE FLOOR probe that flags an unreadable chart
   pane; and `tools/calibrate-capacity.js --pane` measuring a chart's ceiling, so the chart budgets
   can turn `measured` instead of editorial.
3. **Author and package CSS in a pane** (`2376-p2-author-css-…`). A panes deck widens the shipped
   sheet, the theme and the CLI's front-matter `style:`; installed packages and the Studio's
   `extraCss` are not widened yet, so their `section.<component>` rules skip a pane.
4. **Audit the runtime's section-keyed passes** (`2376-p2-audit-…`) — about 17 in `lib/runtime`,
   plus sketch's rough-ink pass; Mermaid in a pane is untested.
5. **A shape family for stacked bands** (`2376-p3-band-…`): a line chart letterboxes, stat tiles
   need ~45% of the stage.
6. **The remaining surfaces** (`2376-p3-panes-on-…`): PPTX, image-set, player, the Studio at 820 and
   390px and its slide strip ("text"), and Export-to-Marp, which cannot carve and should degrade to
   the two panes' content, stacked.
7. **Retire the chart stand-in heading** (`2376-p3-retire-…`).
8. **Authoring surfaces and the spec** — the Studio's insert menu and Compose editor, and the LFM
   spec (`docs/src/content/docs/spec/lfm.md`) — once the syntax is no longer experimental.

---

## 7. See also

- `2026-06-18-frame-recursion-cells.md` — the rejection of recursive frames, and §4, the flat split
  this note builds.
- `design/forms.md` §6 — the Cell contract (resolution-blind box, gap, clip) a pane honors.
- `lib/adaptive/families.js` — the shape families a pane is classified into.
- `2026-06-22-the-fit-spine.md` — the Frame owns box-response; the pane Cell is a new box it owns.
