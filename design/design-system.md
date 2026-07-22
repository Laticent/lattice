# The Lattice Design System

**Function · Form · Substance · Finish — organized as components.**

This document is the canonical mental model for Lattice. It is the
*meta*-organization that sits above the existing references — it tells
you what kind of thing each layout, modifier, chart engine, or palette
token *is*, and how they compose.

If you read exactly one Lattice document, read this one. The other
references (`skill.md`, `theming.md`, `architecture.md`,
`lib/base/base.docs.md`, per-component `<name>.docs.md`) become
specialist references for one layer once you have this model.

This doc **owns the four axes**. For how they relate to the structural nouns
(Frame · Cell · Tile from `forms.md`) and to the component — the whole concept
map on one page — see `design/concepts.md`.

---

## 1. The problem this solves

Lattice grew organically from a small palette and a handful of card
layouts into 53 components, ~18 modifiers, five native chart engines, one
external diagram pipeline (Mermaid), three rendering paths, and 14
palettes. Each addition was internally consistent; collectively they
had no shared vocabulary.

Symptoms a new author hits:

- "Which layout do I want?" has no answer except *scroll the gallery*.
- "Charts" (quadrant, radar, native SVG) and "diagrams" (Mermaid) are
  authored, classed, and rendered three different ways even when they
  express the same thing (e.g. `matrix-2x2` vs `quadrant`).
- Cross-cutting modifiers (`dark`, `compact`, `accent`,
  `mirror`, `numbered`) work on some layouts and silently no-op on
  others. The matrix of valid combinations isn't written down.
- New layouts get added ad hoc with inconsistent naming
  (`cards-grid` vs `verdict-grid` vs `matrix-2x2` vs `kpi`).
- Third-party libraries (Mermaid; potentially D2, Vega-Lite, PlantUML)
  have no clean plug-in boundary.

The diagnosis is not "too much" — it's **no taxonomy**. This document
supplies one.

---

## 2. The four layers

Every Lattice slide is a stack of four orthogonal decisions:

```text
┌────────────────────────────────────────────────────────────┐
│  FUNCTION   what the slide does for the audience           │  ← catalog
│             7 families — Anchor · Statement · Inventory ·  │     grouping
│             Comparison · Progression · Evidence · Imagery  │
├────────────────────────────────────────────────────────────┤
│  FORM       the spatial composition that holds the answer  │  ← ~10 shapes,
│             bookend · divider · canvas · grid · stack ·    │     not 35
│             ledger · panel · matrix · scatter · timeline · │
│             split                                          │
├────────────────────────────────────────────────────────────┤
│  SUBSTANCE  what fills the form                            │  ← 4 sources,
│             prose · structure · series · graph             │     one engine
│                                                            │     contract each
├────────────────────────────────────────────────────────────┤
│  FINISH     palette tokens + cross-cutting modifiers       │  ← already
│             dark · compact · accent · mirror ·     │     clean
│             numbered · background · period                 │
└────────────────────────────────────────────────────────────┘
```

The four layers are **independently replaceable**:

- Swap **Finish** (palette + dark modifier) → same deck, new mood
- Swap **Form** (grid → stack) → same data, new shape
- Swap **Substance** source (Mermaid → D2) → same shape, different renderer
- Swap **Function** by re-classing → the slide says something else

The four layers also correspond to **the four audiences** Lattice serves:

| Layer       | Owned by              | Lives in                            |
|-------------|-----------------------|-------------------------------------|
| Function    | Deck authors          | choosing which component to use     |
| Form        | Layout designers      | `lattice.css` layout blocks         |
| Substance   | Engine maintainers    | `lib/*.js` post-processors, Mermaid |
| Finish      | Theme designers       | `themes/*.css`, modifier rules      |

---

## 2.5 The vocabulary — two registers, one mapping

The four concepts have **two names each**, on purpose: a precise **system**
word for the spine and a plain **human** word for the surface. The rule is
strict — **exactly one system word and one human word per concept, no third
synonym anywhere.** Code, manifests, and docs use the system column; UI,
prompts, and author-facing copy use the human column; the AI reasons in the
system register and speaks in the human register.

