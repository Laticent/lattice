---
status: shipped
summary: >-
  The authoring design for generic pane layouts. A slide names its layout in `_class`
  (`columns` or `rows`, with an optional ratio), and each pane reads like a small slide one
  heading level down: an optional `<!-- _pane: <component> -->` above an optional `### title`,
  hidden with `no-title`. Panes are portals: they bring their component's stage content onto the
  slide and nothing else, so the Key Insight, note and all running chrome stay the slide's. It
  replaces the experimental `<!-- panes: -->` / `<!-- pane: -->` comments (kept as an alias), and
  defers `bleed`, `inset` and a third column until a real deck needs them. Built in the same PR:
  the engine rewrites the syntax into the carve's internal form in one token pass, sets each
  pane's head in a cell beside its `<lat-pane>`, and lines the heads up on a shared subgrid (§12).
---

# Generic pane layouts: the authoring design

**Answer first.** A slide says which layout it uses in `_class`, the same place it names a
component today. Each pane is written the way a slide is written, one heading level down:

```markdown
<!-- _class: columns ratio-60-40 -->

`Q3 review`
## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
`$M, trailing four quarters`

- Licenses `42`
- Services `47`

<!-- _pane: list -->
### What changed

- Services crossed licenses in March
- Training folded into services

> The mix shift is structural, not seasonal.
```

| | A slide (today) | A pane (this design) |
|---|---|---|
| Names its component with | `<!-- _class: bar -->` above the title | `<!-- _pane: bar -->` above the title |
| Title | `##` | `###` |
| Eyebrow | `` `pill` `` above the `##` | `` `pill` `` above the `###` |
| Subtitle | `` `line` `` below the `##` | `` `line` `` below the `###` |
| With nothing named | renders as `content` | renders as `content` |

An author who knows how to write a slide already knows how to write a pane. The two sentences
that teach the whole feature:

> Put `columns` or `rows` in `_class`, and start each pane with `<!-- _pane: … -->` or a `###`
> heading. Name a component in `_pane` when the pane is not plain text.

This note records the authoring design, and §12 how it was built. §10 lists the internal-structure
questions the design raised; §12 answers each.

---

## 1. Why: panes exist, generic layouts do not

Panes shipped as a proof of concept on 2026-09-25
(`2026-09-25-panes-two-components-one-slide.md`). The hard part works: the engine renders any
pane-capable component into part of a slide, sized and budgeted for that part. What is missing
is the authoring surface around it:

1. **The layout has no name.** Panes are declared with HTML comments (`<!-- panes: 55/45 -->`),
   and the carve strips component classes off the slide (`lat-pane-host`). Nothing lets a slide
   say "I am a two-column slide" in the place authors already look, `_class`.
2. **A pane has no title.** A `###` inside a pane renders today, but only as body text. Nothing
   styles it as a title, counts it against the pane's budget, or lines up two panes' titles.
   (Measured on a render: `<lat-pane …><div class="cell-stage"><h3>…</h3><ul>…`.)
3. **A `##` inside a pane breaks the slide.** The default `split: headings` starts a new slide at
   every `##` after a slide's first (`lib/core/heading-split-core.js`), so a pane `##` on a slide
   that already has its title cuts the slide in two. (On a slide with no title, the carve lifts
   the pane's `##` up to be the slide's title instead.) Either way a pane cannot use the slide's
   heading level. That is why the pane title is `###` and not `##`, and why the slide's heading
   block is always written before the panes.
4. **The layouts people reach for are welded to one purpose.** `split-panel`'s feature side is
   a heading slot, not a box, and `image`'s `split` / `spotlight` / `gallery` compositions exist
   only inside `image`. Those stay as they are (§8); this design adds the generic ones beside
   them.

## 2. The grammar

### 2.1 The layout

`_class` carries the layout, with an optional ratio:

| Write | Renders |
|---|---|
| `<!-- _class: columns -->` | two panes side by side, 50/50 |
| `<!-- _class: columns ratio-40-60 -->` | side by side, 40% and 60% |
| `<!-- _class: rows -->` | two panes stacked, 50/50 |
| `<!-- _class: rows ratio-35-65 -->` | stacked, 35% on top |

- The ratio is spelled `ratio-60-40`, a class word (ruling, 2026-09-29): every word in `_class`
  lands in the section's `class` attribute, so each must be a valid CSS identifier, and `60/40`
  is not (a `/` cannot sit in a class name, nor can a leading digit). It follows the house
  `<axis>-<value>` pattern (`cat-4`, `progress-3`); `split-60-40` was rejected because "split"
  already names `split-panel`, the `split:` register and pagination. The engine's internal layout
  comment keeps `60/40`, which is never a class, and so does the experimental `panes:` comment.
