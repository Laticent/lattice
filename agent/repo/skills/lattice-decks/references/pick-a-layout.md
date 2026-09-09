# Pick a layout

> Match your intent to a layout, then count your content against its capacity.


One file per component. Open the one you picked and it tells you everything: slots,
variants, budgets, common mistakes, the data shape.

### How to pick

1. Find your intent in the families below. Each entry says what it is **for**, what it
   is **not for**, and which component to use **instead** when yours is the wrong fit.
2. Open `<name>.md` — median ~1.9k tokens.
3. Author the slide against that file, plus the rules in `../authoring/rules.md`.

`_index.md` (~4.8k tokens) is the same catalog as a flat, greppable table —
reach for it when you want to search by tag or capacity rather than browse by intent.

**The "not for" lines are the ones that save you.** Choosing between two plausible
components is where an agent goes wrong, and the deciding fact is almost always the
anti-pattern, not the purpose.

### The families

#### anchor — where you are in the deck.

- **`closing`** — Final slide.
  - *not for:* Multi-line heading
  - *use `title` when* opens the deck — same dark-bookend chrome
  - *use `divider` when* mid-deck section breaks — same dark canvas
- **`divider`** — Section boundary slide.
  - *not for:* More than five per deck
  - *use `title` when* opens the deck — same dark-bookend chrome
  - *use `closing` when* closes the deck — completes the bookend trio
- **`title`** — Opening slide.
  - *not for:* Mid-deck statements
  - *use `divider` when* mid-deck section breaks — same dark-bookend chrome
  - *use `closing` when* the final slide — closes the bookend pair

#### statement — one declarative claim per slide.

- **`big-number`** — Single oversized number as the focal claim.
  - *not for:* Multiple metrics on one slide
  - *use `stats` when* row of 2-3 metrics, comparable visual weight
  - *use `kpi` when* grid of 4-6 metrics with status indicators
- **`content`** — Generic prose slide — heading plus paragraphs or a short list.
  - *not for:* Forced shape into prose
  - *use `quote` when* the prose IS a quote — let the quotation chrome carry it
  - *use `big-number` when* the prose IS a metric — let the number carry it
- **`premise`** — A framing claim beside a vertically centered ledger of parallel rows — a number, a term, a description, and a right-aligned note, each row colored by its own categorical hue.
  - *not for:* Rows with unequal structure
  - *use `split-panel` when* the featured element deserves its own colored panel, not a shared background
  - *use `list-tabular` when* the rows need MORE than four fields, or a header row naming the columns
- **`quote`** — A pulled quotation, centered, with attribution.
  - *not for:* Paragraph-length quotes
  - *use `split-panel` when* the quote needs implications spelled out alongside it
  - *use `content` when* the language is paraphrasable — let prose carry it
- **`split-panel`** — Featured left panel + supporting right zone — one prominent claim beside the points that substantiate it.
  - *not for:* A binary decision with a verdict
  - *use `split-compare` when* a binary decision with a recommendation card
  - *use `compare-prose` when* two co-equal options side by side

#### inventory — parallel sets of related items.

- **`actors`** — Roster of responsibilities owned by named actors.
  - *not for:* Process sequence
  - *use `list-tabular` when* rows are reference entries, not owners
  - *use `cards-stack` when* each item needs two sentences of body text
- **`agenda`** — Auto-numbered table of contents for the deck.
  - *not for:* Sub-bullets per section
  - *use `divider` when* marking a section boundary without restating the menu
  - *use `list` when* single-line takeaways — the `takeaway` variant
- **`cards-grid`** — 2–4 parallel items, similar weight, scannable in a grid.
  - *not for:* More than 4 items
  - *use `list-steps` when* items carry an explicit sequence
  - *use `cards-stack` when* items stack vertically as full-width rows
- **`cards-stack`** — Parallel items stacked vertically, full-width cards.
  - *not for:* Five or more items
  - *use `cards-grid` when* three or four parallel items in a scannable grid
  - *use `compare-prose` when* exactly two items, side by side
- **`checklist`** — Items with state markers — done, partial, todo.
  - *not for:* All-done lists
  - *use `list` when* items have no state — just bullets
  - *use `list-tabular` when* rows need a label-plus-description structure, not state
- **`glossary`** — Two-column term/definition table with auto-derived alphabetic range pill.
  - *not for:* Multi-sentence definitions
  - *use `list-tabular` when* rows are key/value reference, not term/definition
  - *use `divider` when* lighter mid-section orientation — the bright-canvas `light` variant
- **`inventory`** — A parallel set of related items of similar weight — one content shape, four interchangeable looks.
  - *not for:* More than six items
  - *use `cards-grid` when* you want a fixed cards grid with nested-bullet authoring
  - *use `list-steps` when* the items carry an explicit sequence
