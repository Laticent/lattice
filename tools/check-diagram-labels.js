#!/usr/bin/env node
/**
 * tools/check-diagram-labels.js — #1674's verification harness.
 *
 * Answers the two questions the issue's acceptance criteria are written in, against a
 * REAL exported artifact rather than a fixture (HARD RULE #23):
 *
 *   1. WHAT FACE is each diagram label actually in?  `getComputedStyle().fontFamily`
 *      on every `text` / `tspan` / label element inside every `.mermaid-svg`.
 *   2. IS IT CLIPPED?  The failure the old measure/paint split produced. Compared two
 *      ways, because a Mermaid label can be either an SVG `<text>` or an HTML
 *      `<foreignObject>` span: `getComputedTextLength()` against the node box for the
 *      former, `scrollWidth` against `clientWidth` for the latter.
 *
 *   3. DID EVERY DIAGRAM RENDER AT ALL?  Added after the #1674 adversarial review, which
 *      found the first two questions structurally blind to the worst failure: a diagram
 *      that never rendered has no `.mermaid-svg` wrapper, so it is a MISSING ROW rather
 *      than a red one, and a harness that counts labels reports "0 clipped" for a deck
 *      that lost a diagram entirely. That is exactly how two dropped renderer
 *      registrations survived a green verification pass. `<pre class="mermaid-fallback">`
 *      is the engine's degradation marker; any of them is a failure.
 *
 * Usage:  node tools/check-diagram-labels.js <deck.html> [--json]
 *
 * Exits non-zero when a label overflows its box OR a diagram degraded, so it can gate as
 * well as report.
 */
const path = require('node:path');
const url = require('node:url');

async function main() {
  const file = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!file) { console.error('usage: check-diagram-labels.js <deck.html> [--json]'); process.exit(2); }
  const puppeteer = require('puppeteer');
  const launch = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.goto(url.pathToFileURL(path.resolve(file)).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const degraded = await page.evaluate(() =>
      [...document.querySelectorAll('pre.mermaid-fallback')]
        .map((el) => (el.textContent || '').trim().split('\n')[0].slice(0, 60)));
    const rows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.mermaid-svg').forEach((wrap, di) => {
        const svg = wrap.querySelector('svg');
        if (!svg) return;
        // HTML labels (foreignObject) — the flowchart/state/class/ER default.
        wrap.querySelectorAll('foreignObject .nodeLabel, foreignObject .edgeLabel').forEach((el) => {
          const text = (el.textContent || '').trim();
          if (!text) return;
          out.push({
            diagram: di, kind: 'html', text,
            font: getComputedStyle(el).fontFamily,
            content: el.scrollWidth, box: el.clientWidth,
            overflow: +(el.scrollWidth - el.clientWidth).toFixed(2),
          });
        });
        // SVG <text> labels — sequence, gantt, pie, journey, the legacy renderers.
        svg.querySelectorAll('text').forEach((el) => {
          const text = (el.textContent || '').trim();
          if (!text || el.closest('foreignObject')) return;
          let len = 0;
          try { len = el.getComputedTextLength(); } catch (_e) { return; }
          out.push({
            diagram: di, kind: 'svg', text,
            font: getComputedStyle(el).fontFamily,
            content: +len.toFixed(2), box: null, overflow: null,
          });
        });
      });
      return out;
    });
    if (asJson) { console.log(JSON.stringify({ labels: rows, degraded }, null, 2)); }
    else {
      const faces = new Map();
      let clipped = 0;
      for (const r of rows) {
        faces.set(r.font, (faces.get(r.font) || 0) + 1);
        if (r.overflow !== null && r.overflow > 0.5) {
          clipped++;
          console.log(`  CLIPPED  d${r.diagram} "${r.text}" content=${r.content} box=${r.box} over=${r.overflow}`);
        }
      }
      for (const d of degraded) console.log(`  DEGRADED  a diagram did not render: ${d}…`);
      console.log(`diagrams degraded: ${degraded.length}   labels: ${rows.length}   clipped: ${clipped}`);
      for (const [f, n] of [...faces].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
      if (clipped || degraded.length) process.exitCode = 1;
    }
  } finally { await browser.close(); }
}
main();
