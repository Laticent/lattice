# Write a Lattice deck

Lattice turns one Markdown file into a boardroom-ready deck: PDF, PowerPoint, images or
a web player. Each slide picks a layout with `<!-- _class: NAME -->`, and a palette
colors the whole deck. This file is everything you need to write a good one. Read it
top to bottom once.

Then, for each layout you use, open its file (each name below links to it): it gives
how much the layout holds, its variants, and the mistakes reviewers flag. That is the
difference between a deck that renders and one worth showing.

## 1. The file

```markdown
---
theme: indaco
paginate: true
---
```

- `theme:` picks the palette. `indaco` is the default; `cuoio`, `onyx`, `carta`, `laguna`
  and more ship with Lattice. Add `color-mode: dark` for the dark version.
- `paginate: true` numbers the slides.
- Separate slides with a line containing only `---`, with a blank line on each side.
- Start every slide with one `<!-- _class: NAME -->` line. Use only names from section 5.

## 2. What a good deck is

This is the canon the Lattice Studio sends its own model on every turn.

HOW A BOARDROOM DECK WORKS (so your edits read as an argument, not a file dump):
• ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the slide's claim — never a label ("Q2 Results"), never a question. The body then DELIVERS the claim (the mechanism, the number); it never just restates the heading.
• NARRATIVE ARC: a title that states the stakes -> sections that build the argument -> a closing that names ONE ask. Read top to bottom, the headings alone should BE the argument.
• RHYTHM: interleave a prose claim, an evidence beat (a number / chart), a human beat (a quote), a decision beat. Never run three prose slides in a row.
• RESTRAINT: aim ~70 words of body and <= 6 bullets per slide (a deck declaring `profile: teaching` gets 95). Chrome soft budgets: title <= 10 words, eyebrow <= 5, subtitle <= 12, key-insight <= 18. When content overflows, SPLIT the slide — never shrink the font.
• RIGHT COMPONENT per slide, chosen by INTENT then CAPACITY: match the intent to a component in the catalog, then COUNT the content against that component's capacity — if it exceeds the hard budget, use the escalateTo target or split across slides. Pick from the catalog, never memory.
• CARD-style layouts nest "- Title" then a two-space-indented "  - body" — never an inline "- **Title.** body".
• BOOKENDS are stereotyped: the title slide puts "# h1" FIRST, then a backtick `eyebrow`, then a one-sentence subtitle; both the title and the closing carry `silent`. The closing is ONE sentence plus a signature — never a bulleted "next steps" list.
TRAPS TO AVOID (each is exactly what the deck reviewer flags — self-avoid them up front):
  - a heading that is a category label, not the takeaway → make the heading the message itself — "Revenue grew 18%, led by APAC"
  - a title slide with placeholder text, or no subtitle to orient the room → name the deck, and add one plain line of framing under the h1
  - a data slide whose heading names the topic, not the "so what" → put the conclusion the data supports in the h2, not just its subject
  - a hero number with nothing to compare it to → add a baseline, direction, or target — a bare number is a boast, not a claim
  - a slide dense enough that it holds more than one idea → split it, or cut to the essential point and push detail to speaker notes
  - an element run well past its word budget → tighten hard to the essential point
  - an element crowding its word budget → trim toward the soft target so it reads light
  - a state marker written with braces, which makes a pill rather than a mark → use brackets — `` `[x]` `` inline, or `- [x] text` bare at the start of a bullet
  - a heading too long to land on one tight line → trim to a single assertion; qualifiers and caveats go in the body
  - a numbered divider whose heading fills the band under the section mark and runs off the frame → trim the section name, or drop `numbered` on that slide
  - two dividers in a row → add a slide between them, or merge them
  - stacked possessives ("the system’s policy’s…") that stumble read aloud → one possessive at a time; restructure the phrase to speak cleanly
  - three or more headings opening the same way → vary the opening and verb — identical openings read as a drone
  - two slides making the same claim → give each a distinct takeaway, or merge the duplicate slides
  - a heading with no body — a placeholder shipped as content → fill it with the supporting content, or make it a deliberate divider
  - an image that carries meaning but has no alt text → describe what it shows in the brackets so screen readers reach it
  - a deck that never states what it wants from the room → add a decision slide or a plain "we recommend…" line near the close
  - a long deck with no roadmap the audience can track → add an agenda slide near the top
  - more slides than the talk time supports → aim for ~1–2 minutes per slide; cut the rest
  - a chrome slot (eyebrow, subtitle, key-insight) over its word budget → tighten the slot toward its soft budget — chrome frames the slide, it doesn’t carry it

## 3. Rules for every slide

