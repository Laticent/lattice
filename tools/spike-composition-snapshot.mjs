#!/usr/bin/env node

/**
 * SPIKE — not production tooling. The measurement harness behind
 * engineering/decisions/2026-08-18-golden-corpus-purpose-and-medium.md §5.
 *
 * It exists so that note's numbers are AUDITABLE. The first cut of that note
 * quoted snapshot sizes, extraction times and sensitivity diffs from a harness
 * that was never committed, so no reviewer could re-run any of it — the largest
 * unverified surface in the note, and one §8 failed to list. The trio's
 * independent checker flagged it (HARD RULE #23: a verification claim names its
 * surface and carries an artifact from it).
 *
 * WHAT IT DOES. Loads an already-rendered deck `.html` sidecar in headless
 * Chromium and emits one text line per laid-out element:
 *
 *     s001 h1 [556.5,319.5,167,84.75] :: rgb(255,255,255)|rgba(0,0,0,0)|64px|...
 *      |    |   |__ box, SLIDE-RELATIVE                  |__ resolved properties
 *      |    |__ tag + class chain
 *      |__ slide index
 *
 * Two channels on purpose: geometry before `::`, resolved style after. A color
 * token moves only the right-hand side; a length token moves only the left.
 *
 * KNOWN LIMITS — measured, not guessed. Do not read a green diff as "nothing
 * changed":
 *   · TEXT-BLIND. `"stating"` -> `"statign"` (same glyph multiset, same width)
 *     produces ZERO differing rows while the PDF bytes move. A transformer that
 *     reorders or truncates text at constant width is invisible here.
 *   · SCREEN MEDIA, not print. `page.pdf()` renders under print emulation, where
 *     lib/base/base.finish.css flips the whole finish system to its `-opaque`
 *     mirrors. Pass --print to emulate; the deltas then land in `background-image`
 *     and `clip-path`, which this property set does not carry.
 *   · SVG paint servers invisible. The a11y/print texture `<pattern>` defs live in
 *     a zero-size <svg> outside every <section>, so a per-slide walk never sees
 *     them. lib/core/accessibility-textures.js paints from LITERAL hex in JS.
 *   · Slide insertion still churns. Slide-relative coordinates (used here) do NOT
 *     fix it — the noise source is the slide-index key, not the origin.
 *   · Cross-host stability is UNVERIFIED. Asserted in the note's §5 table without
 *     measurement; the font stack resolves through three host-defined families.
 *
 * Usage:
 *   node tools/spike-composition-snapshot.mjs <deck.html> <out.snap> [--print]
 *   (the .html sidecar is written next to the .pdf by lattice-emulator.js)
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const PROPS = [
  'color', 'background-color', 'font-size', 'font-weight', 'font-family',
  'border-top-width', 'border-left-color', 'padding-top', 'padding-left',
  'gap', 'opacity',
];

const [htmlPath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PRINT = process.argv.includes('--print');

if (!htmlPath || !outPath) {
  process.stderr.write('usage: spike-composition-snapshot.mjs <deck.html> <out.snap> [--print]\n');
  process.exit(2);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  if (PRINT) await page.emulateMediaType('print');
  await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: 'load' });
  // Mirror the emulator's explicit force-load: `waitUntil` is not what makes the
  // fonts correct (lattice-emulator.js, after each navigation).
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
    await document.fonts.ready;
  });

  const rows = await page.evaluate((props) => {
    const out = [];
    [...document.querySelectorAll('section')].forEach((sec, si) => {
      const origin = sec.getBoundingClientRect();
      [sec, ...sec.querySelectorAll('*')].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const cs = getComputedStyle(el);
        const cls = typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        // Slide-relative, quarter-pixel quantized.
        const q = (n) => Math.round(n * 4) / 4;
        const box = [q(r.x - origin.x), q(r.y - origin.y), q(r.width), q(r.height)].join(',');
        const style = props.map((p) => cs.getPropertyValue(p).trim()).join('|');
        out.push(`s${String(si + 1).padStart(3, '0')} ${el.tagName.toLowerCase()}${cls} [${box}] :: ${style}`);
      });
    });
    return out;
  }, PROPS);

  fs.writeFileSync(outPath, `${rows.join('\n')}\n`);
  process.stdout.write(`${rows.length} rows -> ${outPath} (${fs.statSync(outPath).size} bytes${PRINT ? ', print media' : ''})\n`);
} finally {
  await browser.close();
}
