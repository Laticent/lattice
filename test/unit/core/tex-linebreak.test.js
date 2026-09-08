/**
 * tex-linebreak — the display-equation REFLOW (#2136, lever 1).
 *
 * The pass rewrites TeX, so the risk it carries is not "it fails to break" — it is "it breaks
 * something that should have been left alone, or breaks it wrongly". Every arm below is
 * therefore a REFUSAL except the two that assert the one equation this exists for.
 *
 * The rendered widths quoted here were measured through the real emulator at `size: portrait`
 * against a 972px stage, by cloning the laid-out `.katex` into an off-screen `max-content`
 * probe (the laid-out rect is clipped to the box, so it reads 972 for everything).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');

const { reflowDisplayTex, REFLOW_BUDGET, _weight } = require('../../../lib/core/tex-linebreak');

// `math feature`'s committed manifest sample — the equation the pass exists for.
const FEATURE = '\\ell(\\beta) = \\sum_{i=1}^{n} \\left[ y_i \\log \\sigma(x_i^\\top \\beta) '
  + '+ (1 - y_i) \\log\\bigl(1 - \\sigma(x_i^\\top \\beta)\\bigr) \\right]';
// The reference hero — bare `math`'s sample, which fits its box with room to spare.
const OLS = '\\hat\\beta = (X^\\top X)^{-1} X^\\top y';

const renders = (tex) => {
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
  return !/katex-error/.test(html);
};

describe('core: tex-linebreak — what it breaks', () => {
  test('the `feature` sample breaks into an aligned block, descending into the bracket', () => {
    const r = reflowDisplayTex(FEATURE);
    assert.equal(r.lines, 2, 'expected the relation line plus one continuation');
    assert.match(r.tex, /\\begin\{aligned\}/);
    assert.match(r.tex, /\\end\{aligned\}/);
    // The DESCENT is the whole point: the `+` lives inside `\left[…\right]`, so a depth-0 pass
    // cannot see it — and breaking at the top-level `=` alone renders 2606px against 2587px
    // unbroken, i.e. WIDER. The continuation must therefore carry the author's `+`.
    assert.match(r.tex, /\\\\\n&\\quad \+ \(1 - y_i\)/, 'the continuation is not the bracket\'s own `+`');
    // …and `\left[…\right]` cannot span a `\\` inside `aligned`, so the pair is traded for
    // fixed-size delimiters. Both halves, or the block will not parse.
    assert.match(r.tex, /\\Bigl\[/);
    assert.match(r.tex, /\\Bigr\]/);
    assert.doesNotMatch(r.tex, /\\left\[|\\right\]/, 'an auto-sized pair cannot cross a line break');
  });

  test('every line of the broken form is narrower than the source, in glyphs', () => {
    const r = reflowDisplayTex(FEATURE);
    const lines = r.tex.replace(/\\begin\{aligned\}|\\end\{aligned\}/g, '').split('\\\\');
    const worst = Math.max(...lines.map((l) => _weight(l)));
    assert.ok(worst < _weight(FEATURE) * 0.75,
      `the longest line is ${worst} glyphs against ${_weight(FEATURE)} — the aligned wrapper has to earn itself`);
  });

  test('KaTeX parses what the pass emits — a rewrite that does not render is worse than an overflow', () => {
    assert.ok(renders(reflowDisplayTex(FEATURE).tex));
  });
});

describe('core: tex-linebreak — what it refuses, which is most things', () => {
  test('a short equation is returned identically', () => {
    const r = reflowDisplayTex(OLS);
    assert.equal(r.lines, 1);
    assert.equal(r.tex, OLS, 'an untouched equation must come back as the same string, not a re-serialization');
  });

  test("an author's own `\\\\` is a layout decision already made", () => {
    // THE FIXTURE HAS TO BE ONE THE PASS WOULD OTHERWISE REWRITE. The first cut was
    // `'x'.repeat(REFLOW_BUDGET) = a + b \\\\ = c + d`, which has no break the gain check accepts —
    // so it returns `lines: 1` with the guard AND without it, and deleting the guard survived.
    // A two-line sum does get rewritten: 39 lines, an author's deliberate layout replaced by the
    // pass's own. (HARD RULE #25 checker, final pass — the arm passed for the wrong reason.)
    const sum = (p) => Array.from({ length: 20 }, (_, i) => `${p}_{${i}}`).join(' + ');
    const src = `S = ${sum('a')} \\\\ T = ${sum('b')}`;
    assert.ok(src.length > REFLOW_BUDGET, 'the fixture must be past the budget to reach the guard');
    const r = reflowDisplayTex(src);
    assert.equal(r.lines, 1);
    assert.equal(r.tex, src);
    // The SAME sum with no `\\\\` in it does break, which is what proves the refusal is the guard
    // rather than the equation being unbreakable.
    assert.ok(reflowDisplayTex(`S = ${sum('a')} + ${sum('b')}`).lines > 1);
  });

  test('any environment is left alone — this is what keeps every `pmatrix` in the corpus byte-identical', () => {
    // `math matrix`'s committed sample, trimmed. Long past the budget, and a break inside it
    // would be nonsense.
    const src = 'X = \\begin{pmatrix} 1 & x_{11} & \\cdots & x_{1p} \\\\ 1 & x_{21} & \\cdots & x_{2p} '
      + '\\\\ \\vdots & \\vdots & \\ddots & \\vdots \\end{pmatrix}';
    const r = reflowDisplayTex(src);
    assert.equal(r.lines, 1);
    assert.equal(r.tex, src);
  });

  test('a break that does not shorten the longest line is not taken', () => {
    // One long relation with a short left side and no interior seam: splitting at `=` moves
    // nothing, so the `aligned` wrapper would be pure cost. This is the measured 2606px case.
    const src = `a = \\mathrm{${'z'.repeat(REFLOW_BUDGET + 20)}}`;
    assert.equal(reflowDisplayTex(src).lines, 1);
  });

  test('an operator inside a subscript, a fraction or a function argument is not a break point', () => {
    // Every `+` here is at depth ≥ 1. With no depth-0 seam and no dominant group carrying one,
    // the pass has nothing safe to cut.
    const src = `\\gamma_{a+b+c+d} \\cdot \\frac{p+q+r+s}{t+u+v+w} \\cdot \\log(m+n+o+${'p'.repeat(40)})`;
    const r = reflowDisplayTex(src);
    assert.ok(src.length > REFLOW_BUDGET, 'fixture must be past the budget or it proves nothing');
    assert.equal(r.lines, 1);
  });

  test('a LEADING sign is unary, not a binary operator', () => {
    const src = `-\\alpha \\cdot \\mathrm{${'w'.repeat(REFLOW_BUDGET)}}`;
    const r = reflowDisplayTex(src);
    // Whatever it decides, it must never have cut at the leading `-`.
    assert.doesNotMatch(r.tex, /^\s*\\begin\{aligned\}\s*\\\\/);
    assert.ok(renders(r.tex));
  });

  test('a set-builder is one unit — the relation INSIDE it is never the break', () => {
    // `\{ … \}` is two literal glyphs rather than a TeX group, so a depth scan that ignores
    // them puts the `<` of a set-builder at depth 0 — and with no other relation on the line
    // that `<` becomes the alignment column, splitting a set across two lines. Breaks at the
    // top-level `+`s instead, and the set travels whole.
    const src = 'S = \\{x : f(x) < y\\} + \\alpha_1\\beta_1\\gamma_1\\delta_1 '
      + '+ \\alpha_2\\beta_2\\gamma_2\\delta_2';
    const r = reflowDisplayTex(src);
    assert.equal(r.lines, 3, 'expected the relation line plus two operand lines');
    assert.match(r.tex, /S ={}& \\\{x : f\(x\) < y\\\}/, 'the set must ride one line, intact');
    assert.ok(renders(r.tex));
  });

  test('with NO relation outside it, a set-builder still refuses rather than aligning on its `<`', () => {
    const src = 'S = \\{x : f(x) < y\\} \\cup \\{z : g(z) > w\\} \\cup \\{u : h(u) = v\\} '
      + '\\cup \\{q : k(q) = r\\}';
    const r = reflowDisplayTex(src);
    assert.ok(src.length > REFLOW_BUDGET, 'fixture must be past the budget or it proves nothing');
    // `\cup` is not a break point and the relations are all inside sets, so there is nothing
    // safe to cut. Refusing is the right answer; aligning on a set's `<` is not.
    assert.equal(r.lines, 1);
  });

  test('a `%` COMMENT is refused — the pass is unsound in both directions across one', () => {
    // Two measured breaks, both on real renders. (a) `emit` joins with a literal ` \\`, and a `%`
    // earlier on that line comments the terminator out, so the next line merges in as a third
    // alignment column. (b) The break scan reads straight through a comment, so an operator
    // INSIDE one becomes a break point and everything the author commented OUT is put back on the
    // slide — nine terms restored, and a slide that fitted came back tagged "Content clipped".
    const eaten = '\\mathcal{L}(\\theta) = \\alpha + \\beta % the prior term\n + \\gamma + \\delta + \\epsilon + \\zeta';
    const revealed = 'E_{\\text{tot}} = mc^2 % + \\lambda + \\mu + \\nu + \\xi + \\omicron + \\pi + \\rho + \\sigma + \\tau';
    for (const src of [eaten, revealed]) {
      const r = reflowDisplayTex(src);
      assert.equal(r.lines, 1);
      assert.equal(r.tex, src, 'a commented equation must come back byte-identical');
    }
    // …but an ESCAPED percent is a literal glyph, not a comment, and must not block the break.
    const literal = 'r = \\alpha\\%_{1} + \\beta\\%_{2} + \\gamma\\%_{3} + \\delta\\%_{4} '
      + '+ \\epsilon\\%_{5} + \\zeta\\%_{6} + \\eta\\%_{7}';
    assert.ok(literal.length > REFLOW_BUDGET);
    assert.ok(reflowDisplayTex(literal).lines > 1, 'an escaped `\\%` is not a comment');
  });

  test('`\\cr` and `\\newline` are the author\'s layout too, not just `\\\\`', () => {
    for (const brk of ['\\cr', '\\newline']) {
      const src = `y = \\alpha + \\beta ${brk} + \\gamma + \\delta + \\epsilon + \\zeta + \\eta + \\theta + \\iota`;
      const r = reflowDisplayTex(src);
      assert.equal(r.lines, 1, `${brk} must be refused`);
      assert.equal(r.tex, src);
    }
  });

  test('a `\\right`-PREFIXED token after the group does not steal the closing delimiter', () => {
    // `closerOf` searched with `lastIndexOf('\\right', g.end)`, and `lastIndexOf` accepts a match
    // starting AT `from` — so `\\rightarrow` immediately after `\\right)` won, the closer came out
    // as `a`, and the emitted `\\Bigra` was an undefined control sequence with the group's `)` gone.
    const src = 'z = \\left( \\alpha + \\beta + \\gamma + \\delta + \\epsilon + \\zeta + \\eta \\right)\\rightarrow w';
    const r = reflowDisplayTex(src);
    assert.ok(r.lines > 1, 'expected a break');
    assert.match(r.tex, /\\Bigr\)/, 'the closing delimiter must survive the descent');
    assert.doesNotMatch(r.tex, /\\Bigra/);
    assert.ok(renders(r.tex));
    // …and the trailing `\rightarrow w` still rides the last line.
    assert.match(r.tex, /\\rightarrow w/);
  });

  test('with NO relation, the descent does not fabricate a leading `+`', () => {
    // A sign is meaning. This emitted `{op: null, text: ''}` then a hard-coded `'+'`, so the
    // expression came out with a `+` in front of its opening bracket under an empty `aligned` row.
    const src = '\\left[ \\alpha\\beta + \\gamma\\delta + \\epsilon\\zeta + \\eta\\theta + \\iota\\kappa + \\lambda\\mu \\right]';
    const r = reflowDisplayTex(src);
    assert.ok(r.lines > 1, 'expected a break');
    const first = r.tex.split('\\\\')[0].replace('\\begin{aligned}', '').trim();
    assert.doesNotMatch(first, /^&\s*\+/, `a fabricated leading sign: ${first}`);
    assert.match(first, /^&\s*\\Bigl\[/);
    assert.ok(renders(r.tex));
  });

  test('`lines === 1` always means UNCHANGED — a one-row aligned is not a break', () => {
    // A two-segment relation split emits a single `lhs ={}& rhs` row, so `lines` was 1 while `tex`
    // had been rewritten — contradicting this module's own return contract.
    const src = '\\alpha\\beta\\gamma\\delta\\epsilon\\zeta\\eta\\theta\\iota = \\kappa\\lambda\\mu\\nu\\xi\\omicron\\pi\\rho\\sigma';
    const r = reflowDisplayTex(src);
    assert.equal(r.lines, 1);
    assert.equal(r.tex, src, '`lines === 1` promises the input back, identically');
  });

  test('a non-string input is returned as-is rather than thrown on', () => {
    for (const bad of [null, undefined, 42, {}]) {
      assert.equal(reflowDisplayTex(bad).lines, 1);
    }
  });
});

describe('core: tex-linebreak — weight counts glyphs, not characters', () => {
  test('a control sequence is one glyph and a grouping brace is none', () => {
    assert.equal(_weight('\\sigma'), 1);
    assert.equal(_weight('x_{i}'), 3);          // x, _, i — the braces set nothing
    assert.equal(_weight('\\hat\\beta'), 2);
    // The error this guards against: raw length would call `\sigma` six times the width of `x`.
    assert.ok(_weight('\\sigma\\sigma') < '\\sigma\\sigma'.length / 2);
  });
});
