---
kind: library
name: Segno Languages
order: 15
promise: Read a Markdown deck's structure once, then again only where it changed.
intro: A slide deck written in Markdown has a shape before it has any pixels — where each slide starts and ends, the front matter, every comment directive and code fence. Segno Languages reads that shape in one CommonMark pass that agrees with markdown-it token for token, keeps it as a model, and after an edit re-reads only the slide that changed.
group: Drawing and parsing
inLattice: Finds the slides, breaks and directives in a deck for the Studio's editors and the linter.
useWhen: Several parts of your app need to know where a Markdown document's slides, sections or fences are, and the answer has to stay correct and cheap while someone types.
mark: /segno-languages-mark.svg
facts:
  - { k: Package, v: '@laticent/segno-languages' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: Anywhere JavaScript runs }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/segno-markdown/README.md
    note: Every export, the tape's layout, the bounds and how to build and test it.
  - label: The design
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-22-segno-deck-pipeline.md
    note: The four-stage Segno deck pipeline, with the parity and speed measurements for each stage that has landed.
  - label: markdown-it's license
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/segno-markdown/LICENSE.markdown-it.md
    note: The block rules are ported from markdown-it, under its MIT license.
---

## The problem

A Markdown slide deck is one text file. A `---` on a line of its own starts a new slide, front matter at the top sets the theme, and HTML comments carry per-slide settings. Everything that works with the deck needs that structure: the editor's slide list, the preview, the linter, the outline, the "go to slide" command.

The easy ways to find it are wrong in ways that only show up on real decks:

- **Splitting on `---` lines** breaks on a YAML sample inside a code fence, and on a line of text with `---` under it, which CommonMark reads as a heading underline, not a break.
- **Each feature with its own scanner** gives the editor, the preview and the linter slightly different answers about where slide 7 starts. Lattice's editors had grown about nine regressions from exactly that before they shared one model.
- **Running the full Markdown parser again on every keystroke** is correct, but it reads the whole deck to learn that one word changed on one slide.

## The idea

- **One block pass, held to markdown-it.** The parser is markdown-it 14.1.1's block rules, ported rule for rule. Its output agrees with markdown-it token for token (type, level, nesting, line range) on every committed Lattice deck, a fuzz over CommonMark's rule surface and all 652 CommonMark 0.31.2 spec examples.
- **A flat tape, not objects.** Each block token is seven integers in one typed array, and no token carries a copy of its text. On the 59 KB gallery deck the pass takes about a third of markdown-it's block parse (0.73 ms against 2.13 ms, measured 2026-11-05).
- **One model, many views.** `deckModel` reads the deck once. The slides, the slide breaks, the front matter, the comment directives, the fences and the lines of text are views on the same tape, each built the first time something asks for it.
- **An edit re-reads one slide.** A slide break is a `---` outside every list, quote and fence, so the parser's state just after one is empty. `updateDeckModel` re-parses from the break above the edit, stops at the first break below it that the old parse also had, and reuses every other slide's share of the tape as it was.
- **One language per subpath.** Markdown is the first, at `@laticent/segno-languages/markdown`. The package has no root entry, so a later language gets its own subpath without changing this one.

## How to use it

Install it:

```sh
npm install @laticent/segno-languages
```

> Segno Languages publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/segno-markdown`, the folder's old name.

Import the Markdown language from its subpath. Make one parser per configuration and reuse it; the defaults are CommonMark with HTML blocks and tables:

```ts
import { BlockParser, deckModel, updateDeckModel } from '@laticent/segno-languages/markdown';

const parser = new BlockParser();
let model = deckModel('---\ntheme: indaco\n---\n\n# One\n\n---\n\n# Two\n', { parser });

model.text.slice(0, model.bodyStart); // the front matter block
model.slides.length;                  // 2
model.boundaries;                     // Int32Array [3]: the body line of each slide break

// After a keystroke, only the edited slide is parsed again.
model = updateDeckModel(model, '---\ntheme: indaco\n---\n\n# One!\n\n---\n\n# Two\n');
```

Every view on the model is built on its first read, so a reader that wants only the breaks never pays for the rest:

| View | What it holds |
| --- | --- |
| `slides` | Each slide's first and last body line, the break above it, and its tokens on the tape |
| `boundaries` | The body lines that hold a slide break |
| `directives` · `html` | Every HTML comment block, and every other HTML block |
| `fences` | Every fenced and indented code block; `fenceInfo(range)` gives a fence's info string |
| `leaves` · `containers` | The lines of text in paragraphs and headings; the line ranges of lists, items, quotes, tables and rows |
| `plugins` | Blocks that a rule you passed to the parser claimed, such as a `$$` math block |
| `blocks` | The whole body's tape, flat |

Line numbers count from the first line after the front matter, as markdown-it's `token.map` does. An editor that already knows where the edit was can pass it as a third argument, `updateDeckModel(prev, next, { from, toA, toB })`; the library checks it against the two texts and works the edit out itself when it does not hold.

## Where else it fits

- **A Markdown editor with a live outline**: a slide or section list that updates on every keystroke without reading the whole document again.
- **A linter for a Markdown dialect**: rules that need to know they are inside a fence, a comment or a list read it off the model instead of guessing with a regular expression.
- **A dialect with its own blocks**: pass block rules to `new BlockParser({ rules })`, each with the characters it can start on, and the blocks they claim appear in `plugins`.
- **A server that splits uploaded decks**: no DOM and no Node APIs, so the same code runs in a worker, a browser or a function.

## How Lattice uses it

Lattice configures one parser the way it configures markdown-it, with the plugin block rules (math's `$$`, the code plugin's `@code{…}` record), in `lib/core/deck-model.mjs`. Everything that reads a deck's structure reads it from there:

- **Slide breaks.** The linter, the Studio and the Playground split a deck into slides with `lib/core/slide-boundaries.mjs`, which asks the deck model.
- **Directives.** The linter reads every comment directive from the model's comment blocks (`lib/core/meta-scan.mjs`), so a `<!-- _class: … -->` inside a code fence is never read as a setting.
- **The Studio's outline.** The slide index behind the Studio and Playground editors holds one model and updates it with `updateDeckModel` on each edit (`docs/src/lib/deck-outline/deck-outline.ts`).
- **Fix all.** Lattice's deck language for Squadra builds its tree from the same model (`lib/authoring/squadra/lattice-deck.js`).

Slides are still rendered through markdown-it in Lattice 1.0. Moving the engine's own parse onto the model is a later step of the Segno pipeline.

## What it doesn't do

- **It reads blocks, not inline text.** The model knows where a paragraph or heading is, not where its bold or links are. Inline parsing is the next stage of the Segno pipeline.
- **It doesn't render.** There is no HTML output; it tells you the structure, and drawing is your app's or markdown-it's job.
- **It doesn't parse the front matter.** It finds the block at the top and hands it to you as text; reading the keys is up to you.
- **Some edits still read the whole deck.** An edit inside the front matter rebuilds the model from nothing, and so does an update where a block rule that scans ahead (such as `$$` math) was tried above the reused slides.
- **It doesn't carry the HTML entity table.** A link reference whose address holds an entity (`[a]: javascript&colon;x`) needs the entity table to decide whether it is a definition; the parser asks your `linkOk` callback, and without one it decodes numeric references only.
