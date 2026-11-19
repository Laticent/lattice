---
status: in-progress
summary: Audit of why agents author decks wrongly — slot contracts nothing executes, list and bold markers that mean something different per layout, universals that silently drop, and four overlapping modifier registries — plus a six-workstream plan to make authoring deterministic.
---

# Deterministic authoring — the audit, and the plan

**Asked (2026-11-19).** The owner reported that agents author decks poorly and incorrectly, and
named four suspects: (1) component manifests say one thing and the code does another; (2) bold
still signals a header in places, and `1.` vs `-` means different things in different layouts;
(3) "universal" concepts such as the coda are not universal, and the manifests do not say where
they are not; (4) universals and modifiers are hard to tell apart, and the base manifest may not
document them all; (5, asked later) front-matter keys that change a component are undocumented. The goal: **near-deterministic authoring.** One way to write each thing, and
the engine and the linter agree with the docs about it.

This note records the audit and proposes the fix. It builds nothing. The per-component evidence
is in the companion folder [`2026-11-19-deterministic-authoring-audit/`](./2026-11-19-deterministic-authoring-audit/):

| File | What it holds |
|---|---|
| `a-manifest-vs-code.md` | 80 manifests (52 components + 28 chart kinds): every sample linted and rendered, every slot selector tested, four mutation probes |
| `b-list-and-bold.md` | 81 rows: every gallery slide with a list rendered with `1.`/`-` swapped and with bold/plain leads, pixel-diffed |
| `c-universals.md` | 12 universals × 80 surfaces, each rendered in Chromium and checked for presence, placement and clipping |
| `d-modifier-inventory.md` | every class token an author can type: where it is defined, documented and linted |

The probe scripts were throwaway and are kept out of the tree: W1 and W4 below turn them into
gated tests. Everything below marked **measured** was run. Light mode, `indaco` theme, at HEAD
`001c985`. An independent `fact-checker` then checked the note's file:line citations and counts
(three counts corrected) and re-rendered six findings from scratch with the real CLI: journey and
cycle with `1.`, agenda with `-`, the contact layout dropping a speaker note, cards-grid `numbered`,
and a checklist linting clean without its heading. All six reproduced. The five render findings were
run again in dark mode on `cuoio` and reproduced the same way; the lint finding does not depend on
theme or mode.
**Sweep tallies, re-derived (2026-11-19).** The tallies were then re-derived with new scripts
written from scratch, not the originals: one slide per manifest sample (80), rendered with the real
CLI and pixel-diffed (`dist/lattice.js`), or linted with `lintText` with the unmutated sample's
findings subtracted.

| Tally | First run | Re-derived | Note |
|---|---|---|---|
| `##` deleted / demoted to `#` / heading-only, lint silent | 66, 66, 64 of 68 | 66, 66, 64 of 68 | exact |
| Components that change on a top-level `1.`/`-` swap | about 22 | 20 on default samples (17 outside R1/R2) | all 16 default-variant names from the first run, plus `columns`; the first run also counted variants (`list takeaway`, `compare-prose axis`, `math`) |
| Chart kinds that break on a nested swap | 13 | 13 | 12 shared; `journey` in, `bullet` out (its sample has no nested list). 11 non-chart components also change on a nested swap (pricing, kpi, stats, premise, list-steps, list-tabular, …), which the first run did not report |
| Components where a bold lead changes the layout | at least 12 (mostly from code) | 6 rendered on samples, bold weight neutralized: citation-card, decision, statute-stack, math, word-cloud, kanban | the rest of the 12 rest on the code citations, which the fact-check confirmed; their samples do not use the inline bold form |
| Coda S / O / overflow | 60 / 11 / 9 | 58 / 11 / 11 | the same 9 plus gantt and journey (clipped inside a box) |
| Below-note S / O / drop / overflow | 30 / 41 / 1 / 7 | 31 / 41 / 1 (`video`) / 7 | |
| Speaker notes dropped | 4 | 4 | exact: contact, gift-card, wifi, video |
| Eyebrow / subtitle overflow | 3 / 4 | 3 / 5 | subtitle adds `premise`, which the first run filed as broken |
| Author tokens outside `MODIFIER_GROUPS` | 37 | **34** | 3 mode + 7 switch + 16 tint/mark + 8 `tint-at-*`; corrected below |
| Placement words lint calls `unknown-class` | 7 | 7 | exact |
| Typos that lint clean through a prefix | 8 probed | 8 of 8 | `zzbogus` control is flagged; the 9-of-11 open-prefix count in Finding 4 is a count of prefixes, not probes |
| Registers missing from the registers doc | 8 | 8 | exact |
| `@video` / `bleed` drops | 4 / 4 | 4 / 4 | exact: contact, gift-card, wifi, video |
| `@video` / `bleed` overflow | 36 / 3 | 38 / 4 | video adds 2 clipped inside a box; bleed adds `columns` |
| `@image` drops / overflow | 4 / 36 | 4 / 38 | drops exact; overflow matches `@video`'s 38. Markdown's picture (`![…](…)`, full size) also drops on the same 4 and overflows 75 |
| `@legend` as literal code / key only in the chart / dropped | 54 / 22 / 4 | 54 / 22 / 4 | exact |
| `_focus` tags nothing | 18 | 18 | exact, the same 18 components |
| Annotation (`_italic_` trailer) drops / overflow | not probed | 4 / 5 | drops on the same 4 posters; overflows journey, kpi, logo-wall, obligation-matrix, regulatory-update |
| Inline spark in the heading drops / overflow | not probed | 0 of 76 / 1 | lands on every slide with a `##`; overflows team-profile |
| `_build` accepted | not probed | 80 of 80 | stamped on every slide; its stepping runs in the live player, which this probe does not drive |
| Speaker note in the PowerPoint export (poster) | not probed | dropped | a `contact` deck exports no notes slide; a control `content` deck keeps its note |
| Deck header and footer shown (Chromium, computed visibility) | not probed | 75 of 80 | hidden on the three bookends, whose samples carry `silent`, and on `image` and `scene`, whose CSS hides both (`image.styles.css:69-70`, `scene.styles.css:48-49`) with no manifest declaration |
| Deck logo painted (`logo:`; Chromium, computed style) | not probed | 80 of 80 | |

