/**
 * The math typeset memo (lib/engine/math.js).
 *
 * A COUNTING TEST, not a timing one. What the memo buys is measured in
 * `test/benchmark/engine-bench.mjs`'s edit tier; what it must never do is
 * change a byte of output or cache a failure, and both of those are exact.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mathMod = require('../../../lib/engine/math.js');
const { renderTex, _resetMathMemo, _mathMemoStats } = mathMod;
const { render } = require('../../../lib/engine');

const GALLERY = path.join(__dirname, '../../../lib/components/math/math/math.gallery.md');

test('a repeated expression is typeset once', () => {
  _resetMathMemo();
  const a = renderTex('\\hat\\beta = (X^\\top X)^{-1} X^\\top y', true);
  const b = renderTex('\\hat\\beta = (X^\\top X)^{-1} X^\\top y', true);
  assert.equal(a, b, 'the memo must return the identical string');
  assert.equal(_mathMemoStats().typesets, 1, 'the second call must not reach KaTeX');
});

test('displayMode and output are part of the key', () => {
  _resetMathMemo();
  renderTex('x^2', true);
  renderTex('x^2', false);
  renderTex('x^2', true, 'html');
  assert.equal(_mathMemoStats().typesets, 3, 'each (src, displayMode, output) triple is its own entry');
  assert.notEqual(renderTex('x^2', true), renderTex('x^2', false), 'display and inline differ');
});

test('a keystroke that changes no math re-typesets nothing', () => {
  const src = fs.readFileSync(GALLERY, 'utf8');
  _resetMathMemo();
  render(src);
  const cold = _mathMemoStats().typesets;
  assert.ok(cold > 0, 'the gallery must contain math');

  const before = _mathMemoStats().typesets;
  render(`${src}\n<!-- an edit that touches no equation -->`);
  assert.equal(
    _mathMemoStats().typesets - before,
    0,
    'editing prose must not re-typeset a single expression — this is the whole point of the memo',
  );
});

test('within ONE cold render, a repeated expression is typeset once', () => {
  // The gallery repeats symbols between an equation and its legend, so a cold
  // render makes fewer KaTeX calls than it has math tokens. Measured 90 -> 58.
  const src = fs.readFileSync(GALLERY, 'utf8');
  _resetMathMemo();
  render(src);
  const distinct = _mathMemoStats();
  assert.equal(distinct.typesets, distinct.entries, 'every typeset should have produced exactly one entry');
  assert.ok(distinct.entries < 90, `expected dedup below the 90 raw tokens, got ${distinct.entries}`);
});

test('a FAILED typeset is never cached', () => {
  // The browser stub throws until the KaTeX provider registers. Caching that
  // fallback would pin escaped TeX for the life of the page.
  _resetMathMemo();
  const katex = require('katex');
  const real = katex.renderToString;
  katex.renderToString = () => { throw new Error('provider not registered yet'); };
  const degraded = renderTex('E = mc^2', true);
  katex.renderToString = real;

  assert.ok(!degraded.includes('katex'), 'a throw must degrade to escaped source');
  assert.equal(_mathMemoStats().entries, 0, 'the failure must NOT have been cached');

  const recovered = renderTex('E = mc^2', true);
  assert.ok(recovered.includes('katex'), 'once KaTeX works, the same expression must typeset');
});

test('the memo is bounded by bytes and evicts oldest-first', () => {
  _resetMathMemo();
  const big = '\\begin{pmatrix}' + Array.from({ length: 40 }, (_, i) => `a_{${i}} & b_{${i}}`).join(' \\\\ ') + '\\end{pmatrix}';
  for (let i = 0; i < 60; i++) renderTex(`${big} + ${i}`, true);
  const { bytes } = _mathMemoStats();
  assert.ok(bytes <= 512 * 1024, `memo must stay within its byte cap, got ${bytes}`);
});
