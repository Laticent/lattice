#!/usr/bin/env node
/**
 * tools/check-diagram-labels.js — #1674's verification harness.
 *
 * Answers the two questions the issue's acceptance criteria are written in, against a
 * REAL exported artifact rather than a fixture (HARD RULE #23):
 *
 *   1. WHAT FACE is each diagram label actually in?  `getComputedStyle().fontFamily`
 *      on every `text` / `tspan` / label element inside every `.mermaid-svg`.
 *   2. WAS IT MEASURED IN THE FACE IT IS PAINTED IN?  Mermaid sizes a label's
 *      `<foreignObject>` from the width it measures, then the deck paints the label
 *      inside it. When both happen in the same face those two widths are EQUAL — 0.00
 *      apart, not approximately. When the render page lacked the face, the box was sized
 *      against a fallback and the difference is non-zero in whichever direction that
 *      fallback happened to fall.
 *
 *      THE FIRST VERSION OF THIS CHECK WAS DEGENERATE and reported "0 clipped" for every
 *      deck ever run through it, including a deliberately broken one. It compared
 *      `scrollWidth` to `clientWidth` on the label — but mermaid's `.nodeLabel` is a
 *      `display: inline` span, where both are always 0. The adversarial trio's red team
 *      caught it. `getBoundingClientRect()` is the measure that works on an inline box.
 *
 *      Measured on the same flowchart, host page carrying the faces either way:
 *        fonts injected  → span 180.84 / fO 180.84 → 0.00, 0.00
 *        fonts suppressed → span 180.84 / fO 183.30 → 2.45, 4.33
 *
 *      Note the direction: with the full `--sketch-font-body` stack the un-injected
 *      fallback (system-ui) is WIDER than the hand face, so the box comes out slack
 *      rather than clipped. A bare family name with no fallback falls to a narrower
 *      default and clips instead ("Raw Signals" → "Raw Signa"). Which symptom you get
 *      depends on the render host's installed fonts, which is the real argument for the
 *      fix: the geometry was not wrong in a fixed direction, it was nondeterministic.
 *
 *   3. IS IT A FACE THE DECK ASKED FOR?  Added after `mode: sketch` was found reaching
 *      only some families: C4, journey, sequence and timeline carry their own
 *      `*FontFamily` config keys, defaulted to Open Sans / trebuchet ms, which the global
 *      `themeVariables.fontFamily` does not touch. A C4 slide on a sketch deck came back
 *      with 33 of 34 labels in Open Sans. The census had been printing that all along and
 *      it took a human reading the PDF to notice, so it is a failure now, not a line of
 *      output.
 *
 *   4. DID EVERY DIAGRAM RENDER AT ALL?  Added after the #1674 adversarial review, which
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
          const fo = el.closest('foreignObject');
          // getBoundingClientRect, NOT scrollWidth/clientWidth — see the header. An
          // inline span reports 0 for both, which made this check vacuous.
          const painted = el.getBoundingClientRect().width;
          const box = fo ? fo.getBoundingClientRect().width : 0;
          // TWO KINDS OF BOX, and only one is sized from the text. A class diagram's
          // CARDINALITY markers ("1", "0..*") live under `g.edgeTerminals`, and mermaid
          // gives those a fixed minimum width — measured, "1" paints 2.76 into a 5.4 box —
          // so equality cannot hold there and demanding it reports a defect that is not
          // one. They get an OVERFLOW-only test, which still catches a marker too big for
          // its box; every other label keeps exact equality, which is the sharper signal.
          //
          // `g.edgeTerminals`, not `g.inner`: only some of them carry the intervening
          // `g.inner`, so keying on that left half the markers still flagged.
          const padded = !!el.closest('g.edgeTerminals');
          const delta = padded
            ? Math.max(0, painted - box)   // slack is mermaid's padding, not our bug
            : Math.abs(painted - box);     // sized from the text: any gap is a face mismatch
          out.push({
            diagram: di, kind: padded ? 'html-padded' : 'html', text,
            font: getComputedStyle(el).fontFamily,
            content: +painted.toFixed(2), box: +box.toFixed(2),
            overflow: +delta.toFixed(2),
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
      // A FACE THE DECK NEVER ASKED FOR is the failure `mode: sketch` is supposed to make
      // impossible, and it hid behind the census for a whole review round: C4 and journey
      // carry their own `*FontFamily` config keys defaulted to Open Sans / trebuchet ms,
      // so 33 of 34 labels on a C4 slide rendered in Open Sans while every other word on
      // the slide was hand-drawn. Nothing failed — the census printed it and nobody read
      // it. Name mermaid's own defaults and fail on them.
      const MERMAID_DEFAULT_FACES = /^(?:"?Open Sans"?|"?trebuchet ms"?|verdana|arial|Times New Roman)$/i;
      for (const r of rows) {
        faces.set(r.font, (faces.get(r.font) || 0) + 1);
        if (r.overflow !== null && r.overflow > 0.5) {
          clipped++;
          console.log(`  MISMEASURED  d${r.diagram} "${r.text}" painted=${r.content} box=${r.box} off by ${r.overflow}`);
        }
      }
      for (const d of degraded) console.log(`  DEGRADED  a diagram did not render: ${d}…`);
      const foreign = rows.filter((r) => MERMAID_DEFAULT_FACES.test(String(r.font).split(',')[0].trim()));
      if (foreign.length) {
        const byFace = new Map();
        for (const r of foreign) byFace.set(r.font.split(',')[0], (byFace.get(r.font.split(',')[0]) || 0) + 1);
        for (const [face, n] of byFace) {
          console.log(`  FOREIGN FACE  ${n} label(s) in ${face} — a mermaid default, not a deck face`);
        }
      }
      console.log(`diagrams degraded: ${degraded.length}   labels: ${rows.length}   `
        + `mismeasured: ${clipped}   foreign-face: ${foreign.length}`);
      for (const [f, n] of [...faces].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
      if (clipped || degraded.length || foreign.length) process.exitCode = 1;
    }
  } finally { await browser.close(); }
}
main();