| System (spine) | Human (surface) | The author's question | The author's verb |
|---|---|---|---|
| **Function** | **Purpose** | "what's the point of this slide?" | *(rarely changed — it's the intent)* |
| **Form** | **Layout** | "how is it laid out?" | "show it as cards / steps / a list" |
| **Substance** | **Content** | "what goes on it?" | "write / paste this" |
| **Finish** | **Finish** | "what should it feel like?" | "make it formal / sketchy / dark" |

**The Finish axis is surfaced through THREE composable author registers, each
its own front-matter key — no single key does two jobs:**

| Register (human) | Key | What it sets |
|---|---|---|
| **Theme** | `theme:` | the palette (color) |
| **Mode** | `mode:` | the rendering *mode* — the typographic hand: `boardroom` (clean default) / `sketch` / `sketch-clean` |
| **Backdrop** | `finish:` | the layer stack painted *behind* content: `none` / `atrium` … `gallery` |

The Finish axis also carries an **accent** sub-family — small marks on chrome (not
backdrops), each its own front-matter key, palette-blind, defaulting to today's render:

| Register (human) | Key | What it sets |
|---|---|---|
| **Spectrum** | `spectrum:` | the accent-gradient STYLE (`on`/`solid`/`duo`/`mono`/`off`) — drives the brand bar (and the structure under `spectrum-trim: on`) |
| **Spectrum edge** | `spectrum-edge:` | the section-edge bar PLACEMENT (`top`/`left`/`right`/`bottom`/`off`) |
| **Spectrum card** | `spectrum-card:` | an INDEPENDENT spectrum rail on card surfaces (`off`/`auto`/`solid`/`duo`/`mono`/`rainbow`) |
| **Spectrum card edge** | `spectrum-card-edge:` | where the card rail sits (`left`/`top`/`right`/`bottom`) |
| **Spectrum trim** | `spectrum-trim:` | how much the structural accents carry the spectrum (`off`/`restrained`/`on`) — off = quiet accent-tint hairline by default |
| **Heading rule** | `rule:` | the heading underline (`auto`/`full`/`short`/`accent`/`none`) |
| **Eyebrow** | `eyebrow:` | the mono-caps kicker decoration (`plain`/`dot`/`bar`/`arrow`/`underline`) |
| **Headline alignment** | `headline:` | the framing-text cluster's horizontal alignment (`auto`/`left`/`center`/`right`) — `auto` keeps each component's own default; `left`/`center`/`right` pin the whole cluster, even on a layout whose default is the other way |

The accent registers are documented for authors in `lib/base/base.docs.md`; design in
`engineering/decisions/2026-07-15-accent-finish-consolidation.md`.

They compose: `theme: indaco` + `mode: sketch` + `finish: atrium` is a
hand-drawn deck in indaco's blue on an atrium backdrop. *(The key is `mode:`,
not `style:` — Marp already owns `style:` for inline-CSS injection — and the
Finish axis's human word is just "Finish.")*

**The one word we legislate against: "look."** It is ambiguous — it means
**Layout** (Form) *or* the **Mode/Finish** feel, the only collision in the
model. It is never a canonical term; resolving "make it look different" into
*Layout* vs *Mode* is an explicit interpretation step (the AI asks or infers).
Any word outside the canonical columns is a convenience term, not a concept, and
is scoped or retired rather than allowed to drift.

**Form is now the composition *system*, axis included.** `design/forms.md`
ratified the slide-scale model (Form = Frame + Cell + Tile) and *promotes* the
word: **Form** is the system that answers "how is this composed?", and the axis
of a component is one part of it. Its human word stays **Layout**. The twelve
values (`split`, `panel`, `grid`, …) are a Form's **Frame types** — "Frame" is
the system word for *a Form value acting as a slicer* (the object that carves a
box into Cells). It is **not** a third synonym for "Form": "Form" names the
system, "Frame" names the slicer. A component therefore *selects a Frame* and
binds Substance into the Cells it produces. `design/forms.md` owns the Form
vocabulary; this doc owns how a *component* selects a Form. (No human word is
coined for "Frame" — it is a structural, designer-facing system word; an author
selects one via `form: <name>`.)

The **authored-part → Cell map** — which slot (eyebrow, title, lede, content,
key-insight, below-note, caption, footer, …) hoists into which Cell — is owned by
`design/forms.md` §5.1, under the same no-third-synonym law. Two consequences of
that law worth stating here: the lead statement is the existing **`subtitle`/lede**
(there is no coined "heart" noun), and a component's non-hoisted parts (e.g. a
`caption`) stay component-owned *inside its stage Cell* rather than becoming a new
slot. The `conformance: "strict"` manifest opt-in makes the map machine-enforced.

The human register is **generated from** the system register, never coined
independently — so the surfaces can't drift apart.

---

## 3. The 7 functions

| Function       | The audience leaves knowing…                       | Examples |
|----------------|----------------------------------------------------|----------|
| **Anchor**     | where they are in the deck                         | `title`, `divider`, `closing` |
| **Statement**  | one declarative claim                              | `big-number`, `quote`, `split-panel`, `content` |
| **Inventory**  | a parallel set of related items                    | `inventory`, `cards-grid`, `cards-stack`, `list`, `actors`, `agenda`, `glossary`, `list-tabular`, `checklist`, `q-and-a`, `logo-wall` |
| **Comparison** | how two or more options differ                    | `compare-prose`, `compare-code`, `compare-table`, `verdict-grid`, `decision`, `matrix-2x2` |
| **Progression**| an ordered movement through stages or time        | `list-steps`, `list-criteria`, `roadmap`, `gantt`, `kanban` |
| **Evidence**   | data that supports the argument                    | `stats`, `kpi`, `chart-family` (progress, piechart, timeline-list), `radar`, `quadrant`, `word-cloud`, `diagram`, `code` |
| **Imagery**    | a visual that carries its own meaning              | `image` |

Test: an author opens a blank slide. The question "what is this slide
*for*?" must have an answer that is one of these seven. If a real
slide is hard to place, the families are wrong. The current ~35
layouts mapped cleanly into seven.

The audience-function taxonomy organizes the catalog and the docs. On
**disk**, components are grouped slightly differently: seven function
buckets plus five substance- or domain-defined buckets (`chart`,
`diagram`, `math`, `code`, `legal`) that colocate components sharing a
renderer kernel or domain vocabulary. The `function` field on every
manifest is unchanged; the disk grouping is reflected in an optional
`bucket` field. For 31 of the 53 components `bucket === function`; for
the other 22 the bucket diverges to keep maintenance localized. See §9.

---

## 4. The 12 forms

| Form         | Description                                                 | Used by |
|--------------|-------------------------------------------------------------|---------|
| **bookend**  | Dark, centered, no chrome — full-canvas anchor              | Anchor (title, closing) |
| **divider**  | Dark band or full slide marking a section boundary          | Anchor |
| **canvas**   | One element fills the working area, centered                | Statement, Evidence, Imagery |
| **grid**     | N cells in M columns × K rows, each cell parallel           | Inventory, Comparison |
| **stack**    | N cells stacked vertically (or horizontally), each parallel | Inventory |
| **ledger**   | Row-per-item table with consistent columns                  | Inventory, Comparison, Progression, Evidence |
| **panel**    | Two zones: prominent content + supporting context           | Statement |
| **matrix**   | Cells indexed by two axes (categorical × categorical)       | Comparison, Progression, Evidence |
| **scatter**  | Points in a 2-D plane (continuous × continuous)             | Evidence |
| **spatial**  | Points or regions placed by real-world geography (a basemap)| Evidence (map) |
| **timeline** | Items along a single ordered axis                           | Progression |
| **split**    | Two co-equal zones, side-by-side or top-bottom              | Comparison |

(Twelve entries. `split` is comparison's co-equal halves where `panel`
has a prominent side; `spatial` is the newest — positions fixed by an
external geographic coordinate system, not chosen by a grid or axis,
which is what `scatter` and `matrix` can't express. See the `map`
component.)