The two items that were not counts were then settled exactly. **Undocumented tokens:** of 377
author-typable tokens, 20 cannot be learned from any author-facing doc, literally or as a documented
pattern or register word. Ten are documented nowhere (`motion-auto` `motion-build` `motion-fast`
`motion-normal` `motion-rise` `motion-slow` `motion-together`, `fill-anchor` `fill-center`
`fill-optical`). Ten appear only in the contributor doc `engineering/treatments.md` (`tint-ambient`
`tint-duotone` `tint-frame` `tint-ground` `tint-horizon`, `mark-brackets` `mark-micro` `mark-pills`
`mark-slashes` `mark-ticks`). The first run's ≈35 counted pattern-documented families (`tone-rail`,
`tag-end`, `progress-rail-*`, `agenda-*`) whose words their register sections do list. **The 8
contradictions** were each checked against the code; the owner table below says where each is fixed.

## The answer in five lines

1. **The manifest is a description, not a contract.** No code executes a slot's `selector` or
   `required`, so an agent that obeys the manifest gets no help and one that ignores it gets no
   warning. `lint:deck --strict` exits 0 on a slide with its required heading deleted for 66 of
   68 heading-bearing components.
2. **List markers and bold mean something different in each layout.** Only `content`, default
   `list`, `cards-grid` and `cards-stack` follow the owner's rule. 17 more components change,
   usually break, when `1.` and `-` swap (about 22 counting variant slides); 13 chart kinds and
   11 other components change on a nested swap; bold is structural in at least 12.
3. **Only the coda has a support declaration.** Four poster layouts (contact, wifi, gift-card,
   video) drop **speaker notes** (HTML and PowerPoint), an annotation and an added figure;
   `contact` also drops its heading and eyebrow, and `contact`, `wifi` and `gift-card` drop the
   subtitle. None of it is declared, and lint says nothing.
4. **The base manifest exists, but under another name.** `MODIFIER_GROUPS` (`lib/components/index.js:537`,
   344 tokens) is the real registry. The docs point at `UNIVERSAL_GROUPS` (62 tokens), and four
   words ("universal variant", "base modifier", "modifier", "switch") name four overlapping sets.
5. **One root cause under all four:** the contract lives in prose, and each layout re-implements
   its own reading of the Markdown. The fix is to make the manifest executable, put one
   normalizing reader in front of every layout, and make the linter the oracle that the manifest
   compiles into.

## Finding 1 — manifests vs code

**Measured** across 80 manifests and 471 authored samples (skeleton, sample, stress sample,
variant samples), linted with `lintText` and rendered with `lib/engine` `render()`.

| Drift | Count |
|---|---|
| Own samples with a lint error | 0 (the samples are fine; the contract around them is not) |
| Required `h2` deleted → no lint finding | 66 of 68 (only `split-compare`, `split-panel` are caught) |
| `#` written for `##` → no masthead built, lint silent | 66 of 68 |
| Heading-only slide (every required body slot empty) → lint silent | 64 of 68 |
| Component whose own sample fails its own required slot | 5 (diagram, math, statute-stack, content, split-panel) |
| Sample uses structure no slot declares | 26 (≈16 are the shared eyebrow/subtitle `p`; ≈10 component-specific) |
| Selector that is not valid CSS | 3, all `state-chart` (prose in the selector field) |
| Selector that cannot match the rendered DOM | 2 (`content`, `quote`) |
| Declared variant that does nothing, or under an old name | `numbered` on cards-grid and cards-stack has no CSS. `banner-tag` on decision and compare-prose works (pixel-identical to `tag-band`), but it is the shared card-tag placement under its old name, which lint's `tag-alias` suggests replacing |

The worst cases an agent hits:

- **`journey` with `1.`** draws no chart; the raw `{who=…}` pills print as text (all 8 SVGs
  disappear). **`cycle` with `1.`** loses its ring. **`agenda` with `-`** renders a plain list
  (`agenda.styles.css` has zero `ul` selectors). Lint is silent on all three.
- **`<!-- _class: cards-grid numbered -->`** over a `-` list gives no numbers and no warning; the
  numbers come only from `1.`.
- **`quote`** styles every stage `<p>` as an uppercase attribution, so a second paragraph
  becomes a fake attribution.
- **Variants change the input shape and the slots do not follow.** `statute-stack lane` takes a
  table while its required slot is `ul > li`; `math derivation` takes a table; `split-panel
  pullquote` has no `h2` but declares it required.