- **`list`** — Bulleted list under a heading — plain pills, hairline takeaways, or display-weight principles.
  - *not for:* Title plus body per item
  - *use `cards-stack` when* each item has a title plus body sentence
  - *use `list-tabular` when* five or more rows with label-plus-description
- **`list-tabular`** — Hairline-ruled ledger of items — name on the left, body on the right.
  - *not for:* Three or fewer rows
  - *use `glossary` when* term/definition pairs with auto-derived range pill
  - *use `cards-stack` when* two or three richer items, not a ledger
- **`logo-wall`** — A grid of customer, partner, or funder logos as social proof.
  - *not for:* Names that need a sentence
  - *use `actors` when* each named entity owns a responsibility, not just lends its logo
  - *use `cards-grid` when* each item needs a line of body text, not just a mark
- **`q-and-a`** — Anticipated questions paired with prepared answers — the end-of-pitch 'what we expect to be asked' slide.
  - *not for:* A flat FAQ of one-liners
  - *use `list-tabular` when* many terse question/answer look-ups to flip back to, not a few weighty defenses
  - *use `glossary` when* term/definition reference pairs rather than question/answer pairs
- **`team-profile`** — A roster of named people, each under a portrait, with the role they own.

#### comparison — how two or more options differ.

- **`compare-prose`** — Two prose options side-by-side with a labeled corner tag on each.
  - *not for:* Code comparison
  - *use `compare-code` when* the columns are code, not prose
  - *use `split-compare` when* the verdict needs a bottom recommendation bar
- **`compare-table`** — Multi-row comparison table with consistent columns.
  - *not for:* Cells full of prose
  - *use `compare-prose` when* exactly two options with prose bodies
  - *use `verdict-grid` when* options scored against criteria with pass/partial/fail badges
- **`decision`** — The verdict slide — one chosen path, named explicitly.
  - *not for:* No clear chosen path
  - *use `compare-prose` when* the comparison slide that should precede decision
  - *use `split-compare` when* comparison and verdict on one slide instead of two
- **`matrix-2x2`** — Static 2×2 quadrant grid with author-placed items per cell.
  - *not for:* Continuous-axis data
  - *use `quadrant` when* items have continuous x/y coordinates rather than discrete quadrant labels
  - *use `verdict-grid` when* options scored across more than two dimensions
- **`pricing`** — Side-by-side plan tiers with prices, feature checklists, and one recommended column.
  - *not for:* More than four tiers
  - *use `compare-table` when* a dense feature-by-plan matrix with many rows, not a few highlighted features
  - *use `verdict-grid` when* options scored on shared criteria, not priced tiers
- **`redline`** — Clause-by-clause comparison — verbatim language with inline `<ins>`/`<del>` tracking the amendment.
  - *not for:* Code diffs
  - *use `compare-code` when* the diff is source code, not natural language
  - *use `compare-prose` when* two narrative alternatives, not verbatim amendments
- **`split-compare`** — Two options + verdict — dark frame on the left, 2-column option grid + a recommendation card on the right.
  - *not for:* Three or more options
  - *use `compare-prose` when* the comparison is undecided — no verdict bar yet
  - *use `decision` when* the verdict slide that follows a separate comparison
- **`verdict-grid`** — Options scored against criteria as a verdict matrix.
  - *not for:* Exactly two options
  - *use `compare-prose` when* exactly two options with prose bodies
  - *use `split-compare` when* two options with a bottom verdict bar

#### progression — ordered movement through stages or time.

- **`cycle`** — A closed loop of 3-6 stages that returns to its start — for a process with no beginning or end, where the last stage feeds the first.
  - *not for:* A linear process
  - *use `list-steps` when* the process is linear — a real start and finish, not a loop
  - *use `timeline-list` when* events fixed to dates rather than a repeating cycle
- **`list-criteria`** — Numbered criteria list — each requirement is a row with rationale.
  - *not for:* Parallel options, not gates
  - *use `list-steps` when* rows are procedural steps with longer body, not gating criteria
  - *use `checklist` when* rows carry done/in-flight/planned state markers
- **`list-steps`** — Horizontal row of ordered step cards, each with a full description body (the `vertical` variant stacks them instead).
  - *not for:* Light labels, no body
  - *use `list-criteria` when* gating requirements rather than a sequence of actions
  - *use `split-panel` when* phase label + heading on the left, steps on the right

#### evidence — data that supports the argument.

- **`kpi`** — Executive KPI system — one base, five layout modifiers.
  - *not for:* Decorative pills without status semantics
  - *use `stats` when* metric row without targets or status pills
  - *use `big-number` when* a single number is the whole argument
