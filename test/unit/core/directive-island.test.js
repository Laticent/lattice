/**
 * lib/core/directive-island.mjs: the deck model's comment blocks read as islands (Segno P3,
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed).
 *
 * The bar is the engine: a directive counts where `lattice_directives` (lib/engine/slides.js) reads one, which is
 * `readDirectiveComment(token.content)` on each comment `html_block` markdown-it opens. The fuzz below holds the
 * source-side reader (`scanMetaSource`) to that, per slide, over atoms drawn from the shapes block structure
 * decides: fences, indented code, HTML blocks, quotes, list items, unclosed comments, breaks.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { directiveIslands, readIsland } = require('../../../lib/core/directive-island.mjs');
const { scanMetaSource } = require('../../../lib/core/meta-record.mjs');
const { bodyModel } = require('../../../lib/core/deck-model.mjs');
const { boundaryParser: md } = require('../../../lib/core/boundary-parser.mjs');
const { readDirectiveComment } = require('../../../lib/core/comment-directive.mjs');
const { DIRECTIVE_VOCAB } = require('../../../lib/core/meta-keys.mjs');

const show = (d) => `${d.spot ? '_' : ''}${d.key}=${d.value}`;

/** The directives per slide, as the engine reads them off markdown-it's tokens (a leading empty group dropped). */
function engine(src) {
  const out = [[]];
  let any = false;
  for (const t of md.parse(src, {})) {
    if (t.type === 'hr' && t.level === 0) {
      if (any || out.length > 1) out.push([]);
      any = true;
      continue;
    }
    any = true;
    if (t.type !== 'html_block') continue;
    const d = readDirectiveComment(t.content, DIRECTIVE_VOCAB);
    if (d) out.at(-1).push(show(d));
  }
  return out;
}
// The directives the engine reads: a `folded` comment is listed for the lint and is not one of them.
const scanned = (src) => scanMetaSource(src).slides.map((s) => s.comments.filter((c) => c.kind === 'directive' && !c.folded).map(show));

describe('which comments are blocks is the model\'s answer', () => {
  test('a comment line inside an HTML block is not a directive: listed as folded, for the lint, and resolves nothing', () => {
    const src = '<div>\n<!-- _class: kpi -->\n</div>\n';
    assert.deepEqual(scanned(src), [[]]);
    const [slide] = scanMetaSource(src).slides;
    assert.deepEqual(slide.comments.map((c) => [c.kind, c.line, c.folded]), [['directive', 2, true]]);
    assert.equal(slide.resolved.size, 0);
  });
  test('a comment its list item ends before `-->` is listed to its `-->`, folded, and resolves nothing', () => {
    const [slide] = scanMetaSource('- <!-- _class: kpi\n\n  -->\n').slides;
    assert.deepEqual(slide.comments.map((c) => [c.line, c.endLine, c.folded]), [[1, 3, true]]);
    assert.equal(slide.resolved.size, 0);
  });
  test('an unclosed comment in a list item ends with the item, and a directive below it counts', () => {
    assert.deepEqual(scanned('- <!-- open\n\n<!-- _class: kpi -->\n'), [['_class=kpi']]);
  });
  test('an indented comment is code, and a fenced one is code', () => {
    assert.deepEqual(scanned('    <!-- _class: a -->\n\n```\n<!-- _class: b -->\n```\n'), [[]]);
  });
});

describe('the grammar reads the engine\'s text, the finding quotes the author\'s', () => {
  const src = '> <!--\n> _class: kpi\n> -->\n';
  const [island] = directiveIslands(bodyModel(src));
  test('a quoted multi-line comment is a directive, as markdown-it\'s token content makes it', () => {
    assert.deepEqual(readIsland(island).dir, { spot: true, key: 'class', value: 'kpi' });
    assert.deepEqual(scanned(src), engine(src));
  });
  test('the failing arm: the raw text, prefixes and all, is not one (the walk this replaced read it)', () => {
    assert.equal(readDirectiveComment(island.raw, DIRECTIVE_VOCAB), null);
    assert.equal(island.raw, '<!--\n> _class: kpi\n> -->');
  });
  test('a list item\'s continuation indent and nested quotes come off the same way', () => {
    for (const s of ['- <!--\n  _class: kpi\n  -->\n', '> - <!--\n>   _class: kpi\n>   -->\n', '>> <!--\n> > _class: kpi\n>> -->\n']) {
      assert.deepEqual(scanned(s), engine(s), JSON.stringify(s));
      assert.deepEqual(scanned(s), [['_class=kpi']], JSON.stringify(s));
    }
  });
});