---

## 5. The 4 substances

The **substance** is what the author authors. Lattice supports exactly
four substance sources today, and a new chart library, diagram
language, or data format must plug in as one of these four — this is
the engine's only plugin point.

| Substance     | Author writes…                              | Renderer                                            | Output    |
|---------------|---------------------------------------------|-----------------------------------------------------|-----------|
| **prose**     | Headings, paragraphs, inline emphasis       | Marp markdown → semantic HTML; CSS does everything  | DOM       |
| **structure** | Headings + nested lists with conventions    | `lib/*.js` post-processor rewrites lists into purpose-built DOM | DOM       |
| **series**    | Tabular DSL (axes + datapoints as bullets)  | `lib/components/chart/_chart-family/chart-family.js` + per-chart kernel            | SVG       |
| **graph**     | External graph language (Mermaid today)     | External tool (mmdc) → SVG, palette injected        | SVG       |

**The unification this gives us.** "Chart" and "diagram" are no longer
separate concepts. They're both Evidence-function slides with SVG
substance. The split is by **data shape**: series is tabular,
graph is topological. Authors learn one question — "is your data a
table or a network?" — instead of memorizing engines.

A new graph language (D2, PlantUML) plugs into the **graph** contract;
a new chart library (Vega-Lite, Observable Plot) plugs into the
**series** contract; a new declarative layout plugs into **structure**;
a pure-CSS layout plugs into **prose**.

### The `mixed` escape hatch

A boardroom-pitch component may combine prose and structure in one
slot — one prominent recommendation beside supporting cards. For such a
component, the manifest declares `substance: "mixed"`. The loader allows
this **only when `form === 'panel'`**: the panel form is what makes
combining substances coherent (one prominent item beside supporting
structure). `mixed` is not a fifth plugin contract; it's a declaration
that the component composes two existing contracts. The four-substance
plugin point is unchanged. (No component declares `mixed` today — the
hatch stays dormant but remains a general capability.)

---

## 6. The component model

**Each layout is a COMPONENT with a short, memorable name.**

This is the load-bearing decision in the design system, and it's
borrowed directly from mature web-component libraries (shadcn, Chakra,
Mantine, Lit, Storybook, Slidev, Notion blocks). Across all of them
the pattern is universal:

- **Invocation stays short** — one memorable name + optional variant
  props. Nobody writes `<communication-container.grid-form.card-variant>`;
  they write `<CardGrid>` or `<my-card>` or `layout: cover`.
- **Discovery happens outside the code** — Storybook, IDE autocomplete,
  slash commands, visual pickers, manifests. Not in the invocation.
- **Taxonomy organizes the docs, not the names** — the side-nav groups
  by category, but the component is still `<Tooltip>`, not
  `<feedback.overlay.tooltip>`.

Lattice follows the same pattern. The four-layer model organizes
**how we think about the catalog**. It does *not* organize the
authoring grammar. Authors write:

```markdown
<!-- _class: cards-grid compact dark -->
```

The first token is the **component name** (the layout). The rest are
**modifiers** (the variants). This is exactly how it has always
worked. Nothing to migrate.

### What's new

Each component now has a **manifest** — a JSON file describing it for
the catalog, the scaffolder, the IDE snippets, and the docs:

```text
lib/components/cards-grid.json
```

```json
{
  "name": "cards-grid",
  "function": "inventory",
  "form": "grid",
  "substance": "structure",
  "description": "2–4 parallel items, similar weight, scannable in a grid.",
  "purpose": "Use when the audience needs to compare or scan a small set of options at a glance. Avoid for more than 4 items — split into multiple slides.",
  "variants": ["compact", "dark", "mirror", "accent", "numbered", "four", "three"],
  "slots": {
    "title":  { "selector": "h2",         "required": true,  "description": "Slide heading." },
    "cards":  { "selector": "ul > li",    "required": true,  "description": "Each list item becomes one card. A top-level bullet is the card title (renders bold); an indented bullet underneath carries the body text." },
    "insight":{ "selector": "blockquote", "required": false, "description": "Optional key-insight panel above the cards." }
  },
  "skeleton": "<!-- _class: cards-grid -->\n\n## Slide heading.\n\n- First card title\n  - Body text for the first card, one sentence.\n- Second card title\n  - Body text for the second card, one sentence.\n- Third card title\n  - Body text for the third card, one sentence.\n- Fourth card title\n  - Body text for the fourth card, one sentence.\n",
  "example": "examples/snippets/cards-grid.md",
  "anatomyBlock": "T7-card-grid-2x2"
}
```

The manifest is the **single source of truth** for everything *outside*
the rendering pipeline:

- the **scaffolder** (`npm run new:slide <name>`) emits the `skeleton`
- **VS Code snippets** are generated from the skeleton + name
- the **per-component docs** (`lib/components/<name>/<name>.docs.md`) are generated from the enriched manifest fields
- the **autocomplete data** for editor plugins reads `variants`
- the **gallery decision-tree** uses `function` → `form` → `name`

The rendering pipeline (CSS rules, JS post-processors, Mermaid
integration) is unchanged. The manifest is metadata, not behavior.

### 6.5 Universal variants — four tiers

Variants don't all belong to one component. Some apply to every layout
("dark", "with-period"); some apply to most ("compact",
"accent"); some apply to a family of layouts ("checks-*" for the
state-bearing layouts, "canvas" for charts); some are strictly per-layout
("watermark" for split-panel, "four" for cards-grid). The manifest model
recognises four tiers:

**Tier 1 — Universal (46 variants).** Apply to every component. Added
automatically by `effectiveVariants()`; manifests must NOT list them. The
canonical source is `UNIVERSAL_GROUPS` in `lib/components/index.js`. Nine
categories:

