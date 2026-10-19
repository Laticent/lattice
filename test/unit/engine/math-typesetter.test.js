/**
 * Unit: math.render.js's typesetter seam (owner decision 14). With a typesetter set, `renderTex` never runs KaTeX here:
 * it collects, or reads, or asks; and lib/export/math-typeset.js falls back to this process, out loud, when the locked
 * page cannot start. The locked page itself: test/integration/export/math-locked.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../../../lib/plugins/math/math.render.js');
const { createMathTypesetter } = require('../../../lib/export/math-typeset.js');

test('collecting records each formula and shows its source; reading returns the typeset; a miss asks once', () => {
  math._resetMathMemo();
  const lookup = new Map();
  const misses = new Set();
  const asked = [];
  try {
    math.setTypesetter({ lookup, misses, typeset: () => assert.fail('asked while collecting') });
    assert.equal(math.renderTex('a<b', false), 'a&lt;b');
    math.renderTex('x^2', true);
    assert.deepEqual([...misses], [math.typesetKey('a<b', false, 'htmlAndMathml'), math.typesetKey('x^2', true, 'htmlAndMathml')]);
    lookup.set(math.typesetKey('x^2', true, 'htmlAndMathml'), '<b>X</b>');
    math.setTypesetter({ lookup, misses: null, typeset: (keys) => { asked.push(...keys); for (const k of keys) lookup.set(k, '<i>Y</i>'); } });
    assert.equal(math.renderTex('x^2', true), '<b>X</b>');
    assert.equal(math.renderTex('y', false), '<i>Y</i>');
    assert.deepEqual(asked, [math.typesetKey('y', false, 'htmlAndMathml')]);
    assert.equal(math._mathMemoStats().typesets, 0, 'KaTeX ran in this process');
  } finally {
    math.setTypesetter(null);
  }
  assert.deepEqual(math.parseTypesetKey(math.typesetKey('a\u0000b', true, 'html')), { output: 'html', display: true, src: 'a\u0000b' });
});

test('when the locked page cannot start, the formulas are typeset here and the CLI says so once', () => {
  math._resetMathMemo();
  const lines = [];
  const t = createMathTypesetter({ chromePath: '/nonexistent/chromium', warn: (l) => lines.push(l) });
  try {
    t.prepare(() => {
      math.renderTex('x^2', false);
      math.renderTex('y^2', false);
    });
    assert.equal(lines.length, 1, lines.join(' | '));
    assert.match(lines[0], /could not typeset this deck's formulas .* so KaTeX typeset them in this process/);
    assert.equal(t.stats.inProcess, 2);
    assert.equal(math.renderTex('x^2', false), math.typesetInProcess('x^2', false));
  } finally {
    math.setTypesetter(null);
  }
});