- **`stats`** — Row of 3–5 stat tiles, each with a big number and a label.
  - *not for:* Six or more tiles
  - *use `big-number` when* one number is enough to carry the slide
  - *use `kpi` when* metrics need targets, trends, and status pills

#### imagery — visuals that carry their own meaning.

- **`image`** — Image as the slide's anchor, with optional text alongside — composition adapts to the asset and the deck.
  - *not for:* Decorative stock photo
  - *use `diagram` when* the visual is a Mermaid graph, not a photo or screenshot
  - *use `content` when* the slide is mostly prose with one inline visual
- **`scene`** — An Anima motion scene as its poster still — an inline, palette-blind SVG that recolors with the theme and bakes crisp into the PDF; the live animation plays in the HTML/present surfaces.
  - *not for:* Motion as decoration
  - *use `image` when* the visual is a still photo or screenshot, not an animated scene
  - *use `diagram` when* a static Mermaid graph says it — no order or depth that needs motion
- **`video`** — A video as a static, PDF-safe embed: a poster that links to the clip, a play badge, the provider's name, and a scannable QR to the same URL — never a live iframe.
  - *not for:* Expecting it to autoplay in the PDF
  - *use `image` when* the visual is a still photo or screenshot, not a video
  - *use `closing` when* the send-off is a call to action with a QR, not a specific clip

#### chart — series-substance data visualizations (SVG kernel).

- **`bar`** — Bars from a zero baseline that compare magnitude across categories — as columns, rows, side-by-side groups, or signed off a centered zero.
  - *not for:* Parts of one whole
  - *use `progress` when* attainment against 100% rather than magnitude against each other
  - *use `piechart` when* parts of a single whole, where the shares sum to one total
- **`bullet`** — Actual against target inside a qualitative band — one dense row per KPI.
  - *not for:* No target to measure against
  - *use `progress` when* percent-complete with a status verdict and no target or range — HTML bars, so no marker and no band, but the row carries a status pill and a note the bullet has no room for
  - *use `bar` when* magnitudes compared against each other rather than against a plan
- **`funnel`** — Tapering stages that show where a flow drops off, with the conversion rate between each.
  - *not for:* Stages that aren't a subset
  - *use `progress` when* independent metrics as labeled bars, not a narrowing pipeline
  - *use `stats` when* a row of headline figures with no drop-off relationship
- **`gantt`** — Gantt chart — task bars across a date axis.
  - *not for:* Single workstream
  - *use `roadmap` when* phased grid of deliverables across workstreams without continuous spans
  - *use `kanban` when* current state by stage rather than schedule by lane
- **`journey`** — Native user-journey chart — sections of tasks, each tagged with actor(s) and a 1-5 mood.
  - *not for:* Process without affect
  - *use `list-steps` when* process needs descriptive body per step, no chart
  - *use `gantt` when* schedule of overlapping tasks across lanes
- **`kanban`** — Kanban board — columns of cards by stage.
  - *not for:* Schedule, not status
  - *use `gantt` when* schedule of overlapping tasks across lanes, not current state
  - *use `roadmap` when* phased grid of deliverables across workstreams
- **`line`** — A measure plotted across an ordered axis, so the movement is the read — one line or several, optionally filled, stacked, or stepped.
  - *not for:* Two points
  - *use `bar` when* the categories are unordered and the claim is magnitude, not movement
  - *use `slope` when* there are exactly two points and the story is which entities changed rank
- **`map`** — A world-countries (or US-states) basemap that fills regions by value (choropleth) or category (highlight) so the audience leaves knowing where.
  - *not for:* A map as decoration
  - *use `progress` when* the regions are really a ranking — labeled bars compare magnitudes faster than shades
  - *use `stats` when* a few headline figures with no geography to place them on
- **`matrix-grid`** — Two ordered axes as an N×M chart-family grid — each cell marks a position (filled / reachable / not applicable), colored by its row's category from the theme's chart palette.
  - *not for:* Pass/fail or delivery status
  - *use `obligation-matrix` when* rows × columns of pass/partial/exempt status, not a single position
  - *use `roadmap` when* phases × workstreams delivery status
- **`piechart`** — Pie or donut chart with legend — proportional wedges.
  - *not for:* Slices that don't sum to a whole
  - *use `progress` when* comparable parts but precise differences matter
  - *use `stats` when* the values are independent metrics, not a partition
- **`progress`** — Horizontal progress bars — one row per item, percentage filled.
  - *not for:* Comparing unrelated metrics
  - *use `kpi` when* value + target + status tiles, not a single percent
  - *use `stats` when* independent headline metrics, no completion scale
