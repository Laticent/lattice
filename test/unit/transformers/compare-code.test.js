/**
 * Unit tests for the compare-code transform (kernel +
 * lib/transformers/compare-code.js adapter). Each `<p><code>label</code></p>` +
 * `<pre>` after the heading becomes a `.code-col` inside `.code-cols`; the
 * eyebrow code-paragraph and the heading are preserved before it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/components/code/compare-code/compare-code.transform');
const adapter = require('../../../lib/transformers/compare-code');

const EYE = '<p><code>eyebrow</code></p>';
const H2 = '<h2>Heading</h2>';
const colA = '<p><code>Before</code></p><pre>a</pre>';
const colB = '<p><code>After</code></p><pre>b</pre>';
const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;

describe('compare-code — transformCompareCodeSection', () => {
  test('pairs each p>code+pre into a code-col, keeping eyebrow + heading', () => {
    const out = kernel.transformCompareCodeSection(`${EYE}${H2}${colA}${colB}`, 'compare-code');
    assert.equal(
      out,
      `${EYE}${H2}<div class="code-cols"><div class="code-col">${colA}</div><div class="code-col">${colB}</div></div>`,
    );
  });

  test('preserves a leading header and trailing footer (full-section path)', () => {
    const out = kernel.transformCompareCodeSection(`<header>H</header>${EYE}${H2}${colA}${colB}<footer>F</footer>`, 'compare-code');
    assert.match(out, /^<header>H<\/header>/);
    assert.match(out, /<footer>F<\/footer>$/);
    assert.match(out, /class="code-cols"/);
    assert.equal((out.match(/class="code-col"/g) || []).length, 2);
  });

  test('skips non-compare-code sections and is idempotent', () => {
    const body = `${H2}${colA}${colB}`;
    assert.equal(kernel.transformCompareCodeSection(body, 'code'), body);
    const once = kernel.transformCompareCodeSection(body, 'compare-code');
    assert.equal(kernel.transformCompareCodeSection(once, 'compare-code'), once);
  });
});

describe('compare-code — applyToHtml (marp-cli) walks sections', () => {
  test('only the compare-code section is rewritten', () => {
    const out = kernel.applyToRenderedHtml(sec('compare-code', `${H2}${colA}${colB}`) + sec('content', `${H2}<p>x</p>`));
    assert.equal((out.match(/class="code-cols"/g) || []).length, 1);
  });
});

describe('compare-code — applyToDom (runtime)', () => {
  test('groups the column paragraphs+pres into code-cols after the heading', () => {
    const doc = new JSDOM(
      `<!DOCTYPE html><body>${sec('compare-code', `${EYE}${H2}${colA}${colB}`)}</body>`,
    ).window.document;
    adapter.applyToDom(doc);
    const cols = doc.querySelector('section.compare-code > .code-cols');
    assert.ok(cols);
    assert.equal(cols.querySelectorAll('.code-col').length, 2);
    assert.equal(cols.querySelector('.code-col code').textContent, 'Before');
    // eyebrow + heading stay outside the grid
    assert.ok(doc.querySelector('section.compare-code > h2'));
  });
});

// ── Rot-guard on the two-pane geometry. Not a transform test — a pin on the CSS
// contract the transform's output depends on, because the defect it guards was
// invisible to every other gate: horizontal overflow, which the overflow probe
// (vertical only) cannot see, on a layout whose every gallery specimen has short
// lines. It shipped for the life of the component.
describe('compare-code — the two panes stay equal-width and wrap (CSS contract)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(
    path.join(__dirname, '../../../lib/components/code/compare-code/compare-code.styles.css'),
    'utf8',
  );

  test('the column tracks floor at 0, not min-content', () => {
    // `1fr` alone is `minmax(auto, 1fr)`, and `auto` resolves to min-content — which
    // for a `<pre>` is its LONGEST UNWRAPPED LINE. One long line then widens its own
    // track past its half and pushes the other pane off the frame. Measured before
    // the fix: left pane ~1700px in a 1920px stage, right pane a sliver, export
    // tagged "Content clipped".
    const rule = css.match(/section\.compare-code \.code-cols \{[^}]*\}/);
    assert.ok(rule, '.code-cols rule missing');
    assert.match(
      rule[0],
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
      'both tracks must be minmax(0,1fr) — a bare `1fr` reintroduces the min-content floor',
    );
  });

  test('code wraps unconditionally, not only for the reflow families', () => {
    // The pair must be on the BASE rule. It used to be scoped to
    // square/tall/strip on the reasoning that landscape "keeps the width the
    // author wrote for" — landscape has the same floor, so it did not.
    const rule = css.match(/section\.compare-code pre > code \{[^}]*\}/);
    assert.ok(rule, 'base `pre > code` rule missing');
    assert.match(rule[0], /white-space:\s*pre-wrap/, 'long lines must wrap, not clip');
    assert.match(
      rule[0],
      /overflow-wrap:\s*anywhere/,
      '`anywhere` (not `break-word`) — it also lowers min-content, which is what lets the track shrink',
    );
  });

  test('the family-scoped wrap override is not reintroduced', () => {
    // Re-adding it would be a redundant override that reads as if landscape were
    // still excluded from wrapping.
    const scoped = css.match(
      /section\.compare-code:where\(\[data-family="square"\][^{]*\) pre > code \{[^}]*\}/,
    );
    assert.equal(scoped, null, 'wrapping is unconditional now — the family-scoped copy is dead');
  });
});
