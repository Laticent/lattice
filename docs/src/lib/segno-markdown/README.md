# @laticent/segno-languages

Standard languages for Lattice decks, one subpath export each. The folder keeps its old name,
`segno-markdown`. Markdown is the first language, at `@laticent/segno-languages/markdown`; the
subpath leaves room for formulas and Djot (owner's ruling, 2026-11-23).

## `./markdown`

**The deck model.** One parse of a Markdown deck that every reader of its structure shares: where the slides
are, where each slide boundary falls, the front matter, every HTML-comment directive, every fence, every
leaf of inline text. Zero dependencies, no DOM, no Node.

It is stages S0, S1 and S2 of the Segno deck pipeline
(`engineering/decisions/2026-10-22-segno-deck-pipeline.md`):

- **S0, ingest.** Strip a leading BOM and fold `\r\n` and a lone `\r` to `\n`. Nothing else, and no later
  stage normalizes again.
- **S1, the block pass.** markdown-it 14.3.3's block rules, ported rule for rule onto a lean state that writes
  a flat tape of integers instead of `Token` objects and computes no `content` strings. The structure matches
  markdown-it token for token (type, level, nesting, line map, `hidden`), which is the fidelity bar the owner
  set (D3): the corpus, a fuzz over CommonMark's rule surface and the 652 CommonMark 0.31.2 spec examples
  agree with markdown-it on every token.
- **S2, the inline pass.** markdown-it 14.3.3's inline rules and post-processing (the delimiter resolver that pairs
  emphasis and strikethrough), ported the same way onto a tape of inline records, one leaf at a time and on first
  read. Held to markdown-it field for field through the token adapter (`lib/core/model-tokens.mjs`): the corpus, a
  seeded fuzz over the inline rule surface in every leaf context, and the 652 spec examples.

## Install

```sh
npm i @laticent/segno-markdown
```

## Use

```js
import { BlockParser, deckModel, updateDeckModel } from '@laticent/segno-languages/markdown';

const parser = new BlockParser(); // commonmark + html + table, as Lattice configures markdown-it
let model = deckModel('# One\n\n---\n\n# Two\n', { parser });
model.boundaries; // Int32Array [2]: the body lines that split slides
model.slides.length; // 2

// After a keystroke: only the edited slide is parsed again.
model = updateDeckModel(model, '# One!\n\n---\n\n# Two\n');
```

| Export | What it does |
|---|---|
| `new BlockParser(options)` | A configured block pass: `html`, `table`, extra `rules` (a host's block rules, installed before `fence` as markdown-it's `ruler.before` would, each with the `triggers` it can start on), and `linkOk` for a link reference destination holding an entity |
| `parser.parse(src, startLine?)` | S1 over normalized text: a `BlockTape` (`tape`, `length`, `lines`, `bMarks`, `eMarks`, `kinds`) |
| `deckModel(source, { parser, frontMatter?, raw? })` | S0 (skipped with `raw`), the front-matter split (the engine's rule by default), S1 over the body |
| `updateDeckModel(prev, next, span?)` | The model of `next`, re-parsing from the slide the edit starts in until a break realigns with the old parse. `span` is the editor's account of the edit, checked and never trusted |
| `model.boundaries` · `model.leadingEmpty` · `model.slides` | Where the engine splits slides; whether the body opens with a break (the engine then drops the empty group before it); each authored slide's line and token range |
| `model.directives` · `model.html` · `model.fences` · `model.plugins` · `model.leaves` · `model.containers` | HTML comment blocks; every other HTML block; fenced and indented code; blocks a host rule claimed; inline leaves (paragraphs, headings); the line ranges of lists, items, quotes, tables and table rows. Each list is built on its first read, so a reader of one does not pay for the others |
| `model.blocks` | The whole body's tape, flat |
| `ingest(source)` | S0 alone |

### S2: inline structure

```js
import { InlineParser, inlineOf, leafText, leafToBody, referencesOf, slideLeaves } from '@laticent/segno-markdown';

// The entity table is the host's (Lattice's bridge asks markdown-it); `namedEntity` says whether `&name;` is one.
const inline = new InlineParser({ namedEntity: (ref) => ENTITIES.has(ref) });
const model = deckModel(source, { parser, inline });
const { tape, leaf } = inlineOf(model, token); // `token`: an `inline` token's index on the block tape
leaf.text; // markdown-it's `content` for that leaf
leafToBody(leaf, 3); // where the leaf's fourth character sits in the body
```

| Export | What it does |
|---|---|
| `new InlineParser(options)` | A configured inline pass: `html`, `strikethrough`, extra `rules` (a host's inline rules, anchored `after` or `before` a core rule, each with its `triggers`), `namedEntity` (required: the HTML entity table is the host's) and `linkOk` |
| `inline.parse(text, refs?)` | S2 over one leaf's text: an `InlineTape`. `refs` maps each normalized reference label to its index |
| `inlineOf(model, token)` | A leaf's text and tape, parsed on first read and kept with its slide's segment; dropped when the deck's reference labels change |
| `leafText(model, token)` · `leafToBody(leaf, offset)` | A leaf's text as markdown-it builds it (a quote's or list item's prefix dropped, a cell's escaped `\|` unescaped), and where each character of it sits in the body |
| `referencesOf(model)` | The deck's link reference definitions in source order, with the spelling kept, and the first-definition table a reference link reads |
| `slideLeaves(model, slide)` | One slide's `inline` tokens, for a reader that re-reads the slide an edit touched |
| `slideDetail(model, slide)` | The slide's DETAIL parse: the same tokens with the content columns and line starts a token adapter needs. Parsed on demand; `deckModel(…, { detail: true })` makes the first parse a detail parse |
| `isPunct(c)` · `isWhiteSpace(c)` | The flanking rules' character classes, markdown-it's at every code point (uc.micro 2.1.0's table, not the engine's `\p{P}`) |