- **`quadrant`** — Native 2×2 scatter chart — items plotted on two continuous axes.
  - *not for:* Static categorical 2×2
  - *use `matrix-2x2` when* the 2×2 is categorical, not coordinate-based
  - *use `radar` when* items rated across more than two criteria
- **`radar`** — Native radar / spider chart — items rated across multiple axes.
  - *not for:* More than four series
  - *use `quadrant` when* two axes are enough — the other six dimensions drop out
  - *use `verdict-grid` when* the criteria are categorical (pass/fail), not graded
- **`roadmap`** — Phased multi-workstream grid — phases across the top, workstreams down the side.
  - *not for:* One workstream
  - *use `gantt` when* continuous task bars across a date axis rather than discrete phase cells
  - *use `kanban` when* current state by stage rather than phased schedule
- **`scatter`** — An XY plot with real units on both axes — one dot per entity, showing how two measures relate.
  - *not for:* A unitless 2x2 score
  - *use `quadrant` when* the axes are unitless scores and the read is which of four named zones
  - *use `matrix-2x2` when* items are placed by category, not by coordinate
- **`slope`** — Two labeled columns joined by one line per entity, so a change in ranking reads as a crossing.
  - *not for:* A two-point line chart
  - *use `line` when* three or more points in time — a trend rather than a before/after
  - *use `bar` when* one point in time, comparing magnitudes across categories
- **`stacked-bar`** — Bars split into parts, so one chart carries both the total for each category and the mix inside it.
  - *not for:* Tracking a part that is not at the bottom
  - *use `piechart` when* one total to decompose, with no comparison across categories
  - *use `progress` when* independent attainment bars with no parts and no shared value axis
- **`state-chart`** — Native state machine diagram — states as a numbered list, transitions as nested inline-code refs.
  - *not for:* More than ~8 states
  - *use `diagram` when* the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
  - *use `journey` when* the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- **`timeline-list`** — Date-stamped event list rendered as a horizontal spine — a dot per event with its date pill above and title, status pill, and body stacked below.
  - *not for:* Date-less steps
  - *use `regulatory-update` when* the dated entries are regulatory changes and every row carries a citation
  - *use `gantt` when* milestones occupy date ranges, not single moments
- **`waterfall`** — A bridge from one total to another through signed contributions, each bar starting where the last one ended.
  - *not for:* Independent magnitudes with no running total
  - *use `bar` when* the categories are independent magnitudes with no running total, or you want the drivers alone without the anchors
  - *use `stacked-bar` when* the contributions are all positive parts of one total rather than signed changes to it
- **`word-cloud`** — Spiral-packed word cloud — items sized by weight.
  - *not for:* Precise comparisons
  - *use `progress` when* the weights need precise visual comparison
  - *use `stats` when* the headline metrics are independent numbers, not a corpus
- **`_chart-family.md`** — the shared contract every chart component wraps in. Read it too.

#### diagram — graph-substance network visuals (external renderer).

- **`diagram`** — Mermaid diagram as the slide's centerpiece.
  - *not for:* Tabular data on axes
  - *use `code` when* the implementation, not the topology, is the argument
  - *use `quadrant` when* items positioned by two numeric attributes

#### math — typeset equations and proofs.

- **`math`** — Boardroom-quality math layouts for mathematicians, quants, ML researchers, physicists, statisticians, and economists.
  - *not for:* Two display equations in the base layout
  - *use `code` when* the implementation, not the equation, is the argument
  - *use `diagram` when* the structure of the model, not its closed form

#### code — syntax-highlighted source code blocks.

- **`code`** — Single fenced code block as the slide's centerpiece.
  - *not for:* Comparing two versions
  - *use `compare-code` when* before/after snippet comparison
  - *use `diagram` when* the architecture matters more than the code
- **`compare-code`** — Two fenced code blocks side-by-side, each with a label.
  - *not for:* One side is prose
  - *use `compare-prose` when* the change is state, not code
  - *use `redline` when* the comparison is prose-versus-prose

#### legal — citation-aware layouts for statutes, obligations, and regulatory change.

- **`authority-chain`** — Provenance chain — statute to regulation to guidance to case, walked in order.
  - *not for:* Flat list of citations
  - *use `regulatory-update` when* period-bounded changelog rather than a single rule's lineage
  - *use `list-criteria` when* flat enumeration of requirements without tier hierarchy
- **`citation-card`** — Single authoritative reference — heading + citation + verbatim quote + plain-English gloss.
  - *not for:* Multiple citations on one slide
  - *use `statute-stack` when* two or three citations need to land on one slide
  - *use `quote` when* the source is a person, not a document
