# AGENTS.md — authoring Lattice decks with an AI agent

Lattice renders boardroom-quality PDFs from Markdown. A deck is a Lattice
Flavored Markdown (LFM) file — Marpit-compatible, rendered by Lattice's own
engine — and each slide opts into a **component** via a
`<!-- _class: <name> -->` directive and fills its slots with ordinary
Markdown. This file orients any AI agent (Claude Code, Copilot, Cursor, an
SDK agent) toward authoring decks correctly. For engine/contributor work,
read `CLAUDE.md` and the `engineering/` docs instead — and before building any
script or tool, check `engineering/capabilities.md` (the generated index of
every script, tool, and framework) so you extend what exists rather than
reinvent it.

## Read these first

- **`design/skill.md`** — the deck-authoring contract. Read before writing
  any slide.
- **`design/design-system.md`** — the Function · Form · Substance · Finish
  model (§2) and how to discover components (§7). One read explains the
  whole catalog's shape.
- **`design/skills/`** — when the task is to *create a new* deck, theme,
  component, chart, finish, lens, or notes/reviews/captions from scratch: one
  self-contained skill per artifact (what good/bad looks like, the recipe, the
  gates). `design/skills/deck.md` is the from-blank deck walkthrough.

## The catalog — pick the right component

Every component is described in two generated, always-current files:

- **`dist/docs/components.json`** — machine-readable. One read gives you
  every component's axes, **search tags**, slots, authoring skeleton,
  **`capacity`** (how many elements the component holds), **`density`**
  (how many WORDS each element gets before it overflows), and
  `whenToUse` / `antiPatterns` / `related` prose, plus the controlled
  vocabularies. Load this to select a component.
- **`dist/docs/components.md`** — the same, human-readable; the browsable
  edition (the docs-site component pages) adds a live filter by name,
  description, or tag, plus a live preview and an in-browser editor.

**Selecting by intent.** Each component carries 3–5 search tags — the
*searcher's* vocabulary (e.g. `swimlane`, `board-deck`, `percentage`,
`prioritize`). Match the author's intent words to tags, then confirm with
the component's `whenToUse` / `antiPatterns`. Don't pick from memory; the
catalog is the source of truth.

**Count first, then filter by capacity.** A component overflows when you pour
more elements into it than it holds — the single most common authoring slip.
Before committing to a `_class`, **count your content** (how many items / rows
/ columns / code lines) and check the component's **`capacity`** in
`components.json`: `{ axis, sweet, soft, hard, escalateTo }`. `sweet` is the
ideal count; past `soft` it crowds; past `hard` it overflows. If your count
exceeds `hard`, **don't pick that component** — use one of its `escalateTo`
targets or split the content across slides. `lint:deck` warns when a slide
exceeds capacity (rules `capacity-crowd` / `capacity-overflow`), but choosing
by capacity up front is the fix; the warning is the backstop. See
`engineering/decisions/2026-06-17-content-capacity-contract.md`.

**Then budget the words.** The right component with the right number of elements
still fails if each element is a paragraph. Where `capacity` bounds the element
COUNT, **`density`** bounds the WORDS per element: `{ axis, soft, hard }` — `soft`
is the brevity target (aim here), `hard` the ceiling past which it overflows.
Write each card / row / step to ~`soft` words; push detail to speaker notes.
**Universal chrome has its own word budgets** regardless of component — keep the
**eyebrow ≤ 5 words** (a label, not a sentence), the **slide title ≤ 10**, the
**subtitle ≤ 12**, a **key-insight ≤ 18** (one memorable sentence), and a
**status pill to one or two words**. The Drawing Board reviewer flags overruns as
suggestions (`density-crowd` / `density-overflow`, `verbose-eyebrow` /
`verbose-subtitle` / `verbose-key-insight`); writing tight up front is the fix.
See `engineering/decisions/2026-06-30-prose-density-budget.md`.

## Once you've picked one — read its agent contract

`components.json` is for *picking*; each component's generated
`lib/components/<bucket>/<name>/<name>.docs.md` is for *authoring inside* the
one you picked (HARD RULE #6 in `CLAUDE.md`: open it before writing or editing
that slide). Its `## Agent contract` section, right after the header, is the
dense, scannable part — read it before the narrative below. In order, it
carries: the same `capacity`/`density` budgets already summarized above,
the **Slots** table you already see in `components.json`, then three
subsections that only appear where the manifest declares them:

- **Variant decision rule** — for components with more than one variant, the
  concrete signal that should drive the pick (e.g. audience, data shape),
  not just what each variant looks like.
- **Common mistakes** — authoring-time errors specific to this component
  (wrong nesting, a slot's exact structural requirement, a variant paired
  with the wrong data), distinct from `antiPatterns`, which is about whether
  to reach for the component at all.
- **Data shape** — for data-driven components, terse constraints on the data
  itself (cardinality, sort order, label length, unit consistency) beyond the
  generic `capacity`/`density` item-count budgets.

Not every component has all three yet — they're being backfilled
incrementally; when absent, fall back to the narrative `whenToUse` /
`antiPatterns` sections below the contract.

## Author, then lint, then render

```text
edit deck.md  →  npm run lint:deck -- deck.md  →  fix  →  render
```

- **`npm run lint:deck -- <file.md>`** — fast, no-render check for the
  markdown footguns the docs warn about. Run it on every draft and fix all
  errors before rendering. Rules: card-style slides forbid the inline
  `- **Title.** body` shape (use the nested `- Title` / `  - body` shape);
  ordered-list "statement" components forbid `**bold**` inside items; class
  typos are flagged. `--json` gives machine-readable output; `--strict`
  fails on warnings too.
- **Render** (needs a Chromium; set `CHROME_PATH` in the cloud sandbox —
  see `engineering/gotchas.md`):

  ```bash
  CHROME_PATH=$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome | head -1) \
    npx lattice deck.md deck.pdf
  ```

## The rules agents most often break

- **Card-style components use nested bullets, not inline bold.**
  `- Title` then `  - body`, never `- **Title.** body`. The linter catches
  this; so does the commit gate.
- **Title slides:** `title silent` + a backtick-wrapped `` `eyebrow` `` +
  a plain subtitle paragraph. See `components.json` → `title`.
- **No hand-editing generated files** (`dist/**`, `<name>.docs.md`,
  `<name>.gallery.md`, the snippets file). Edit the manifest and regenerate.
- **Tags, slots, and skeletons come from the catalog**, not from training
  memory — they change as the engine evolves.