The inline tape is `ISTRIDE` (7) integers per token, in markdown-it's order before `fragments_join`: kind
(`IKIND`), nesting, level, the range it was read from, a per-kind number (a code span's backtick count, a marker
character, a link record) and flags. Text markdown-it joins from pieces stays as its pieces, each with its range.
A link or image points into `links` (`LSTRIDE` per record: inline, reference, autolink or email; destination and
title ranges; the reference's index; an image's alt-text tape in `children`). No `content` strings are computed:
a reader derives them from the ranges, as the adapter does with markdown-it's own functions.

## The tape

`STRIDE` (7) integers per token, in markdown-it's token order: kind (`KIND`), level, nesting, `map[0]`,
`map[1]` (-1 when markdown-it gives the token no map), flags (`F_HIDDEN`), and one per-kind number (a heading's
level, an ordered list's start, a fence's marker length, a table cell's column). Line numbers index
`body.split('\n')`, as markdown-it's `token.map` does.

Inside the model the tape is held slide by slide, so an update reuses every slide it did not touch by
reference and only moves it; `model.blocks` joins them on first read.

## Bounds

The rules are markdown-it's, so the parser's bounds are markdown-it's block parser's: each line is visited a
bounded number of times per open container, and the nesting cap (the commonmark preset's 20) bounds the
containers. The tests hold each rule to a hostile ladder, about 10x the work for 10x input, counted in characters
read (test/helpers/work-count.js), not timed.

S2's bounds are markdown-it's inline parser's: the text rule reads each character once, `skipToken`'s cache reads a
link label's positions once per leaf, backtick runs are scanned once per leaf, and an unterminated comment, CDATA or
processing instruction stops later searches. The delimiter resolver (CommonMark's "process emphasis") is linear in a
leaf's delimiters: `openersBottom` remembers, per marker, closer kind and length mod 3, how far down a failed search
went, so no opener is passed twice by closers of one class, and `jumps` skip matched pairs. One departure from
markdown-it's code, same answers: an HTML tag is matched with a sticky regex at its position instead of
`src.slice(pos).match(/^…/)`, which copied the rest of the leaf at every `<`. inline.test.ts holds seventeen hostile
shapes to the ladder.

## Build

`npm run segno-markdown-lib:build` writes `dist/` (ESM + CJS + `.d.ts`); `npm run segno-markdown-lib:check`
fails if it is stale. Tests: `cd docs && npx vitest run src/lib/segno-markdown`, and
`node --test test/unit/core/deck-model.test.js` for the differential against markdown-it.

## License

AGPL-3.0-only. Its parsing rules are ported from markdown-it (MIT, Copyright (c) 2014 Vitaly Puzrin, Alex
Kocharin); its license text ships beside this file as `LICENSE.markdown-it.md`.
