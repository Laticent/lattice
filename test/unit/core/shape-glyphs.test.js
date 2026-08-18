/**
 * Unit: the shape-glyph table (lib/core/shape-glyphs.js) — the curated list of
 * characters that are SHAPES pretending to be text.
 *
 * The single most valuable thing here is the BOUNDARY. This table is a deny
 * list, not a ban on non-ASCII, and the difference is whether the rule survives
 * contact with typography: an em-dash is punctuation, a curly quote is a
 * quotation mark, `redline` literally renders `content: 'OLD — prior text'`.
 * A rule that flags those gets switched off within a week, and then nothing is
 * enforced at all. So the tests below pin what must NOT be listed at least as
 * firmly as what must.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  SHAPE_GLYPHS,
  SHAPE_BY_CHAR,
  NOT_SHAPES,
  shapeGlyphRe,
  findShapeGlyphs,
  shapeGlyphAdvice,
} = require('../../../lib/core/shape-glyphs');

describe('shape-glyphs — the boundary', () => {
  test('punctuation is NOT listed, and that is the load-bearing half', () => {
    for (const ch of NOT_SHAPES) {
      assert.equal(findShapeGlyphs(ch).length, 0, `${JSON.stringify(ch)} is punctuation and must not be flagged`);
    }
  });

  test('a real component label full of punctuation is clean', () => {
    // redline's actual `content:` value, plus quote's quotation marks.
    assert.deepEqual(findShapeGlyphs('OLD — prior text'), []);
    assert.deepEqual(findShapeGlyphs('NEW · current'), []);
    assert.deepEqual(findShapeGlyphs('“quoted”'), []);
  });

  test('the multiplication SIGN is text; the multiplication X is an icon', () => {
    // `svg-label` measures `×` as a character in running text. `✕` is the
    // icon-shaped sibling and is the one that must be drawn.
    assert.deepEqual(findShapeGlyphs('12 × 8'), []);
    assert.equal(findShapeGlyphs('✕').length, 1);
  });

  test('the shapes we actually found in the tree are all listed', () => {
    // Every glyph the CSS `content:` audit turned up as chrome.
    for (const ch of ['✓', '✗', '›', '❯', '⌄', '→', '▶', '⏸', '↻', '✦', '✧', '◆', '●']) {
      assert.ok(SHAPE_BY_CHAR.has(ch), `${ch} was found in engine CSS and must be listed`);
    }
  });
});

describe('shape-glyphs — the table', () => {
  test('every entry names a replacement token and a Unicode name', () => {
    for (const g of SHAPE_GLYPHS) {
      assert.match(g.token, /^--[a-z-]+$/, `${g.ch}: token must be a custom property name`);
      assert.ok(g.name && g.name === g.name.toUpperCase(), `${g.ch}: needs its Unicode name`);
      assert.equal([...g.ch].length, 1, `${g.ch}: one codepoint per entry`);
    }
  });

  test('no character is listed twice', () => {
    assert.equal(SHAPE_BY_CHAR.size, SHAPE_GLYPHS.length);
  });

  test('the state marks point at the tokens that already exist', () => {
    // These four are the whole reason the rule exists: `--mark-check` has been
    // a curated SVG the entire time, and five sites typed `\\2713` anyway.
    assert.equal(SHAPE_BY_CHAR.get('✓').token, '--mark-check');
    assert.equal(SHAPE_BY_CHAR.get('✗').token, '--mark-x');
    assert.equal(SHAPE_BY_CHAR.get('✓').authoring, '[x]');
    assert.equal(SHAPE_BY_CHAR.get('✗').authoring, '[ ]');
  });
});

describe('shape-glyphs — finding', () => {
  test('reports each occurrence with its index', () => {
    const hits = findShapeGlyphs('a ✓ b → c ✓');
    assert.deepEqual(hits.map((h) => h.ch), ['✓', '→', '✓']);
    assert.deepEqual(hits.map((h) => h.index), [2, 6, 10]);
  });

  test('a fresh regex per call — a shared /g/ would alternate true and false', () => {
    // `shapeGlyphRe()` must not be hoisted to a module constant: a g-flagged
    // RegExp carries mutable lastIndex, so a shared one makes .test() skip
    // every other match and the gate would look flaky rather than wrong.
    const a = shapeGlyphRe();
    const b = shapeGlyphRe();
    assert.notEqual(a, b);
    assert.equal(a.test('✓'), true);
    assert.equal(b.test('✓'), true);
    // …and the helper itself is stable across repeated calls.
    assert.equal(findShapeGlyphs('✓').length, 1);
    assert.equal(findShapeGlyphs('✓').length, 1);
  });

  test('handles empty and glyph-free input', () => {
    assert.deepEqual(findShapeGlyphs(''), []);
    assert.deepEqual(findShapeGlyphs(null), []);
    assert.deepEqual(findShapeGlyphs('plain ascii text'), []);
  });
});

describe('shape-glyphs — advice', () => {
  test('the author is told what to TYPE; the engine is told which TOKEN', () => {
    const check = SHAPE_BY_CHAR.get('✓');
    assert.match(shapeGlyphAdvice(check, 'author'), /Type `\[x\]`/);
    assert.match(shapeGlyphAdvice(check, 'engine'), /var\(--mark-check\)/);
  });

  test('a glyph with no deck-level equivalent says so instead of inventing one', () => {
    // Coaching that names a fix which does not exist is worse than none.
    const chevron = SHAPE_BY_CHAR.get('❯');
    assert.equal(chevron.authoring, null);
    assert.match(shapeGlyphAdvice(chevron, 'author'), /no deck-level equivalent/);
  });

  test('every message explains WHY, not just what', () => {
    for (const g of SHAPE_GLYPHS) {
      assert.match(shapeGlyphAdvice(g, 'author'), /font/, `${g.ch}: must name the font-dependence`);
    }
  });
});
