/**
 * Integration: chart text holds the back-row floor at every venue (followups 3098, lib/transformers/chart-text-venue.js).
 *
 * Renders the default slide of each covered kind's gallery with the real CLI to HTML, once per venue (laptop, huddle,
 * conference, hall), with a running header, meta and footer, then measures every text run inside each chart body in
 * Chromium at 1280 × 720: an SVG run's size is its font size times its screen matrix, as tools/type-voice-audit.mjs
 * measures it. Every run must print at least `labelFloorPx(venue)`, 8 arcminutes of x-height at the venue's back row
 * (engineering/typography.md §7): 10.1, 15.1, 20.1 and 26.8 px.
 *
 * FALSIFIABLE: before the fix a bar chart's category labels printed 17.4 px at laptop and 13.0 px at hall, under the
 * hall floor and smaller than at laptop; the last test pins that hall prints larger than laptop.
 *
 * COVERED is the kinds whose default gallery slide clears the floor at every venue with every name whole. Line, waterfall,
 * ep-curve, histogram and stacked-bar take the factor too, but the guard steps it down where the full factor would cut or
 * drop a label, so on their gallery slides they grow without reaching the floor everywhere; the sibling
 * chart-text-venue-regressions.test.js pins that none of them, nor these, ever prints less than before.
 * followups.d/3098-p1-chart-text-venue-remaining-kinds.md lists every kind short of the floor. A kind joins COVERED
 * when it clears the floor here. Deterministic (HARD RULE #32): it waits on `document.fonts.ready`, never
 * on a duration, and asserts sizes, not timings.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer');
const { labelFloorPx } = require('../../../lib/transformers/chart-text-venue');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'lattice.js');
const KINDS = path.join(ROOT, 'lib/plugins/chart-family/kinds');
const VENUES = ['laptop', 'huddle', 'conference', 'hall'];
const COVERED = ['bar', 'funnel', 'heatmap'];

/** The first slide of a kind's gallery that draws the kind. */
function gallerySlide(kind) {
  const src = fs.readFileSync(path.join(KINDS, kind, `${kind}.gallery.md`), 'utf8').replace(/\r/g, '');
  return src.split(/\n---\n/).slice(1).find((s) => s.includes(`_class: ${kind} -->`) || s.includes(`_class: ${kind}\n`)).trim();
}

describe('chart text follows the venue', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chart-venue-'));
  const runs = {};
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const venue of VENUES) {
      const md = path.join(dir, `${venue}.md`);
      const html = path.join(dir, `${venue}.html`);
      fs.writeFileSync(md, [
        '---', 'theme: cuoio', 'paginate: true', 'header: "Northwind · Board review"', 'meta: "Q3 2026 · Finance"',
        'footer: "Confidential · prepared for the board"', `venue: ${venue}`, '---', '',
        COVERED.map(gallerySlide).join('\n\n---\n\n'), '',
      ].join('\n'));
      const r = spawnSync(process.execPath, [CLI, md, html, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
      assert.equal(r.status, 0, `${venue}: ${r.stderr}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`);
      await page.evaluate(() => document.fonts.ready);
      runs[venue] = await page.evaluate(() => [...document.querySelectorAll('section')].map((sec) => {
        const scale = sec.getBoundingClientRect().width / 1280;
        const out = [];
        for (const el of sec.querySelectorAll('.chart-body *')) {
          if (el.closest('.chart-sr-table,.chart-sr-only,.sr-only,style,script,title,desc')) continue;
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (!box.width || !box.height || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
          let px = parseFloat(cs.fontSize);
          if (el instanceof SVGElement) { const m = el.getScreenCTM(); px *= Math.hypot(m.a, m.b); }
          out.push({ text: el.textContent.trim().slice(0, 24), px: px / scale });
        }
        return out;
      }));
      await page.close();
    }
  });
  after(async () => { await browser?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  for (const venue of VENUES) {
    test(`every covered kind's chart text clears the ${venue} floor`, () => {
      const floor = labelFloorPx(venue);
      COVERED.forEach((kind, i) => {
        const list = runs[venue][i];
        assert.ok(list.length > 0, `${kind} at ${venue} printed no chart text`);
        const least = list.reduce((a, r) => (r.px < a.px ? r : a));
        assert.ok(least.px >= floor, `${kind} at ${venue}: "${least.text}" prints ${least.px.toFixed(1)} px, under the ${floor.toFixed(1)} px floor`);
      });
    });
  }

  test('a chart prints its labels larger at hall than at laptop (the defect printed them smaller)', () => {
    const min = (venue) => Math.min(...runs[venue][COVERED.indexOf('bar')].map((r) => r.px));
    assert.ok(min('hall') > min('laptop') * 1.8, `bar: ${min('laptop').toFixed(1)} px at laptop, ${min('hall').toFixed(1)} px at hall`);
  });
});