test('fuzz: per slide, the directives scanMetaSource reads are the engine\'s', () => {
  const ATOMS = ['<!-- _class: a -->', '<!-- class: b -->', '> <!-- _class: c -->', '- <!-- _class: d -->', '<div>', '</div>', '```', '~~~',
    '    <!-- _class: e -->', '<!-- open', '-->', '---', '', '', 'text', '> quote', '- item', '<!--\n_class: f\n-->', '  <!-- _class: g -->',
    '1. <!-- _class: h -->', '\t<!-- _class: i -->', 'a <!-- _class: j -->', '<!-- _class: k --> tail', '***', '$$', '> <!--\n> _class: m\n> -->',
    '<pre>', '</pre>', '- x\n  <!-- _class: n -->', '- <!--\n  _class: o\n  -->', '> - <!--\n>   _class: p\n>   -->', '>> <!--\n>> _class: q\n> > -->', '- a\n\n  <!--\n  _header: cont\n    deeper\n  -->'];
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  let checked = 0;
  for (let i = 0; i < 20000; i++) {
    const lines = [];
    for (let k = 1 + rnd(9); k > 0; k--) lines.push(ATOMS[rnd(ATOMS.length)]);
    const src = `${lines.join('\n')}\n`;
    if (src.startsWith('---\n')) continue; // front matter is not this comparison's question
    assert.deepEqual(scanned(src), engine(src), JSON.stringify(src));
    checked++;
  }
  assert.ok(checked > 15000);
});

describe('the red team\'s shapes', () => {
  const classes = (src) => scanMetaSource(src).slides.map((s) => s.resolved.get('class')?.value ?? null);
  test('a quote continued by a `>` indented four spaces or a tab is still the quote, as markdown-it reads it', () => {
    for (const s of ['> <!--\n    > _class: kpi\n> -->\n', '> <!--\n\t> _class: kpi\n> -->\n']) assert.deepEqual(scanned(s), engine(s), JSON.stringify(s));
  });
  test('a BOM after the front matter is text, so the comment under it is a paragraph, not a directive', () => {
    assert.deepEqual(classes('---\ntheme: indaco\n---\n\uFEFF<!-- _class: kpi -->\n# A\n'), [null, null, null]);
  });
  test('two BOMs: one normalization, so the slides line up with chunkBoundaryLines', () => {
    const { chunkBoundaryLines } = require('../../../lib/core/slide-boundaries.mjs');
    const src = '\uFEFF\uFEFF---\ntheme: indaco\n---\n<!-- _class: kpi -->\n# A\n---\n# B\n';
    assert.equal(scanMetaSource(src).slides.length, chunkBoundaryLines(src).length + 1);
  });
  test('a front-matter closer with text after it: lines stay the document\'s, and a comment on it is the first slide\'s', () => {
    const src = '---\na: 1\n--- <!-- _class: k -->\n# T\n<!-- _class: j -->\n';
    const slides = scanMetaSource(src).slides;
    assert.deepEqual(slides.map((s) => s.comments.map((c) => [c.line, c.value])), [[], [], [[3, 'k'], [5, 'j']]]);
  });
  test('typing in a short note keeps no copy of the deck per keystroke (the grammar is not memoized by text)', () => {
    // A real collection, so the heap measures what is KEPT, not what other tests left lying around.
    require('node:v8').setFlagsFromString('--expose-gc');
    const gc = require('node:vm').runInNewContext('gc');
    const deck = `${'# slide\n\ntext\n\n---\n\n'.repeat(400)}<!-- note -->\n`;
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 400; i++) scanMetaSource(deck.replace('<!-- note', `<!-- note ${i}`));
    gc();
    // A memo keyed by each keystroke's comment kept its whole deck (about 10 KB here): 400 keystrokes, about 4 MB.
    assert.ok(process.memoryUsage().heapUsed - before < 2e6, 'each keystroke kept its deck');
  });
});

test('hostile input: many unclosed openers, each ended by its list item, stay linear', () => {
  const t = '- <!-- open\n'.repeat(20000);
  const t0 = performance.now();
  scanMetaSource(t);
  assert.ok(performance.now() - t0 < 1500, 'the island read was not linear');
});

test('a lint rule about a directive\'s effect skips a folded one: the engine never reads it', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const vocab = buildVocab();
  const rules = (src) => lintText(src, { vocab }).map((f) => f.rule);
  // The same comments outside the `<div>` are read, and each rule fires; inside it, neither does.
  assert.ok(rules('# A\n\n<!-- class: columns -->\n\n---\n\n# B\n').includes('pane-layout'));
  assert.ok(!rules('# A\n\n<div>\n<!-- class: columns -->\n</div>\n\n---\n\n# B\n').includes('pane-layout'));
  assert.ok(rules('<!-- _debug: bogus -->\n\n# A\n').includes('unknown-debug-facet'));
  assert.ok(!rules('<div>\n<!-- _debug: bogus -->\n</div>\n\n# A\n').includes('unknown-debug-facet'));
});