- Author every slide as plain Markdown. Choose a layout with `<!-- _class: NAME -->` at the top of the slide; separate slides with a line containing only `---`.
- Use each layout’s skeleton below VERBATIM as the structure — match its heading levels and bullet nesting exactly. Do not invent a structure.
- A variant can change a layout’s authoring STRUCTURE, not just its look. When a variant below shows its OWN skeleton, match THAT skeleton for that variant — not the base one (e.g. `list-tabular` rows are `1. Name` + a nested description, but `list-tabular metric` is `1. Name \`value\`` with no description row).
- Card-style layouts (cards-grid, cards-stack, compare-prose, matrix-2x2, verdict-grid, decision, citation-card, pricing, q-and-a, cycle, policy-recommendation, team-profile) and the panel-split layouts (split-panel, split-compare) take NESTED bullets — a top-level bullet is the card title, a nested bullet is its body. NEVER write inline `- **Title.** body` on these; the body would inherit the title’s bold. Indent a nested bullet to match its parent’s marker width: 2 spaces under a `-` parent, 3 under a `1.` parent. Any layout whose skeleton shows `1.` rows (premise, timeline-list, kpi, list-tabular, …) needs 3.
- Two components on one slide is a HOST component, `columns` or `rows`, whose body is two other components: `<!-- _class: columns ratio-60-40 -->` (side by side; ratio optional, 25–75) or `<!-- _class: rows -->` (stacked), the slide’s `## title` first, then each pane as a slide one heading level down — `<!-- _pane: bar -->` (optional; default content) above a `### Pane title`, a short label of five words or fewer (it renders as small capitals; no eyebrow pill above it). Every top-level `###` on such a slide is a pane’s title. A trailing `>` Key Insight is the slide’s, set below both panes. Two panes per slide.
- Title slides: `<!-- _class: title silent -->`, then an `# H1`, then a backtick-wrapped `eyebrow` paragraph, then a single plain subtitle paragraph — that order exactly, nothing more. The eyebrow is matched as the paragraph IMMEDIATELY after the h1, so authoring the subtitle first silently renders the eyebrow as a second subtitle line instead.
- Compose tokens on the class, space-separated: a layout’s own VARIANTS (listed with each layout, e.g. `list-steps timeline`) plus the cross-cutting BASE MODIFIERS — `dark`, `numbered`, `mirror`, `silent`, the `tint-*` / `mark-*` / `with-*` families, and the `tone-pass` / `tone-fail` / `tone-warn` / `tone-skip` state markers. Colors come from theme tokens — never author raw hex.
- Rich blocks are supported: ```mermaid or ~~~mermaid (25 diagram types), ```functionplot (plotted functions), ```anima (motion scenes), and $$…$$ or ```math (KaTeX display math; $…$ inline). There is NO ```chart fence — the chart layouts (funnel, progress, quadrant, radar, piechart, …) are authored as nested Markdown lists like every other layout, chosen with `_class`.
- A photo is Markdown’s picture alone on its own line, with a name: `![The team at the offsite](photo.jpg)`. The slide’s class places it: `image` beside the text (`image mirror` on the left), `bleed` behind the whole slide; anywhere else it is a picture in the text. NEVER write Marp’s `![bg …](…)` keywords (`![bg right](photo.jpg)`): Lattice draws them as an ordinary picture and keeps the slide’s photo out of its panel.
- Keep it tight — slides are glance media, not documents. Respect each layout’s `Budget:` line (max elements + words per element). Universal limits on ANY slide regardless of layout: eyebrow ≤ 5 words, slide title ≤ 10, subtitle ≤ 12, a `> ` key-insight ≤ 18 (one memorable sentence), a status pill 1–2 words. When an element needs more, cut it or move the detail to speaker notes — never let a card become a paragraph.
- Speaker notes: a plain HTML comment on the slide, `<!-- Pause here for questions. -->`.
  `<!-- say: … -->` holds the exact words to speak. Notes never show on the slide.
- A `kpi` row's first pill takes its color from the row's POSITION, never its words:
  plain `kpi` draws every row green with a check (on plan); `kpi attention` draws row 1 in
  the warning color; `kpi ops` rows 1 and 3; `kpi compliance` row 3. Put an off-plan metric
  on a warning row, or leave its pill off and say the miss in the context line. A second
  pill on a row is a neutral tag.
- A `kpi` key insight (`>`) fits only with 3 rows, and never on `kpi ops`; `kpi compliance`
  holds 3 rows. Past that the export clips the slide: drop the `>` or split.
- `big-number` and `quote` take an optional `## ` claim above the number or the quotation;
  their skeletons omit it. Write one, so the headings-only read keeps the beat.
- A `timeline-list` status pill is one of 10 words: `on-track` `done` `live` `at-risk` `warn` `blocked` `fail` `pilot` `decision` `deferred`.
  Any other word draws in the info color.

## 4. Parts any slide can carry

These work on almost every layout with no class: write the Markdown shape and the slide
draws it. A layout line in section 5 says when it does not take a key insight or a
below-note. Each name links to the full rule and examples.

