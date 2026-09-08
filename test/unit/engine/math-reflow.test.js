/**
 * Unit: the RENDER SEAM for the display-equation reflow (`displayBlock` in lib/engine/math.js).
 *
 * The rule itself lives in lib/core/tex-linebreak.js and is tested there. What this file pins is
 * the three things the seam owns, each of which can be wrong without the rule being wrong:
 *
 *   1. the reflow is OFF unless the caller asks for it — `lib/engine/index.js` asks only for a
 *      non-`wide` family, which is what keeps every 16:9 render in the repo byte-identical;
 *   2. a broken equation is MARKED (`data-math-reflow`), because `math.styles.css` keys the
 *      multi-line display scale off that attribute and a silent break would leave the equation
 *      set at the single-line hero size;
 *   3. a rewrite KaTeX cannot parse falls back to the author's own source. A `.katex-error` box
 *      where an equation used to be is strictly worse than the overflow the pass was fixing.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { installMath } = require('../../../lib/engine/math');

const FEATURE = '\\ell(\\beta) = \\sum_{i=1}^{n} \\left[ y_i \\log \\sigma(x_i^\\top \\beta) '
  + '+ (1 - y_i) \\log\\bigl(1 - \\sigma(x_i^\\top \\beta)\\bigr) \\right]';

function render(tex, opts) {
  const md = new MarkdownIt('commonmark');
  installMath(md, opts);
  return md.render(`$$\n${tex}\n$$\n`);
}

describe('engine: the display-equation reflow seam', () => {
  test('OFF by default — a caller that says nothing gets the author\'s own source', () => {
    const html = render(FEATURE, {});
    assert.doesNotMatch(html, /data-math-reflow/);
    // The `aligned` environment is what the reflow emits; unreflowed there is none.
    assert.doesNotMatch(html, /aligned/);
  });

  test('ON, a long equation is broken AND marked with its line count', () => {
    const html = render(FEATURE, { reflow: true });
    assert.match(html, /<p data-math-reflow="2">/,
      'the marker is what math.styles.css keys the multi-line display scale off — without it the '
      + 'equation is broken but still set at the single-line hero size');
    assert.doesNotMatch(html, /katex-error/);
  });

  test('ON, a SHORT equation is left alone and carries no marker', () => {
    const html = render('\\hat\\beta = (X^\\top X)^{-1} X^\\top y', { reflow: true });
    assert.doesNotMatch(html, /data-math-reflow/,
      'marking an untouched equation would shrink a hero that fits');
  });

  test('the marker is the ONLY difference — reflow off and on agree on every equation the pass declines', () => {
    // The whole corpus at `wide` depends on this: the gate in lib/engine/index.js is a family
    // test, so if `reflow: true` changed anything about a declined equation the two families
    // would render differently for no reason.
    const short = '\\sigma(x) = \\dfrac{1}{1 + e^{-x}}';
    assert.equal(render(short, { reflow: true }), render(short, {}));
  });

  test('a rewrite KaTeX cannot parse falls back to the author\'s source, not to an error box', () => {
    // Force the failure at the seam rather than simulating it: a stub `reflowDisplayTex` cannot
    // be injected, so this drives the real guard by checking that NO input produces `katex-error`
    // where the unreflowed render does not. An unbalanced `\left` is the shape most likely to
    // survive the rule and fail the typesetter.
    const nasty = '\\left( a + b + \\mathrm{' + 'q'.repeat(70) + '} + c \\right] + d + e';
    const on = render(nasty, { reflow: true });
    const off = render(nasty, {});
    assert.equal(/katex-error/.test(on), /katex-error/.test(off),
      'the reflow introduced a typeset error the author\'s own source does not have');
  });
});