- The ratio keeps today's range: 25–75 in 5% steps, default 50/50. An out-of-range ratio falls
  back to 50/50 and `lint:deck` reports it (`pane-layout`, as today).
- Slide modifiers go beside the layout as they do beside a component: `columns ratio-40-60 dark`.
- `no-rule` drops the spine between the panes, as today.
- A component named in the slide's `_class` on a `columns` / `rows` slide is ignored, and
  `lint:deck` says so: components are named per pane.
- A deck-wide `class:` in front matter never sets a layout. Two panes are a per-slide decision.

### 2.2 Where a pane starts

Both the marker and the title are optional, so the rule for where a pane starts has to be exact:

- **A slide with no `_pane` markers:** each `###` starts a `content` pane. This is the quick
  outline form:

  ```markdown
  <!-- _class: columns -->

  ## The migration halved support tickets.

  ### Before
  - 1,240 tickets a month

  ### After
  - 610 tickets a month
  ```

- **A slide with markers:** every top-level `###` is still a pane's title. Right under a marker
  (an eyebrow pill may sit between them) it titles that marker's pane; anywhere else it starts a
  new `content` pane. So adding a marker above one `###` of an outline keeps the other a pane.
  A heading inside a pane is `####`.
- **A component whose own anatomy uses `###`** keeps every `###` it holds: `team-profile sides`
  labels its two rosters with `###`. The pane catalog records it (`h3`, derived from the
  manifest's slot selectors), so the engine and the linter read the same list.
- *Revised after the adversarial review:* the first cut said "with markers, only markers start
  panes". The Munger inversion found the natural edit that breaks it — convert one pane of an
  outline into a chart by adding its marker, and the other `###` silently joined the chart, so
  the slide collapsed to one pane.
- Everything before the first pane is the slide's heading block: directives, eyebrow, `##`,
  subtitle.
- A third pane folds into the second, as today, and `lint:deck` reports it. Two panes is the v1
  limit (§8).

### 2.3 The pane marker

```markdown
<!-- _pane: bar -->
<!-- _pane: image no-title -->
<!-- _pane: no-title -->
```

- The first word, when it is a component id, names the pane's component. Without one the pane
  is `content`, as a slide without a `_class` is.
- The words after it are the component's modifiers (`<!-- _pane: team-profile sides -->`),
  which reach the pane's render as a slide's `_class` would carry them, and the pane's own
  modifier, `no-title`. `lint:deck` checks the component's modifiers as it checks a `_class`.
- The leading underscore mirrors `_class`. It reads as "this pane only", the way `_class` reads
  as "this slide only". The engine leaves an unknown `<!-- _pane: … -->` comment untouched
  (checked on a render), so the carve can claim it without colliding with a directive.

### 2.4 The pane title and `no-title`

A pane title is optional. The documentation, the gallery and every example still write one,
because a titled pane states its intent and a reader scanning the slide finds it.

`no-title` hides a pane's title **visually**. The heading stays in the document, so screen
readers, the Read view, the Studio's outline and the linter still see what the pane is for. The
height the title would have used goes back to the pane's body. `no-title` on a pane with no
`###` does nothing, and `lint:deck` says so.

It follows the house naming for hiding a slide element: `no-note`, `no-header`, `no-footer`,
`no-paginate`, `no-rule`.

### 2.5 The pane title is a label (ruling, 2026-09-29)

A pane title renders in the **eyebrow's voice**: the label face, `--fs-meta`, weight 600, 0.18em
tracking, uppercase, `--text-secondary` — the same setting as the pill above a slide's `##`
(lib/forms/cell/pane/pane.css). It first shipped as a smaller serif heading (`--fs-h3`), which read
as a second slide title competing with the first. As a label it is the layout's own furniture: the
slide's `##` makes the point, and each pane names what it holds, as a column or a card is labeled.
The owner chose it after comparing both renders of `examples/pane-layouts.md`.

Two consequences, both chosen from options:

- **One label per pane.** An eyebrow pill above a `###` would stack a second label on the first
  (the render showed SHORTLIST over CLEARED). The engine joins them instead: `` `Shortlist` `` over
  `### Cleared` renders "Shortlist · Cleared", the pill run through the host's inline rules and
  unwrapped from its `<code>` (`paneHeadHtml`, and `headBlock` on a split page). `lint:deck`
  suggests writing the one line (`pane-title`). The alternative, keeping both labels, was rejected
  as reading like a glitch.
- **The subtitle steps under the label.** At `--fs-body` it now outranked the title, so it drops
  to `--fs-body-compact` in `--text-muted`.

Tracked capitals are for a short label (the runhead note in base.modifiers.css measured a long
title set that way turning into a wall of letter-spaced capitals), so `lint:deck` suggests a pane
title of five words or fewer. The smaller head gives each pane back height: the title row is
23.9px at 1280 against 36.8px before, and `PANE_HEAD` carries the re-measured figures.

### 2.6 `columns` and `rows` are host components (ruling, 2026-09-29)

They live in `lib/components/layout/` with a manifest, a docs page and a gallery like every other
component, so every list built from the manifests — the docs site, `components.json`, the agent's
pick list, the AI primer, the pickers, lint's vocabulary — has them without a special case. What
makes them special is one manifest field, `hosts: "panes"`: the body is two other components.

| Field | Value | Why |
|---|---|---|
| `bucket`, `function` | `layout` | a new bucket and function: a host does nothing by itself |
| `form` | `split` | two regions, like `split-panel` and `split-compare` |
| `substance` | `mixed` | composes its panes' substances; the loader allows `mixed` on a host as on a panel |
| `stage` | `flow` | a standard masthead over a stage that holds the panes |
| `adapt.mode` | `reflow` | the pane carve restructures it: one slide per pane where two do not share a frame |
| `pane` | never | a host never goes inside a pane |
| split treatment | `host` | the pane carve splits it before the split registry runs, which never sees it |
| `density`, `venueCapacity` | exempt / `none` | the budgets are its panes' |
| `label` | "Two columns" / "Top and bottom" | the Studio's tile name (§7.2) |

The engine did not change: the carve still reads the words from `_class`, and the ratio and
`no-rule` are the host's modifiers. `design/design-system.md` records the `mixed` extension.

## 3. The layouts

```
columns ratio-60-40                          rows ratio-35-65
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ eyebrow                      │       │ eyebrow                      │
│ ## Slide title               │       │ ## Slide title               │
│ ┌───────────────┐┊┌────────┐ │       │ ┌──────────────────────────┐ │
│ │ ### Pane A    │┊│### B   │ │       │ │ ### Pane A               │ │
│ │               │┊│        │ │       │ └──────────────────────────┘ │
│ │  (bar chart)  │┊│ (list) │ │       │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│ │               │┊│        │ │       │ ┌──────────────────────────┐ │
│ └───────────────┘┊└────────┘ │       │ │ ### Pane B               │ │
│ > Key Insight (the slide's)  │       │ │                          │ │
│ footer             page no.  │       │ └──────────────────────────┘ │
└──────────────────────────────┘       └──────────────────────────────┘
```

- **Single pane has no name.** The default slide already is one: a title and one open stage.
  A named `single` earns a place only if it adds something the default does not, such as a
  narrower centered column or a card surface. Nobody has asked for either yet.
- **Side-by-side titles share a row.** When both panes carry a `###`, the two titles sit on one
  row as tall as the taller one, so the two bodies start on the same line even when one title
  wraps. A pane with `no-title` does not take part and its body starts at the top.

## 4. Who owns what: panes are portals

A pane is a portal. It brings its component's **stage content** onto the slide and nothing
else. The slide keeps everything around the stage, and the layout decides where each piece
sits.

| Element | Owner |
|---|---|
| Running header, footer, page number, logo, progress rail, watermark | the slide |
| Slide eyebrow, `##` title, subtitle | the slide |
| Key Insight (`>`) and below-note (`— `), wherever they are written | the slide |
| Slide modifiers (`dark`, `finish-*`, `cards-*`, …) | the slide |
| Pane eyebrow, `###` title, subtitle | the pane's frame, not its component |
| The component's body | the pane |

**Which `>` and `— ` go to the slide.** The trailing run of either pane, where an author closes a
thought, goes to the slide. Three cases stay in the pane:

- a `>` in the MIDDLE of a pane, which is a quotation and part of that pane's argument (a lawyer
  quoting a statute, then reading it);
