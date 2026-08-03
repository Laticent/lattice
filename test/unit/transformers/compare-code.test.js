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
  const raw = fs.readFileSync(
    path.join(__dirname, '../../../lib/components/code/compare-code/compare-code.styles.css'),
    'utf8',
  );
  // Normalize before matching. The first cut of these guards matched the source
  // byte-for-byte, so `minmax( 0, 1fr)` or a missing space before `{` failed them —
  // and the failure message said "rule missing", which points at the wrong thing
  // entirely. A guard that trips on harmless reformatting gets deleted by whoever
  // reformats, which costs the protection it was written for.
  const css = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // comments carry the same words as the rules
    .replace(/\s+/g, ' ');
  const block = (selectorRe) => {
    const m = css.match(new RegExp(`${selectorRe}\\s*\\{([^}]*)\\}`));
    return m?.[1];
  };

  test('the column tracks floor at 0, not min-content', () => {
    // `1fr` alone is `minmax(auto, 1fr)`, and `auto` resolves to min-content — which
    // for a `<pre>` is its LONGEST UNWRAPPED LINE. One long line then widens its own
    // track past its half and pushes the other pane off the frame.
    const body = block('section\\.compare-code \\.code-cols');
    assert.ok(body, '.code-cols rule missing');
    const decl = body.match(/grid-template-columns:([^;]*)/);
    assert.ok(decl, 'grid-template-columns missing from .code-cols');
    const tracks = decl[1].replace(/\s+/g, '');
    assert.equal(
      tracks, 'minmax(0,1fr)minmax(0,1fr)',
      `both tracks must be minmax(0,1fr) — a bare \`1fr\` reintroduces the min-content floor; got "${decl[1].trim()}"`,
    );
  });

  test('code wraps unconditionally, not only for the reflow families', () => {
    // The pair must be on the BASE rule. It used to be scoped to square/tall/strip on
    // the reasoning that landscape "keeps the width the author wrote for" — landscape
    // has the same floor, so it did not.
    const body = block('section\\.compare-code pre > code');
    assert.ok(body, 'base `pre > code` rule missing');
    assert.match(body, /white-space:\s*pre-wrap/, 'long lines must wrap, not clip');
    assert.match(
      body, /overflow-wrap:\s*anywhere/,
      '`anywhere` (not `break-word`) — verified in Chromium: with break-word the track stays blown out (1862px), with anywhere it collapses to its half (564px)',
    );
  });

  test('no later rule re-narrows wrapping to a subset of families', () => {
    // Fails OPEN in the first cut: the regex pinned `[data-family="square"]` as the
    // FIRST argument and pinned double quotes, so reordering the families or using
    // single quotes let the forbidden rule back in with the guard still green — it
    // caught only the byte-identical form of the thing it forbids. Now it asks the
    // real question: does ANY rule after the base one set white-space or
    // overflow-wrap on compare-code's code, scoped to a family or not?
    const base = css.indexOf('section.compare-code pre > code');
    assert.ok(base > -1, 'base rule missing');
    const after = css.slice(base + 1);
    // `(?![-\w])` matters: without it this also matches `section.compare-code-block`,
    // the SPLIT path — a different class that sets pre-wrap legitimately on its own
    // full-width block. Catching it would be a false positive that trains people to
    // ignore the guard.
    const offenders = [...after.matchAll(/section\.compare-code(?![-\w])[^{}]*pre > code\s*\{([^}]*)\}/g)]
      .filter((m) => /white-space|overflow-wrap/.test(m[1]));
    assert.deepEqual(
      offenders.map((m) => m[0].slice(0, 90)), [],
      'wrapping is unconditional — a later rule narrowing it to some families reopens the clip for the rest',
    );
  });
});