- **One of our own skills teaches the wrong form.** `design/skills/lens.md:281-283` writes a `kpi`
  slide with `# Revenue…` (an `h1`) and no `1.` list.

**Why the gates miss it.** The schema gate (`2026-09-01-manifest-schema-gate.md`) checks shape
only, and `selector` is any non-empty string. `checkVariantDeclaration` catches
implemented-but-undeclared variants and leaves the inverse to manual review. The 2026-06-15
manifest-CSS audit was a one-time sweep, not a gate. `check:modifier-effects` runs on demand
only. The only structural slot rule the linter enforces is HARD RULE #5's
`card-style-inline-title`. Squadra (`2026-11-13-squadra-replaces-lint-core.md`) is a rule-for-rule
port, so it inherits the gap.

**Root causes.** (a) A selector has no defined meaning: some describe the author's Markdown, some
the rendered DOM, some neither. (b) `required` and the list type are prose. (c) Slots are flat while
variants change the input shape. (d) Variants are a flat list, with no way to say "needs `takeaway`",
"comes from the source, not the class" or "retired alias". (e) The shared half of every contract
(eyebrow, subtitle, heading level, `tag-*`) lives in `base.docs.md`, outside every manifest, so the
per-component surfaces an agent reads (`components.pick.md`, `<name>.docs.md`) show half a contract.

## Finding 2 — list markers and bold

The owner's rule:

