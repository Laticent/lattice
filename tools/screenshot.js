#!/usr/bin/env node
/**
 * Screenshot a URL to a PNG with the puppeteer-cached Chromium.
 *
 * This is how an agent (or a dev) VISUALLY VERIFIES the docs site / Drawing
 * Board / Workbench in a headless cloud sandbox — yes, that works here. See
 * engineering/development.md § "Previewing the docs site (Astro) + screenshots"
 * and CLAUDE.md § "Screenshotting the live docs site" for the full loop
 * (start the dev server, then run this), and gotchas.md for the traps.
 *
 * Usage:
 *   node tools/screenshot.js <url> <out.png> [--width N] [--height N]
 *                                            [--full] [--wait <css-selector>]
 *                                            [--delay <ms>] [--storage k=v]
 *
 * Example (after starting the docs dev server on :4321):
 *   node tools/screenshot.js http://127.0.0.1:4321/studio/ \
 *     .scratch/studio.png --width 1440 --height 900
 *
 * `--storage k=v` (repeatable) seeds localStorage BEFORE the first navigation, so
 * the page's own pre-paint script reads it and the shot is of a settled page rather
 * than one caught mid-switch. That is the only way to photograph the docs site on a
 * NON-DEFAULT palette: the palette lives in `lattice-docs-palette` (and the mode in
 * `lattice-docs-mode`), and no route takes it as a query parameter —
 *   --storage lattice-docs-palette=onyx --storage lattice-docs-mode=dark
 * Toggling it after load instead photographs a page that has already painted cuoio,
 * which is a different picture on any surface with a transition.
 *
 * Then view the PNG with the Read tool (it renders inline) or SendUserFile.
 *
 * Chromium resolution: CHROME_PATH env wins; otherwise the puppeteer cache at
 * ~/.cache/puppeteer/chrome/<platform>/chrome-linux64/chrome (or puppeteer's
 * own default). --no-sandbox is set because the sandbox container runs as root.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('./lib/resolve-chrome');

function parseArgs(argv) {
  const a = { width: 1440, height: 900, full: false, wait: null, delay: 0, storage: [] };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--full') a.full = true;
    else if (t === '--width') a.width = Number(argv[++i]);
    else if (t === '--height') a.height = Number(argv[++i]);
    else if (t === '--wait') a.wait = argv[++i];
    else if (t === '--delay') a.delay = Number(argv[++i]);
    else if (t === '--storage') {
      const pair = argv[++i] ?? '';
      const eq = pair.indexOf('=');
      if (eq < 1) { console.error(`--storage wants key=value, got ${JSON.stringify(pair)}`); process.exit(2); }
      a.storage.push([pair.slice(0, eq), pair.slice(eq + 1)]);
    }
    else pos.push(t);
  }
  a.url = pos[0];
  a.out = pos[1];
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.url || !a.out) {
    console.error('usage: node tools/screenshot.js <url> <out.png> [--width N] [--height N] [--full] [--wait <sel>] [--delay <ms>] [--storage k=v]');
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: a.width, height: a.height, deviceScaleFactor: 1 });
    // Seeded on EVERY document, before any of its script runs — the page's own
    // pre-paint seed is what reads these, so writing them after `goto` would be too late.
    if (a.storage.length) {
      await page.evaluateOnNewDocument((pairs) => {
        try { for (const [k, v] of pairs) localStorage.setItem(k, v); } catch { /* storage disabled */ }
      }, a.storage);
    }
    await page.goto(a.url, { waitUntil: 'networkidle0', timeout: 60000 });
    if (a.wait) await page.waitForSelector(a.wait, { timeout: 30000 });
    if (a.delay) await new Promise(r => setTimeout(r, a.delay));
    await page.screenshot({ path: a.out, fullPage: a.full });
    const { size } = fs.statSync(a.out);
    console.log(`screenshot: ${a.out} (${a.width}x${a.height}${a.full ? ', full-page' : ''}, ${size} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('screenshot failed:', e.message);
  process.exit(1);
});