- an element the component uses as part of its own anatomy (a `quote`'s attribution, a chart's
  caption), declared in its manifest's `coda.claims`;
- a pane that is nothing but a quote and its `— ` attribution, which would otherwise be left
  empty under its title.

If both panes close with a `>`, the slide has two Key Insights and `lint:deck` warns.
*Revised after the adversarial review:* the first cut moved every `>` "wherever it was
written". The inversion and the checker found the two cases it broke: a mid-pane quotation
lifted out of its argument, and a quote pane emptied. The owner's ruling (the Key Insight is the
slide's; a pane brings its stage content) holds for both: a closing `>` is the Key Insight, and a
quotation is stage content.

Per-slide overrides keep working as they do on any slide: `_header`, `_footer`, `_paginate`.

## 5. Budget

A pane's budget is its box minus its own chrome, measured the same way as a slide's.

- Today `stageBox` in `lib/engine/index.js` takes the slide's stage and subtracts the title,
  subtitle, Key Insight and note, counting wrapped lines. The same model runs one level down: a
  pane's eyebrow, `###` title and subtitle cost that pane lines, and a hidden title costs
  nothing.
- `lint:deck` counts `pane-overflow` and `pane-crowd` against what is left, as it does today.
- Side by side, a titled pane pays for the shared title row (§3).
- Stacked, a title is paid in height, which a 16:9 slide has least of.
- The linter scales a titled pane's counts by the share of its height the head leaves
  (`headedBudget`, lib/core/pane-spec.js): about 12% side by side, 27% stacked at 50/50. The
  measured heights live once, in `PANE_HEAD` (lib/core/pane-spec.js), and the engine's pane box
  reads the same copy. A flat
  "one item fewer" was tried first and was wrong both ways on the demo deck: it called three short
  items crowded in a titled 50% pane, which read with room to spare.
