/**
 * Unit tests for the compare-code transform (kernel +
 * lib/transformers/compare-code.js adapter). Each `<p><code>label</code></p>` +
 * `<pre>` after the heading becomes a `.code-col` inside `.code-cols`; the
 * eyebrow code-paragraph and the heading are preserved before it.
 */

const { test, describe, before } = require('node:test');
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

// ── Rot-guard on the two-pane geometry.
//
// BEHAVIORAL, not textual, and that is the whole point. Three earlier cuts of these
// guards matched the stylesheet as a string, and a red-team pass evaded every one of
// them with trivial reformulations of the forbidden rule — `pre>code` with no spaces,
// the attribute before the class, the class without `section`, a descendant combinator
// instead of a child. A guard that only recognizes the byte-identical form of what it
// forbids provides the appearance of protection, which is worse than none.
//
// So these assert what the BROWSER computes, over the real bundle. Selector spelling,
// property order, whitespace and source position stop mattering; only the resolved
// behavior does. They skip (not fail) with no Chromium, because `npm test` must stay
// render-free — the browser-backed tier is on-demand here, same as css:values.
describe('compare-code — the two-pane geometry, as the browser resolves it', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const ROOT = path.join(__dirname, '../../..');
  const { resolveChrome: chrome } = require('../../../tools/lib/resolve-chrome');

  // One page, one long line on the LEFT only — the shape that broke. Returns the two
  // resolved track widths and the computed white-space, which is all three guards need.
  const measure = async () => {
    const exe = chrome();
    if (!exe) return null;
    const puppeteer = require('puppeteer-core');
    const css = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8');
    const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const LONG = 'const enrichedSignalsWithOwners = await database.signals.findAllMatching({ includeOwner: true });';
      await page.setContent(`<!DOCTYPE html><style>${css}</style>
        <section class="compare-code" style="width:1280px">
          <h2>H</h2>
          <div class="code-cols">
            <div class="code-col"><p><code>Before</code></p><pre><code>${LONG}</code></pre></div>
            <div class="code-col"><p><code>After</code></p><pre><code>return signals;</code></pre></div>
          </div>
        </section>`);
      return await page.evaluate(() => {
        const cols = document.querySelector('.code-cols');
        const code = document.querySelector('.code-col pre > code');
        return {
          tracks: getComputedStyle(cols).gridTemplateColumns.split(/\s+/).map(parseFloat),
          whiteSpace: getComputedStyle(code).whiteSpace,
          sectionWidth: document.querySelector('section').getBoundingClientRect().width,
        };
      });
    } finally { await browser.close(); }
  };

  let m;
  before(async () => { m = await measure(); });

  test('the two panes resolve to equal widths despite a long line on one side', async (t) => {
    if (!m) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
    const [a, b] = m.tracks;
    // Before the fix these measured 946.219 / 182.734 in a 1280px section: the long
    // line's min-content took the left track and the right pane became a sliver.
    assert.ok(
      Math.abs(a - b) < 1,
      `panes must resolve equal regardless of content; got ${a}px / ${b}px in a ${m.sectionWidth}px section`,
    );
  });

  test('landscape code stays verbatim — it does not wrap', async (t) => {
    if (!m) return t.skip('no Chromium — set CHROME_PATH');
    // Wrapping was tried here and reversed. On a two-pane diff the reader pairs line
    // N left with line N right; wrapping is per-pane, so one long line offsets every
    // row below it across the gutter. It also drops trailing lines out of the
    // `overflow:hidden` pane on export, and bakes a hard break into the PDF text
    // layer mid-token. The families that DO wrap stack to one column, where none of
    // that applies. A too-long line here is clipped inside its own pane instead.
    assert.equal(
      m.whiteSpace, 'pre',
      `landscape compare-code must not wrap; computed white-space was "${m.whiteSpace}". `
      + 'If you are deliberately reintroducing wrapping, read the .code-cols comment first '
      + 'and re-render the committed decks — this reverses a decision, it is not a tweak.',
    );
  });
});
