---
status: proposed
summary: >-
  The authoring design for generic pane layouts. A slide names its layout in `_class`
  (`columns` or `rows`, with an optional ratio), and each pane reads like a small slide one
  heading level down: an optional `<!-- _pane: <component> -->` above an optional `### title`,
  hidden with `no-title`. Panes are portals: they bring their component's stage content onto the
  slide and nothing else, so the Key Insight, note and all running chrome stay the slide's. It
  replaces the experimental `<!-- panes: -->` / `<!-- pane: -->` comments, and defers `bleed`,
  `inset` and a third column until a real deck needs them.
---

# Generic pane layouts: the authoring design

**Answer first.** A slide says which layout it uses in `_class`, the same place it names a
component today. Each pane is written the way a slide is written, one heading level down:

```markdown
<!-- _class: columns 60/40 -->

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

This note records the authoring design only. The internal structure (how a `_class` layout
becomes a Frame whose Cells hold the panes) is the next note; §9 lists what it has to answer.

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
| `<!-- _class: columns 40/60 -->` | side by side, 40% and 60% |
| `<!-- _class: rows -->` | two panes stacked, 50/50 |
| `<!-- _class: rows 35/65 -->` | stacked, 35% on top |

- The ratio keeps today's range: 25–75 in 5% steps, default 50/50. An out-of-range ratio falls
  back to 50/50 and `lint:deck` reports it (`pane-layout`, as today).
- Slide modifiers go beside the layout as they do beside a component: `columns 40/60 dark`.
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

- **A slide with markers:** only markers start panes. The first `###` after a marker (an eyebrow
  pill may sit between them) is that pane's title. Any later `###` belongs to the component. This
  keeps `team-profile sides`, which labels its two rosters with `###`, working inside a pane.
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
- The words after it are pane modifiers. v1 has one: `no-title`.
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

## 3. The layouts

```
columns 60/40                          rows 35/65
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

**One case passes through.** When a component uses a `>` or `— ` paragraph as part of its own
anatomy (a `quote`'s attribution, a chart's caption), that paragraph is the component's stage
content and stays in the pane. Manifests already declare these in `coda.claims`; authors never
need to know the mechanism. Every other `>` or `— ` goes to the slide, including one written in
the middle of pane A. If both panes carry one, the slide has two Key Insights and `lint:deck`
warns.

Per-slide overrides keep working as they do on any slide: `_header`, `_footer`, `_paginate`.

## 5. Budget

A pane's budget is its box minus its own chrome, measured the same way as a slide's.

- Today `stageBox` in `lib/engine/index.js` takes the slide's stage and subtracts the title,
  subtitle, Key Insight and note, counting wrapped lines. The same model runs one level down: a
  pane's eyebrow, `###` title and subtitle cost that pane lines, and a hidden title costs
  nothing.
- `lint:deck` counts `pane-overflow` and `pane-crowd` against what is left, as it does today.
- Side by side, a titled pane pays for the shared title row (§3).
- Stacked, a title is paid in height, which a 16:9 slide has least of. A titled stacked pane
  holds about one item fewer than an untitled one.
- The component budgets in each manifest's `pane` field stay what they are. They were measured
  with no pane title, so they are the untitled figures; the title's cost is subtracted from
  them, never measured into them.

## 6. Narrow decks

Unchanged from panes: on a square, portrait, story or mobile deck a `columns` / `rows` slide
splits into one page per pane. Each page repeats the slide's heading block, and the pane's
`###` travels with its pane as the first line of that page's body. A `no-title` pane's title
stays hidden on its page.

## 7. Names

**The layouts are `columns` and `rows`, and the marker is `_pane`.** There is no single industry
standard, but there is a clear majority word, and it is "columns". Lattice's personas
(`2026-07-02-website-copy-positioning.md` §2) come from these tools:

| Tool | Persona | Two side by side | Related layouts |
|---|---|---|---|
| Quarto | plain-text native (P1) | `:::: {.columns}` + `::: {.column width="40%"}` | — |
| Slidev | plain-text native (P1) | `two-cols`, `two-cols-header` | `image-left`, `image-right`, `full` |
| Beamer | plain-text native (P1) | `columns` environment | — |
| Google Slides | deck-burdened expert (P3) | "Title and two columns" | "One column text", "Caption" |
| PowerPoint | P3, brand gatekeeper (P4) | "Two Content", "Comparison" | "Picture with Caption" |
| Marp | plain-text native (P1) | "split backgrounds" (`![bg left:40%]`) | — |

Slidev's and Quarto's names are checked against their current documentation. The PowerPoint
and Google Slides names are their stock layout names. The positioning note names Marp, Slidev,
Beamer and Quarto for P1; pairing Google Slides and PowerPoint with P3 and P4 is this note's
inference (those personas make decks in office suites), not the positioning note's claim.

- **`columns`** is the word four of the six use (Slidev abbreviates it to `cols`), and it
  extends to three columns without a rename.
- **`rows`** pairs with `columns` as it does in every spreadsheet and CSS grid. It replaces
  `panes: stack`.
- **Not `split`.** The repo already uses it at least four ways: the `split:` front-matter
  setting, auto-splitting a slide into pages, a modifier on `image` / `scene` / `redline` /
  `citation-card`, and
  `form: split` in manifests. A fifth meaning would guarantee confusion.
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
| `<!-- panes: 55/45 -->` | `<!-- _class: columns 55/45 -->` |
| `<!-- panes: stack 35/65 -->` | `<!-- _class: rows 35/65 -->` |
| `<!-- panes: 50/50 no-rule -->` | `<!-- _class: columns no-rule -->` |
| `<!-- pane: bar -->` | `<!-- _pane: bar -->` |

`examples/panes.md`, `lib/base/base.docs.md` § "Two components on one slide — panes" and the
Studio's editor move to the new syntax in the same change that ships it.

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
- Names should be ones Lattice's personas already know, preferring an industry word over a house
  one: hence `columns` and `rows`.
- Keep it simple: ship `columns` and `rows`; defer `bleed` and `inset`.
- The pane marker mirrors `_class` (`_pane`, above the `###`) so it reads familiar.
- The `###` pane title is optional, the documentation always writes one, and `no-title` hides it.

## See also

- `2026-09-25-panes-two-components-one-slide.md`: the pane engine this design builds on.
- `2026-06-18-frame-recursion-cells.md` §4: the flat split layout this completes.
- `design/forms.md` §0 and §8: Frames, and who selects them.
- `lib/base/base.docs.md` § "Two components on one slide — panes": today's author docs.
