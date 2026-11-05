# @laticent/segno-markdown

**The deck model.** One parse of a Markdown deck that every reader of its structure shares: where the slides
are, where each slide boundary falls, the front matter, every HTML-comment directive, every fence, every
leaf of inline text. Zero dependencies, no DOM, no Node.

It is stages S0 and S1 of the Segno deck pipeline
(`engineering/decisions/2026-10-22-segno-deck-pipeline.md`):

- **S0, ingest.** Strip a leading BOM and fold `\r\n` and a lone `\r` to `\n`. Nothing else, and no later
  stage normalizes again.
- **S1, the block pass.** markdown-it 14.1.1's block rules, ported rule for rule onto a lean state that writes
  a flat tape of integers instead of `Token` objects and computes no `content` strings. The structure matches
  markdown-it token for token (type, level, nesting, line map, `hidden`), which is the fidelity bar the owner
  set (D3): the corpus, a fuzz over CommonMark's rule surface and the 652 CommonMark 0.31.2 spec examples
  agree with markdown-it on every token.

```js
import { BlockParser, deckModel, updateDeckModel } from '@laticent/segno-markdown';

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
| `model.directives` · `model.fences` · `model.plugins` · `model.leaves` | HTML comment blocks; fenced and indented code; blocks a host rule claimed; inline leaves (paragraphs, headings) |
| `model.blocks` | The whole body's tape, flat |
| `ingest(source)` | S0 alone |

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
containers. The tests hold each rule to a hostile ladder, about 10x time for 10x input.

## Build

`npm run segno-markdown-lib:build` writes `dist/` (ESM + CJS + `.d.ts`); `npm run segno-markdown-lib:check`
fails if it is stale. Tests: `cd docs && npx vitest run src/lib/segno-markdown`, and
`node --test test/unit/core/deck-model.test.js` for the differential against markdown-it.

Ported from markdown-it (MIT, Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin).
