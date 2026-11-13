// `lattice-deck`, Lattice's deck language for Squadra (decision 2026-10-26-squadra-lint-library,
// design.md §5.5). It extends the reference Markdown language (`@laticent/squadra/markdown`) with
// what a Lattice deck means: where the front matter ends as lint-core reads it, the
// directive island, and slide numbers the way every lint finding has always counted them.
//
// ONE PARSE, SHARED. The model is the deck model the slide splitter and the directive scan already
// read (`slideBoundaryModel`, lib/core/slide-boundaries.mjs), from the same small memo, cut at the
// front matter lint-core's slide split cuts and normalized as lib/core/meta-scan.mjs `commentsOf`
// normalizes (`normalizeSourceText`). So a Squadra rule, a lint-core rule and the engine read
// one block structure, and linting a deck through Squadra costs no second block parse.
//
// FACTS
//   deck.meta               the directive scan (`scanMetaSourceShared`, the one lint-core reads): per chunk, the comments and the
//                           directives in force. Indexed as `splitTopLevel` indexes its chunks.
//   deck.frontMatterChunks  2 when the deck opens with front matter, else 0: the chunks it takes
//                           (lint-core's `fmChunks`), so chunk `idx` is slide `idx - fm + 1`.
//   deck.lineStarts         the offset in Source.text where each line starts.
//   deck.chunks             how many chunks `splitTopLevel` cuts the source into: the bound a rule that walks
//                           `deck.meta` stays inside, as lint-core's rules walked the chunks.
//   slide.number            a `slide` node's number as lint-core reports it: 1-based, front matter
//                           excluded, and the empty group before a leading break dropped, as the
//                           engine drops it.
//
// INERT is the reference language's: fenced and indented code blocks. HTML comments that are not
// directives stay visible for now. Design §5.5 makes them inert too; that waits for a rule that
// needs it, because it would change what the bridge's fix path refuses.
//
// Pure and fs-free like lint-core, because the Studio bundles it.

const { markdownLanguage } = require('@laticent/squadra/markdown');
const { bodyModel } = require('../../core/deck-model.mjs');
const { scanMetaSourceShared } = require('../../core/meta-scan.mjs');
const { normalizeSourceText, slideBoundaryModel } = require('../../core/slide-boundaries.mjs');
const { splitTopLevel } = require('../slide-split');

const ID = 'lattice-deck';
// lint-core's front-matter test (`fmChunks`), the one every finding's slide number counts past.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/** The deck model of a whole source, as the authoring cores cut and read it. */
function deckView(source) {
  const raw = String(source ?? '');
  const text = normalizeSourceText(raw);
  // The front matter as lint-core's slide split cuts it (`splitTopLevel`, lib/authoring/slide-split.js): its test on
  // the source as given, so a BOM in front of `---` means no front matter, and a closing line of `----` or `---x` does
  // not close it. Read this way, the model's slides are lint-core's chunks one for one, so a rule numbers slides as
  // every lint-core rule does. (The directive scan cuts with `frontMatterBlockOf`, which reads those two closers
  // differently; a rule that reads the scan stays inside `deck.chunks`.)
  const head = FRONT_MATTER.exec(raw);
  const fm = head ? normalizeSourceText(head[0]) : '';
  const body = text.slice(fm.length);
  const m = body.charCodeAt(0) === 0xfeff ? bodyModel(body) : slideBoundaryModel(body);
  return {
    text,
    bodyStart: fm.length,
    leadingEmpty: m.leadingEmpty,
    slides: m.slides,
    directives: m.directives,
    html: m.html,
    fences: m.fences,
    plugins: m.plugins,
    leaves: m.leaves,
    lineStart: (line) => m.lineStart(line),
    lineEnd: (line) => m.lineEnd(line),
    fenceInfo: (range) => m.fenceInfo(range),
  };
}

function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

const markdown = markdownLanguage({ model: deckView, id: 'markdown' });

const latticeDeck = {
  ...markdown,
  id: ID,
  version: '1',
  extends: markdown,
  facts: {
    'deck.meta': (_tree, source) => scanMetaSourceShared(source.text),
    'deck.frontMatterChunks': (_tree, source) => (FRONT_MATTER.test(source.text) ? 2 : 0),
    'deck.lineStarts': (_tree, source) => lineStarts(source.text),
    'deck.chunks': (_tree, source) => splitTopLevel(source.text).length,
    'slide.number': (tree, _source, node) => {
      const index = node?.kind === 'slide' ? node.attrs.index : -1;
      if (index < 0) return 0;
      return index + 1 - (tree.model.leadingEmpty && tree.slideNodes.length > 1 ? 1 : 0);
    },
  },
};

module.exports = { latticeDeck, deckView, LANGUAGE: ID };
