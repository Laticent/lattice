# Lattice skills

Each file here teaches one Lattice job end to end. Read this table first and open only
the skill the task needs: each row says when to use it and roughly what it costs to read.
They are self-contained on purpose: the tokens, slots, budgets and commands are inlined so
you never have to chase a link mid-task. Each opens with front matter (`name`,
`description`) that an agent harness can index without reading the body.

## Which one

| Use when… | Open |
|---|---|
| Use when reviewing a deck for accessibility: contrast, alt text and describe: comments, reading order, color as the only signal, type size, captions and motion. (≈3.5k tokens) | [`accessibility-review.md`](./accessibility-review.md) |
| Use when adding a new chart kind to the chart family: manifest, pure SVG kernel, palette-blind chart CSS and the contrast contract. (≈5.9k tokens) | [`chart-component.md`](./chart-component.md) |
| Use when the author has numbers (pasted rows, a CSV, a table) and needs the right chart on a slide: pick the kind from the question, author the data, write the claim. (≈3.3k tokens) | [`chart-from-data.md`](./chart-from-data.md) |
| Use when rendering, exporting, sharing or checking a finished deck from a terminal: PDF, PowerPoint, images, player, handouts. (≈3.4k tokens) | [`cli.md`](./cli.md) |
| Use when writing the gallery slides that teach one component: word budgets per slide form, sized before you render. (≈2.1k tokens) | [`component-showcase.md`](./component-showcase.md) |
| Use when adding a new `_class:` layout to the catalog: manifest, palette-blind CSS, optional transform, generated docs. (≈3.7k tokens) | [`component.md`](./component.md) |
| Use when writing a whole deck from a blank file: narrative arc, front matter, picking layouts, the 10/10 bar and the ship checklist. (≈3.3k tokens) | [`deck.md`](./deck.md) |
| Use when a slide needs a diagram: a Mermaid flowchart, sequence or state diagram, or a native flowchart; when it helps, size limits, theming and what breaks. (≈3.0k tokens) | [`diagram.md`](./diagram.md) |
| Use when editing or restructuring a deck that already exists: find its argument, reorder, split or merge slides, keep the author's voice and change only what was asked. (≈3.3k tokens) | [`edit-deck.md`](./edit-deck.md) |
| Use when creating or choosing a finish: backdrop — the layered, palette-blind atmosphere painted behind slide content. (≈3.8k tokens) | [`finish.md`](./finish.md) |
| Use when turning lint, Coach or overflow findings into fixes: reading lint:deck output, the common rule ids and their fixes, and fitting a slide without shrinking type. (≈3.5k tokens) | [`fix-findings.md`](./fix-findings.md) |
| Use when bringing outside content into Lattice: pasted Markdown, a Marp deck, a PowerPoint or PDF, then cleaning the result into the house deck shape. (≈3.1k tokens) | [`import.md`](./import.md) |
| Use when defining a reader lens (Lente): an approved subset of a deck's slides, projected for another audience without editing it. (≈4.7k tokens) | [`lens.md`](./lens.md) |
| Use when a slide carries math: inline $x$ or a display equation, the math layout and its variants, legends for symbols, and when prose beats an equation. (≈2.8k tokens) | [`math.md`](./math.md) |
| Use when changing how a deck looks without changing what it says: theme, color mode, preset, finish, mode, registers, per-slide modifiers, or a better-fitting layout. (≈3.2k tokens) | [`restyle-deck.md`](./restyle-deck.md) |
| Use when writing speaker notes, say: lines, review comments or captions, or when reviewing a deck against the notes rubric. (≈5.4k tokens) | [`speaker-notes.md`](./speaker-notes.md) |
| Use when working in Lattice Studio or answering how to: its panels, keyboard verbs, where decks are stored, and what the Studio chat can and cannot do. (≈3.8k tokens) | [`studio.md`](./studio.md) |
| Use when creating a new palette (`themes/<name>/<name>.css`): the token contract, AA contrast, categorical colors and both modes. (≈5.8k tokens) | [`theme.md`](./theme.md) |

## What each one gives you

Every skill follows the same nine-part shape, so once you have read one you can navigate
all of them: the **10/10 bar** for that artifact · a **mental model** · **where it lives** ·
a numbered **recipe** · a copy-paste **contract** · **what good and bad look like** ·
a **ship checklist** · **common mistakes** · **canonical sources**.

They name the falsifiable bar — the rules you can check. The last mile is taste, and every
skill ends in the same place for that reason: **render it and actually look at it.**

## Reading these outside the Lattice repository

These files ship **verbatim** from the Lattice repo, so they cite things a kit reader does
not have. That is deliberate — rewriting them would fork a second copy that drifts from the
originals. Read the references as context, not instructions:

- **`npm run …` commands and paths like `lib/…`, `tools/…`** assume a clone of the Lattice
  repository. Skip them unless you have one.
- **"HARD RULE #N"** cites the engine's own engineering rules. The ones these skills
  actually reference:

| Rule | What it says |
|---|---|
| #1 | Render paths share one source of truth |
| #2 | Never hand-edit `dist/` |
| #3 | No hex literals in layout CSS — always `var(--token)` |
| #4 | Typography is the 12-token `--fs-*` system |
| #5 | Card-style layouts use nested `- Title` / `  - body` |
| #6 | Before authoring any `<!-- _class: X -->` slide |
| #8 | Isolate feature/fix content from the six long-running galleries |
| #9 | A change a human can SEE ON A SLIDE ships a per-feature demo deck |
| #11 | Universal role-based token names are canonical |
| #15 | Don't reinvent — reuse, for tooling AND UI |
| #20 | No `margin` in engine layout CSS — space with `padding` / `gap` |
| #29 | A typed glyph never reaches a rendered surface; we draw the shape |

Nothing in the recipes depends on being able to follow those citations — they explain
*why* a step exists, not *how* to do it.