- **`obligation-matrix`** — Regulation × obligation grid — state-marker cells encode applies / partial / exempt at a glance.
  - *not for:* Two regimes only
  - *use `compare-table` when* cells are textual values, not state markers
  - *use `verdict-grid` when* options scored against criteria with a per-card layout instead of a table
- **`policy-recommendation`** — A legislative recommendation — a stance verdict beside the recommendation, its evidence, and the specific ask to lawmakers.
  - *not for:* Weighing two options
  - *use `split-compare` when* two options weighed before a verdict card
  - *use `decision` when* naming a chosen path among options already presented
- **`regulatory-update`** — Change log against a baseline — numbered list of statutes/cases/rules with citation, summary, and effective date.
  - *not for:* Single rule's lineage
  - *use `timeline-list` when* dated entries with a status read and a sentence each, but no citation per row
  - *use `authority-chain` when* single rule walked from statute to regulation to guidance to case
- **`statute-stack`** — Citation hierarchy — federal / state / local rows with citation, headline obligation, and status.
  - *not for:* More than four rows
  - *use `list-tabular` when* the rows are citation-only references, no obligation prose
  - *use `obligation-matrix` when* obligations cross-tab against actors or controls

#### connect — cards the room can scan: join the network, save the speaker.

- **`contact`** — An identity card that encodes a vCard: name, title and contact lines beside a QR that saves the presenter to a phone.
  - *not for:* Not a team roster
  - *use `wifi` when* the card is a network to join rather than a person
- **`wifi`** — A network join card: readable Wi-Fi credentials beside a QR a phone scans to connect in one tap.
  - *not for:* Not for secrets that outlive the room
  - *use `contact` when* the card is a person's identity rather than a network

---

_Generated from the component manifests. Every line here is derived; nothing is restated by hand._


---

# The same catalog as one table


Generated by `tools/build-docs-portal.js` from the component manifests — do not edit
by hand. One line per component: enough to CHOOSE one, and nothing more.

**How to use this file.** Skim or `grep` it (`grep -i comparison`,
`grep 'item:.*/8/'`), pick a component, then open its
`./<name>.md` for slots, skeleton, variants and
anti-patterns — always read it before you write the slide. Tools that need
the full machine record read `components.json`; this file is not a substitute for it.

**A zero-hit `grep` means read the 61 rows, not that no component fits.** Rows carry
names, tags and a one-line purpose — not the full `whenToUse` prose — so a search for
`swot`, `screenshot` or `bullet` can miss a component that handles it. The whole table
is ~60 lines; skimming it is the fallback.

**Every `purpose` here is the FIRST SENTENCE of the manifest’s.** Manifest prose is
written head-first ("Use for X…") and tail-last ("…for Y, use `Z` instead"), so the
half telling you when NOT to use a component is deliberately not on this surface — it
is in the component’s `.docs.md`, which you should always open before
writing the slide anyway. Check the `see also` column before committing. A `…` marks
a first sentence long enough to be cut as well.

**`capacity`** is `axis:sweet/soft/hard` — the ideal count, the count past which it
crowds, and the count past which it overflows. **Count your content before committing
to a component**: if your count exceeds `hard`, pick something from *escalates to* or
split across slides. `npm run lint:deck` warns after the fact (`capacity-crowd` /
`capacity-overflow`); this column is how you avoid the rework.

**A `*` means the budget VARIES BY DECK SIZE**, and the number shown is the wide
(16:9) one. A `mobile`/`strip` deck holds fewer, a `tall` deck often more — `list` is
5/6/6 wide but crowds at 5 on mobile. For any deck that is not wide, read the
per-family numbers in the component's `.docs.md` before counting.

A `—` capacity means **no count budget is published** for this component — not that it
holds unlimited items. Where the budget is a prose length rather than a count (a title,
a big number), the component's `.docs.md` is the record.

**`escalates to`** is where to go when your count blows the budget; **`see also`** is
where to go when the SHAPE is wrong — the components this one is most often confused
with. Each relation's `when` clause is in this component's `.docs.md`.