- **R1** In a content component, `1.` renders a numbered list and `-` a bulleted list.
- **R2** In a card component with corner tags, `1.` means numbered tags; `-` means none.
- **R3** Everywhere else, `1.` and `-` render identically.
- **R4** Bold never carries structure. Titles come from nesting (`- Title` / `  - body`, HARD RULE
  #5) or from headings.

**Measured** by rendering every gallery slide that holds a list with its markers swapped, and with
each item's lead bold or plain, then pixel-diffing the pairs.

| Verdict | Components |
|---|---|
| Follows the rule | `content`, `list` (default) → R1; `cards-grid`, `cards-stack` → R2 |
| R1 broken | `list takeaway` hides the numbers of `1.`; `list takeaway numbered` draws numbers for `-` too (the class decides); `list principles` and its counters work only on `1.` |
| R2 broken | `list-steps` (every variant): `-` collapses to unstyled text instead of unnumbered cards |
| R3 broken, `-` collapses | agenda, kpi, stats, list-tabular, premise |
| R3 broken, `1.` collapses | inventory, cycle, glossary (no table), pricing, policy-recommendation, verdict-grid, logo-wall (one giant logo), big-number, journey |
| R3 broken, numbers appear | split-panel (every variant: `1.` becomes a native list or numbered cards; `steps` reads only `ol`), compare-prose `axis` (`-` draws "0") |
| R3 broken on a nested swap | ep-curve, funnel, gantt, hub-spoke, map, piechart, quadrant, radar, scatter, timeline-list, tower, waterfall, bullet |
| R3 broken on a nested swap, non-chart (found by the re-derivation) | pricing, big-number, premise, list-steps, logo-wall, list-tabular, verdict-grid, policy-recommendation, stats, glossary, kpi |

**Bold is structural (R4) in at least 12 components:**

- **Slot-label lift** (`lib/core/slot-label-lift.js:72`, `plugins.js:1757`). The engine wraps an
  item's lead in `<strong>` to mark it as the label, and skips the wrap when the author's item
  already starts with `**`. The author's bold run then becomes the label. In `decision` and
  `compare-prose`, `**A** rest` turns A into the corner tag.
- **`inlineRun.slots: ["strong"]`** in 8 manifests (matrix-2x2, pricing, verdict-grid, kpi,
  cards-grid, cards-stack, cycle, list-steps). In cards-grid, `- **A** x` pushes "x" into a
  separate flex item at the right edge; in kpi, only the bold run becomes the big value.
- **CSS keyed on `strong`.** `inventory` makes `li strong` a block title and hangs the row number
  off it, and its docs teach `- **Lead.** detail`. `citation-card pull-quote` **hides** every item
  without bold. `q-and-a` switches layout on `:has(> li > strong)`; `statute-stack` reads
  `strong:first-child` as the jurisdiction; `math` styles `> **Theorem.**` as the environment label.
- **JS readers** take the first `<strong>` as a title or value: `relationship.js:1058`,
  `carousel.js:47-58`, `prose-projection.mjs:1621`, `:1999-2007`, the glossary term at
  `plugins.js:1937`.
- **Docs and manifests teach it:** matrix-2x2, verdict-grid, redline, citation-card, inventory.

**The linter takes both sides.** `card-style-inline-title` bans `- **Title.** body` on card layouts
(HARD RULE #5), but `- **Title.**` with a nested body passes, and inventory is not covered.
`ledger-inline-title` tells eight layouts to switch to `1.`, so the linter itself enforces `ol` as
structure. `list-modifier-inert` warns about the R1 breaks instead of the engine fixing them. And
`list-shapes.js:88-94` says card layouts want an unordered list while `base.docs.md` §Auto-Numbered
cards says `1.` supplies the badge.

**Root causes.** (a) No shared list contract: each layout's CSS keys on `ol > li` or `ul > li`
(9 manifest selectors are `ol`-only, ≈50 `ul`-only), and the base reset treats them differently
(`base.elements.css:212-213`). (b) Shared kernels read one list type: `splitDetail` (16 of 28 chart
kinds), `findOuterUL`, the agenda and glossary and cycle parsers. `@laticent/markup`'s
`parseTopLevelLis` already reads both. (c) Numbering is driven three ways: by `ol`, by a class,
or always on but `ol`-only. (d) `<strong>` means both "the engine's label" and "the author's
emphasis", so the author's emphasis always acts as structure.

## Finding 3 — universals

**Measured** by appending one universal to each manifest sample, rendering in Chromium, and
checking that the text is present, placed and unclipped.

| Universal | Supported | Declared opt-out | Silent drop | Broken |
|---|---|---|---|---|
| Coda (`> …`) | 58 | 11 | 0 | 11 overflow |
| Below-note | 31 | 41 | 1 | 7 overflow |
| Eyebrow | 74 | — | 1 | 1 + 3 overflow |
| Subtitle | 66 | — | 3 | 5 overflow, 4 reuse the slot undeclared |
| Pill / state mark in heading | 77 / 78 | — | 1 / 1 | 1 overflow |
| `@image` / `@video` | 40 / 40 | — | 4 / 4 | 38 / 38 overflow (honest capacity, flagged) |
| Speaker notes | 76 | — | **4** (HTML and PowerPoint) | — |
| `_focus` | 62 | — | 18 tag nothing | — |
| `bleed` | 72 | — | 4 | 4 overflow |

- **The four posters** (contact, wifi, gift-card, video) rebuild the slide from the authored list
  and drop universals. All four drop **speaker notes**, an annotation, an added figure
  (`@image`, `@video` or a picture; `video` keeps its own video card), `bleed` and `@legend`.
  `contact` also drops the heading itself, the eyebrow, the subtitle and pills; `wifi` and
  `gift-card` drop the subtitle. `video` keeps its eyebrow (rendered: `eyebrow-bar` draws). The notes are missing from the HTML
  (`aside.lattice-notes` is never written), so the presenter view loses them, and so does the PowerPoint export (measured: a `contact` deck exports with no notes slide; a control `content` deck keeps its note).
- **Overflow is flagged by the engine but not by lint.** Eleven components with no coda claim clip
  their own sample once a Key Insight is added (kpi shows its fourth tile under the panel).
- **`premise`** puts an eyebrow in a third flex column as a raw code chip, and a subtitle collapses
  its list to zero width.
- **Four layouts reuse the subtitle position** (redline, citation-card, regulatory-update as a
  source citation; compare-code as a column label) and nothing declares it.
- **Pane hosts** harvest the below-note into the last pane, though `base.docs.md` §panes promises
  one slide-level note.

**Declarations.** Only the coda has one (`coda.claims`, `coda.dock`). `focusAxes` exists but
nothing reads it to warn. `media` declares a host, with no way to say "no figures". Eyebrow,
subtitle, pills, marks, notes, `bleed`, legend and pane behavior have no field. Even the coda
claim is half-wired: `block-unsupported` (`lint-core.js:5992`) fires on the `insight-*` and `no-note`
modifiers, not on an authored `> …`, which contradicts `2026-08-24-universal-coda-cell.md` §4.
`base.docs.md` says ten layouts claim the blockquote (11 do) and fourteen chart layouts claim the
trailing paragraph (28 do).

**Root cause.** The coda fix — harvest the beats **before** any transform runs so a rebuilder
cannot drop them — was never generalized. Every other universal is "works everywhere" by
assumption, with no catalog for lint to read.

## Finding 4 — universals vs modifiers

The machine-readable base manifest is `MODIFIER_GROUPS` (`lib/components/index.js:537`): 43
groups, 344 tokens (343 at the audit head `001c985`; this PR adds the `banner-tag` alias), each with the surface it acts on and its exclusions. The linter and the
Studio's `_class:` completion both read it. Nothing calls it the base manifest, and the docs point
elsewhere.

| Measure | Count |
|---|---|
| Registries that each hold part of the vocabulary | 11 (`MODIFIER_GROUPS`, `UNIVERSAL_GROUPS`, `SEMI_UNIVERSAL_VARIANTS`, `EXCLUSIVE_AXES`, `BASE_MODIFIERS`/`FRAME_`/`ANIMATION_MODIFIERS`, `FAMILY_MODIFIERS`, `MODE_TOKENS`, `SWITCHES`, `TINTS`/`MARKS`, `MODIFIER_PREFIXES`, `COLOR_MODE_TOKENS`) |
| Author-facing tokens outside `MODIFIER_GROUPS` | 34 (3 mode, 7 switch, 16 tint/mark, 8 `tint-at-*` spellings) |
| Tokens an author cannot learn from any author-facing doc | 20: 10 documented nowhere (7 `motion-*`, 3 `fill-*`), 10 only in `engineering/treatments.md` (5 tints, 5 marks) |
| Docs-vs-code contradictions | 8 |
| Tokens the engine paints that lint calls `unknown-class` | 7 (bare treatment placements: `top`, `bottom-right`, …) |
| Typos that lint clean through an open prefix | 9 of 11 prefixes (`no-heaer`, `with-finsh`, `tone-blah`, `fill-xyz` all pass) |
| Cross-component variants that lint clean | any (`kpi gallery`, `statement heat`): the vocabulary is the union of every component's variants |
| Front-matter registers missing from the registers doc | 8 |

The words, as the code uses them:

| Word | Means in code | Drift |
|---|---|---|
| variant | a token in one manifest's `variants` | `base.docs.md` §Universal variants also files directives (`_focus`, `_build`), content syntax and a mode token under it |
| universal variant | a `UNIVERSAL_GROUPS` member (62) | the doc calls it the full set; the full set is 344 |
| base modifier | `BASE_MODIFIERS`: `light` plus 6 aliases | CLAUDE.md #6 sends "base modifiers" to `base.docs.md`, which never uses the phrase |
| modifier | any `_class` word after the component | `design-system.md` says ≈18; the code has 344 |
| switch | a `no-X`/`with-X` pair | 7 switch tokens missing from `MODIFIER_GROUPS`; `silent` documented with one fewer effect than it has |
| finish | backdrop presets | also used for `sketch` (a `mode:` token), the spectrum bar, media finishes, `logo-finish:` |

## Finding 5 — front-matter keys that change how components look and behave

**Asked (2026-11-19):** "We don't document front matter keys that have direct impact on components'
look and behavior. Should they be documented in the base manifest too? Which keys affect behavior
and look?"

**Measured** from `DECK_SETTINGS` (`lib/core/deck-settings.js`, 101 rows, each with a `kind` and a
`group`), cross-checked against `base.registers.docs.md` and `base.docs.md`.

**The keys that change a slide's look or behavior.** A *register* stamps class words on every
slide, and an *axis* register stamps one word per axis:

| Group | Keys | What they reach |
|---|---|---|
| Look | `theme` `preset` `color-mode` `mode` `finish` `finish-override` `backdrop` `typography` `size` `venue` `fit` `claim` | every slide |
| Card-shaped components | `cards` (spare height in a card row), `tag` (card tags), `lift` (elevation), `corners`, `image-card` | cards-grid, cards-stack, list-steps, the image card, … |
| Component-specific | `agenda` (agenda), `marks` (how charts spend color), `split` (divider slides), `glossary`, `inline-code` (pills and marks) | the named component or family |
| Accent | `spectrum` `spectrum-edge` `spectrum-card` `spectrum-card-edge` `spectrum-trim` `rule` `eyebrow` `headline` `stamp` `tone` | the heading, the eyebrow, card edges, state markers |
| Chrome | `header` `footer` `paginate` `meta` `logo` `logo-finish` `progress-rail` | the slide frame |
| Motion and speech | `motion` `motion-style` `motion-speed` `player-motion`, `pace` `delivery` | the player and the narrated guide |
| Declared by plugins | `spark` `callout` `icon` and the image, video and avatar registers | the plugin's inline objects, on any slide |

**What is wrong.**

- **Three registries, not one.** Engine registers live in `DECK_SETTINGS`. Plugin registers live in
  each plugin's manifest (`contributes.registers`, built by `lib/core/register-factory.js`), and
  `spark:` and `callout:` are documented as registers but absent from `DECK_SETTINGS`. Axis words
  live in `lib/core/axis-registers.js`.
- **Undocumented.** `size`, `glossary`, `color-mode` (outside `base.docs.md`), the four motion keys,
  `pace` and `code` have no section in `base.registers.docs.md`.
- **No component says which keys change it.** `cards-grid`'s manifest has a `cards` field for its
  row behavior, but nothing ties that field to the `cards:` register, and no manifest lists the
  registers it responds to. An agent cannot learn from a component's contract that `tag:`,
  `lift:` or `corners:` will restyle it.

**The precedent is already in the tree.** Plugins declare their registers as data in their
manifests, and `register-factory.js` builds them with no host code. The engine's own registers
should work the same way.

## Why agents fail — the pattern across all four

An agent authors from what it reads: `components.pick.md`, the component's `.docs.md`, the
manifest, `base.docs.md`, a skill. Each of the four findings gives that agent a contract that is
**incomplete** (the shared half lives elsewhere), **ambiguous** (`1.`, `**`, "universal" mean
different things per layout) or **false** (`numbered`, `required`, the lens skill's
`h1`). Then the one tool that could correct it, `lint:deck`, passes the slide, because it does not
read the contract either. An agent in a write → lint → fix loop converges on "lint-clean", and
lint-clean is not "correct". **Determinism needs one contract, executed by the engine and the
linter alike, and published to the agent in one place.**

## The plan — six workstreams

Ordered by what each unblocks. Each is one branch and one PR (HARD RULE #17), and each lands
behind the one before it only where it reads that one's output.

### W1 — The manifest becomes executable (the oracle)

- Give `slots` a defined meaning: **a slot describes the author's Markdown** (the markdown-it tree
  before any transform), never the rendered DOM. Replace free-text `selector` with a structured
  shape the build can check: `{ heading: 2 }`, `{ list: { depth: 1, marker: "any" } }`,
  `{ blockquote: true }`, `{ table: true }`, `{ code: "fence" }`. Keep `selector` only as a derived
  read-out.
- Add **per-variant slot overrides** (`variants[x].slots`) so `lane`, `derivation`, `pullquote`
  stop contradicting the base contract.
- Give variants a kind: `class` (CSS reacts), `requires: [...]` (list's counters), `alias-of`
  (retired names), and drop phantom variants (cards `numbered`).
- **One generic lint rule, `slot-contract`**, compiled from the manifest: required slot missing,
  wrong heading level, wrong block type, extra structure the component ignores. Lands in Squadra if
  that has merged, else in `lint-core` (HARD RULE #7).
- **One build gate:** every sample in every manifest satisfies its own slot contract.
- Fix the five components whose samples fail their own contract, and `design/skills/lens.md`.

### W2 — One list contract (R1–R3)

- Each manifest declares **`lists: "prose" | "numbered-tags" | "neutral"`**. The schema requires it
  on any component that reads a list.
- A shared kernel step normalizes every list before layouts see it: one element shape, with
  `data-ordered` recording what the author wrote. For `neutral`, layouts never see the difference.
  For `numbered-tags`, `data-ordered` turns the tags on. For `prose`, the native list renders.
- Every one-list-type reader (`splitDetail`, `findOuterUL`, the agenda, glossary, cycle and
  timeline-list parsers) reads both, through one helper (lift `parseTopLevelLis`).
- CSS keyed on `ol > li` / `ul > li` moves to the normalized shape. `list takeaway` and
  `principles` follow R1; `numbered` becomes the `1.` marker, not a class.
- Lint rules that enforce a list type (`ledger-inline-title`, `list-modifier-inert`'s list arms)
  retire, because the marker stops mattering.

### W3 — Bold is emphasis, never structure (R4)

- The engine marks labels with its own element (`<span class="lat-label">`), never `<strong>`.
  `slot-label-lift`, `inlineRun.slots`, `card-tag-equalize`, the CSS and the JS readers move to it.
- The layouts that teach bold as a title (inventory, citation-card, matrix-2x2, verdict-grid,
  redline, statute-stack, q-and-a, math theorem) move to nesting or a heading, and their docs and
  galleries follow (gallery changes graduate separately, HARD RULE #8).
- A codemod rewrites `- **Title.** body` and `- **Title.**` + nested body into `- Title` + nested
  body for the repo's decks and for Studio imports. A lint finding with an autofix carries
  authors over during the transition (see decision 2).

### W4 — Universals are declared, and protected

- The manifest gets a **`universals`** block: one entry per universal (`coda`, `note`, `eyebrow`,
  `subtitle`, `inline-marks`, `media`, `bleed`, `legend`, `focus`), each `supported` by default or
  `unsupported` / `claimed` with a one-line reason. `coda.claims` folds into it.
- **Speaker notes are not optional.** They are an engine invariant: no layout may drop them, and
  the four posters are fixed.
- Generalize the coda kernel's **harvest-before-transform** to eyebrow, subtitle and the notes
  aside, so a rebuilding transform cannot lose them.
- Lint reads the block: an authored universal on a component that does not support it is a finding,
  with the reason (closes the `block-unsupported` gap).
- **A conformance test** (the audit's harness, promoted): render every component × every universal
  and assert the rendered state equals the declared one. A silent drop becomes a red test.

### W5 — One base manifest

- Promote `MODIFIER_GROUPS` to a declared base manifest (see decision 3) and fold in the 34 missing
  tokens: modes, switches, treatments.
- Adopt one taxonomy, each kind with a one-line test an agent can apply:

| Kind | Test |
|---|---|
| Component | the first `_class` token; a key of the component catalog |
| Variant | in this component's own `variants`; legal only after it |
| Modifier | in the base manifest, with a `surface` the component has |
| Switch | a modifier spelled `no-X`/`with-X`, X in `SWITCHES` |
| Register | a front-matter key (`DECK_SETTINGS` `kind: register`/`axis`); its per-slide twin is a modifier group of the same name |
| Universal content | Markdown the engine detects (eyebrow, coda, note, pills, marks) and `_directive:` comments; never a class |
| Engine class | stamped by the engine; an author never types it |

- Generate the reference half of `base.docs.md` from the manifest (as component docs already are),
  retire `UNIVERSAL_GROUPS` and the term "universal variant", and fix the 8 contradictions.
- Lint checks variants **per component** and closes the open prefixes against the manifest.
- **Registers move into the base manifest too** (Finding 5). Each engine register is declared
  there as data, the way plugins already declare theirs (`contributes.registers`): its key, its
  words, its default, the class words it stamps, and the **surface** those classes act on.
  `DECK_SETTINGS` and the front-matter reference page are generated from the base manifest plus
  the plugin manifests, so a register cannot exist in one and not the other.
- **A component's register list is derived, not declared.** A register stamps a modifier group, a
  modifier group acts on a surface, and a component declares the surfaces it has. The build joins
  the three, so each component's contract card (W6) lists every front-matter key that changes it.
  Nobody hand-maintains that list, so it cannot drift.

### W6 — One contract card per component, for agents

- Generate, per component, the **whole** contract an agent needs in one place: slot shapes,
  `lists` mode, which universals it supports, its variants and their kinds, the legal modifiers.
  `components.pick.md` links to it, and the Studio chat's canon interpolates it
  (`2026-07-19-authoring-canon-unification-plan.md`).
- Measure the result: a fixed set of authoring prompts, run before and after, scored by
  `slot-contract` findings and rendered drops. "Deterministic" is a number, not a feeling.

## Keeping it from drifting again

**Asked (2026-11-19):** "How do we also ensure there isn't future drift?"

Every drift in this audit has one of three causes. Each workstream above removes its cause by
construction, and leaves no rule that depends on someone remembering it.

| How it drifted | Example from the audit | What closes it |
|---|---|---|
| **A fact lived in prose** that nothing executes | `selector`, `required`, "always use `1.`", "ten layouts claim the blockquote" | **D1.** Every fact is a field with an enum or a structured shape, never free text. Counts in docs are generated or not stated |
| **A gate checked one direction** | `checkVariantDeclaration` catches implemented-but-undeclared variants; nothing catches declared-but-inert ones (`numbered`) | **D2.** Every manifest↔code check runs both ways and fails on a stale entry |
| **A check ran once, or on demand** | the 2026-06-15 manifest audit; `check:modifier-effects` | **D3.** The audit's probes become tests in tiers that already run on every PR |

The mechanisms, each tied to a workstream:

- **D1 — One source, everything else generated** (W1, W5, W6). Each component manifest and the
  base manifest are the only hand-written contract. The lint rules, `MODIFIER_GROUPS`, the
  reference half of `base.docs.md`, `<name>.docs.md`, `components.pick.md`, the contract card and
  the Studio canon are all generated from them. A generated file cannot drift, and `build:check`
  already fails when one is stale. Retiring the duplicate registries (`UNIVERSAL_GROUPS`, the
  scattered token lists) removes the copies that drifted.
- **D2 — The schema refuses vagueness** (W1, W2, W4). `selector` becomes a structured shape, so
  a prose selector cannot pass. `lists` is required on any component that reads a list.
  `universals` defaults to supported, and an opt-out needs a reason string. A new component
  cannot ship without answering each question, because the schema asks it.
- **D3 — The contract is executed both ways, on every PR** (W1, W4). These are added to existing
  test tiers, with no new CI job:
  - **Manifest → code:** every manifest sample satisfies its own slot contract.
  - **Code → manifest:** a conformance test walks every manifest found on disk (no roster to
    forget). For each component × universal × list marker it renders the slide and asserts that
    the rendered state equals the declared one. A declared variant with no rendered effect fails
    too.
- **D4 — The no-silent-change invariant** (W1). This one property catches drift nobody
  anticipated. For every component, the build mutates its sample: swap `1.`/`-`, delete each
  required slot, demote `##` to `#`, add bold to each lead, append each universal. **Each
  mutation must either render identically or produce a lint finding.** A mutation that changes
  the render while lint stays silent is exactly the failure this audit found 66 times, and from
  then on it fails the build. That is the operational meaning of "lint-clean means correct".
- **D5 — The agent eval as a ratchet** (W6). The fixed prompt set from W6 is scored by
  `slot-contract` findings and rendered drops. Its score is committed as a baseline that may only
  improve (the `flaky-test-baseline.json` pattern). Running it spends model budget, so it can
  only run nightly or on dispatch, never per PR (HARD RULE #24's posture). **Adding that workflow
  is a CI-contract change, so it comes back to the owner with measured cost before it is built.**

What this does not cover: taste. A layout can honor its contract and still look wrong. That stays
with the visual review path (Quality Bar, `engineering/visual-review.md`).

## Every finding has an owner

Nothing in this audit is left to a follow-up file. Each defect is either fixed in this PR or is the
named job of one workstream, which fixes it in full before it merges (HARD RULE #18).

| Finding | Fixed |
|---|---|
| `design/skills/lens.md` teaches a `kpi` slide with `#` and a layout that does not exist (`appendix-detail`) | **This PR** |
| `base.docs.md`, the decision and compare-prose manifests, their generated guides and their galleries teach `banner-tag`, the old name of `tag-band` | **This PR**: all renamed to `tag-band` (pixel-identical; the two gallery footers change one word). `banner-tag` moves to the registry's `aliases` group, so it keeps working on every tagged layout instead of being known only as two components' variant |
| `base.docs.md` says "Ten" layouts claim the blockquote (11; `gift-card` was missing) and "fourteen" chart layouts claim the trailing paragraph | **This PR**: the doc names examples and points at `coda.claims` instead of a count |
| `base.docs.md` and `design-system.md` call `UNIVERSAL_GROUPS` (62) the full set; `design-system.md` says 51 and gives stale per-group counts | **This PR**: both name `MODIFIER_GROUPS` as the full registry (`design-system.md` keeps that `effectiveVariants()` adds the `UNIVERSAL_GROUPS` subset); every count in that table removed |
| `silent` documented without the section rail it also hides | **This PR** |
| `sketch` documented as a finish; it is a `mode:` token | **This PR** |
| `light`, `mirror`, `numbered` filed under "Universal variants" while the code calls them base modifiers or aliases; the four overlapping terms | **W5**: the taxonomy and the generated modifier reference replace the section |
| CLAUDE.md HARD RULE #6 says "base modifiers", a term `base.docs.md` never uses | **W5**, and the CLAUDE.md wording goes to the owner (a canonical-doc change is the owner's) |
| 20 tokens an author cannot learn; 8 registers with no section; `spark:`/`callout:` outside `DECK_SETTINGS` | **W5** (base manifest + generated reference) |
| Bare placement words the engine paints and lint calls `unknown-class`; typos that lint clean through an open prefix; cross-component variants that lint clean | **W5** (lint reads the base manifest; prefixes closed; variants per component) |
| Required slots, heading level and list type unenforced; prose selectors; samples that fail their own contract; `numbered` phantom; `quote` styling every paragraph as attribution | **W1** |
| `1.`/`-` and nested swaps change or break 30+ components | **W2** |
| Bold as structure in 12+ components | **W3** |
| Posters drop speaker notes, annotations and added figures (all four), the subtitle (contact, wifi, gift-card), the heading and eyebrow (contact); 11 components overflow on a coda; `premise` eyebrow/subtitle; `_focus` silent on 18; pane hosts misplace the below-note; `block-unsupported` ignores an authored blockquote | **W4** |
| `@legend` shows as literal code on 54 surfaces, is key-only on 22 chart readers and drops on 4 posters | **W4** (the `legend` entry of the `universals` block; lint reads it) |
| Four layouts reuse the subtitle position undeclared (redline, citation-card, regulatory-update as a citation; compare-code as a column label) | **W1** (a per-component slot the manifest declares) and **W4** (the `subtitle` entry says `claimed`) |
| `image` and `scene` hide the deck header and footer in their own CSS; the manifest `chrome` field has no `footer` key to declare it, and `image`'s anatomy diagram draws both | **W4**: chrome is a declared universal (the schema gains `footer`), the declaration replaces the CSS, and the anatomy is generated from it |
| `npm run check:modifier-effects` (run 2026-11-19, exit 1): the committed surface record (`lib/core/modifier-effects.generated.json`, which the Studio's `_class:` completion reads) disagreed with the render for 14 components | **This PR.** Each drift judged: (a) on gantt, radar, ep-curve and histogram the buggy probe reported eyebrow as inert (gantt and radar were already recorded with an eyebrow effect, so their record does not change; ep-curve and histogram now get theirs) because it took the chart's axis line (`` `[…]` ``) for an eyebrow and never placed a real one; rendered with a real eyebrow, `eyebrow-bar` draws its bar. The probe now skips axis lines. (b) agenda's `cards` variant was retired on 2026-11-08 and the record still listed it. (c) 8 components had no entry. (d) premise (heading) and video (eyebrow) moved from inert to an effect, and quadrant and scatter (eyebrow) through the probe fix; split-compare's `table` left the inert list without gaining an effect, so the record no longer claims anything about it; why the measurement changed is not yet known, and W4's conformance test owns it. The record is re-blessed from the fixed probe; D3 moves the check into a per-PR tier |
| `components.pick.md` contradicts itself on its length; `AGENTS.md` overstates what `lint:deck` catches | **This PR** |

## Settled with the owner (2026-11-19)

| Question | Answer |
|---|---|
| 1. Numbered-by-nature layouts | **Split by shape.** `list-steps` and `split-panel steps` follow R2 (`-` = unnumbered cards); `agenda`, `list-tabular`, `stats`, `kpi`, `premise` follow R3 (always numbered, marker irrelevant) |
| 2. Bold migration | **Hard break plus a codemod** for the repo's decks. No transition release: bold stops carrying structure in the W3 release, which leads its changelog with `**Breaking:**` |
| 3. Base manifest form | **JSON `lib/base/base.manifest.json`** with a schema; it generates `MODIFIER_GROUPS` and the reference half of `base.docs.md` |
| 4–6. Universals, strictness, order | **The recommendations below, as written.** Order: W1 → W5 → W2 → W3 → W4 → W6 |

The options as they were put follow, for the record.

## Decisions for the owner

1. **Numbered-by-nature layouts.** `list-steps`, `agenda`, `list-tabular`, `stats`, `kpi`, `premise`,
   and `split-panel steps` draw numbers today. Do they follow **R2** (`-` turns the numbers off) or
   **R3** (always numbered; the marker is irrelevant)? *Recommend:* R2 for the card-shaped ones
   (`list-steps`, `split-panel steps`) and R3 for the rest. *Default if silent:* that split.
2. **Bold migration.** *Option A:* a hard break plus a codemod for the repo's decks. *Option B:* one
   release in which bold still works, with a lint warning and autofix, then removal. *Recommend:* B
   (user decks in the Studio are not in the repo, so a codemod cannot reach them). *Default:* B.
3. **Base manifest form.** *Option A:* a JSON `lib/base/base.manifest.json` with a schema, the shape
   agents already read for components, which generates `MODIFIER_GROUPS`. *Option B:* keep the JS
   registry, rename it, and generate the docs from it. *Recommend:* A. *Default:* A.
4. **Universals: default-supported with explicit opt-out, or every manifest lists every universal.**
   *Recommend:* default-supported, opt-outs declared with a reason, enforced by the conformance test.
   This keeps 52 manifests short while making a silent drop impossible. *Default:* that.
5. **Strictness.** Are `slot-contract` findings errors (they block `lint:deck --strict` and the
   Studio's ship check) or warnings? *Recommend:* errors for a missing required slot and a wrong
   heading level; warnings for ignored extra structure. *Default:* that.
6. **Order.** *Recommend:* W1 → W5 → W2 → W3 → W4 → W6. W1 gives every later workstream its test.
   W5 is small and makes lint honest. W2 and W3 are the visible fixes (each owes a demo deck,
   HARD RULE #9, and a `**Breaking:**` changelog line).
