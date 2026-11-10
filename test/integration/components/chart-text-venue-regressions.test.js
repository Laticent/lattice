/**
 * Integration: chart text following the venue never costs the reader anything the old drawing printed.
 *
 * For EVERY slide of every covered kind's gallery, at all four venues and all four slide sizes (landscape 16:9,
 * portrait, square, standard 4:3), the deck is rendered twice with the real CLI: as shipped, and with the venue's
 * chart-text factor pinned to 1 (`chart-text-venue.off.cjs`, preloaded into the CLI), which is the drawing the engine
 * made before chart text followed the venue. Each slide's chart text is then measured in Chromium at 1280 × 720 (an
 * SVG run's size is its font size times its screen matrix, as tools/type-voice-audit.mjs measures it), and the shipped
 * slide must hold, against the old one:
 *
 *   - no smaller text: its smallest run is not smaller (0.3 px of rounding allowed);
 *   - no name lost: no more runs cut to "…", and no word the old drawing printed missing (a dropped label);
 *   - no new collision: no more pairs of text boxes overlapping by more than 25% of the smaller one;
 *   - nothing new off the slide.
 *
 * FALSIFIABLE: on the first cut of this change (dade0d6) the bar gallery's "Every unit named in full" slide printed
 * 4 of 8 names with "…" at hall, a heatmap printed 74 overlapping pairs, and a grouped bar's key shrank 18.7 → 14.6 px.
 * Deterministic (HARD RULE #32): it waits on `document.fonts.ready`, compares sizes and counts, never timings.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'lattice.js');
const OFF = path.join(__dirname, 'chart-text-venue.off.cjs');
const KINDS = path.join(ROOT, 'lib/plugins/chart-family/kinds');
const COVERED = ['bar', 'ep-curve', 'funnel', 'heatmap', 'histogram', 'line', 'stacked-bar', 'waterfall', 'scatter', 'piechart', 'radar'];
const VENUES = ['laptop', 'huddle', 'conference', 'hall'];
const SIZES = { landscape: [], portrait: ['size: portrait'], square: ['size: square'], standard: ['size: standard'] };

/** Every slide of a kind's gallery that draws a chart. */
function gallerySlides(kind) {
  const src = fs.readFileSync(path.join(KINDS, kind, `${kind}.gallery.md`), 'utf8').replace(/\r/g, '');
  return src.split(/\n---\n/).slice(1).filter((s) => s.includes('_class:') && !s.includes('_class: title')).map((s) => s.trim());
}

/** Per chart slide: smallest run, run count, "…" count, overlapping pairs, runs off the slide. */
function measure() {
  return [...document.querySelectorAll('section')].filter((s) => s.querySelector('.chart-body')).map((sec) => {
    const sb = sec.getBoundingClientRect();
    const scale = sb.width / (sec.offsetWidth || sb.width);
    const runs = [];
    for (const el of sec.querySelectorAll('.chart-body *')) {
      if (el.closest('.chart-sr-table,.chart-sr-only,.sr-only,style,script,title,desc,template')) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      let px = parseFloat(cs.fontSize);
      if (el instanceof SVGElement && el.getScreenCTM) { const m = el.getScreenCTM(); px *= Math.hypot(m.a, m.b); }
      // Own text only: a wrapped label's lines are its <tspan>s, so a parent <text> would count them twice.
      const full = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
      runs.push({ t: el.textContent.trim().slice(0, 24), full, px: px / scale, b: [b.left, b.top, b.right, b.bottom] });
    }
    let overlaps = 0;
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i].b;
        const c = runs[j].b;
        const w = Math.min(a[2], c[2]) - Math.max(a[0], c[0]);
        const h = Math.min(a[3], c[3]) - Math.max(a[1], c[1]);
        const small = Math.min((a[2] - a[0]) * (a[3] - a[1]), (c[2] - c[0]) * (c[3] - c[1]));
        if (w > 1 && h > 1 && w * h > 0.25 * small) overlaps += 1;
      }
    }
    const off = runs.filter((r) => r.b[2] > sb.right + 1 || r.b[3] > sb.bottom + 1 || r.b[0] < sb.left - 1 || r.b[1] < sb.top - 1).length;
    const least = runs.reduce((m, r) => (m && m.px <= r.px ? m : r), null);
    return {
      title: sec.querySelector('h2')?.textContent?.slice(0, 48) || '',
      min: least ? least.px : null, minText: least ? least.t : '',
      words: runs.flatMap((r) => r.full.split(/\s+/)).filter(Boolean), cut: runs.filter((r) => r.t.includes('…')).length, overlaps, off,
    };
  });
}

describe('chart text follows the venue without costing a label', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chart-venue-reg-'));
  const results = {};
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const body = COVERED.flatMap(gallerySlides).join('\n\n---\n\n');
    for (const [size, fm] of Object.entries(SIZES)) {
      for (const venue of VENUES) {
        const md = path.join(dir, `${size}-${venue}.md`);
        fs.writeFileSync(md, ['---', 'theme: cuoio', 'paginate: true', 'header: "Northwind · Board review"',
          'meta: "Q3 2026 · Finance"', 'footer: "Confidential"', `venue: ${venue}`, ...fm, '---', '', body, ''].join('\n'));
        const pair = {};
        for (const [arm, pre] of [['shipped', []], ['old', ['-r', OFF]]]) {
          const html = path.join(dir, `${size}-${venue}-${arm}.html`);
          const r = spawnSync(process.execPath, [...pre, CLI, md, html, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
          assert.equal(r.status, 0, `${size} ${venue} ${arm}: ${r.stderr}`);
          const page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 720 });
          await page.goto(`file://${html}`, { timeout: 300000 });
          await page.evaluate(() => document.fonts.ready);
          pair[arm] = await page.evaluate(measure);
          await page.close();
        }
        results[`${size} ${venue}`] = pair;
      }
    }
  });
  after(async () => { await browser?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  for (const size of Object.keys(SIZES)) {
    for (const venue of VENUES) {
      test(`${size} at ${venue}: no smaller text, no lost name, no new collision, nothing off the slide`, () => {
        const { shipped, old } = results[`${size} ${venue}`];
        assert.equal(shipped.length, old.length, 'the same chart slides');
        const faults = [];
        shipped.forEach((s, i) => {
          const o = old[i];
          const at = `slide ${i + 1} "${s.title}"`;
          if (s.min != null && o.min != null && s.min < o.min - 0.3) faults.push(`${at}: "${s.minText}" ${o.min.toFixed(1)} → ${s.min.toFixed(1)} px`);
          if (s.cut > o.cut) faults.push(`${at}: ${o.cut} → ${s.cut} names cut to "…"`);
          // A word the old drawing printed that the shipped one does not: a dropped or cut label. Words, not runs, so a
          // label that wraps onto fewer lines in a wider canvas is not counted as lost.
          const left = new Map();
          for (const w of s.words) left.set(w, (left.get(w) || 0) + 1);
          // A word the old drawing had already cut ("Attritio…") is not a name it printed in full.
          const lost = o.words.filter((w) => { if (w.includes('\u2026')) return false; const n = left.get(w) || 0; if (n) left.set(w, n - 1); return !n; });
          if (lost.length) faults.push(`${at}: lost ${lost.slice(0, 6).join(' ')}`);
          if (s.overlaps > o.overlaps) faults.push(`${at}: ${o.overlaps} → ${s.overlaps} overlapping text pairs`);
          if (s.off > o.off) faults.push(`${at}: ${o.off} → ${s.off} runs off the slide`);
        });
        assert.deepEqual(faults, []);
      });
    }
  }
});
