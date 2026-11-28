/**
 * Unit: the `drawing:` register resolver (lib/core/resolve-drawing.js).
 *
 * Pure mapping from the deck front-matter `drawing:` value (clean / sketch /
 * sketch-headings) to the CSS class tokens the three render paths append to every
 * section. The sibling of resolve-finish (the backdrop axis); the two compose.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DRAWING_REGISTER,
  DRAWING_NAMES,
  DRAWING_TOKENS,
  drawsByHand,
  writesBodyByHand,
  readFrontMatterDrawing,
  isKnownDrawing,
  drawingClasses,
  drawingClassesFromSource,
} = require('../../../lib/core/resolve-drawing');

describe('resolve-drawing', () => {
  test('register maps each name to its class tokens', () => {
    assert.equal(drawingClasses('sketch'), 'sketch');
    assert.equal(drawingClasses('sketch-headings'), 'sketch-headings', 'one class, the owner\'s choice');
    assert.equal(drawingClasses('clean'), '', 'clean is the no-class baseline');
  });

  test('clean / omitted / unrecognized all resolve to no classes', () => {
    assert.equal(drawingClasses('clean'), '');
    assert.equal(drawingClasses(''), '');
    assert.equal(drawingClasses('   '), '');
    assert.equal(drawingClasses('sketchh'), '', 'typo → no classes (deck-lint flags it)');
    assert.equal(drawingClasses('boardroom'), '', 'the old word is gone');
    assert.equal(drawingClasses('sketch-clean'), '', 'the old word is gone');
    assert.equal(drawingClasses(undefined), '');
    assert.equal(drawingClasses(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(drawingClasses('  Sketch  '), 'sketch');
    assert.equal(drawingClasses('SKETCH-HEADINGS'), 'sketch-headings');
  });

  test('isKnownDrawing recognizes the register names only', () => {
    for (const v of ['sketch', 'sketch-headings', 'clean']) assert.ok(isKnownDrawing(v), v);
    for (const v of ['sketchh', '', undefined, 'boardroom', 'sketch-clean']) assert.ok(!isKnownDrawing(v), String(v));
  });

  test('DRAWING_NAMES lists exactly the registered names', () => {
    assert.deepEqual([...DRAWING_NAMES].sort(), ['clean', 'sketch', 'sketch-headings']);
  });

  test('DRAWING_TOKENS names the per-slide override tokens (incl. the no-sketch opt-out)', () => {
    assert.deepEqual([...DRAWING_TOKENS].sort(), ['no-sketch', 'sketch', 'sketch-headings']);
  });

  test('drawsByHand and writesBodyByHand read a class list as the CSS does', () => {
    assert.ok(drawsByHand(['sketch']) && writesBodyByHand(['sketch']));
    assert.ok(drawsByHand(['sketch-headings']) && !writesBodyByHand(['sketch-headings']));
    assert.ok(drawsByHand(['sketch', 'sketch-headings']) && !writesBodyByHand(['sketch', 'sketch-headings']));
    assert.ok(!drawsByHand(['kpi', 'no-sketch']) && !writesBodyByHand([]));
  });

  test('readFrontMatterDrawing extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntheme: carta\ndrawing: sketch\n---\n\n# H\n\n`drawing: not-this` in body\n';
    assert.equal(readFrontMatterDrawing(md), 'sketch');
    assert.equal(drawingClassesFromSource(md), 'sketch');
    assert.equal(drawingClassesFromSource('---\nmode: sketch\n---\n'), '', 'the old key renders nothing');
  });

  test('readFrontMatterDrawing accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterDrawing('---\ndrawing: "sketch-headings"\n---\n'), 'sketch-headings');
    assert.equal(readFrontMatterDrawing("---\ndrawing: 'clean'\n---\n"), 'clean');
    assert.equal(readFrontMatterDrawing('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterDrawing(''), null);
  });

  // Rot-guard: every style class the register maps to must have a real CSS rule in
  // base.sketch.css (and clean maps to nothing).
  test('every style class resolves to a real CSS rule in base.sketch.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.sketch.css'), 'utf8');
    const registered = new Set();
    for (const tokens of Object.values(DRAWING_REGISTER)) {
      for (const cls of tokens.split(/\s+/).filter(Boolean)) registered.add(cls);
    }
    for (const cls of registered) {
      assert.ok(new RegExp(`\\.${cls}(?![\\w-])`).test(css), `style maps to .${cls} but base.sketch.css has no rule`);
    }
  });

  // The one-class choice: a sketch rule that names `sketch` alone would drop off a
  // `sketch-headings` slide. Only the body-face re-point may.
  test('every section.sketch rule also names sketch-headings, but the body re-point', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.sketch.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const lone = css.match(/section\.sketch(?![\w-])[^{,]*/g) || [];
    assert.deepEqual(lone.map((s) => s.trim()), ['section.sketch:not(.sketch-headings)']);
  });
});