- *Added 2026-10-05:* the slide's own chrome takes height too. An eyebrow, subtitle, Key Insight
  or note each takes a measured band of the stage (`SLIDE_BANDS`, lib/core/pane-spec.js, the copy
  the engine's `stageBox` reads), and `chromeBudget` cuts the HARD count to the room left. A count
  budget is a height with a fixed cost in it, so the budget counts that fixed cost as items
  (`BUDGET_OVERHEAD`: a table's header row) before scaling, and takes it back after. A first try
  scaled the counts by height alone. It passed a two-row table that the slide's eyebrow and Key
  Insight clip, and flagged three panes that render with room. Measured at 1280 through the export's
  overflow probe, the shipped model flags the clipping table and none of the three. The sweet count
  only drops to stay at or under the hard count, because chrome changes how much fits, not how a
  pane reads. Run against every shipped example and gallery, the change adds no new finding.
- The component budgets in each manifest's `pane` field stay what they are. They were measured
  with no pane title, so they are the untitled figures; the title's cost is subtracted from
  them, never measured into them.

## 6. Narrow decks

Unchanged from panes: on a square, portrait, story or mobile deck a `columns` / `rows` slide
splits into one page per pane. Each page repeats the slide's heading block, and the pane's
`###` travels with its pane as the first line of that page's body. A `no-title` pane's title
stays hidden on its page.

## 7. Names

**The layouts are `columns` and `rows`, and the marker is `_pane`.** The test for a name is
whether the people Lattice is built for already know it. There is no single industry standard,
but there is one pair every one of them knows: "columns" and "rows".

### 7.1 Who the names are for: the audiences

The audiences are the ones the home page names (`docs/src/components/landing/sections.tsx`) and
the sectors the exemplar library covers (`exemplars/`: corporate, academic, government and
public, nonprofit, general team). Most of them never write a Markdown deck. What they share is
the office suite, and each group also meets the word in a tool of its own:

| Audience | Where they already meet "columns" / "rows" |
|---|---|
| Lawyers and compliance, government, nonprofit, general teams | Word's **Columns** button (Layout › Columns); the rows and columns of every Excel sheet |
| Scientists and academics (the `academic` exemplars) | the journal "two-column format"; poster columns; Beamer's `columns` |
| Mathematicians, quants and ML | Beamer's `columns`; Quarto's `.columns`; Jupyter |
| Engineers and architects | CSS grid rows and columns; Slidev's `two-cols`; Notion's columns |
| Project leads, analysts and consultants | Google Slides' "Title and two columns"; PowerPoint's "Two Content" and "Comparison" |

The slide tools' own names for a two-sided layout, for reference:

| Tool | Two side by side | Related layouts |
|---|---|---|
| Quarto | `:::: {.columns}` + `::: {.column width="40%"}` | — |
| Slidev | `two-cols`, `two-cols-header` | `image-left`, `image-right`, `full` |
| Beamer | `columns` environment | — |
| Google Slides | "Title and two columns" | "One column text", "Caption" |
| PowerPoint | "Two Content", "Comparison" | "Picture with Caption" |
| Marp | "split backgrounds" (`![bg left:40%]`) | — |

Sources, checked 2026-09-28: Slidev's and Quarto's names against their current documentation
(sli.dev/builtin/layouts, quarto.org/docs/presentations/revealjs). Word's Layout › Columns and
PowerPoint's "Comparison" and "Picture with Caption" against Microsoft Support ("Create multiple
columns in Word", "Apply a slide layout"). PowerPoint's "Two Content" and Google Slides' "Title
and two columns" / "One column text" against third-party guides (Indezine, SlideModel), since
neither vendor's help page lists its layout names. The Excel, Notion, Jupyter, journal and
poster uses are common knowledge, not checked against a source.

### 7.2 How each role meets the name

The same lawyer or scientist meets this feature in one of four roles, and each asks something
different of the name:

| Role | Sees | What the name has to do |
|---|---|---|
| **The author typing Markdown** | `_class: columns ratio-60-40` | be the word they would guess |
| **The Studio user** | a menu of layouts, never the syntax | read as plain English: the insert menu labels them **"Two columns"** and **"Top and bottom"** and writes `columns` / `rows` into the source |
| **The AI drafting the deck** (the agent-workflow persona in `2026-07-02-website-copy-positioning.md` §2) | whatever it guesses | be the word its training data taught it: `columns` is what Quarto, Beamer and CSS use, so a model guesses it without reading our docs, where a house word like `panes` would have to be looked up |
| **The reviewer reading the source in a pull request** | the raw Markdown | read as prose: `columns ratio-60-40` over two `###` headings describes the slide without a render |

**In Compose (2026-10-05).** The Studio user edits a pane slide without seeing its syntax. Each
pane opens with a bar that names its place, its share and what it holds ("Left pane 60% · bar ·
Change"). Its `###` title reads as a field labeled "Title" ("Title · hidden on the slide" under
`no-title`), and a pane with a marker and no title gets an "Add title" button.

**Changing what a pane holds is a choice of OUTCOME, not of a name.** A first cut put a native
`<select>` of component names on the bar. The owner tried it on an iPhone. It relabeled the pane
and left its content alone, so "- A point" sat under `bar` and drew nothing, and the menu reopened
after every pick. The owner's question was what an average user should expect. The answer:
- **What happens is shown before the pick.** "Change" opens the slide gallery in pane mode
  (SlidePicker `pane`): live tiles of the components that fit the pane, each saying what picking it
  does.
- **"Keeps your text"** when the component can read the pane as it stands: every slot its grammar
  requires is present, and a chart has numbers (`paneFit`, `pane-needs.ts`).
- *Ruled 2026-10-05:* **"Keeps" means the text would read as that component, not merely fit its
  shape.** Shape alone over-promised. `contact` and `actors` require only a list item, so "- A
  point" kept its text as a contact card. Now a component whose own example puts a mark on EVERY
  item asks the pane to use one of those marks: a trailing label (`- Ann Lee `name``), a leading
  figure (big-number's `- 92%`), a picture (logo-wall), or an arrow (flowchart). `marksOf` reads
  the marks off the generated skeleton, so a new component gets its rule with no code change. A mark
  only some items carry (team-profile's portrait) is optional and not asked for. Measured on the
  real Studio, on a plain list in a 40% pane, five of the 37 tiles moved to "Starts with an
  example": contact, actors, big-number, logo-wall and flowchart. statute-stack, wifi and pricing
  follow the same rule where a pane is wide enough to offer them. The list-shaped components whose
  examples are plain lists still keep the text: cards-grid, glossary, decision, state-chart.
  Numbered examples count too: a plain `1. First point` list no longer keeps under `kpi` or
  `stats`, whose example items open on a figure.
  The rule leans toward "keeps" when the evidence is mixed. One labeled item is enough, because
  "Starts with an example" replaces the author's text, and a wrong "keeps" loses nothing. The
  known cost of that lean: one code span in a technical list (`- Install with `npm i``) counts as a
  label, and an item that opens on a number ("3 reasons we win") counts as a figure.
- The needs map rides the Studio's on-demand component catalog (`studio/component-catalog.json`,
  whose slots now carry their selectors), derived in Compose's lazy chunk. A first cut inlined it
  into the Studio page, which cost the page 8.3 KB of HTML that only this gallery reads.
- **"Starts with an example"** when it cannot. The pane's body is swapped for the component's own
  starter, and a notice offers Undo. The Undo stands down once the author edits anything else.
- **The pane's title and the slide's Key Insight never move.**
- **The pane's own component leads the "Keeps your text" band.**
- **A component whose starter Compose could not edit is not offered:** a checklist's state markers
  or a formula would lock the slide read-only.

This is the PowerPoint "change layout" model with the guesswork removed: the tile says which way
the change goes.

Where each pane starts, and which `###` titles it, are the kernel's answer.
`docs/src/lib/compose/pane-model.ts` runs `scanPanes` on a stand-in text, each block's lines kept
line for line, and maps the lines back to blocks. The two independent reviews found four slides
where Compose and the engine disagreed; each is now pinned:
- a multi-line note under a marker, which the kernel itself read wrongly and is fixed in
  `paneStartsOf`;
- a bold pill;
- a pill followed by a comment;
- a double-backtick pill.

The bar is a decoration and writes nothing to the source. The marker stays in the document as a
comment node, with its pill hidden, since the bar names the component in words. A hidden node is
easy to delete unseen. Binding the keys that delete it missed chords (Shift-Backspace,
Mod-Backspace), so `paneMarkerGuard` guards the RESULT instead: it refuses any transaction that
would leave the deck with fewer pane markers. Three things pass it: a pane command, Undo, and a
range the author deliberately selected. A selection that lands on a hidden marker is moved off it.
A refusal says why, in one status notice: "A ### here would start a new pane" when the edit added
a `###` (a heading in a titled pane starts the next pane and folds the one after it), and "That
would remove a pane" otherwise. A silent refusal looked like a broken button.
A pane cut and pasted keeps its marker, because the paste gate admits a `_pane` comment in one
strict shape (comment-block.ts). Before all this, Compose read every `<!-- _pane: … -->` as a slide
directive and moved it to the slide's head, so one keystroke on a marked pane slide wrote both
markers above the `##` and the slide lost its panes. The markers now stay in the body
(`deck-source.ts`).

A fifth person never sees a name at all: **the audience in the room.** What they need is for two
panes to read as one argument, which is what the shared title row (§3) and the rule that the Key
Insight is the slide's, with a lint warning when there are two (§4), are for.

### 7.3 The choices

- **`columns`** is the word the office suite, the journals and four of the six slide tools use
  (Slidev abbreviates it to `cols`), and it extends to three columns without a rename.
- **`rows`** pairs with `columns` as it does in every spreadsheet and CSS grid. It replaces
  `panes: stack`. The Studio labels it "Top and bottom", which says the same thing to someone who
  does not think in grids.
- **Not `split`.** The repo already uses it at least four ways: the `split:` front-matter
  setting, auto-splitting a slide into pages, a modifier on `image` / `scene` / `redline` /
  `citation-card`, and `form: split` in five manifests, before counting the component names
`split-panel` and `split-compare`. Another meaning would guarantee confusion.
- **Not `two-cols` or "two content".** Those bake the count into the name; `columns` does not.
- **`_pane` keeps the word "pane"** because "column" does not fit a box in `rows`, and "pane" is
  plain English.

## 8. What this design does not do yet

Each item is deferred until a real deck needs something the existing components cannot do:

- **`bleed`**, a pane modifier that runs a pane to the slide's edges (today's `split-panel` and
  `image split` look). It is the only piece with a rule the author cannot see: a full-height
  pane has no room above it for the slide title, so the layout would move the title and Key
  Insight into the other pane. That hidden move is the reason it waits.
- **`inset`**, a small pane floating over a large one (picture in picture). It raises its own
  questions (which corner, what size, what it may cover) and nobody has asked for it with a
  real deck.
- **A third column** (`columns 3`, or three `_pane`s). The engine renders two panes today.
- **Pane surfaces** (`accent`, `dark` on a `_pane`), which `bleed` would mostly need.
- **Rebuilding `split-panel`, `split-compare` and `image`'s compositions on these layouts.** They
  keep working exactly as they are.

## 9. Migration from the experimental syntax

Panes are marked experimental, so the syntax may change. For one release, the old comments keep
working as aliases, and `lint:deck` offers the rewrite:

| Old | New |
|---|---|
| `<!-- panes: 55/45 -->` | `<!-- _class: columns ratio-55-45 -->` |
| `<!-- panes: stack 35/65 -->` | `<!-- _class: rows ratio-35-65 -->` |
| `<!-- panes: 50/50 no-rule -->` | `<!-- _class: columns no-rule -->` |
| `<!-- pane: bar -->` | `<!-- _pane: bar -->` |

`lib/base/base.docs.md` § "Two components on one slide — pane layouts" and the new demo,
`examples/pane-layouts.md`, teach the syntax. The six example decks first written in the alias
(panes, panes-mermaid, panes-radar, panes-sketch, chart-lead-blocks, chart-lead-paragraphs) moved
to it on 2026-10-05, and each renders byte-identical HTML before and after. The alias is still
pinned by test/unit/core/pane-layouts.test.js ("the alias still renders the same panes"). Whether
it stays past the next release, with `pane-syntax` promoted from a suggestion to a warning first,
is recorded in `followups.d/2473-p3-retire-the-experimental-pane-syntax.md`.

## 10. Questions for the internal-structure note

These are for the next note, not for authors:

1. **Does `columns` become a Frame?** `design/forms.md` §0 says the component picks the Frame
   and no author selects one. A layout in `_class` is an author selecting one. Either the rule
   changes (a canonical-doc change, the owner's call), or `columns` / `rows` stay the `standard`
   Frame with a stage carved into two `pane` Cells, as panes are today.
2. **Parsing the ratio.** `60/40` is not a valid class name. The carve reads it off `_class` and
   stamps it as a data attribute, so it never reaches the class list.
3. **The pane masthead.** Where the pane's eyebrow, title and subtitle live in the DOM (a
   `.cell-masthead` inside the `<lat-pane>`, which `dropMasthead` removes today), and how the
   shared title row lines up across two panes.
4. **The budget model one level down.** Extending `stageBox`'s line counting to the pane's own
   chrome, and pinning it in `test/unit/core/panes.test.js`.
5. **The linter and the Studio.** No `pane-title` rule (titles are optional), but the `no-title` no-op warning, the
   ignored component in `_class`, the two-Key-Insights warning, and the rewrite from the old
   syntax, all in `lib/authoring/lint-core.js` (HARD RULE #7).

## 11. Rulings from the design conversation (2026-09-28)

- The Key Insight and note belong to the slide: panes are portals that bring only stage content.
- The `_pane` marker is optional.
- Names should be ones Lattice's audiences already know, preferring an industry word over a house
  one: hence `columns` and `rows`. The audiences are the home page's and the exemplars' (lawyers,
  scientists, project leads, architects, …), not only the early-adopter personas, and the note
  weighs the name for each role that meets it: author, Studio user, AI, reviewer (§7).
- Keep it simple: ship `columns` and `rows`; defer `bleed` and `inset`.
- The pane marker mirrors `_class` (`_pane`, above the `###`) so it reads familiar.
- The `###` pane title is optional, the documentation always writes one, and `no-title` hides it.
- (2026-09-29) The pane title is set as a label, in the eyebrow's voice; an eyebrow pill above it
  joins it as one label; the subtitle steps under it (§2.5).
- (2026-09-29) `columns` and `rows` are COMPONENTS, of a special kind: hosts (§2.6). They first
  shipped as layout words the engine knew and the catalog did not, and the pickers had to list
  them by hand; the owner's objection was that this made them "a magical thing that isn't really a
  component", when `split-panel` already shows a component can have two regions.
- (2026-09-29) Where they file: Family **Split layouts** (beside `split-panel` and `split-compare`,
  where a side-by-side slide is looked for), Function **Layout** (a group of their own, because a
  layout does nothing by itself; its panes do the work), Substance **mixed** (they compose the
  substances their panes hold). The Studio's add-slide gallery shows them as "Two columns" and
  "Top and bottom" (§7.2). Reusing Comparison / Structure was the rejected option: it would
  mislabel a slide that stacks progress over a table.

## 12. How it was built

The §10 questions, answered.

1. **`columns` / `rows` stay the `standard` Frame.** The stage is carved into two pane Cells, as
   panes were. A layout named in `_class` is read by the pane rules and never reaches the class
   list, so `design/forms.md` §0 ("the component picks the Frame") still holds.
2. **The ratio never reaches the class list.** `normalizePaneSyntax` (lib/core/panes.js) runs on
   the block tokens after the heading split and before any pane rule. It compiles every authored
   marker, `_pane:` or the `pane:` alias, into an internal `<!-- lat-pane: {…} -->` comment
   (component, pane modifiers, component modifiers), and the layout into
   `<!-- lat-panes: … -->`; keeps the `_class`'s other words; and applies the start rule of §2.2
   to the tokens (`startPanesAtHeadings`), inserting a `content` marker before each `###` that
   starts a pane. No rule after it reads an author's text, so retiring the alias is a change to
   `parseMarker` alone. The layout
   is the slide's LAST `_class`, the one the engine applies, and every `_class` loses its layout
   words. The internal layout comment carries a `heads` flag for a slide written in the syntax,
   and only such a slide takes pane heads and the slide-wide coda (§4): a slide in the alias
   keeps the rules it rendered with. Every later rule (the split, the carve, the slide map) reads
   only the internal form. Decks without the syntax render byte-identical markup (all 243 example
   and baseline decks, checked by the independent checker against `HEAD`), and the six alias
   decks are pixel-clean through `tools/pixel-check.js`. The checker's first pass found that
   without the flag an alias pane opening with a `###` (a `team-profile sides` pane) changed
   markup, which is why the flag exists.
3. **The head sits beside the pane, not in it.** The carve cuts the eyebrow, `###` and subtitle
   out of the pane's source (`paneHeadOf`), and `embed` writes a `.lat-pane-cell` holding a
   `.lat-pane-head` and the `<lat-pane>`. Inside the pane, a component's `h3` rules would reach
   the title through its twin. Only a slide with a head gets the cell, so every other panes slide
   keeps its markup. Side by side, the cells subgrid into five shared rows (eyebrow, title,
   subtitle, gap, pane), so both titles sit on one line whatever else each head carries.
   Aligning whole heads was tried first: with an eyebrow on one pane and a subtitle on the other,
   the titles landed a line apart. On a narrow deck's split page, the head is wrapped in the same
   `.lat-pane-head` block (`headBlock`), because a chart's wrap otherwise lifted the pane's
   subtitle into the page masthead. `no-title` hides the head with the screen-reader clip, and
   the overflow probe ignores that clip (`IGNORED_CLIP_SELECTOR`), as it does a chart's hidden
   data table.
4. **The budget model one level down.** `paneGeometry` (lib/engine/index.js) takes each pane's
   head out of its box, from measured heights (`HEAD`), counting wrapped title lines. A
   1280px slide with an eyebrow on one pane and a subtitle on the other measures a 313.0px pane
   and models 312.8. A long title that wraps to two lines models as three, the same short
   error the slide's own model makes on purpose.
5. **The linter and the Studio** read the syntax from text (`splitPaneMarkdown`), with new
   findings for a layout with fewer than two panes, a component in the layout's `_class`, an
   unknown marker word, a `no-title` with no title (`pane-layout`), two Key Insights
   (`pane-insight`) and the alias (`pane-syntax`, a suggestion). The Studio's slide index, caret
   placement and deck-kind label read the same, and the Read view projects each pane's head
   before its body.

Test: `test/unit/core/pane-layouts.test.js`.

### 12.1 What the adversarial review changed

The build went through the full trio (HARD RULE #25): an independent checker, a red team and a
Munger inversion, each run against the working tree. What each found, and what changed:

- **The start rule** (§2.2) and **the coda rule** (§4) were revised, as recorded there: the first
  cut collapsed a slide when an author added one marker to an outline, and moved a mid-pane
  quotation out of its argument.
- **The alias stays exactly as it was.** Pane heads and the slide-wide coda apply only to a slide
  in the syntax (the `heads` flag); an alias pane opening with a `###` was changing markup.
- **One source for each rule.** The narration linter, the Studio's component count and slide map,
  the sweep tool and the parser-memo test each carried their own `pane:` probe and missed the
  syntax; each now reads the pane spec. The head's measured heights live once (`PANE_HEAD`).
- **Author inputs that misbehaved:** a multi-line `_class` crashed the linter; two `_class`
  comments disagreed between engine and linter (the last one now names the layout, as the last
  `_class` is the one applied); a spaced ratio and a fenced example drew false warnings; a lowercase
  speaker note starting `pane:` became a marker; a long unbroken title ran across the spine; a
  bare `###` drew an empty row; an author-written internal marker could carry quotes into an
  attribute; pane pills skipped the host's inline rules.
- **`columns` and `rows` were already a Marp idiom** for an author's own class. A slide with fewer
  than two panes keeps the word as its class, in the engine and in Export-to-Marp; a slide with two
  or more `###` now lays out in panes, which the changelog marks **Breaking**.
- **The linter says more:** which marker a third pane folds away, `####` for a heading inside a
  pane, both `columns` and `rows` named, a `###` above the slide's title, and a deck-wide
  `class: columns`.

Measured after the fixes: every example, gallery and baseline deck that does not use the syntax
(256) renders byte-identical HTML to `HEAD`, and the six alias decks are pixel-clean.

## See also

- `2026-09-25-panes-two-components-one-slide.md`: the pane engine this design builds on.
- `2026-06-18-frame-recursion-cells.md` §4: the flat split layout this completes.
- `design/forms.md` §0 and §8: Frames, and who selects them.
- `lib/base/base.docs.md` § "Two components on one slide — panes": today's author docs.
