/**
 * lib/core/meta-record.mjs: the one reader and writer of slide metadata in a comment
 * (design note 2026-10-17-meta-record.md §5.2). The corpus gate is meta-record-corpus.test.js;
 * these pin the mechanisms.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const m = { ...require('../../../lib/core/meta-record.mjs'), ...require('../../../lib/core/meta-edit.mjs') };

const SRC = '---\ntheme: indaco\n---\n\n<!-- class: dark -->\n<!-- _footer: One -->\n\n# A\n\n---\n\n<!-- _class: cards -->\n\n# B\n\n---\n\n# C\n';

describe('scanMetaSource', () => {
  const slides = m.scanMetaSource(SRC).slides.slice(2);
  test('a spot replaces the running global for its slide only; a global carries on', () => {
    assert.equal(slides[0].resolved.get('class').value, 'dark');
    assert.equal(slides[1].resolved.get('class').value, 'cards');
    assert.equal(slides[2].resolved.get('class').value, 'dark');
  });
  test('a spot lasts one slide', () => {
    assert.equal(slides[0].resolved.get('footer').value, 'One');
    assert.equal(slides[1].resolved.has('footer'), false);
  });
  test('a comment in a fence is not read; a record-shaped comment is classified, not resolved', () => {
    const s = m.scanMetaSource('```\n<!-- _class: x -->\n```\n\n<!-- {layout=content} -->\n\n<!-- a note -->\n').slides.at(-1);
    assert.equal(s.resolved.size, 0);
    assert.deepEqual(s.comments.map((c) => c.kind), ['record', 'note']);
  });
});

describe('classifyComment and directiveKey', () => {
  test('directive, marker, record, note', () => {
    assert.deepEqual(m.classifyComment(' _class: x '), { kind: 'directive', key: 'class', spot: true });
    assert.equal(m.classifyComment(' stress-slide ').kind, 'marker');
    assert.equal(m.classifyComment(' {layout=content} ').kind, 'record');
    assert.equal(m.classifyComment(' @meta{a=b} ').kind, 'record');
    assert.equal(m.classifyComment(' remember to smile ').kind, 'note');
  });
  test('a bare key is a directive only when the key may be bare', () => {
    assert.equal(m.directiveKey('_build'), 'build');
    assert.equal(m.directiveKey('color'), '');
    assert.equal(m.directiveKey('color: red'), 'color');
  });
});

describe('readMetaField and writeMeta', () => {
  test('set, replace, remove, and a compound comment keeps its other lines', () => {
    assert.equal(m.writeMeta('# A', { footer: 'Q3' }), '<!-- _footer: Q3 -->\n\n# A');
    assert.equal(m.writeMeta('<!-- _footer: Q3 -->\n\n# A', { footer: 'Q4' }), '<!-- _footer: Q4 -->\n\n# A');
    assert.equal(m.writeMeta('<!-- _footer: Q3 -->\n\n# A', { footer: null }), '# A');
    assert.equal(m.writeMeta('<!-- _class: a\n_footer: Q3 -->\n\n# A', { footer: '' }), '<!-- _class: a -->\n\n# A');
  });
  test('a value can never close the comment', () => {
    assert.equal(m.writeMeta('# A', { footer: 'a --> b' }), '<!-- _footer: a -> b -->\n\n# A');
  });
  test('a duplicate or a YAML array is left alone', () => {
    const dup = '<!-- _class: a -->\n<!-- _class: b -->';
    assert.equal(m.readMetaField(dup, 'class').reason, 'duplicate');
    assert.equal(m.writeMeta(dup, { class: 'c' }), dup);
    assert.equal(m.readMetaField('<!-- _class: [a, b] -->', 'class').reason, 'array-form');
  });
  test('an unknown key throws', () => {
    assert.throws(() => m.writeMeta('# A', { nope: 'x' }), /not a slide-metadata key/);
  });
});

describe('commentBlocks: the directive editors read what the engine reads', () => {
  test('a comment inside a `<div>` block is not one: the class editor, the lint and the render agree on no class', () => {
    const src = '<div>\n<!-- _class: kpi -->\n</div>\n';
    assert.deepEqual(m.commentBlocks(src), []);
    assert.equal(m.readMetaField(src, 'class').present, false);
    assert.equal(m.scanMetaSource(src).slides[0].resolved.has('class'), false);
    // The failing arm: the notes reader still lists it (a note in an HTML block is live to the engine's notes reader).
    assert.equal(m.comments(src).length, 1);
  });
  test('a fenced, an indented and a mid-line comment are not blocks; a quoted and a listed one are', () => {
    const src = '```\n<!-- _class: a -->\n```\n\n    <!-- _class: b -->\n\ntext <!-- _class: c -->\n\n> <!-- _class: d -->\n\n- <!-- _class: e -->\n';
    assert.deepEqual(m.commentBlocks(src).map((c) => c.body.trim()), ['_class: d', '_class: e']);
  });
  test('offsets index the chunk as given: a BOM, CRLF line ends and front matter', () => {
    const src = '\uFEFF---\r\ntheme: x\r\n---\r\n\r\n<!-- _class: a -->\r\n<!--\r\none -->\r\n';
    const found = m.commentBlocks(src);
    assert.deepEqual(found.map((c) => src.slice(c.start, c.end)), ['<!-- _class: a -->', '<!--\r\none -->']);
    assert.deepEqual(found.map((c) => src.slice(c.bodyStart, c.bodyStart + c.body.length)), found.map((c) => c.body));
    assert.equal(m.readMetaField(src, 'class').value, 'a');
  });
  test('a block that is more than one comment is none: the engine reads its whole content', () => {
    for (const src of ['<!-- _class: kpi --> tail\n', '<!-- _class: kpi --> <!-- note\nmore -->\n', '<!-- _class: kpi --> <!-- _footer: x -->\n']) {
      assert.equal(m.readMetaField(src, 'class').present, false, JSON.stringify(src));
    }
  });
  test('a comment its list item ends before `-->` is not one', () => {
    assert.deepEqual(m.commentBlocks('- <!-- _class: kpi\n\n  -->\n'), []);
  });
  test('250 KB of unclosed openers stays fast', () => {
    const t = '<!-- '.repeat(50000);
    const t0 = performance.now();
    m.commentBlocks(t);
    assert.ok(performance.now() - t0 < 250);
  });
});

describe('the comment finder is linear on hostile text', () => {
  test('250 KB of unclosed openers is milliseconds, not seconds', () => {
    const t = '<!-- '.repeat(50000);
    const t0 = performance.now();
    m.comments(t);
    m.hasMarker(t, 'stress-slide');
    assert.ok(performance.now() - t0 < 250, 'the lazy regex this replaced took 5.4s');
  });
  test('hasMarker ignores a fenced marker', () => {
    assert.equal(m.hasMarker('<!-- stress-slide -->', 'stress-slide'), true);
    assert.equal(m.hasMarker('```\n<!-- stress-slide -->\n```', 'stress-slide'), false);
    assert.equal(m.hasMarker('<!-- stress-slide -->', 'other'), false);
  });
});

describe('hostile-input cost, round 1 findings', () => {
  test('many comments against many fences stay linear (the fence scan advances one pointer)', () => {
    const t = '```\n```\n<!-- x -->\n'.repeat(8000);
    const t0 = performance.now();
    m.comments(t);
    assert.ok(performance.now() - t0 < 250, 'comments x fences took the quadratic path');
  });
  test('many unterminated openers on separate lines are one failed scan, not one each', () => {
    const t = '<!-- open\n'.repeat(20000);
    const t0 = performance.now();
    m.scanMetaSource(t);
    assert.ok(performance.now() - t0 < 1500, 'the comment scan rescanned to EOF per opener');
  });
});
