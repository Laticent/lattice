#!/usr/bin/env node
/**
 * state-chart-label-probe — does any state-chart edge label touch another label, a line, a node, or the edge of its drawing?
 *
 * Loads an exported deck's HTML in Chromium at the slide's own canvas size, waits for the
 * state-chart layout pass, and for every painted edge label (`.state-edge-label`) reports
 * each collision it finds:
 *
 *   label x label     two label boxes overlap
 *   label x line      a drawn edge (`path.state-edge`, sampled along its length) crosses
 *                     the label's box, the label's own edge included
 *   label x node      the label's box overlaps a state's tile
 *   outside viewBox   the label's box leaves the SVG's viewBox, where `.chart-body` clips
 *
 * Boxes are `getBBox()`, the glyph box without the halo, so a hit is a real touch and not a
 * near miss. Built for #2355's follow-ups (followups.d 2355-p3: dagre label crowding and the
 * portrait type floor), where it measured 30 hits across the 14 state-chart decks before
 * those fixes and 16 after.
 *
 * Usage:
 *   node lattice-emulator.js deck.md out.html
 *   node tools/state-chart-label-probe.js out.html [width height]   # default 1280 720
 *
 * Prints one JSON row per state-chart slide: `{ si, labels, hits: [...] }`. Exits 1 when any
 * slide has a hit, 0 when none, 2 when Chromium cannot start. On-demand; not a gate.
 */
const path = require('node:path');

async function main() {
  const [file, W = '1280', H = '720'] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/state-chart-label-probe.js <deck.html> [width height]');
    process.exit(2);
  }
  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  } catch (err) {
    console.error(`state-chart-label-probe: no Chromium (${err.message}); set CHROME_PATH`);
    process.exit(2);
  }
  const page = await browser.newPage();
  await page.setViewport({ width: +W, height: +H });
  await page.goto('file://' + path.resolve(file));
  await new Promise((r) => setTimeout(r, 2500));
  const rows = await page.evaluate(() => [...document.querySelectorAll('section.state-chart')].map((s, si) => {
    const svg = s.querySelector('svg.state-chart-edges');
    if (!svg) return { si, labels: 0, hits: [] };
    const labs = [...svg.querySelectorAll('.state-edge-label')].map((t) => {
      const bb = t.getBBox();
      return { t: t.textContent, x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    });
    const paths = [...svg.querySelectorAll('path.state-edge')].map((pp) => {
      const L = pp.getTotalLength();
      const pts = [];
      for (let i = 0; i <= 200; i++) { const q = pp.getPointAtLength((L * i) / 200); pts.push([q.x, q.y]); }
      return { d: pp.getAttribute('data-dir'), pts };
    });
    const nodes = [...svg.querySelectorAll('.state-node-shape')].map((r) => r.getBBox());
    const hits = [];
    const vb = svg.viewBox.baseVal;
    const ov = (a, c) => a.x < c.x + c.width && c.x < a.x + a.w && a.y < c.y + c.height && c.y < a.y + a.h;
    labs.forEach((a, i) => {
      if (vb?.width && (a.x < vb.x - 0.5 || a.y < vb.y - 0.5 || a.x + a.w > vb.x + vb.width + 0.5 || a.y + a.h > vb.y + vb.height + 0.5)) {
        hits.push(`label "${a.t}" outside viewBox`);
      }
      labs.forEach((c, j) => { if (j > i && ov(a, { x: c.x, y: c.y, width: c.w, height: c.h })) hits.push(`label "${a.t}" x label "${c.t}"`); });
      paths.forEach((pp, k) => {
        if (pp.pts.some(([x, y]) => x > a.x && x < a.x + a.w && y > a.y + 1 && y < a.y + a.h - 1)) hits.push(`label "${a.t}" x line ${k}(${pp.d})`);
      });
      nodes.forEach((n) => { if (ov(a, n)) hits.push(`label "${a.t}" x node`); });
    });
    return { si, labels: labs.length, hits };
  }));
  await browser.close();
  for (const r of rows) console.log(JSON.stringify(r));
  process.exit(rows.some((r) => r.hits.length) ? 1 : 0);
}

main();