| Category | Variants |
|---|---|
| Mood (1) | `dark` |
| Decoration (6) | `treatment-none`, `tint-corner at-tl`, `mark-orbit`, `tint-vignette`, `tint-edge at-right`, `mark-threads` |
| Typography (5) | `with-period`, `no-period`, `scale-l`, `scale-xl`, `scale-2xl` |
| Chrome (7) | `silent`, `no-header`, `no-footer`, `no-paginate`, `form`, `no-form`, `no-progress` |
| Social (1) | `safe` |
| State (8) | `wip`, `draft`, `tbd`, `confidential`, `redacted`, `archived`, `pinned`, `revised` |
| Tone (4) | `tone-pass`, `tone-warn`, `tone-fail`, `tone-skip` |
| Insight (11) | `insight-key`, `insight-recommendation`, `insight-takeaway`, `insight-verdict`, `insight-so-what`, `insight-bottom-line`, `insight-the-ask`, `insight-our-view`, `insight-implication`, `insight-next-step`, `insight-why` |
| Claim (3) | `claim-quiet`, `claim-hero`, `claim-framed` (the last is the no-op per-slide opt-out marker) |

The State variants are the team-collaboration vocabulary — visible
markers for slides that are in-progress, confidential, or otherwise
need a meta-signal independent of the content. The Tone variants
reuse the state-token color system (pass/warn/fail/skip) at the
canvas level — a "this slide is the failure slide" treatment. The
**Insight** variants rename the callout eyebrow — the universal Key
Insight panel and the split-compare verdict tag share one
`--insight-label` seam, so a curated modifier swaps the word
(`insight-takeaway` → TAKEAWAY, `insight-verdict` → VERDICT) while every
default stays put; `insight-key`/`insight-recommendation` are the two
defaults as explicit modifiers, so either can move onto the other surface
(`engineering/decisions/2026-07-17-insight-label-vocabulary.md`). The
**Claim** variants let content claim the stage by receding the chrome
(quiet → hero → bleed); they compose with the Chrome switches above and
are the author surface of the `claim:` register (`design/concepts.md`;
`engineering/decisions/2026-07-03-claim-content-claims-the-stage.md`).

**Chrome control is per-slide OR deck-wide.** The Chrome tokens above are
per-slide (`<!-- _class: no-footer -->`). Each chrome element also has a
deck-wide control in the front-matter, so an author can set the baseline once
and opt individual slides out:

| Element | Per-slide token | Deck-wide (front-matter) | Default |
|---|---|---|---|
| Running header | `no-header` | `header: "…"` (text present) | off |
| Running footer | `no-footer` | `footer: "…"` (text present) | off |
| Page number | `no-paginate` | `paginate: true` | on (Form) |
| Section rail | `no-progress` | `class: no-progress` (propagated) | on (Form) |

Header / footer / pagination ride native Marp directives; the rail has no native
directive, so its deck-wide off-switch is the `no-progress` class propagated to
every slide. `silent` bundles header + footer + pagination off for a single
slide. The full matrix — and the Studio controls that emit it — is in the
authoring guide (`docs/src/content/docs/guides/authoring.md`).

**Tier 2 — Semi-universal.** Apply to most layouts but
not all. Manifests opt OUT via `excludes`; default is accepted.

| Variant | Excluded by |
|---|---|
| `compact` | layouts with no internal density (bookends, single-canvas) |
| `accent` | dense ledger layouts where the focal is ambiguous |
| `claim-bleed` | prose-dense / table layouts where edge-to-edge crops content (`compare-table`, `list-tabular`, `glossary`, `inventory`, the legal ledgers) |

**Tier 3 — Family (scoped).** Cross-cutting section modifiers that apply
to a SUBSET of layouts — neither universal nor a single component's
variant. The token sets live in `FAMILY_MODIFIERS`
(`lib/components/index.js`); membership is declared two ways —
**per-layout** via the manifest's `families` field (co-located, so a new
state-bearing layout opts in next to where it's defined) and **per-bucket**
via the group's `buckets` (when the family is genuinely bucket-wide):

| Family | Modifiers | Scope (how) |
|---|---|---|
| State-markers | `checks-ringed`, `checks-knockout`, `checks-bold`, `checks-outline`, `checks-tonal`, `heat` | layouts declaring `families: ["state-markers"]` — `checklist`, `verdict-grid`, `obligation-matrix`, `roadmap` |
| Chart | `canvas` | the `chart` bucket |