- [Eyebrow labels](./authoring/universal.md#eyebrow-labels): A paragraph containing only a single inline-code span, placed **above** a heading or list, renders as a mono uppercase label.
- [Subtitle labels](./authoring/universal.md#subtitle-labels): A paragraph containing only a single inline-code span, placed **below** a heading, renders as body-font italic in `--text-secondary` — no pill, no mono, no uppercase.
- [A pill on a list row](./authoring/universal.md#a-pill-on-a-list-row): A pill on a list row is written in the pills plugin's notation, `` `{…}` ``, and a component that takes one places and tints it.
- [Key Insight panel](./authoring/universal.md#key-insight-panel): Any card-bearing layout that ends with a trailing `> blockquote` renders it as a **Key Insight panel** — an accent-tinted bar that pins below the card content.
- [Below-Note](./authoring/universal.md#below-note): A short paragraph after a list/table/blockquote, prefixed by an em-dash hairline rule.
- [Annotation](./authoring/universal.md#annotation): A trailing paragraph whose only content is an `_italic_` span renders as an annotation — a `✦` in `--accent`, DRAWN from the `--shape-spark` mask rather than typed,…
- [The three trailing-paragraph registers — comparison](./authoring/universal.md#the-three-trailing-paragraph-registers--comparison): The three registers are told apart by MARKDOWN SHAPE, not by a class the author types.
- [Labeled Corner Tag](./authoring/universal.md#labeled-corner-tag): The named-slot sibling of the numbered corner tag.
- [Auto-Numbered cards — and what `1.` versus `-` means everywhere](./authoring/universal.md#auto-numbered-cards--and-what-1-versus---means-everywhere): Every layout answers one question the same way: **does the marker you type mean anything here?** The component's manifest declares the answer (`lists`), and the engine…

**Deck-wide settings (front matter).** Each key sets one thing for the whole deck:

- [`plugins:`](./authoring/registers.md#the-plugins-front-matter-import-list): front-matter import list
- [`preset:`](./authoring/registers.md#the-preset-front-matter-register-a-named-look): a named look
- [`mode:`](./authoring/registers.md#the-mode-front-matter-register-rendering-mode): rendering mode
- [`fit:`](./authoring/registers.md#the-fit-front-matter-register-what-the-engine-may-do-to-make-a-slide-fit): what the engine may do to make a slide fit
- [`finish:`](./authoring/registers.md#the-finish-front-matter-register-backdrop): backdrop
- [`split:`](./authoring/registers.md#the-split-front-matter-divider): front-matter divider
- [`stamp:` / `tone:`](./authoring/registers.md#the-stamp--tone-front-matter-registers-marker-shape): marker shape
- [`spectrum:` / `spectrum-edge:`](./authoring/registers.md#the-spectrum--spectrum-edge-registers-the-spectrum-accent-finish): the spectrum accent finish
- [`rule:`](./authoring/registers.md#the-rule-front-matter-register-heading-underline): heading underline
- [`inline-code:`](./authoring/registers.md#the-inline-code-front-matter-register-pills-and-marks): pills and marks
- [`eyebrow:`](./authoring/registers.md#the-eyebrow-front-matter-register-kicker-decoration): kicker decoration
- [`headline:`](./authoring/registers.md#the-headline-front-matter-register-framing-text-alignment): framing-text alignment
- [`lift:`](./authoring/registers.md#the-lift-front-matter-register-card-elevation): card elevation
- [`typography:`](./authoring/registers.md#the-typography-front-matter-register-the-type-set): the type set
- [`venue:`](./authoring/registers.md#the-venue-front-matter-register-where-the-deck-is-seen): where the deck is seen
- [`marks:`](./authoring/registers.md#the-marks-front-matter-register-how-charts-spend-color): how charts spend color
- [`cards:`](./authoring/registers.md#the-cards-front-matter-register-where-a-card-row-puts-its-spare-height): where a card row puts its spare height
- [`tag:`](./authoring/registers.md#the-tag-front-matter-register-card-tags): card tags
- [`image-card:`](./authoring/registers.md#the-image-card-front-matter-register-the-text-card-on-a-photo): the text card on a photo
- [`spark:`](./authoring/registers.md#the-spark-front-matter-register-inline-sparks): inline sparks
- [`callout:`](./authoring/registers.md#the-callout-front-matter-register-chart-callouts): chart callouts
- [`corners:`](./authoring/registers.md#the-slides-corner--corners): slide's corner
- [`progress-rail:`](./authoring/registers.md#the-section-rail--progress-rail): section rail
- [`agenda:`](./authoring/registers.md#the-agenda--agenda): agenda
- [`delivery:`](./authoring/registers.md#the-delivery-front-matter-register-how-the-narrated-guide-gestures): how the narrated Guide gestures
- [`greeting:` / `closing:`](./authoring/registers.md#the-greeting--closing-front-matter-registers-what-a-narrated-deck-says-first-and-last): what a narrated deck says first and last
- `profile:` (`general` · `teaching` · `mission`): the genre the checker judges the deck against; `teaching` allows denser slides

## 5. All 80 layouts

Pick by what the slide has to do. Each line gives the layout's job and how much it holds;
past the maximum, split the slide or pick a roomier layout. If nothing fits, use
`content` for prose or `list` for bullets. Never invent a name.

**Where you are in the deck**

- [`closing`](./components/closing.md): Last slide of every deck. Variants: `qr`, `index`, `spectrum`. No below-note.
- [`divider`](./components/divider.md): Marks the start of a major section. Variants: `numbered`, `light`, `qr`. No below-note.
- [`title`](./components/title.md): First slide of every deck. Variants: `spectrum`. No below-note.
- [`topic`](./components/topic.md): Marks a topic WITHIN a section, where `divider` marks the boundary BETWEEN sections. Variants: `fact`. No below-note.

**One claim per slide**

- [`big-number`](./components/big-number.md): Use to make one metric land.
- [`content`](./components/content.md): The catch-all for explanatory content that doesn't fit a more structured layout. (best 5, max 7 items)
- [`premise`](./components/premise.md): Use when a deck needs to introduce an ORDERED vocabulary — a maturity ladder, a set of named stages, a… (best 4, max 8 items) ~14 words per item.
- [`quote`](./components/quote.md): Use to land a phrase verbatim — customer voice, expert claim, mission statement. Variants: `bare`. No key insight or below-note.
- [`split-panel`](./components/split-panel.md): Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel… ~16 words per item. Variants: `metric`, `pullquote`, `steps`, `watermark`, `proof`, `capstone`, `mirror`, `qr`, `cat-1`, `cat-2`, `cat-3`, `cat-4`, `cat-5`, `cat-6`, `cat-7`, `cat-8`. No key insight or below-note.

**A set of related items**

- [`actors`](./components/actors.md): Use to show 'who owns what' across a process, scoring policy, or org chart. (best 4, max 7 items) ~12 words per item.
- [`agenda`](./components/agenda.md): Use as the second slide of any multi-section deck. (best 4, max 6 items) ~10 words per item. Variants: `progress-1`, `progress-2`, `progress-3`, `progress-4`, `progress-5`, `progress-6`, `circles`, `checks`.
- [`cards-grid`](./components/cards-grid.md): Use when the audience needs to compare or scan a small set of options at a glance. (best 3, max 4 items) ~15 words per item. Variants: `four`, `three`, `numbered`.
- [`cards-stack`](./components/cards-stack.md): Use when the items want vertical reading order — sequential exploration rather than a-glance comparison. (best 3, max 4 items) ~16 words per item. Variants: `horizontal`, `numbered`.
- [`checklist`](./components/checklist.md): Use for completion reports, readiness audits, or pre-flight checks. (best 6, max 9 items) ~10 words per item.
- [`glossary`](./components/glossary.md): Use for jargon-heavy decks where the audience needs a reference page. ~16 words per item.
- [`inventory`](./components/inventory.md): Use for a small register of related items where each carries similar weight. (best 4, max 6 items) ~14 words per item. Variants: `cards`, `timeline`, `editorial`. No key insight.
- [`list`](./components/list.md): Use when the items are genuinely a flat list of one-line points. (best 5, max 6 items) ~14 words per item. Variants: `takeaway`, `principles`, `lettered`, `roman`, `bullet`.
- [`list-tabular`](./components/list-tabular.md): Use for compact reference tables: glossary-style entries, key/value pairs, specs. ~12 words per item. Variants: `def`, `metric`, `spec`, `register`, `rule`, `solid`, `stacked`, `outline`, `fit-name`, `fit-body`, `fit-meta`, `flex-name`, `flex-meta`, `fixed`.
- [`logo-wall`](./components/logo-wall.md): Use for the credibility slide — the 'trusted by' / 'our funders' / 'participating agencies' wall. Variants: `color`, `dense`.
- [`q-and-a`](./components/q-and-a.md): Use to pre-empt the room: line up the three or four hardest questions the audience will raise and answer… (4 items) ~12 words per item. Variants: `spine`, `rail`, `tab`, `grid`, `solo`.
- [`team-profile`](./components/team-profile.md): Use for the people slide — 'meet the leaders', 'your account team', the QBR roll-call. (best 6, max 12 items) ~12 words per item. Variants: `lead`, `bench`, `sides`, `bio`.

**How options differ**

- [`compare-prose`](./components/compare-prose.md): Use to weigh two approaches against each other in body text. ~20 words per item. Variants: `transition`, `mirror`, `chosen`, `decision`, `vertical`, `tag-band`, `rejected`, `axis`.
- [`decision`](./components/decision.md): Use after a comparison slide to land the decision. ~20 words per item. Variants: `tag-band`.
- [`matrix-2x2`](./components/matrix-2x2.md): Use for categorical 2×2 reasoning when the items are fixed and you control which cell each lands in. (4 items) ~10 words per item.
- [`pricing`](./components/pricing.md): Use for the plans / packages slide — two to four tiers compared on price and features, with one tier… (best 3, max 4 items) Variants: `two`, `four`.
- [`redline`](./components/redline.md): Use when an amendment's diff is the slide. Variants: `annotated`, `three-col`, `split`, `stacked`. No key insight.
- [`split-compare`](./components/split-compare.md): Use when a decision frames a binary choice and the recommendation must be unambiguous. (2 items) ~14 words per item. No key insight or below-note.
- [`table`](./components/table.md): Use when the table IS the slide. (best 4, max 8 rows) ~12 words per row.
- [`verdict-grid`](./components/verdict-grid.md): Use to evaluate 2–4 options against the same set of criteria, with a check per criterion. (best 3, max 5 items) ~12 words per item.

**Steps, stages, time**

- [`cycle`](./components/cycle.md): Use when the sequence is CIRCULAR: a natural cycle, a feedback loop, a recurring phase. (best 4, max 6 items) ~12 words per item.
- [`list-steps`](./components/list-steps.md): Use for richer sequential processes where each step needs a paragraph rather than a label. (best 4, max 5 items) ~14 words per item. Variants: `vertical`, `chevron`, `converge`, `ghost`, `timeline`, `phase`, `milestone`, `lettered`, `stage`, `rank`, `tier`, `roman`, `capsule`.

**Numbers and proof**

- [`kpi`](./components/kpi.md): Use for KPI dashboards with status framing — current value, target, trend, attention-needed. (best 3, max 4 items) ~8 words per item. Variants: `attention`, `ops`, `compliance`, `trajectory`, `spotlight`.
- [`stats`](./components/stats.md): Use for at-a-glance metric rows — quarterly results, headline KPIs. (best 4, max 6 items) ~8 words per item. No below-note.

**Data as a chart (authored as nested lists, not a fence)**

- [`bar`](./components/bar.md): Use when the claim is that these categories differ in size: revenue by region, headcount by team, spend by… Variants: `row`, `grouped`, `diverging`. No below-note.
- [`bullet`](./components/bullet.md): Use when the question is 'are we on plan'. Variants: `shared-axis`, `own-axis`. No below-note.
- [`ep-curve`](./components/ep-curve.md): Use when the question is how big a loss to plan for: a reinsurance program's 1-in-100 and 1-in-250 losses, a… No below-note.
- [`flowchart`](./components/flowchart.md): Use for a process or decision flow, an org chart, a data flow or a system map: any set of boxes where the… Variants: `lr`, `tb`, `curved`, `rearrange`. No below-note.
- [`funnel`](./components/funnel.md): Use for a pipeline that narrows — a sales / conversion funnel, a hiring or grant pipeline, an onboarding flow. No below-note.
- [`gantt`](./components/gantt.md): Use for project plans with overlapping or staggered tasks. No below-note.
- [`heatmap`](./components/heatmap.md): Use when the question is 'where does this concentrate', not 'how do these compare'. Variants: `scale`. No below-note.
- [`histogram`](./components/histogram.md): Use when the question is how a quantity is spread: annual losses, claim sizes, deal sizes, response times. No below-note.
- [`hub-spoke`](./components/hub-spoke.md): Use bar or stacked-bar instead when the claim is a ranking or a share: a length or a stacked segment… Variants: `sized`, `flow-out`, `flow-in`, `flow-both`, `tiered`. No below-note.
- [`journey`](./components/journey.md): Use when a process or experience needs charting as a horizontal sequence of moments, each scored for affect. Variants: `heatmap`, `curve`, `swimlane`, `weighted`. No below-note.
- [`kanban`](./components/kanban.md): Use for status snapshots: what's in each lane (todo/doing/done or similar). (best 3, max 6 items) ~8 words per item. Variants: `keyline`, `tinted`. No below-note.
- [`line`](./components/line.md): Use when the claim is that something MOVED: revenue by quarter, headcount through a reorg, latency after a… Variants: `area`, `stacked-area`, `step`. No below-note.
- [`map`](./components/map.md): Use when the story is geographic — program reach, service territories, where the grants landed, the regions… Variants: `us`, `world`, `highlight`, `robinson`, `grouped`. No below-note.
- [`matrix-grid`](./components/matrix-grid.md): Use for a rubric where BOTH axes are ordered categories (a depth ladder × a reach ladder, a maturity level ×… No below-note.
- [`piechart`](./components/piechart.md): Use for part-to-whole breakdowns with three to six slices. Variants: `donut`. No below-note.
- [`progress`](./components/progress.md): Use for status-tracking across multiple parallel items (project readiness, OKR progress, capacity… No below-note.
- [`quadrant`](./components/quadrant.md): Use to position items by two numeric attributes (cost × value, effort × impact). Variants: `bubble`, `trail`, `cohort`, `threshold`, `magic`, `minimal`. No below-note.
- [`radar`](./components/radar.md): Use to compare 2–4 options across the same 4–8 criteria. Variants: `target`, `delta`, `benchmark`, `quadrant`, `small-multiples`, `minimal`. No below-note.
- [`risk-matrix`](./components/risk-matrix.md): Use for a risk register a board or risk committee reviews: enterprise risk, a project's top risks, an… No below-note.
- [`roadmap`](./components/roadmap.md): Use to show what ships in each phase across multiple parallel workstreams. (best 4, max 5 cols) Variants: `horizons`, `status`, `swimlane`, `milestones`. No below-note.
- [`scatter`](./components/scatter.md): Use when the argument is that two measures move together (or against each other) and both numbers matter:… Variants: `bubble`, `trend`. No below-note.
- [`slope`](./components/slope.md): Use when the claim is that the ORDER changed between two points — market share before and after, unit cost… Variants: `dumbbell`, `signal`. No below-note.
- [`stacked-bar`](./components/stacked-bar.md): Use when the claim is that a total DECOMPOSES — revenue by product line across quarters, cost by function… Variants: `share`, `row`. No below-note.
- [`state-chart`](./components/state-chart.md): Use to show a finite-state machine — the discrete states a system can be in and the events that move between… Variants: `lr`, `tb`, `inline`, `curved`, `unnumbered`, `rearrange`. No below-note.
- [`timeline-list`](./components/timeline-list.md): Use for milestone history or annotated timelines. ~16 words per item. No below-note.
- [`tower`](./components/tower.md): Use for a reinsurance or insurance tower — a catastrophe program, a casualty excess tower, a D&O program. No below-note.
- [`waterfall`](./components/waterfall.md): Use for a variance walk — budget to actual, an EBITDA bridge, price/volume/mix, a headcount reconciliation. Variants: `zoom`, `lower-is-better`. No below-note.
- [`word-cloud`](./components/word-cloud.md): Use for qualitative summaries — retrospective themes, survey verbatims. Variants: `constellation`, `dense`, `spectrum`, `focal`. No below-note.

**Structure and flow**

- [`diagram`](./components/diagram.md): Use for relational or topological visuals — flowcharts, sequence diagrams, state machines, ER diagrams.

**Photos and pictures**

- [`collage`](./components/collage.md): Use when several photographs make the argument together: a product line, a site, a collection. Variants: `ordered`, `fill`, `above`, `bleed`, `mirror`.
- [`image`](./components/image.md): Use when a visual carries meaning on its own. Variants: `clean`, `split`, `spotlight`, `gallery`, `statement`, `mirror`, `at-tl`, `at-top`, `at-tr`, `at-center`, `at-bl`, `at-bottom`, `at-br`, `card-solid`, `card-soft`, `card-sheer`, `card-clear`, `ink-light`, `ink-dark`, `card-sm`, `card-md`, `card-lg`, `card-regular`, `band`, `card-float`. No below-note.
- [`scene`](./components/scene.md): Use to put an Anima scene (a 3D mechanism, a self-drawing process flow) on a slide as its hero still. Variants: `clean`, `split`, `spotlight`, `gallery`, `statement`, `mirror`.
- [`video`](./components/video.md): Use to put a YouTube / Vimeo / TikTok / Instagram video on a slide. Variants: `companion`, `gallery`, `qr`.

**Equations**

- [`math`](./components/math.md): Use when the slide IS the equation. Variants: `feature`, `derivation`, `theorem`, `compare`, `canvas`, `matrix`, `stats`, `decompose`. No key insight or below-note.

**Source code**

- [`code`](./components/code.md): Use when the code IS the slide — an API snippet, a config example, a migration.
- [`compare-code`](./components/compare-code.md): Use to contrast a before/after refactor, two API styles, or two configurations.

**Legal and policy**

- [`authority-chain`](./components/authority-chain.md): Use when the audience needs to see how a rule descends: what the statute says, how the agency implemented… (best 4, max 6 items) ~14 words per item. Variants: `branching`, `trail`, `pyramid`, `bracket`.
- [`citation-card`](./components/citation-card.md): Use when one citation IS the slide. Variants: `pull-quote`, `split`, `margin`, `triptych`. No key insight.
- [`obligation-matrix`](./components/obligation-matrix.md): Use when many regimes need comparing across the same obligations. Variants: `heat`, `asymmetric`, `pills`, `lanes`.
- [`policy-recommendation`](./components/policy-recommendation.md): Use to put ONE policy recommendation before lawmakers. (3 items) ~20 words per item. Variants: `adopt`, `amend`, `oppose`, `defer`. No key insight.
- [`regulatory-update`](./components/regulatory-update.md): Use when a quarter's regulatory motion needs a single-slide digest. (best 4, max 6 items) ~14 words per item. Variants: `timeline`, `priority`, `cards`, `diff-bands`.
- [`statute-stack`](./components/statute-stack.md): Use when three or four parallel jurisdictions need to read at a glance: each row carries the jurisdiction… (best 3, max 5 items) ~16 words per item. Variants: `hierarchy`, `bands`, `preemption`, `lane`.

**People and contact**

- [`contact`](./components/contact.md): Use as the "scan to add me" close or a speaker-intro slide. No key insight or below-note.
- [`gift-card`](./components/gift-card.md): Printed QR gift card. No key insight or below-note.
- [`wifi`](./components/wifi.md): Use to get a room onto the Wi-Fi without reading a password aloud. No key insight or below-note.

**Two components on one slide**

- [`columns`](./components/columns.md): Use when two components make one point together: a chart and what it means, before and after, a list beside… Variants: `no-spine`.
- [`rows`](./components/rows.md): Use when two wide components make one point together: progress over the table behind it, a line of context… Variants: `no-spine`.

## 6. Modifiers

The core class tokens no layout has to declare. Nearly every layout honors them (the poster
layouts `contact`, `wifi`, `gift-card` and `video` do not render several). Compose them on
the same comment, space-separated, after the layout name:

```
<!-- _class: cards-grid dark tone-warn insight-the-ask -->
```

This page lists the 62 core tokens, in 11 groups; a layout never has to declare them.
They are not the whole vocabulary: card tags (`tag-*`), card lift and rows, stage alignment,
motion and the front-matter registers add more, each acting only on a layout that has the part
it styles. The complete list, with the part of the slide each group acts on, is
`vocabularies.modifierGroups` in [`reference/components.json`](./reference/components.json).

| Group | Tokens | What it is for |
|---|---|---|
| `mood` (1) | `dark` | Flip a single slide to the dark companion palette. Deck-wide dark is a theme choice, not this. |
| `decoration` (6) | `no-treatment` · `tint-corner at-tl` · `mark-orbit` · `tint-vignette` · `tint-edge at-right` · `mark-threads` | Ambient art on the canvas. One per slide at most — two read as clutter, and none is the right answer on a dense slide. |
| `typography` (5) | `with-period` · `no-period` · `scale-l` · `scale-xl` · `scale-2xl` | Scale the slide’s type up, or control the auto-period on headings. `scale-*` buys emphasis on a SPARSE slide; on a full one it just overflows. |
| `chrome` (11) | `silent` · `no-header` · `with-header` · `no-footer` · `with-footer` · `no-pagination` · `with-pagination` · `no-progress` · `with-progress` · `no-logo` · `with-logo` | Turn the running header, footer, page number or section rail off for one slide. `silent` turns off all four in one token — it is what bookends use. |
| `note` (3) | `no-note` · `with-note` · `note-warn` | Act on a trailing sentence: keep it as body copy, or mark the slide’s callout as an alarm (the warning triangle is drawn, so a caveat needs no typed glyph). |
| `social` (1) | `safe` | Crop-safe framing for a slide destined to be screenshotted. |
| `table` (9) | `table-plain` · `table-fill` · `state-cells` · `with-row-label` · `no-row-label` · `table-cards` · `table-pairs` · `table-lists` · `no-table-reflow` | Table treatment switches: drop the zebra, spread rows into leftover height, or decode the six state markers (`[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`) in cells into status discs. |
| `state` (8) | `wip` · `draft` · `tbd` · `confidential` · `redacted` · `archived` · `pinned` · `revised` | Collaboration markers — a visible stamp that a slide is in progress, confidential or superseded. Meta-signal about the slide, independent of its content. |
| `tone` (4) | `tone-pass` · `tone-warn` · `tone-fail` · `tone-skip` | Cast the whole slide in a pass/warn/fail/skip color. Use for "this is the failure slide", not to color one item. |
| `insight` (11) | `insight-key` · `insight-recommendation` · `insight-takeaway` · `insight-verdict` · `insight-so-what` · `insight-bottom-line` · `insight-the-ask` · `insight-our-view` · `insight-implication` · `insight-next-step` · `insight-why` | Rename the key-insight callout’s eyebrow (TAKEAWAY, VERDICT, THE ASK, …). Changes the WORD, never the styling. |
| `claim` (3) | `claim-quiet` · `claim-hero` · `claim-framed` | Let content claim the stage by receding the chrome — quiet, then hero. Composes with the chrome switches above. |

### Two rules that save a slide

**Colors come from the theme, never from you.** There is no way to author a hex
value, and that is the point: a token means the same thing in every theme, a hex
means one thing in one theme and is wrong in the rest.

**One decoration per slide, and usually none.** `tint-*` and `mark-*` are ambient
art. They earn their place on a bookend or a divider; on a slide already carrying
content they compete with it.

### Position suffixes

The `tint-corner` / `tint-edge` treatments take a companion `at-*` token that says
where: `at-tl` `at-top` `at-tr` `at-right` `at-br` `at-bottom` `at-bl` `at-left`.
Author both — `tint-corner at-tl`.

### Semi-universal

These apply to MOST layouts; a layout whose shape they would break opts out, so a
component file is the authority for its own:

`compact` · `accent` · `claim-bleed`

Per-layout variants are listed in each `../components/<name>.md`.

---

Generated from `UNIVERSAL_GROUPS` in the component index — the same source the
engine composes against, so this list cannot drift from what actually renders.

## 7. Inline notation

Plugins add small drawn things you write in inline code: pills, icons, word-sized charts,
check marks, portraits, pictures. **The backticks are part of the notation**: `` `{On plan}` ``
is a pill, while a bare {On plan} prints as text. Each name links to the full notation.
Most work on any slide. Three do not: a callout works on the charts its file lists; the
`[x]` shortcuts lead a list item only on layouts that read them (checklist, verdict-grid,
pricing and a few more), though `` `[x]` `` as inline code draws anywhere; and an authored
`@legend{…}` key is not drawn by any layout yet, since the charts draw their own keys.
`lint:deck` warns when nothing on the slide reads a callout or legend.

- [`anima`](./plugins/anima.md): Carry an [Anima](https://github.com/Laticent/lattice/tree/main/docs/src/lib/anima) scene from a ` ```anima ` fence to the `scene` slide. The fence…
- [`avatars`](./plugins/avatars.md): Drawn stand-in portraits, written in inline code like an icon.
  Example: `` Our sponsor `!{Ada Okafor}` clears blockers above the program. ``
- [`callout`](./plugins/callout.md): A **callout** is a note pinned to one mark on a chart: a cell, a bar, a point.
- [`chart-family`](./plugins/chart-family.md): Draw a chart slide from what the author wrote.
- [`checks`](./plugins/checks.md): The six answers a criterion can have, drawn as a disc.
  Example (on a `verdict-grid` slide): `- [x] Certified`
- [`code`](./plugins/code.md): Syntax-highlighted code on any slide.
- [`function-plot`](./plugins/function-plot.md): Plot y = f(x), parametric, polar and implicit curves on any slide.
- [`icons`](./plugins/icons.md): Drawn, single-color icons, written in inline code like a spark.
  Example: `` Raw files land in `^{bucket, c4}` S3 and load into `^{warehouse, c5}` Snowflake. ``
- [`image`](./plugins/image.md): A picture, written in inline code on a line of its own.
  Example: `` `@image{sample:photo-wide.jpg, title="Q3 offsite", description="The field team at Lake Louise, site 14 of 40.", frame=mat, nimbus}` ``
- [`legend`](./plugins/legend.md): The **key**: what each color, swatch or line on a figure means.
- [`math`](./plugins/math.md): Typeset math on any slide.
- [`mermaid`](./plugins/mermaid.md): Draw a flowchart, sequence, state, class, entity-relationship, Gantt, pie, mind-map or any other Mermaid diagram from a ` ```mermaid ` fence. The…
- [`meta`](./plugins/meta.md): How a deck is read.
- [`pills`](./plugins/pills.md): Shaped, colored labels written in inline code.
  Example: `` - Shipped and load-tested `{STABLE, c2}` ``
- [`sparks`](./plugins/sparks.md): Word-sized charts, written in inline code.
  Example: `` Revenue `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` $1.9M, against a plan of `~{1.9/1.6, bullet}`. ``
- [`video`](./plugins/video.md): A video as a static, PDF-safe poster that links to the clip, written in inline code on a line of its own.
  Example: `` `@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour", poster=sample:photo-pano.jpg}` ``

## 8. Skeletons for the 19 most-used layouts and 2 charts

Copy the shape exactly: heading levels, bullet nesting and the order of lines all
matter. Every other layout's skeleton is in its own file.

### title

```
<!-- _class: title -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.
```

### closing

```
<!-- _class: closing -->

## Closing takeaway or call to action

`Optional eyebrow`
```

### divider

```
<!-- _class: divider -->

`Section 01`

## Section name
```

### content

```
<!-- _class: content -->

## Slide heading.

The explanatory paragraph that develops the heading goes here. Keep the slide under forty words.

- Optional supporting point one.
- Optional supporting point two.
```

### list

```
<!-- _class: list -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.
```

### cards-grid

```
<!-- _class: cards-grid -->

## Slide heading.

- First card title
  - Body text for the first card, one sentence.
- Second card title
  - Body text for the second card, one sentence.
- Third card title
  - Body text for the third card, one sentence.
- Fourth card title
  - Body text for the fourth card, one sentence.
```

### stats

```
<!-- _class: stats -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`Measured against pre-framework baseline, same teams, same market conditions.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time
```

### kpi

```
<!-- _class: kpi -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `{On plan}`
2. 42%
   - Gross margin
   - +2pp QoQ `{On plan}`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `{On plan}`
```

### big-number

```
<!-- _class: big-number -->

`Optional eyebrow`

- 92%
  - of the audience remembers a single number from a deck.
```

### quote

```
<!-- _class: quote -->

> The quoted sentence sits here, kept short enough to read in one breath.

— Person, Role
```

### list-steps

```
<!-- _class: list-steps -->

## How to roll this out.

1. First step
   - One sentence on what happens in this step.
2. Second step
   - One sentence on what happens in this step.
3. Third step
   - One sentence on what happens in this step.
4. Fourth step
   - One sentence on what happens in this step.
```

### list-tabular

```
<!-- _class: list-tabular -->

## Slide heading.

1. First entry
   - Description or value for the first entry.
2. Second entry
   - Description or value for the second entry.
3. Third entry
   - Description or value for the third entry.
4. Fourth entry
   - Description or value for the fourth entry.
```

### timeline-list

```
<!-- _class: timeline-list -->

`Eyebrow · context`

## How it unfolded.

1. `2024 Q3` First milestone
   - One-sentence description of what shipped.
2. `2025 Q1` Second milestone `decision`
   - One-sentence description.
3. `2025 Q3` Third milestone `live`
   - One-sentence description.
```

### checklist

```
<!-- _class: checklist -->

## Pre-launch readiness.

- [x] First item that is fully done.
- [x] Second item that is fully done.
- [-] Third item that is partially complete with a caveat.
- [!] Fourth item that was checked and failed.
- [?] Fifth item nobody can settle yet.
- [ ] Sixth item that is not yet started.
```

### table

```
<!-- _class: table -->

## Heading framing the comparison.

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| First criterion | Value | Value | Value |
| Second criterion | Value | Value | Value |
| Third criterion | Value | Value | Value |
```

### decision

```
<!-- _class: decision -->

## What we are doing.

- Chosen path
  - One-line rationale for the decision.
- Rejected option
  - One-line rationale for why this didn't fit.
```

### matrix-2x2

```
<!-- _class: matrix-2x2 -->

## Where each option lives.

- **High value · Low cost.**
  - First item in this quadrant
  - Second item
- **High value · High cost.**
  - First item in this quadrant
- **Low value · Low cost.**
  - First item in this quadrant
- **Low value · High cost.**
  - First item in this quadrant
```

### split-panel

```
<!-- _class: split-panel -->

`Eyebrow context`

## Headline that anchors the panel.

One-sentence framing paragraph explaining what the points cover.

- First point
  - Supporting detail explaining the first point.
- Second point
  - Supporting detail explaining the second point.
- Third point
  - Supporting detail explaining the third point.
```

### agenda

```
<!-- _class: agenda -->

## What this deck covers.

1. First section title
2. Second section title
3. Third section title
4. Fourth section title
```

### bar

```
<!-- _class: bar -->

## Which category is biggest.

- First `120`
- Second `86`
- Third `54`
- Fourth `31`
```

### piechart

```
<!-- _class: piechart donut -->

`Eyebrow · context`

## What the breakdown shows.

- First slice `40%`
- Second slice `30%`
- Third slice `20%`
- Fourth slice `10%`
```

## 9. Check and render

```sh
node review/check.mjs deck.md               # from the kit root: code, not a model
npx @laticent/lattice deck.md deck.pdf      # or .pptx, .png, .html
```

Reading this on lattice.style rather than from the kit? Fetch the checker and the catalog
it reads, side by side as in the kit; without the catalog it skips the word budgets:

```sh
mkdir -p lattice/review lattice/reference
curl -fsSL https://lattice.style/agents/review/check.mjs -o lattice/review/check.mjs
curl -fsSL https://lattice.style/agents/reference/components.json -o lattice/reference/components.json
node lattice/review/check.mjs deck.md
```

No command line? Open the file in the Lattice Studio at <https://lattice.style/studio>
and export from there. More in [`render/lattice-render-a-deck.md`](./render/lattice-render-a-deck.md).

## 10. When you need more

| To… | Read |
|---|---|
| Every universal part, with examples | [`authoring/universal.md`](./authoring/universal.md) |
| Every front-matter setting | [`authoring/registers.md`](./authoring/registers.md) |
| See a whole deck | [`examples/lattice-example-starter.md`](./examples/lattice-example-starter.md) |
| Edit or restructure an existing deck | [`skills/edit-deck.md`](./skills/edit-deck.md) |
| Change how a deck looks, not what it says | [`skills/restyle-deck.md`](./skills/restyle-deck.md) |
| Turn numbers into the right chart | [`skills/chart-from-data.md`](./skills/chart-from-data.md) |
| Write speaker notes | [`skills/speaker-notes.md`](./skills/speaker-notes.md) |
| Fix what the checker reported | [`skills/fix-findings.md`](./skills/fix-findings.md) |
| Every other task: a diagram, math, import, a theme | [`skills/README.md`](./skills/README.md) |
| Hand the deck to someone who uses Marp | [`render/lattice-export-to-marp.md`](./render/lattice-export-to-marp.md) |
