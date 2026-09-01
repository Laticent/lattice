#!/usr/bin/env node
/**
 * measure.mjs — the card-slack classifier, rebuilt.
 *
 * Loads each rendered HTML sidecar in real Chromium at the family's viewport and,
 * for every CARD inside `.cell-stage`, measures:
 *
 *   leading  = first in-flow child's top    − card's CONTENT-box top
 *   trailing = card's CONTENT-box bottom    − last in-flow child's bottom
 *
 * Three corrections the design notes paid for, all implemented here:
 *   1. the card's OWN padding + border are subtracted (content box, not border box) —
 *      not doing it put `stats` at 41% and `kpi` at 48% (composition note §4);
 *   2. `position: absolute|fixed` children are FILTERED — `decision`'s corner tag
 *      counted as flow content invented a square defect (§4b);
 *   3. children are banded into visual ROWS by pairwise-with-the-BAND overlap, not
 *      all-pairs overlap, so an n×m card grid is not skipped (alignment note §8).
 *
 * Emits one JSON record per card to stdout. No thresholds are applied here — the
 * classification is done in analyze.mjs so a threshold sweep costs no renders.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const VIEWPORT = {
  landscape: [1920, 1080],
  portrait: [1080, 1350],
  square: [1080, 1080],
};

const probe = () => {
  const num = (v) => Number.parseFloat(v) || 0;
  const OVERLAP = 0.5; // a child joins a band when it overlaps the band by >50% of the shorter height

  /**
   * Collect the in-flow content rects under a card, one level of BOX at a time.
   *
   * An element that generates NO BOX (`display: contents`, or any element whose
   * `getClientRects()` is empty while its children paint) is NOT content and is NOT
   * absent either — it is transparent, so the walk descends through it. Dropping it
   * instead loses everything under it: `list-tabular` wraps each row's body column in
   * a `display: contents` <ul>, so a first cut that filtered on "zero rects" measured
   * only the row's title and reported 58% trailing slack on a row that is visibly full.
   * That was instrument bug #4 in this line of work.
   */
  function collect(node, acc, depth) {
    if (node.nodeType === 3) {
      if (!node.nodeValue.trim()) return;
      const rg = document.createRange();
      rg.selectNodeContents(node);
      for (const r of rg.getClientRects()) if (r.width > 0 || r.height > 0) acc.rects.push(r);
      return;
    }
    if (node.nodeType !== 1) return;
    const cs = getComputedStyle(node);
    if (cs.display === 'none') return;
    if (cs.position === 'absolute' || cs.position === 'fixed') { acc.outOfFlow += 1; return; }
    const boxless = cs.display === 'contents' || node.getClientRects().length === 0;
    if (boxless) {
      if (depth < 8) for (const k of node.childNodes) collect(k, acc, depth + 1);
      return;
    }
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      if (depth < 8) for (const k of node.childNodes) collect(k, acc, depth + 1);
      return;
    }
    acc.rects.push(r);
  }

  /** In-flow child rects of a box, plus a count of the out-of-flow ones skipped. */
  function inFlowChildren(box) {
    const acc = { rects: [], outOfFlow: 0 };
    for (const n of box.childNodes) collect(n, acc, 0);
    return acc;
  }

  /**
   * Band a container's in-flow element children into visual ROWS.
   * A child joins the current band when it overlaps the band's vertical extent by
   * more than OVERLAP of the shorter of the two heights. Requiring every child to
   * overlap every OTHER child (the first cut in the alignment note) flattens an
   * n×m grid to "no row" and silently drops `matrix-2x2`, `verdict-grid`,
   * `cards-grid` — the majority of the interesting cases.
   */
  function bandRows(children) {
    const items = children
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((c) => c.r.width > 0 && c.r.height > 0)
      .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    const bands = [];
    for (const c of items) {
      const band = bands[bands.length - 1];
      if (band) {
        const bTop = Math.min(...band.map((m) => m.r.top));
        const bBot = Math.max(...band.map((m) => m.r.bottom));
        const ov = Math.min(bBot, c.r.bottom) - Math.max(bTop, c.r.top);
        const shorter = Math.min(bBot - bTop, c.r.height);
        if (shorter > 0 && ov / shorter > OVERLAP) { band.push(c); continue; }
      }
      bands.push([c]);
    }
    for (const b of bands) b.sort((a, z) => a.r.left - z.r.left);
    return bands;
  }

  const cards = [];
  const measureCard = (card, container, bands, meta) => {
    const cs = getComputedStyle(card);
    const ccs = getComputedStyle(container);
    const r = card.getBoundingClientRect();
    const cTop = r.top + num(cs.borderTopWidth) + num(cs.paddingTop);
    const cBot = r.bottom - num(cs.borderBottomWidth) - num(cs.paddingBottom);
    const H = cBot - cTop;
    const { rects, outOfFlow } = inFlowChildren(card);
    if (!rects.length || H <= 0) return null;
    const top = Math.min(...rects.map((x) => x.top));
    const bot = Math.max(...rects.map((x) => x.bottom));
    // INTERIOR void — the largest vertical gap BETWEEN the card's own content, after
    // merging overlapping rects. Leading/trailing slack is blind to it by construction:
    // a `pricing` card whose footer is flex-pushed to the bottom has trail ~0 and a
    // hole in the middle. Reported, never classified on.
    const merged = rects.map((x) => [x.top, x.bottom]).sort((a, b) => a[0] - b[0])
      .reduce((acc, seg) => {
        const last = acc[acc.length - 1];
        if (last && seg[0] <= last[1]) { last[1] = Math.max(last[1], seg[1]); return acc; }
        acc.push([...seg]); return acc;
      }, []);
    let maxGap = 0;
    for (let i = 1; i < merged.length; i += 1) maxGap = Math.max(maxGap, merged[i][0] - merged[i - 1][1]);
    let band = -1; let bandSize = 1; let idx = 0;
    bands.forEach((b, bi) => {
      const k = b.findIndex((m) => m.el === card);
      if (k >= 0) { band = bi; bandSize = b.length; idx = k; }
    });
    return {
      container: `${container.tagName.toLowerCase()}${container.className ? `.${String(container.className).trim().split(/\s+/).join('.')}` : ''}`,
      band, bandSize, idx,
      cardTag: card.tagName.toLowerCase(),
      H: +H.toFixed(2),
      cardH: +r.height.toFixed(2),
      lead: +(top - cTop).toFixed(2),
      trail: +(cBot - bot).toFixed(2),
      contentH: +(bot - top).toFixed(2),
      maxGap: +maxGap.toFixed(2),
      outOfFlow,
      justify: cs.justifyContent,
      display: cs.display,
      alignItems: ccs.alignItems,
      containerDisplay: ccs.display,
      ...meta,
    };
  };

  for (const sec of document.querySelectorAll('section')) {
    const component = (sec.dataset.class || sec.className || '').trim().split(/\s+/)[0] || '(none)';
    const family = sec.getAttribute('data-family') || '(wide)';
    const slide = +sec.id || 0;
    const stage = sec.querySelector('.cell-stage');
    if (!stage) continue;
    const seen = new Map();

    // ── SET L — the composition note's own instrument, verbatim:
    //    `.cell-stage > :is(ul, ol) > li`, unconditionally, row or column.
    for (const list of stage.children) {
      if (!/^(UL|OL)$/.test(list.tagName)) continue;
      const kids = [...list.children].filter((k) => {
        const cs = getComputedStyle(k);
        return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed'
          && k.getClientRects().length > 0;
      });
      const bands = bandRows(kids);
      for (const k of kids) {
        const rec = measureCard(k, list, bands, { setL: true, setB: false });
        if (rec) seen.set(k, rec);
      }
    }

    // ── SET B — the generalized banded-row detector. Walk the stage subtree; a
    // container qualifies when its in-flow element children band into a row of 2+.
    // Do NOT descend past a qualifying container: the outermost row is the card row.
    (function walk(el, depth) {
      if (depth > 8) return;
      const kids = [...el.children].filter((k) => {
        const cs = getComputedStyle(k);
        return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed'
          && k.getClientRects().length > 0;
      });
      const bands = kids.length >= 2 ? bandRows(kids) : [];
      if (bands.some((b) => b.length >= 2)) {
        for (const k of kids) {
          const prev = seen.get(k);
          if (prev) { prev.setB = true; continue; }
          const rec = measureCard(k, el, bands, { setL: false, setB: true });
          if (rec) seen.set(k, rec);
        }
        return;
      }
      for (const k of kids) walk(k, depth + 1);
    })(stage, 0);

    for (const rec of seen.values()) cards.push({ slide, component, family, ...rec });
  }
  return cards;
};

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('usage: measure.mjs <html-root>'); process.exit(2); }
const root = path.resolve(dirs[0]);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const rows = [];
for (const size of Object.keys(VIEWPORT)) {
  const dir = path.join(root, size);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT[size][0], height: VIEWPORT[size][1] });
    await page.goto(`file://${path.join(dir, f)}`, { waitUntil: 'networkidle0', timeout: 180_000 });
    const cards = await page.evaluate(probe);
    await page.close();
    for (const c of cards) rows.push({ size, deck: path.basename(f, '.html'), ...c });
    process.stderr.write(`\r${size}/${f} → ${cards.length} cards (total ${rows.length})            `);
  }
}
process.stderr.write('\n');
await browser.close();
process.stdout.write(JSON.stringify(rows));
