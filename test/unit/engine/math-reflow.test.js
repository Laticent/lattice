/**
 * Unit: the RENDER SEAM for display-equation wrapping (`displayBlock` in lib/plugins/math/math.render.js).
 *
 * The rule itself lives in lib/plugins/math/shared/tex-linebreak.js (`breakableTex`) and is tested there.
 * Since 2026-11-06 (owner: one size, wrapped at the real width) an equation off 16:9 is not rewritten
 * onto `aligned` lines; it is regrouped so the browser may wrap it only at safe points, and
 * `math.styles.css` lets display math wrap off 16:9. What this file pins is what the seam owns:
 *
 *   1. it is OFF unless the caller asks for it — `lib/engine/index.js` asks only for a non-`wide`
 *      family, which is what keeps every 16:9 render in the repo byte-identical;
 *   2. a regrouped equation is MARKED (`data-math-wrap`) and never an `aligned` rewrite;
 *   3. a regrouping KaTeX cannot typeset falls back to the author's own source. A `.katex-error` box
 *      where an equation used to be is strictly worse than the overflow it was fixing.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { installPlugins } = require('../../../lib/plugins/host');

const FEATURE = '\\ell(\\beta) = \\sum_{i=1}^{n} \\left[ y_i \\log \\sigma(x_i^\\top \\beta) '
  + '+ (1 - y_i) \\log\\bigl(1 - \\sigma(x_i^\\top \\beta)\\bigr) \\right]';

// `reflow: true` is a non-16:9 deck: the math plugin reflows at every family except `wide`.
function render(tex, opts) {
  const md = new MarkdownIt('commonmark');
  installPlugins(md, { family: opts.reflow ? 'tall' : 'wide' });
  return md.render(`$$\n${tex}\n$$\n`);
}

describe('engine: the display-equation reflow seam', () => {
  test('OFF by default — a caller that says nothing gets the author\'s own source', () => {
    const html = render(FEATURE, {});
    assert.doesNotMatch(html, /data-math-wrap/);
    assert.doesNotMatch(html, /aligned/);
  });

  test('ON, a long equation is regrouped for wrapping and marked, never rewritten onto aligned lines', () => {
    const html = render(FEATURE, { reflow: true });
    assert.match(html, /<p data-math-wrap>/);
    assert.doesNotMatch(html, /aligned/);
    assert.doesNotMatch(html, /katex-error/);
  });

  test('ON, a short equation is regrouped too: it fits, so nothing visible changes', () => {
    const html = render('\\hat\\beta = (X^\\top X)^{-1} X^\\top y', { reflow: true });
    assert.match(html, /<p data-math-wrap>/);
    assert.doesNotMatch(html, /aligned/);
  });

  test('an author\'s own layout is left alone — on and off agree', () => {
    // A `\\\\` the author wrote is a layout they chose: the seam typesets their source, unmarked.
    const authored = 'a = b \\\\ c = d';
    assert.equal(render(authored, { reflow: true }), render(authored, {}));
  });

  test('a rewrite KaTeX cannot parse falls back to the author\'s source, not to an error box', () => {
    // Force the failure at the seam rather than simulating it: a stub `reflowDisplayTex` cannot
    // be injected, so this drives the real guard by checking that NO input produces an error
    // render where the unreflowed source does not. An unbalanced `\left` is the shape most likely
    // to survive the rule and fail the typesetter.
    const nasty = '\\left( a + b + \\mathrm{' + 'q'.repeat(70) + '} + c \\right] + d + e';
    const on = render(nasty, { reflow: true });
    const off = render(nasty, {});
    assert.equal(/katex-error/.test(on), /katex-error/.test(off),
      'the reflow introduced a typeset error the author\'s own source does not have');
  });

  test('BOTH of KaTeX\'s failure renderings are caught — only one of them carries a class', () => {
    // A ParseError becomes `<span class="katex-error">`; an UNDEFINED CONTROL SEQUENCE becomes
    // `<span class="mord text" style="color:var(--warn)">` with no error class anywhere. The seam
    // tested `katex-error` alone and so adopted a render carrying a red literal `\Bigra` mid-
    // equation with the group's closing bracket gone.
    //
    // THE ARM THAT USED TO BE HERE COULD NOT FAIL, which is the same defect in a different place.
    // It asserted `bad(reflowed) === bad(original)` over three equations that all render CLEAN —
    // `false === false` whatever the seam does. Deleting the error-color half of the guard survived
    // it, and so did `if (true)`: adopt every reflow, error or not. (HARD RULE #25 checker, final
    // pass, by mutation.)
    //
    // WHAT MAKES THIS ONE FAIL is an equation whose REFLOW renders broken, and it took a hunt to
    // get one: the pass is sound enough that a corpus fuzz over 13 real display equations found
    // zero. `\Bigra` is an undefined control sequence — so it errors in BOTH renders, and what
    // the guard owes is not a clean render (impossible; the author's source is broken) but the
    // REFUSAL TO CLAIM ONE: no `data-math-wrap`, so `math.styles.css` never applies the
    // multi-line scale to an equation that was not successfully broken.
    const sum = (p) => Array.from({ length: 20 }, (_, i) => `${p}_{${i}}`).join(' + ');
    const bad = (html) => /katex-error/.test(html) || /color:var\(--warn\)/.test(html);

    // 1. The undefined-command signal, which carries NO class. This is the arm that kills both
    //    mutations: without the error-color half, or with the guard removed, the marker is written.
    const undef = `S = ${sum('a')} + \\Bigra{x} + ${sum('b')}`;
    const undefOn = render(undef, { reflow: true });
    assert.match(undefOn, /color:var\(--warn\)/, 'the fixture must actually render the red-literal form');
    assert.doesNotMatch(undefOn, /katex-error/, 'and it must NOT carry the class, or it pins nothing');
    assert.doesNotMatch(undefOn, /data-math-wrap/,
      'a reflow that renders an undefined control sequence was marked as a successful break');
    assert.doesNotMatch(undefOn, /aligned/, 'and the aligned rewrite must not ship either');

    // 2. The ParseError signal, which does carry one.
    const parse = `S = ${sum('a')} + \\label{eq} + ${sum('b')}`;
    const parseOn = render(parse, { reflow: true });
    assert.ok(bad(parseOn), 'the fixture must actually render broken');
    assert.doesNotMatch(parseOn, /data-math-wrap/,
      'a reflow that renders a ParseError was marked as a successful break');

    // 3. AND THE GUARD IS NOT JUST "REFUSE EVERYTHING": the same sum with no broken command in it
    //    reflows and IS marked. Without this the two arms above pass on a seam that never breaks
    //    anything at all.
    const good = render(`S = ${sum('a')} + ${sum('b')}`, { reflow: true });
    assert.match(good, /data-math-wrap/);
    assert.ok(!bad(good));

    // 4. The original surface check, kept: no equation may GAIN an error render.
    const shapes = [
      'z = \\left( \\alpha + \\beta + \\gamma + \\delta + \\epsilon + \\zeta + \\eta \\right)\\rightarrow w',
      '\\left[ \\alpha\\beta + \\gamma\\delta + \\epsilon\\zeta + \\eta\\theta + \\iota\\kappa + \\lambda\\mu \\right]',
      '\\text{ARR} = \\text{New} + \\text{Expansion} - \\text{Churn} - \\text{Contraction} - \\text{Downgrade}',
    ];
    for (const tex of shapes) {
      assert.equal(bad(render(tex, { reflow: true })), bad(render(tex, {})),
        `the reflow of \`${tex.slice(0, 40)}…\` renders an error the source does not`);
    }
  });
});
