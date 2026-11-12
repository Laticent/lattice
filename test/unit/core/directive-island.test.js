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
const { scanWork } = require('../../helpers/work-count');

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
  test('a comment in a list item runs to its `-->` across a blank line, and resolves as the engine does', () => {
    // markdown-it 14.3: an outdented BLANK line no longer ends a comment block inside a list item (14.1 cut the
    // comment at the item's end, so it folded and resolved nothing). The engine now applies `_class: kpi` here,
    // and the record must agree with it.
    const [slide] = scanMetaSource('- <!-- _class: kpi\n\n  -->\n').slides;
    assert.deepEqual(slide.comments.map((c) => [c.line, c.endLine, c.folded]), [[1, 3, undefined]]);
    assert.equal(slide.resolved.size, 1);
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
    assert.deepEqual(readIsland(island).dirs, [{ spot: true, key: 'class', value: 'kpi' }]);
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
  test('a multi-line value keeps the engine\'s inner whitespace: S1 records the content, tabs expanded as getLines does', () => {
    // The prefix heuristic this replaced read `a\n\tb` here; markdown-it's content is `a\n  b`.
    for (const s of ['- <!-- _class: a\n\tb -->\n', '1. <!--\n\t _header: x\n   -->\n', '> <!-- _header: a\n>\t\tb -->\n', '- a\n\n  <!--\n  _header: cont\n\t  deeper\n  -->\n']) {
      assert.deepEqual(scanned(s), engine(s), JSON.stringify(s));
    }
    assert.deepEqual(scanned('- <!-- _class: a\n\tb -->\n'), [['_class=a\n  b']]);
  });
  test('S1 records offsets, not a string: a string sliced from the parse source would keep that source alive', () => {
    // The first cut stored getLines' result: a cons string of slices of the whole body. Chained incremental models
    // (the boundary memo derives each miss from a held model) then kept a body per keystroke: 111 MB after 3,000
    // keystrokes on a 130 KB deck of quoted comments, against 7.6 MB with offsets.
    const model = bodyModel('> <!--\n> _class: kpi\n> -->\n');
    const [r] = model.directives;
    const side = model.segs[r.slide].side.get(r.token - model.segTok[r.slide]);
    assert.equal(side.content, undefined);
    assert.ok(side.meta instanceof Int32Array);
    assert.equal(model.blockContent(r), '<!--\n_class: kpi\n-->\n');
  });
});

test('fuzz: per slide, the directives scanMetaSource reads are the engine\'s', () => {
  const ATOMS = ['<!-- _class: a -->', '<!-- class: b -->', '> <!-- _class: c -->', '- <!-- _class: d -->', '<div>', '</div>', '```', '~~~',
    '    <!-- _class: e -->', '<!-- open', '-->', '---', '', '', 'text', '> quote', '- item', '<!--\n_class: f\n-->', '  <!-- _class: g -->',
    '1. <!-- _class: h -->', '\t<!-- _class: i -->', 'a <!-- _class: j -->', '<!-- _class: k --> tail', '***', '$$', '> <!--\n> _class: m\n> -->',
    '<pre>', '</pre>', '- x\n  <!-- _class: n -->', '- <!--\n  _class: o\n  -->', '> - <!--\n>   _class: p\n>   -->', '>> <!--\n>> _class: q\n> > -->', '- a\n\n  <!--\n  _header: cont\n    deeper\n  -->',
    '- <!-- _header: a\n\tb -->', '> <!-- _header: a\n>\tb\n> -->', '1. <!--\n\t _footer: t\n   -->', '\t- <!--\n\t  _header: u\n\t\tv -->'];
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
  // Counted, not timed (HARD RULE #32): about 9 times the text today. Each unclosed opener looks for its `-->` only
  // up to the next island; looking to the end of the deck instead, or the parser searching for `-->` afresh at every
  // opener, covers about 1,000 times the text at a tenth of this size.
  const t = '- <!-- open\n'.repeat(20000);
  const { scanned } = scanWork(() => scanMetaSource(t));
  assert.ok(scanned <= 30 * t.length, `the island read was not linear: ${scanned} chars for ${t.length}`);
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

describe('a record sets every field it names', () => {
  // The Studio rail labeled `{layout=list-steps, footer="…"}` "text": the scan kept one field per comment, the last
  // one it knew, so the footer resolved and the class did not.
  test('class and footer from one record, each resolved on its slide', () => {
    const src = '<!-- {layout=list-steps, footer="Q3"}\nnote: |\n  A note.\n-->\n\n## A\n\n---\n\n<!-- {pane=list, footer="P"} -->\n\n## B\n';
    const [one, two] = scanMetaSource(src).slides;
    assert.equal(one.resolved.get('class')?.value, 'list-steps');
    assert.equal(one.resolved.get('footer')?.value, 'Q3');
    assert.deepEqual(one.comments.filter((c) => c.kind === 'directive').map((c) => c.key), ['class', 'footer']);
    assert.equal(two.resolved.get('footer')?.value, 'P');
  });
  test('an authored internal comment resolves nothing: the door blanks it as a forgery', () => {
    const [island] = directiveIslands(bodyModel('<!-- lat-meta: {"carry":false,"d":{"class":"cards","footer":"F"}} -->\n'));
    assert.deepEqual(readIsland(island).dirs, []);
  });
  test('a record\'s fields are marked, so a rule for the one-line form leaves them alone', () => {
    const [one] = scanMetaSource('<!-- {layout=kpi, paginate=true} -->\n\n## A\n').slides;
    assert.ok(one.comments.every((c) => c.record === true));
    assert.equal(one.resolved.get('class').record, true);
    const [two] = scanMetaSource('<!-- _class: kpi -->\n\n## A\n').slides;
    assert.equal(two.resolved.get('class').record, undefined);
  });
});

describe('readIsland: bareOpener reads in one pass', () => {
  const { mulberry32 } = require('../../helpers/regex-differential');
  const { assertLinearRegexes } = require('../../helpers/regex-trace');
  // The regex bareOpener used to be, verbatim: polynomial by recheck 4.6.2, since its two `\s*` split a run of blank
  // lines every way (about 19 s for a comment holding 200,000 of them).
  const OLD = /^\s*\n\s*(?:\{[^}]*=|@meta\{)/;
  const bare = (inner) => readIsland({ content: `<!--${inner}-->`, folded: false, level: 0, indent: '' }).bareOpener;

  test('answers as the regex it replaced (seeded fuzz, seed 3045)', () => {
    const rand = mulberry32(3045);
    // 251 of the 20,000 draws are bare openers today.
    const tokens = [' ', '\t', '\n', '\r', ' ', ' ', '{', '}', '=', '@meta{', '@', 'meta', 'a', 'x=1', ' '];
    let opened = 0;
    for (let i = 0; i < 20_000; i++) {
      let inner = '';
      const len = Math.floor(rand() * 12);
      for (let k = 0; k < len; k++) inner += tokens[Math.floor(rand() * tokens.length)];
      const want = OLD.test(inner);
      if (want) opened++;
      assert.equal(bare(inner), want, `seed 3045, draw ${i}: ${JSON.stringify(inner)}`);
    }
    assert.ok(opened > 100, `only ${opened} draws were bare openers: the fuzz did not reach the true branch`);
  });

  test('runs only regexes the census calls linear, on a comment of 200,000 blank lines', () => {
    const inner = `${'\n'.repeat(200_000)}x`;
    const { result } = assertLinearRegexes(() => bare(inner));
    assert.equal(result, false);
    assert.throws(() => assertLinearRegexes(() => OLD.test(inner.slice(0, 20))), /polynomial|does not hold/);
  });
});