| component | bucket | form/function/substance | capacity | escalates to | tags | see also | purpose |
|---|---|---|---|---|---|---|---|
| closing | anchor | bookend/anchor/prose | — |  | summary takeaway board-deck | title divider big-number | Last slide of every deck. |
| divider | anchor | divider/anchor/prose | — |  | section-break agenda-setting walkthrough | title closing | Marks the start of a major section. |
| title | anchor | bookend/anchor/prose | — |  | pitch board-deck showcase kickoff | divider closing | First slide of every deck. |
| big-number | statement | canvas/statement/prose | — |  | hero-number metric pitch | stats kpi split-panel content | Use to make one metric land. |
| content | statement | canvas/statement/prose | item:5/6/7* |  | walkthrough overview summary | quote big-number cards-grid compare-prose list-steps | The catch-all for explanatory content that doesn't fit a more structured layout. |
| premise | statement | split/statement/series | item:4/6/8 | split across slides (automatic), list-tabular | onboarding ranking definition overview | split-panel list-tabular cards-stack glossary | Use when a deck needs to introduce an ORDERED vocabulary — a maturity ladder, a set of named stages, a ranked taxonomy — and wants one framing claim to sit … |
| quote | statement | canvas/statement/prose | — |  | pull-quote quotation showcase | split-panel content big-number | Use to land a phrase verbatim — customer voice, expert claim, mission statement. |
| split-panel | statement | panel/statement/structure | — |  | summary board-deck hero-number pull-quote takeaway | split-compare compare-prose big-number list-steps | Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel and the right side carries the supporting points. |
| actors | inventory | ledger/inventory/structure | item:4/6/7 | list-tabular, split across slides | ownership onboarding reference | list-tabular cards-stack list glossary | Use to show 'who owns what' across a process, scoring policy, or org chart. |
| agenda | inventory | stack/inventory/structure | item:4/6/6 | split across slides | agenda-setting overview onboarding kickoff | divider list title | Use as the second slide of any multi-section deck. |
| cards-grid | inventory | grid/inventory/structure | item:3/4/4* | list-tabular, split across slides | overview showcase summary | list-steps cards-stack compare-prose verdict-grid | Use when the audience needs to compare or scan a small set of options at a glance. |
| cards-stack | inventory | stack/inventory/structure | item:3/4/4 | list-tabular, split across slides | overview summary reference | cards-grid compare-prose list-steps | Use when the items want vertical reading order — sequential exploration rather than a-glance comparison. |
| checklist | inventory | stack/inventory/structure | item:6/8/9 | split across slides | status stoplight process requirements | list list-tabular cards-stack | Use for completion reports, readiness audits, or pre-flight checks. |
| glossary | inventory | ledger/inventory/structure | — |  | definition reference onboarding | list-tabular divider actors list | Use for jargon-heavy decks where the audience needs a reference page. |
| inventory | inventory | ledger/inventory/structure | item:4/5/6* | list-tabular, split across slides | overview summary showcase | cards-grid list-steps list-tabular timeline-list | Use for a small register of related items where each carries similar weight. |
| list | inventory | stack/inventory/prose | item:5/6/6* |  | overview summary takeaway walkthrough | cards-stack list-tabular checklist | Use when the items are genuinely a flat list of one-line points. |
| list-tabular | inventory | ledger/inventory/structure | — |  | reference overview status | glossary cards-stack actors list | Use for compact reference tables: glossary-style entries, key/value pairs, specs. |
| logo-wall | inventory | grid/inventory/prose | — |  | visual showcase pitch | actors cards-grid big-number quote image | Use for the credibility slide — the 'trusted by' / 'our funders' / 'participating agencies' wall. |
| q-and-a | inventory | stack/inventory/structure | item:4/5/6 | split across slides (automatic) | pitch board-deck recommendation | list-tabular glossary list-criteria cards-stack decision | Use to pre-empt the room: line up the three or four hardest questions the audience will raise and answer each one before it is asked. |
| team-profile | inventory | grid/inventory/structure | item:6/12/12 | actors, list-tabular, split across slides | org-chart onboarding kickoff pitch |  | Use for the people slide — 'meet the leaders', 'your account team', the QBR roll-call. |
| compare-prose | comparison | split/comparison/structure | — |  | tradeoff contrast recommendation transformation retrospective | compare-code split-compare verdict-grid decision | Use to weigh two approaches against each other in body text. |
| compare-table | comparison | ledger/comparison/prose | row:4/6/8 | split across slides | tradeoff ranking assessment | compare-prose verdict-grid obligation-matrix cards-stack | Use when you have 3+ options or 4+ rows of criteria. |
| decision | comparison | canvas/comparison/structure | — |  | recommendation tradeoff strategy | compare-prose split-compare closing big-number | Use after a comparison slide to land the decision. |
| matrix-2x2 | comparison | matrix/comparison/structure | 4/4/4 |  | two-by-two prioritize strategy risk | quadrant verdict-grid obligation-matrix matrix-grid cards-grid | Use for categorical 2×2 reasoning when the items are fixed and you control which cell each lands in. |
| pricing | comparison | grid/comparison/structure | item:3/4/4 | compare-table, split across slides | pitch tradeoff recommendation | compare-table verdict-grid cards-grid decision big-number | Use for the plans / packages slide — two to four tiers compared on price and features, with one tier elevated as the recommendation. |
| redline | comparison | canvas/comparison/prose | — |  | contract contrast compliance transformation | compare-code compare-prose state-chart obligation-matrix | Use when an amendment's diff is the slide. |
| split-compare | comparison | split/comparison/structure | item:2/2/2 | decision, compare-table | tradeoff recommendation contrast | compare-prose decision split-panel verdict-grid | Use when a decision frames a binary choice and the recommendation must be unambiguous. |
| verdict-grid | comparison | grid/comparison/structure | item:3/4/5 | compare-table, split across slides | scorecard ranking prioritize assessment | compare-prose split-compare obligation-matrix compare-table checklist | Use to evaluate 2–4 options against the same set of criteria, with pass/partial/fail badges. |
| cycle | progression | timeline/progression/structure | item:4/5/6 | list-steps, split across slides | process workflow retrospective | list-steps timeline-list diagram | Use when the sequence is CIRCULAR: a natural cycle, a feedback loop, a recurring phase. |
| list-criteria | progression | ledger/progression/structure | item:4/5/5 |  | requirements assessment okr | list-steps checklist verdict-grid list list-tabular | Use to enumerate the criteria a decision must meet, in priority order. |
| list-steps | progression | timeline/progression/structure | item:4/5/5 | timeline-list, split across slides | process walkthrough planning | list-criteria split-panel roadmap list funnel | Use for richer sequential processes where each step needs a paragraph rather than a label. |
| kpi | evidence | ledger/evidence/structure | item:3/4/4* | stats, split across slides | dashboard scorecard metric okr | stats big-number split-panel progress timeline-list | Use for KPI dashboards with status framing — current value, target, trend, attention-needed. |
| stats | evidence | stack/evidence/structure | item:4/5/6 | kpi, split across slides | dashboard metric percentage | big-number kpi split-panel piechart progress | Use for at-a-glance metric rows — quarterly results, headline KPIs. |
| image | imagery | canvas/imagery/prose | — |  | visual showcase pitch | diagram content title quote | Use when a visual carries meaning on its own. |
| scene | imagery | canvas/imagery/prose | — |  | visual showcase walkthrough | image diagram video | Use to put an Anima scene (a 3D mechanism, a self-drawing process flow) on a slide as its hero still. |
| video | imagery | canvas/imagery/prose | — |  | visual showcase pitch | image closing diagram | Use to put a YouTube / Vimeo / TikTok / Instagram video on a slide. |
| bar | chart | canvas/evidence/series | — |  | metric ranking contrast board-deck | progress piechart funnel stats big-number | Use when the claim is that these categories differ in size: revenue by region, headcount by team, spend by line item, variance against plan. |
| bullet | chart | canvas/evidence/series | — |  | metric okr scorecard assessment | progress bar big-number stats gantt | Use when the question is 'are we on plan'. |
| funnel | chart | canvas/evidence/series | — |  | percentage sequence pitch | progress stats piechart list-steps big-number | Use for a pipeline that narrows — a sales / conversion funnel, a hiring or grant pipeline, an onboarding flow. |
| gantt | chart | timeline/progression/series | — |  | swimlane planning milestones agile | roadmap kanban list-steps | Use for project plans with overlapping or staggered tasks. |
| journey | chart | timeline/progression/structure | — |  | process assessment walkthrough | list-steps gantt kanban | Use when a process or experience needs charting as a horizontal sequence of moments, each scored for affect. |
| kanban | chart | timeline/progression/series | item:3/5/6 | split across slides | swimlane workflow status agile ownership | gantt roadmap checklist verdict-grid | Use for status snapshots: what's in each lane (todo/doing/done or similar). |
| line | chart | canvas/evidence/series | — |  | metric board-deck takeaway strategy | bar slope stacked-bar bullet gantt | Use when the claim is that something MOVED: revenue by quarter, headcount through a reorg, latency after a fix. |
| map | chart | spatial/evidence/series | — |  | metric proportion overview visual | progress stats piechart image | Use when the story is geographic — program reach, service territories, where the grants landed, the regions you operate in. |
| matrix-grid | chart | matrix/comparison/structure | — |  | stoplight assessment positioning okr | obligation-matrix roadmap matrix-2x2 verdict-grid | Use for a rubric where BOTH axes are ordered categories (a depth ladder × a reach ladder, a maturity level × a scope) and a reader needs to see one position at … |
| piechart | chart | canvas/evidence/series | — |  | donut proportion percentage | progress stats big-number kpi | Use for part-to-whole breakdowns with three to six slices. |
| progress | chart | canvas/evidence/series | — |  | percentage stoplight status | kpi stats gantt checklist timeline-list | Use for status-tracking across multiple parallel items (project readiness, OKR progress, capacity utilization). |
| quadrant | chart | scatter/evidence/series | — |  | two-by-two positioning prioritize risk | matrix-2x2 radar progress piechart verdict-grid | Use to position items by two numeric attributes (cost × value, effort × impact). |
| radar | chart | scatter/evidence/series | — |  | spider assessment positioning | quadrant verdict-grid kpi compare-table piechart | Use to compare 2–4 options across the same 4–8 criteria. |
| roadmap | chart | matrix/progression/structure | col:4/5/5 | split across slides | planning swimlane milestones agile | gantt kanban list-steps verdict-grid checklist | Use to show what ships in each phase across multiple parallel workstreams. |
| scatter | chart | canvas/evidence/series | — |  | metric tradeoff positioning board-deck | quadrant matrix-2x2 radar progress list-tabular | Use when the argument is that two measures move together (or against each other) and both numbers matter: cost against value, price against adoption, risk … |
| slope | chart | canvas/evidence/series | — |  | ranking transformation contrast board-deck | line bar stats big-number piechart progress | Use when the claim is that the ORDER changed between two points — market share before and after, unit cost at two dates, satisfaction across a program … |
| stacked-bar | chart | canvas/evidence/series | — |  | proportion board-deck metric summary | piechart progress funnel matrix-grid | Use when the claim is that a total DECOMPOSES — revenue by product line across quarters, cost by function across years, headcount by team across sites. |
| state-chart | chart | timeline/progression/graph | — |  | flowchart states workflow | diagram journey timeline-list list-steps roadmap | Use to show a finite-state machine — the discrete states a system can be in and the events that move between them. |
| timeline-list | chart | timeline/evidence/series | — |  | changelog milestones status retrospective | regulatory-update gantt list-steps journey roadmap progress | Use for milestone history or annotated timelines. |
| waterfall | chart | canvas/progression/series | — |  | board-deck metric transformation | bar stacked-bar funnel big-number line | Use for a variance walk — budget to actual, an EBITDA bridge, price/volume/mix, a headcount reconciliation. |
| word-cloud | chart | canvas/evidence/series | — |  | tag-cloud themes proportion | progress stats piechart quote list | Use for qualitative summaries — retrospective themes, survey verbatims. |
| diagram | diagram | canvas/evidence/graph | — |  | flowchart org-chart sequence process | code quadrant radar timeline-list content | Use for relational or topological visuals — flowcharts, sequence diagrams, state machines, ER diagrams. |
| math | math | canvas/evidence/prose | — |  | formula assessment reference | code diagram stats content | Use when the slide IS the equation. |
| code | code | canvas/evidence/prose | — |  | snippet walkthrough reference | compare-code diagram math content | Use when the code IS the slide — an API snippet, a config example, a migration. |
| compare-code | code | split/comparison/structure | — |  | snippet contrast tradeoff | compare-prose redline redline compare-table | Use to contrast a before/after refactor, two API styles, or two configurations. |
| authority-chain | legal | timeline/progression/structure | item:4/5/6 | split across slides (automatic), statute-stack | regulation citation sequence | regulatory-update list-criteria list-steps | Use when the audience needs to see how a rule descends: what the statute says, how the agency implemented it, what guidance interpreted it, and what cases have … |
| citation-card | legal | canvas/evidence/prose | — |  | citation quotation contract | statute-stack quote split-panel content | Use when one citation IS the slide. |
| obligation-matrix | legal | matrix/comparison/structure | — |  | compliance regulation stoplight | compare-table verdict-grid matrix-2x2 checklist matrix-grid | Use when many regimes need comparing across the same obligations. |
| policy-recommendation | legal | panel/statement/structure | item:3/3/3 | list-criteria, split across slides | recommendation regulation risk takeaway | split-compare decision list-criteria regulatory-update | Use to put ONE policy recommendation before lawmakers. |
| regulatory-update | legal | ledger/progression/structure | item:4/5/6 | split across slides (automatic), list-tabular | changelog compliance regulation | timeline-list authority-chain list-criteria list-steps list-tabular | Use when a quarter's regulatory motion needs a single-slide digest. |
| statute-stack | legal | ledger/inventory/structure | item:3/4/5 | split across slides (automatic), list-tabular | citation reference compliance | list-tabular obligation-matrix authority-chain compare-table | Use when three or four parallel jurisdictions need to read at a glance: each row carries the jurisdiction label, the citation, the obligation summary, and an … |
| contact | connect | panel/statement/structure | — |  | reference onboarding kickoff | wifi | Use as the "scan to add me" close or a speaker-intro slide. |
| wifi | connect | panel/statement/structure | — |  | reference onboarding kickoff | contact | Use to get a room onto the Wi-Fi without reading a password aloud. |

