/**
 * Unit: lib/engine/math-detect.mjs — the KaTeX-free math-syntax pre-scan.
 *
 * The predicate mirrors math.js's own inline/block delimiter guards
 * independently (no shared implementation — see math-detect.mjs's header), so
 * this suite is the drift guard: every fixture is cross-checked against what
 * the REAL engine (createEngine().render()) actually renders as
 * `class="katex"`, not just against the predicate's own logic.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');

let sourceHasMath, hasDisplayMath, hasInlineMath;
test.before(async () => {
  ({ sourceHasMath, hasDisplayMath, hasInlineMath } = await import('../../../lib/engine/math-detect.mjs'));
});

function engineRendersMath(src) {
  const { html } = createEngine().render(src, 'lattice');
  return /class="katex"/.test(html);
}

const FIXTURES = [
  { name: 'plain prose, no math', src: '# Title\n\nJust some text.\n', expect: false },
  { name: 'inline math', src: 'Inline $a^2 + b^2 = c^2$ here.\n', expect: true },
  { name: 'display math', src: '$$\\int_0^1 x\\,dx$$\n', expect: true },
  { name: 'display math, multi-line', src: '$$\n\\sum_{i=1}^n i\n$$\n', expect: true },
  { name: 'currency prose (single amount)', src: 'Revenue grew to $400M this year.\n', expect: false },
  {
    name: 'currency prose (two amounts, the real kpi-slide regression case)',
    src: 'up 28% YoY, ahead by $18M and $400M total.\n',
    expect: false,
  },
  { name: 'escaped dollar before close', src: 'Price is \\$5 not math.\n', expect: false },
  { name: 'unpaired dollar', src: 'A lone $ sign.\n', expect: false },
  { name: 'empty string', src: '', expect: false },
  {
    name: 'display math indented inside a list item (adversarial-review regression case)',
    src: '- item\n\n  $$\n  x^2\n  $$\n',
    expect: true,
  },
  {
    name: 'display math inside a blockquote (adversarial-review regression case)',
    src: '> $$\n> x^2\n> $$\n',
    expect: true,
  },
  {
    name: 'a `$$` that fails as a display opener still lets the SECOND `$` open inline math (adversarial-review regression case)',
    src: 'a $$b$ c',
    expect: true,
  },
];

describe('math-detect: sourceHasMath parity with the real engine', () => {
  for (const { name, src, expect } of FIXTURES) {
    test(name, () => {
      assert.equal(sourceHasMath(src), expect, `sourceHasMath mismatch for: ${name}`);
      assert.equal(engineRendersMath(src), expect, `engine render mismatch for: ${name}`);
    });
  }
});

describe('math-detect: unit behavior', () => {
  test('hasDisplayMath requires $$ at line start, allowing container-marker indentation', () => {
    assert.equal(hasDisplayMath('$$x$$'), true);
    assert.equal(hasDisplayMath('  $$x$$'), true); // list-item indentation
    assert.equal(hasDisplayMath('> $$x$$'), true); // blockquote marker
    assert.equal(hasDisplayMath('text $$x$$'), false); // not container indentation — real prose prefix
  });

  test('hasInlineMath requires a valid open/close pair', () => {
    assert.equal(hasInlineMath('$x$'), true);
    assert.equal(hasInlineMath('$ x$'), false); // open followed by whitespace
    assert.equal(hasInlineMath('$x $'), false); // close preceded by whitespace
    assert.equal(hasInlineMath('$x$5'), false); // close followed by a digit
  });

  test('hasInlineMath: a failed `$$` opener does not consume the second `$`', () => {
    assert.equal(hasInlineMath('$$b$'), true); // the second `$` opens `$b$`
  });

  test('sourceHasMath is false for null/undefined', () => {
    assert.equal(sourceHasMath(null), false);
    assert.equal(sourceHasMath(undefined), false);
  });
});
