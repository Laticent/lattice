/**
 * Integration: a redline's one long sentence is measured clause by clause (lib/core/fit-measure.js
 * `passageOf`, with `clauseStarts` from lib/core/passage-sentences.js travelling into the page), in a
 * real Chromium page (owner, 2026-11-13; fit-everywhere-model.md §23). The `passage` strategy cuts at
 * the same clause starts (`passageCuts(…, { clauses })`), so the plan and the pages agree. Cases:
 *   REDLINE    one sentence with a semicolon is two members, so a split can fall between its clauses
 *   QUOTE      the same sentence on a quote is one member: only a redline breaks inside a sentence
 *   EDIT       a clause break inside a deletion is refused, as `passageBreaks` refuses any cut in an edit
 *
 * FALSIFIABLE: without `__latticeClauseStarts` in MEASURE_FIT_SRC (or without the redline gate),
 * REDLINE reads no members; with the gate dropped, QUOTE reads two.
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

/** Measure one overflowing section of class `cls` whose stage holds a blockquote of `inner`. */
async function measure(cls, inner) {
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <section class="${cls}" data-lattice-slide="3" style="width:1000px;height:1000px;padding:0;box-sizing:border-box;overflow:hidden">
      <div class="cell-stage"><blockquote style="margin:0;font:20px/30px serif"><p>${inner}</p></blockquote></div>
    </section></body></html>`);
  return page.evaluate((src) => {
    const measureFit = new Function(`return (${src})`)();
    const verdict = () => ({ fits: () => ({ ok: false }) });
    const slides = (doc) => [...doc.querySelectorAll('section[data-lattice-slide]')];
    return measureFit(verdict, {}, slides, [], false);
  }, MEASURE_FIT_SRC);
}

const SENTENCE = 'The lessee shall pay the rent on the first day of each month; the lessor shall keep the roof in repair.';

test('REDLINE: one sentence with a semicolon measures as two clauses', async () => {
  const out = await measure('redline', SENTENCE);
  assert.ok(out[0].members, JSON.stringify(out[0]));
  assert.equal(out[0].members.heights.length, 2, JSON.stringify(out[0].members));
});

test('QUOTE: the same sentence on a quote is one member, so no plan splits it', async () => {
  const out = await measure('quote', SENTENCE);
  assert.equal(out[0].members, null, JSON.stringify(out[0]));
});

test('EDIT: a clause break inside a deletion is refused', async () => {
  const out = await measure('redline', 'The lessee shall <del>pay the rent; the lessor shall</del> keep the roof in repair.');
  assert.equal(out[0].members, null, JSON.stringify(out[0]));
});
