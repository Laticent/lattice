/**
 * Integration: the measured split reads a CODE slide's lines as its members (lib/core/fit-measure.js
 * `measureFit` → `codeOf`), in a real Chromium page (fit-everywhere-model.md §23). On a phone every
 * code line wraps, so the `code-cards` count of 12 lines a page promised room a wrapped block did not
 * have, and a block of fewer than 12 lines never split at all. Cases:
 *   WRAPPED LINES  each line is a member, and a line that wraps to three rows measures three rows tall
 *   EDGE BLANKS    blank lines before the first and after the last are not members (`codeLines` drops
 *                  them too, so the counts agree and the plan is taken)
 *   TWO BLOCKS     a slide with two blocks splits one block a page, by count: no line members
 *   NOT CODE       a `content` slide with a block is not read as code lines here
 *   HIGHLIGHTED    each line in its own span (highlighted code): every line keeps its own height
 *
 * FALSIFIABLE: without `codeOf`, WRAPPED LINES reads no members (a code slide has no list), so the
 * plan cannot split it; with the edge blanks kept, EDGE BLANKS reads 8 members against the strategy's 4; with a line's
 * range ending at the next text node's start, HIGHLIGHTED reads `[39, 20, 0]`.
 * Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');
const { MEASURE_FIT_SRC } = require('../../../lib/core/fit-measure');

let browser;
let page;
before(async () => {
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080 });
});
after(async () => {
  await browser?.close();
});

// 20px lines, 400px wide: a 100-character line wraps to several rows. No fonts to wait for.
const PRE = 'margin:0;padding:0;font:16px/20px monospace;white-space:pre-wrap;width:400px';

/** Measure one overflowing 1000px section of class `cls` whose stage holds `stage`. */
async function measure(cls, stage) {
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <section class="${cls}" data-lattice-slide="3" style="width:1000px;height:1000px;padding:0;box-sizing:border-box;overflow:hidden">
      <div class="cell-stage">${stage}</div>
    </section></body></html>`);
  return page.evaluate((src) => {
    const measureFit = new Function(`return (${src})`)();
    const verdict = () => ({ fits: () => ({ ok: false }) });
    const slides = (doc) => [...doc.querySelectorAll('section[data-lattice-slide]')];
    return measureFit(verdict, {}, slides, [], false);
  }, MEASURE_FIT_SRC);
}

const block = (text) => `<pre style="${PRE}"><code>${text}</code></pre>`;

test('WRAPPED LINES: each code line is a member, and a wrapped line measures every row it takes', async () => {
  const long = 'word '.repeat(20).trim(); // 99 characters with spaces to wrap at
  const out = await measure('code', block(`const a = 1;\n${long}\nconst b = 2;`));
  assert.equal(out.length, 1, JSON.stringify(out));
  const { heights } = out[0].members;
  assert.equal(heights.length, 3, JSON.stringify(heights));
  // A Range's rects are the glyph box, so the first line misses half its leading (as a passage's
  // first sentence does); every later line is measured bottom to bottom, the full 20px pitch.
  assert.ok(heights[0] >= 18 && heights[0] <= 20, `a one-row first line is about one 20px row, got ${heights[0]}px`);
  assert.ok(heights[1] >= 60, `a 100-character line in a 400px block wraps to several rows, got ${heights[1]}px`);
  assert.equal(heights[2], 20, 'a one-row line after another is exactly one 20px row');
});

test('EDGE BLANKS: blank lines before the first and after the last are not members', async () => {
  const out = await measure('code', block('\n\nline 1\nline 2\n\nline 4\n\n'));
  assert.equal(out[0].members.heights.length, 4, 'line 1, line 2, the blank between them and line 4; a blank inside the block is a line');
});

test('TWO BLOCKS: a slide with two blocks has no line members (it splits a block a page)', async () => {
  const out = await measure('code', block('a\nb\nc') + block('d\ne\nf'));
  assert.equal(out[0].members, null, JSON.stringify(out[0]));
});

test('NOT CODE: a block on a content slide is not read as code lines here', async () => {
  const out = await measure('content', block('a\nb\nc'));
  assert.equal(out[0].members, null, JSON.stringify(out[0]));
});

test('HIGHLIGHTED: a line that starts in a new text node keeps its own height', async () => {
  const out = await measure('code', block('<span>a1</span>\n<span>a2</span>\n<span>a3</span>'));
  const { heights } = out[0].members;
  assert.equal(heights.length, 3, JSON.stringify(heights));
  assert.ok(heights[0] >= 18 && heights[0] <= 20, `the first line is one row, got ${JSON.stringify(heights)}`);
  assert.deepEqual(heights.slice(1), [20, 20], 'each later line is one 20px row, not 0 or two rows');
});
