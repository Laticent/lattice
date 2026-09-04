# Which layout, and how to author it

One file per component. Open the one you picked and it tells you everything: slots,
variants, budgets, common mistakes, the data shape.

## How to pick

1. Find your intent in the families below. Each entry says what it is **for**, what it
   is **not for**, and which component to use **instead** when yours is the wrong fit.
2. Open `<name>.md` — median ~1.7k tokens.
3. Author the slide against that file, plus the rules in `../authoring/rules.md`.

`_index.md` (~4.2k tokens) is the same catalog as a flat, greppable table —
reach for it when you want to search by tag or capacity rather than browse by intent.

**The "not for" lines are the ones that save you.** Choosing between two plausible
components is where an agent goes wrong, and the deciding fact is almost always the
anti-pattern, not the purpose.

## The families

### anchor — where you are in the deck.

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

### statement — one declarative claim per slide.

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

### inventory — parallel sets of related items.

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

### comparison — how two or more options differ.

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

### progression — ordered movement through stages or time.

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

### evidence — data that supports the argument.

- **`kpi`** — Executive KPI system — one base, five layout modifiers.
  - *not for:* Decorative pills without status semantics
  - *use `stats` when* metric row without targets or status pills
  - *use `big-number` when* a single number is the whole argument
- **`stats`** — Row of 3–5 stat tiles, each with a big number and a label.
  - *not for:* Six or more tiles
  - *use `big-number` when* one number is enough to carry the slide
  - *use `kpi` when* metrics need targets, trends, and status pills

### imagery — visuals that carry their own meaning.

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

### chart — series-substance data visualizations (SVG kernel).

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
- **`state-chart`** — Native state machine diagram — states as a numbered list, transitions as nested inline-code refs.
  - *not for:* More than ~8 states
  - *use `diagram` when* the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
  - *use `journey` when* the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- **`timeline-list`** — Date-stamped event list rendered as a horizontal spine — a dot per event with its date pill above and title, status pill, and body stacked below.
  - *not for:* Date-less steps
  - *use `regulatory-update` when* the dated entries are regulatory changes and every row carries a citation
  - *use `gantt` when* milestones occupy date ranges, not single moments
- **`word-cloud`** — Spiral-packed word cloud — items sized by weight.
  - *not for:* Precise comparisons
  - *use `progress` when* the weights need precise visual comparison
  - *use `stats` when* the headline metrics are independent numbers, not a corpus
- **`_chart-family.md`** — the shared contract every chart component wraps in. Read it too.

### diagram — graph-substance network visuals (external renderer).

- **`diagram`** — Mermaid diagram as the slide's centerpiece.
  - *not for:* Tabular data on axes
  - *use `code` when* the implementation, not the topology, is the argument
  - *use `quadrant` when* items positioned by two numeric attributes

### math — typeset equations and proofs.

- **`math`** — Boardroom-quality math layouts for mathematicians, quants, ML researchers, physicists, statisticians, and economists.
  - *not for:* Two display equations in the base layout
  - *use `code` when* the implementation, not the equation, is the argument
  - *use `diagram` when* the structure of the model, not its closed form

### code — syntax-highlighted source code blocks.

- **`code`** — Single fenced code block as the slide's centerpiece.
  - *not for:* Comparing two versions
  - *use `compare-code` when* before/after snippet comparison
  - *use `diagram` when* the architecture matters more than the code
- **`compare-code`** — Two fenced code blocks side-by-side, each with a label.
  - *not for:* One side is prose
  - *use `compare-prose` when* the change is state, not code
  - *use `redline` when* the comparison is prose-versus-prose

### legal — citation-aware layouts for statutes, obligations, and regulatory change.

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

### connect — cards the room can scan: join the network, save the speaker.

- **`contact`** — An identity card that encodes a vCard: name, title and contact lines beside a QR that saves the presenter to a phone.
  - *not for:* Not a team roster
  - *use `wifi` when* the card is a network to join rather than a person
- **`wifi`** — A network join card: readable Wi-Fi credentials beside a QR a phone scans to connect in one tap.
  - *not for:* Not for secrets that outlive the room
  - *use `contact` when* the card is a person's identity rather than a network

---

_Generated from the component manifests. Every line here is derived; nothing is restated by hand._
