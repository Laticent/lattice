/**
 * Integration: the measured split's member reader (lib/core/fit-measure.js `measureFit`) on a chart's
 * `role="list"`, in a real Chromium page (fit-everywhere-model.md §18). Cases:
 *   BODY PAGE ROOM  a built body page that keeps its heading (a chart's native slice does) has room
 *                   from the member list's top down, not from the content box's top: the heading's
 *                   height is not room the members can use
 *   ONE ROW         a `role="list"` whose items all share one row (timeline-list's horizontal spine)
 *                   gives the plan no members, so the recipe's `perPage` cuts it
 *   STACKED         the same list stacked down the page is read as members, as before
 *
 * FALSIFIABLE: with `roomOf` measuring from the content box's top on a body page (the code before this
 * fix), BODY PAGE ROOM fails by the heading's 200px; without the one-row rule, ONE ROW reads 4 members.
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

const item = (n) => `<div role="listitem" style="height:100px">Milestone ${n}</div>`;

/** Measure one 1000px section holding a 200px heading and four 100px members laid out by `listStyle`. */
async function measure(listStyle, { role = 'body', slide = '2.2', bodyPages = true } = {}) {
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <section data-lattice-slide="${slide}" data-split-role="${role}" style="width:1000px;height:1000px;padding:0;box-sizing:border-box;overflow:hidden">
      <h2 style="margin:0;height:200px">The timeline pins events to their dates.</h2>
      <div role="list" style="${listStyle}">${[1, 2, 3, 4].map(item).join('')}</div>
    </section></body></html>`);
  return page.evaluate((src, bodyPages) => {
    const measureFit = new Function(`return (${src})`)();
    const verdict = () => ({ fits: () => ({ ok: false }) });
    const slides = (doc) => [...doc.querySelectorAll('section[data-lattice-slide]')];
    return measureFit(verdict, {}, slides, [], bodyPages);
  }, MEASURE_FIT_SRC, bodyPages);
}

test('BODY PAGE ROOM: a body page that keeps its heading has room from the member list down', async () => {
  const out = await measure('display:flex;flex-direction:column;gap:20px');
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.equal(out[0].capacity, 800, 'the 1000px page less the 200px heading above the list');
  assert.deepEqual(out[0].members.heights, [100, 100, 100, 100]);
});

test('ONE ROW: members that all share one row give the plan nothing to pack', async () => {
  const out = await measure('display:flex;flex-direction:row;gap:20px', { role: '', slide: '2', bodyPages: false });
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.equal(out[0].members, null, 'no members: the recipe\'s perPage cuts a row');
});

test('STACKED: the same list stacked down the page is read as members', async () => {
  const out = await measure('display:flex;flex-direction:column;gap:20px', { role: '', slide: '2', bodyPages: false });
  assert.deepEqual(out[0].members.heights, [100, 100, 100, 100]);
  assert.equal(out[0].members.gap, 20);
});
