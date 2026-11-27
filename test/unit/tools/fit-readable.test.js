/**
 * Unit: tools/lib/fit-harness/page.js `fits` — the readable-prose rule (2026-10-28-fit-everywhere-model.md §12),
 * run in a real Chromium against a hand-built slide.
 *
 * A split cover's lead-in is the last line of its masthead: a few words at `--fs-emphasis`, a title's own measure.
 * At a hall venue on a story box it wraps to three lines of whole words, and the rule used to read that as crammed
 * prose. The same words in a body-size card squeezed to a narrow column must still fail: that is the defect the rule
 * exists for. And the cover's lede is prose, so it is still read.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const { PAGE_SRC } = require('../../../tools/lib/fit-harness/page.js');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, IGNORED_BEARER_SELECTOR, PROBE_SRC, CONTENT_CLIPPED_SRC, FRAME_TOLERANCE } = require('../../../lib/core/overflow-probe');
const { DECK_SLIDES_SRC } = require('../../../lib/core/deck-slides');

const chrome = resolveChrome();
const skip = skipWithoutChrome(chrome);
const cfg = { noCompact: [], probeSrc: PROBE_SRC, ccSrc: CONTENT_CLIPPED_SRC, slidesSrc: DECK_SLIDES_SRC, clipSel: CLIP_CELL_SELECTOR, ignoreSel: IGNORED_CLIP_SELECTOR, bearerSel: IGNORED_BEARER_SELECTOR, tol: FRAME_TOLERANCE };
// Story box at hall: 1080 wide, body 70px, the lead-in at 1.45× body at the ten-character measure that 972px gives it there, set in `ch` so the test does not lean on a font (#32).
const slide = (cls, inner) => `<section class="${cls}" style="width:1080px;height:1920px;font-size:70px;padding:0 54px;box-sizing:border-box;overflow:hidden;font-family:sans-serif">${inner}</section>`;
const LEAD = '<div class="split-cover-lead" style="font-size:102px;width:10ch">What each jurisdiction requires</div>';

let browser;
let page;
before(async () => {
  if (skip) return;
  const puppeteer = require('puppeteer');
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 2400 });
});
after(async () => { if (browser) await browser.close(); });

const readable = async (html) => {
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`${PAGE_SRC}(${JSON.stringify(cfg)})`);
  return page.evaluate(() => {
    const s = document.querySelector('section');
    // Sanity: the lead-in really wraps to three lines here, so the rule had something to judge.
    const lead = s.querySelector('.split-cover-lead, .card');
    const r = document.createRange();
    r.selectNodeContents(lead);
    const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    const f = window.__fit.fits(s);
    return { lines, unreadable: !!f.unreadable };
  });
};

test('a split cover\'s masthead lead-in is a title\'s measure, not crammed prose', { skip }, async () => {
  const r = await readable(slide('content lat-split-cover', `<div class="split-feat-h" style="font-size:146px">Three jurisdictions.</div>${LEAD}`));
  assert.equal(r.lines, 3);
  assert.equal(r.unreadable, false);
});

test('the same words in a body-size card squeezed to a narrow column still fail', { skip }, async () => {
  const r = await readable(slide('cards', '<div class="card" style="font-size:70px;width:10ch">What each jurisdiction requires</div>'));
  assert.ok(r.lines > 2);
  assert.equal(r.unreadable, true);
});

test('the cover\'s lede is prose, and is still read', { skip }, async () => {
  const r = await readable(slide('content lat-split-cover', '<div class="split-feat-lede card" style="font-size:70px;width:10ch">What each jurisdiction requires</div>'));
  assert.ok(r.lines > 2);
  assert.equal(r.unreadable, true);
});