`familyModifiersFor(manifest)` resolves the in-scope set, which the
docs-portal hands to the catalog so the Drawing Board / playground
autocomplete offers them **only on the layouts they apply to** (right
after the component's own variants). The linter accepts the flat union
(`FAMILY_MODIFIER_TOKENS`) everywhere, and the autocomplete-parity test
keeps the two from drifting.

**Tier 4 — Layout-specific.** The manifest's `variants` field. Things
like `mirror`, `numbered`, `four`, `chosen`, `donut`, etc. Specific to
one or a few layouts.

The validator rejects any manifest that lists a Tier 1 or Tier 2
variant in its `variants` array — those are added automatically, and
listing them risks drift if the universal set changes later.

---

## 7. Discovery

The decisive insight from rethinking the first pass: **a verbose
invocation does not aid discovery; tooling does.**

### For the CLI

```bash
npm run new:slide -- --list           # all components grouped by function
npm run new:slide -- cards-grid       # emit the skeleton to stdout
npm run new:slide -- cards-grid > my-slide.md
```

Implementation: `tools/new-slide.js`. Reads `lib/components/*.json`,
emits the `skeleton` field. With `--list`, groups by `function` and
prints `name — description` per row.

### For the editor

Generated `.vscode/lattice.code-snippets`. Typing `lattice-cards-grid`
in any `.md` file → autocomplete suggests the snippet → tab inserts
the full skeleton with placeholder slots. The snippet file is
generated from the same manifests; never hand-edited.

### For the browser (future)

A `docs/catalog.html` generated from manifests would deliver the
Storybook experience: every component with a thumbnail, description,
variant list, and example. Not in scope for the initial foundation;
the gallery decks fill this role partially today.

### Search tags — the searcher's vocabulary

Function/Form/Substance is the **designer's** taxonomy: it answers
"what kind of thing is this." It is not the vocabulary an author types
when they don't yet know the component's name. The `tags` field is that
missing layer — the **searcher's vocabulary**. Every manifest declares
3–5 tags drawn from a **controlled vocabulary** (`TAG_GROUPS` in
`lib/components/index.js`), spanning four dimensions:

| Dimension | What it captures | Examples |
|---|---|---|
| **idiom** | colloquial / visual name | `swimlane`, `two-by-two`, `stoplight`, `donut`, `pull-quote` |
| **occasion** | meeting, phase, domain | `board-deck`, `qbr`-style `kickoff`, `okr`, `compliance` |
| **material** | the input in hand | `percentage`, `milestones`, `quotation`, `citation`, `snippet` |
| **task** | what the author is doing | `prioritize`, `tradeoff`, `summary`, `walkthrough` |

Two rules keep tags valuable rather than noisy:

1. **Controlled.** A tag must be a member of the vocabulary. New search
   vocabulary is added to `TAG_GROUPS` deliberately — never coined
   per-manifest — so facets cluster across components. Enforced by
   `validate()`.
2. **Strictly complementary.** A tag must **not** repeat the
   component's own `name` / `function` / `form` / `substance` / `bucket`.
   `gantt` is not tagged `gantt` or `timeline`; it carries `swimlane`,
   `planning`, `milestones`, `agile` — the words the axes can't.
   Enforced by `validate()`.

A third, **cross-component** property — vocabulary alone can't express
it — is enforced by `tools/check-ownership.js` (`checkTagClustering`):
every tag must be used by **≥2 components** (so the facet clusters), and
no vocabulary term may be **dead** (used by zero). Genuinely-unique
idioms (`spider` for radar, `formula` for math) are knowingly
allow-listed in `SINGLETON_TAGS`. Tags surface in the generated
`<name>.docs.md`, the aggregated `dist/docs/components.md`, and as
chips + a live filter facet on the docs-site component pages.

### For agents

AI agents authoring decks get a discovery surface and a validation loop:

- **`dist/docs/components.json`** — a machine-readable catalog: every
  component's axes, tags, slots, skeleton, **`capacity`**, and
  when/anti/related prose, plus the controlled vocabularies, in one
  deterministic document an agent loads in a single read. Generated alongside
  `components.md/.html` by `tools/build-docs-portal.js`.
- **Capacity — pick by content shape.** A layout overflows when it holds more
  elements than it's built for — the most common authoring slip. A component's
  optional `capacity` block (`{ axis, sweet, soft, hard, escalateTo }`) declares
  how many elements (along the `item`/`row`/`col`/`cell`/`line` axis it's built
  on) it holds: `sweet` is ideal, past `soft` it crowds, past `hard` it
  overflows. **Count the content first, then filter by capacity**; over `hard`,
  take an `escalateTo` target or split across slides. `lint:deck` warns
  (`capacity-crowd` / `capacity-overflow`) as a backstop. See
  `engineering/decisions/2026-06-17-content-capacity-contract.md`.
- **Density — budget the words, not just the elements.** The right layout with
  the right element count still fails if each element is a paragraph. A
  component's optional `density` block (`{ axis, soft, hard }`) declares how many
  WORDS each element gets: `soft` is the brevity target, past `hard` it overflows.
  Universal chrome carries its own budgets regardless of layout — eyebrow ≤ 5
  words, title ≤ 10, subtitle ≤ 12, key-insight ≤ 18, pill ≤ 2. The Drawing Board
  reviewer flags overruns as suggestions (`density-crowd` / `density-overflow`,
  `verbose-eyebrow` / `verbose-subtitle` / `verbose-key-insight`); writing tight
  up front is the fix. See
  `engineering/decisions/2026-06-30-prose-density-budget.md`.
- **`npm run lint:deck -- <file>`** (`tools/lint-deck.js` →
  `lib/authoring/lint.js`) — runs the markdown footgun checks against a
  *draft* deck and emits structured, fix-oriented diagnostics with no
  Chromium render. The fast edit→check loop. The checks: card-style
  inline-title (`- **Title.** body` *or* `1. **Title.** body` on
  card-style layouts), ledger inline-title (`- **Name.** value` on a
  ledger/numbered layout that wants `1. Name` / `   - value`), ordered-list
  bold (a `**span**` inside a `principles` statement), split/number slot
  bodyless items, and class typos. The per-manifest equivalents of the same
  rules run in `validate()`; the repo-wide commit gate is
  `test/unit/components/deck-authoring.test.js`. All checks live in the pure,
  browser-safe `lib/authoring/lint-core.js` — the single source shared by the
  CLI, `validate()`, and the Drawing Board / coach Architect panel.
- **`AGENTS.md`** (repo root) — the vendor-neutral entrypoint pointing any
  agent at `design/skill.md`, the catalog, and the linter.

---

## 8. For each audience

### 8.1 Authors — pick the component, write the skeleton

A new author:

```bash
npm run new:slide -- --list           # browse the catalog
npm run new:slide -- compare-prose    # generate the skeleton
```

…copies the skeleton into their deck, fills in the slots, runs
`npm run build:galleries`, ships. The decision tree (which component
to use) lives in `design/skill.md` and the visual gallery; it is not
encoded in the directive name.

Existing authors continue to write `<!-- _class: cards-grid -->` as
they always have. Nothing breaks. Nothing changes.

### 8.2 Theme designers — Finish ownership

Unchanged. Edit `themes/<name>.css`. Stay palette-blind: roles, not
colors. See `design.md` §1.3 and `design/theming.md`.

### 8.3 Layout designers — adding a new component

1. Pick `function.form` coordinates. Confirm they're sanctioned in
   §4's matrix; if not, design first.
2. Write `lib/components/<bucket>/<name>/<name>.manifest.json` with the manifest fields.
3. Implement the CSS in `lattice.css`.
4. If `substance` is `structure`, add a post-processor in
   `lib/<name>.js` and wire into all three render paths.
5. Add a 6–10-slide demo deck in `examples/<name>.md` per
   `workflow.md`.
6. Regenerate VS Code snippets: `npm run snippets:build`.

The manifest is the contract; everything else flows from it.

### 8.4 Engine maintainers — the four substance contracts

The engine has exactly four plugin points, one per substance.

**Adding a new chart kind (substance = series).** Add a kernel module
`lib/<name>.js` exporting a function that takes the parsed list and
returns SVG sized to the chart-frame. Register the kind in
`CHART_LAYOUTS` in `lib/components/chart/_chart-family/chart-family.js`. Add CSS, manifest, demo
deck.

**Adding a new graph language (substance = graph).** Detect the fence
in the shared kernel and the two render surfaces — `lattice-emulator.js`
and `lattice-runtime.js` (the owned engine, `lib/engine/`, composes the
same plugins; `marp.config.js` is retired). Resolve palette tokens. Inject
into the language's theming API. Invoke the external CLI. Inline the SVG.
Add DIAGRAM OVERRIDES if needed.

**Adding a new structure layout (substance = structure).** Define the
canonical list shape. Write the post-processor. Wire into all three
render paths. Write the CSS. Manifest + demo deck.

**Adding a new prose layout (substance = prose).** Just CSS. Manifest
+ demo deck.

---

## 9. Component folder layout on disk

Each component is self-contained in a folder under its **bucket**:

```text
lib/components/inventory/cards-grid/
  cards-grid.manifest.json   ← schema-validated; declares bucket
  cards-grid.styles.css      ← extracted from lattice.css
  cards-grid.transform.js    ← post-processor (only for structure/series)
  cards-grid.docs.md         ← generated from manifest prose fields
  cards-grid.gallery.md      ← generated; the variant catalog source
  cards-grid.gallery.light.pdf  ← rendered light-theme gallery
  cards-grid.gallery.dark.pdf   ← rendered dark-theme gallery
```

### Buckets — the disk grouping

Components live under one of twelve buckets. Seven match the audience-
function families from §3; five are substance- or domain-defined
exceptions introduced for maintenance colocation:

| Bucket       | Count | Origin |
|--------------|-------|--------|
| `anchor`     | 3     | function = anchor |
| `statement`  | 4     | function = statement |
| `inventory`  | 10    | function = inventory (statute-stack moved to legal) |
| `comparison` | 8     | function = comparison (obligation-matrix → legal, compare-code → code) |
| `progression`| 2     | function = progression (authority-chain, regulatory-update → legal; journey, roadmap → chart) |
| `evidence`   | 2     | function = evidence (citation-card → legal, math → math, code → code) |
| `imagery`    | 1     | function = imagery |
| `chart`      | 13    | substance = data visualizations (function stays evidence/progression); journey, word-cloud + roadmap folded into the chart family |
| `diagram`    | 1     | substance = topological visuals (function stays evidence) |
| `math`       | 1     | substance = typeset equations (function stays evidence) |
| `code`       | 2     | substance = syntax-highlighted source (function stays evidence for code, comparison for compare-code) |
| `legal`      | 5     | domain = legal (function spans 4 families) |

For 31 of the 53 components `bucket === function`. The 22 divergent
components declare their `bucket` explicitly in the manifest; their
`function` field is unchanged in every case. Three reasons for
divergence:

- **Substance** — `chart`, `diagram`, `math`, and `code` each colocate
  components built around a specific KIND of rendered content. Each
  describes the category, not the library that happens to render it
  today (today's implementation may not be tomorrow's):
  chart = data visualizations (today: internal SVG kernel);
  diagram = topological visuals (today: Mermaid);
  math = typeset equations (today: KaTeX);
  code = syntax-highlighted source (today: highlight.js).
  Each has its own !important overrides for the current renderer's
  inline styles, so colocating the component with its substance-
  specific surface aids maintenance when the renderer changes.
- **Domain** — `legal` colocates components sharing authoring
  vocabulary, citation conventions, and audience use case
  (statute-stack from inventory; regulatory-update + authority-chain
  from progression; citation-card from evidence; obligation-matrix
  from comparison).

The audience-facing taxonomy in §3 is what authors use to pick a
component; the disk bucket is what maintainers use to navigate the
shared-context code.

The bucket layout is reflected in three places only:
- the manifest's optional `bucket` field
- the filesystem path
- `groupByBucket()` in `lib/components/index.js`

Everything else — including the `<!-- _class: name -->` invocation —
is unchanged. Authors never type a bucket name.

### Per-bucket survey galleries

Each bucket has its own generated survey PDF:

```text
lib/components/inventory/
  inventory.gallery.md          ← generated from manifest.sample[…]
  inventory.gallery.light.pdf
  inventory.gallery.dark.pdf
```

The survey is one slide per bucket member (drawn from
`manifest.sample`) plus an opening title slide. Generated by
`npm run build:bucket-galleries`; never hand-edited.

A consequence worth knowing: each `manifest.sample` is the source for
**two** generated decks — the component's own `<name>.gallery.md` and its
bucket's survey — but only the per-component one is rebuilt by
`npm run build`. Editing a `sample` therefore staled the survey until CI;
rebuild it with `build:bucket-galleries` (see development.md →
Cross-cutting rules, and gotchas.md).

**`galleryAuthored` is not "this component is special" — it is a
maintenance-mode flag.** A gallery is either *generator-owned* (the
committed `.md` must byte-match the generator, enforced by the
`:check` gate) or *author-owned* (`galleryAuthored: true` — the generator
and the exact-match gate both skip it; only a light/dark page-count
parity check runs). Any `.md` could be hand-edited; the flag just
declares who maintains it. The two author-owned cases today are
content-heavy decks that are far nicer to maintain as a `.md` than as
manifest JSON: `diagram` (~31 slides, one per Mermaid diagram type —
variation lives in content, not in modifier classes) and the `legal`
bucket survey.

### Shared infrastructure

Lives in flat subdirectories of `lib/`:

```text
lib/
  base/         ← tokens, elements, modifiers, variants, treatments
  chart-family/ ← shared dispatch for series substance
  engine/       ← match-section, resolve-palette, slot-label-lift, …
  helpers/      ← cross-cutting utilities
  shared/       ← shared.styles.css
  transformers/ ← registry.js + per-adapter shims
  components/   ← bucketed per-component folders
  _theme.css    ← top-level theme entry
```

The split is: per-component things go in the component folder;
catalog-shaped collections (components, integrations) nest per item;
flat infrastructure (base, engine, helpers, shared, transformers)
stays flat.

---

## 10. CSS architecture — bundling + `@layer`

Per-component CSS files (`lib/components/<name>/styles.css`) are
concatenated into `lattice.css` at build time. The bundled file is
committed (like `.vscode/lattice.code-snippets`) so the renderer
loads exactly one file with zero fetch dependency.

Cascade order is enforced via **CSS `@layer`** — independent of source
or bundle order:

```css
@layer base, root, scaffold, components, semi-universal, universal, diagram-overrides;
```

Each per-component CSS file wraps its rules in the `components`
layer:

```css
/* lib/components/cards-grid/styles.css */
@layer components {
  section.cards-grid h2 { … }
  section.cards-grid > ul { … }
}
```

Universal variants (`dark`, `with-period`, `tone-warn`, etc.) live in
`lib/_universal.css` wrapped in `@layer universal`, which always wins
over any component-level rule regardless of bundle order or
specificity. Adding a new universal variant is guaranteed safe — no
ordering bugs possible.

### The bundler

`tools/build-css.js` concatenates the following in declared order:

1. `lib/_base.css` — resets, `*`, `html`, `body`
2. `lib/_root.css` — `:root` tokens, font-face declarations
3. `lib/_scaffold.css` — `section`, `header`, `footer`, pagination
4. `lib/components/*/styles.css` — every per-component file (alphabetical)
5. `lib/_semi-universal.css` — `compact`, `accent` rules
6. `lib/_universal.css` — `dark`, `with-period`, `tint-*`, `mark-*`, State, Tone, Chrome
7. `lib/_diagram-overrides.css` — Mermaid theme overrides

Output: `lattice.css` (committed). Header comment lists source files.

### npm scripts

| Script | Purpose |
|---|---|
| `npm run css:build` | Regenerate `lattice.css` from sources |
| `npm run css:check` | Fail if `lattice.css` is stale relative to sources (CI gate) |

The `css:check` script runs as part of the pre-push hook (along with
the snippets freshness gate). If anyone modifies a per-component
`styles.css` without regenerating, the push fails with a
"`npm run css:build` to regenerate" message.

### Migration

Components are extracted from the monolithic `lattice.css` in batches
of 5, with per-batch validation: rebuild the baseline deck
(`test/integration/baseline-decks/gallery.md`) plus the 58 per-component
galleries, then diff page-by-page (via `pdftoppm` rendering
to PNG) against the pre-batch baseline. Any visual change fails the
batch.

Until extraction is complete, un-migrated components' CSS remains in
`lib/_unmigrated.css` (the renamed residual `lattice.css` content),
which sits in `@layer components` alongside the migrated files.

---

## 11. What this document is NOT

- **Not a tutorial.** That is `skill.md`.
- **Not a layout catalog.** That role moved to per-component docs at
  `lib/components/<name>/<name>.docs.md`; this file's §3 keeps the
  function-family index that points there.
- **Not a palette spec.** That is `theming.md` + `design.md` §1.3–§1.6.
- **Not an architecture deep-dive.** That is `architecture.md`.
- **Not an authoring-grammar change.** Component names stay short.
  The four-layer model is for organizing the catalog, the docs, and
  the engine — not for typing.

---

## 12. The component model versus the alternatives

| Approach | Library that uses it | Pros | Cons |
|----------|----------------------|------|------|
| **Short component names + variant props** (this proposal) | shadcn, Chakra, Mantine, Slidev, Notion blocks | Terse author syntax. Familiar pattern. Discovery via tooling. | Two namespaces (components + variants) to learn. |
| Dotted/categorical names (`inventory.grid.cards`) | none in practice — was tried in commit `0ec93da`, reverted | Self-documenting at the call site. | Verbose. Authors learn ~70 path combinations vs ~35 names. Implementation surfaces (e.g. `evidence.canvas.chart.progress` for what used to be `progress`). |
| Atomic utility classes | Tailwind | Maximal composability. | Wrong layer — Lattice is at the slide level, not the property level. |
| HTML/JSX components | Spectacle, MDX decks | Slot semantics are explicit. Type-checkable. | Loses the Marp markdown-first contract. |
| Visual layout picker | PowerPoint, Keynote | Best discovery. | Requires a GUI; can't ship in a CLI tool. |

The short-name + manifest approach is the lowest-friction model that
keeps Marp markdown as the source format. The manifest layer adds the
discovery story that markdown alone can't provide.

---

## 13. Status

**Shipped on this branch:**

- This document — the canonical four-layer model + component contract.
- The 7-family taxonomy + 11 forms + 4 substances vocabulary.
- `lib/components/` — 58 manifests + loader + validator + universal-variant tiers. (Original 45 + 5 SPLIT-* + 6 legal-family + journey + post-Phase-5 renames, all promoted to first-class components.)
- `tools/new-slide.js` — the scaffolder.
- `.vscode/lattice.code-snippets` — generated from manifests.
- `design/design-system.gallery.md` — the slide-rendered demo of this doc.
- Test scope rename — `test/unit/layouts/` → `test/unit/components/`, with `tools/affected-tests.js` updated to route changes under `lib/components/<name>/` to `test:components`.
- `cards-side` CSS extraction — split out of `cards-grid/styles.css` into its own `lib/components/cards-side/styles.css`. Validated by same-sandbox before/after PDF byte-compare on all five decks using either component (0–1 byte drift = pixel-identical).
- Per-component transform location — every component whose transform exists is now at `lib/components/<bucket>/<name>/<name>.transform.js`. The chart-family dispatcher itself lives at `lib/components/chart/_chart-family/chart-family.js` (underscore-prefixed so the component loader and bucket-wide CSS walker both skip it) — bucket-scoped shared infrastructure colocated with the bucket it serves.
- **`lib/_legacy.css` fully retired.** The 5,938-line monolith was split across 7 phases into 8 new source files (`_root.css`, `_base.css`, `_modifiers.css`, `_syntax-highlight.css`, `_chart-family.css`, `_backgrounds.css`, `_semi-universal.css`, `_diagram-overrides.css`) + 17 component folders. Bundle position of every block preserved to maintain cascade outcomes. See `engineering/decisions/2026-05-16-post-foundation-followups.md` for the open follow-ups (specificity-bump hacks introduced during extraction, @layer activation as the principled retirement path).
- **`tools/pixel-check.js`** — same-sandbox before/after PDF byte-compare with pdftoppm + ImageMagick pixel-diff fallback for mmdc non-determinism. Built mid-branch; got us through the 30+ extraction commits without a single false-positive regression slipping through.

**Shipped on the bucketed-layout branch (2026-05-18):**

> *Historical snapshot — the counts below (9 buckets, 58 components, 89 gallery
> pages) are as of that branch. The catalog ships **53 components across 12
> buckets** today; the live count is `dist/docs/components.json` `.count`.*

- **Disk reorg into 9 buckets** (anchor, statement, inventory,
  comparison, progression, evidence, imagery + chart, diagram).
  58 components moved from flat `lib/components/<name>/` to
  bucket-nested `lib/components/<bucket>/<name>/`. Pixel-validated
  zero drift across all 89 pages of gallery.md against pre-move
  baseline in the same sandbox.
- **`bucket` field on the manifest schema**, with `BUCKETS`,
  `groupByBucket()`, `manifestBucket()` added to `lib/components/`.
  `loadAll()` learned the bucket-nested layout; backwards-compatible
  with the flat shape during migration.
- **Light/dark per-component galleries.** Every `<name>.gallery.pdf`
  renamed to `<name>.gallery.light.pdf`, and a sibling
  `<name>.gallery.dark.pdf` generated for all 58 components via
  `tools/build-galleries.js` (idempotent `dark` injection into every
  `_class` directive of the gallery source).
- **Per-bucket survey galleries.** 9 generated `<bucket>.gallery.md`
  sources composed from each bucket's `manifest.sample` set, rendered
  to `<bucket>.gallery.{light,dark}.pdf` via
  `tools/build-bucket-galleries.js`.
- **Discovery tools bucket-aware.** `tools/build-css.js`,
  `tools/build-component-docs.js`, `tools/preview.js`, and
  `tools/affected-tests.js` all tolerate both shapes during the
  migration; new collisions (the `diagram` component-name-equals-
  bucket-name case) handled explicitly.
- **Integration tests.** Each component now asserts BOTH light page
  count (= manifest formula) AND dark page count (must match light);
  each bucket asserts source-md-matches-manifests AND PDF page count
  = members + 1.

**Still deferred (see `engineering/decisions/2026-05-18-component-reorg-and-modular-css.md`):**

- State / Tone / Chrome universal-variant CSS — the metadata shipped
  in §6.5 but the actual CSS rules for these tiers haven't landed.
- **Broad `@layer` activation — blocked, not deferred.** The Phase 3.5
  investigation attempted to activate `@layer components` across all
  component CSS and discovered that a partial activation breaks the
  cascade: per the CSS spec, unlayered declarations beat layered ones
  regardless of specificity, so wrapping components but not shared
  files makes components silently lose to whatever generic shared
  rule exists. The full coordinated activation is blocked by the
  `!important` competition between `lib/integrations/markdown-it/scaffold.css`
  and `lib/base/base.variants.css`. Both must stay unlayered for the
  source-order cascade to keep working. See `engineering/cascade.md`
  for the full investigation and what would unblock it.
- **Modular CSS migration (Phase 4)** — moving component-specific
  universal-variant rules out of `lib/base/base.modifiers.css` and
  into each component's `<name>.styles.css`. Originally depended on
  `@layer` activation; now blocked indefinitely until the
  scaffold-vs-variants `!important` strategy is rewritten.

**Shipped from Phase 3.5 (May 2026 investigation):**

- 7 component-level cascade-workaround `!important` declarations
  retired (in `anchor/title`, `comparison/verdict-grid`,
  `progression/list-criteria` ×2, `progression/list-steps`). Natural
  selector specificity already wins; the `!important` was defensive
  overkill. Pixel-diffed: 0 deltas across 35 affected pages.
- `engineering/cascade.md` captures the cascade architecture
  and the `@layer` constraints so future contributors don't redo
  the partial-activation attempt that broke.

**Ratified on this branch:**

- **Variant proliferation guardrail — doc rule, not a field.**
  When a variant changes the *shape* of the data (not just the
  visual treatment), it's a separate component. Today
  `inventory.ledger.bullets` has four sibling variants
  (`def`, `metric`, `spec`, `register`) — all the same flat-list
  shape, only the row layout differs, so they stay as variants.
  Kept as a review rule, not encoded in the manifest, to avoid
  inventing a `dataShape` field before we know we need one. Revisit
  if review judgement starts drifting.
- **Multi-substance components — `substance: "mixed"` on panel
  forms.** The four-substance plugin contract stays at four. A panel-
  form component that legitimately combines prose + structure may
  declare `substance: "mixed"` in its manifest. The loader allows
  this only when `form === 'panel'`. `mixed` is not a fifth plugin;
  it's a declaration that the component composes two existing
  contracts. No component declares `mixed` today — the hatch stays
  dormant. See §5.

**Deferred (open questions):**

- Third-party library boundary tightening. The four-substance
  contracts are abstract; the first real integration (D2? Vega-Lite?)
  should be code-reviewed for boundary shape and the contract
  documented per what was learned.
- Visual catalog (`docs/catalog.html` or a desktop-app panel). Doable
  from manifests; not in scope for this branch.
