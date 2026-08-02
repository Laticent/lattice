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
 *                                            [--delay <ms>]
 *
 * Example (after starting the docs dev server on :4321):
 *   node tools/screenshot.js http://127.0.0.1:4321/studio/ \
 *     .scratch/studio.png --width 1440 --height 900
 *
 * Then view the PNG with the Read tool (it renders inline) or SendUserFile.
 *
 * Chromium resolution: CHROME_PATH env wins; otherwise the puppeteer cache at
 * ~/.cache/puppeteer/chrome/<platform>/chrome-linux64/chrome (or puppeteer's
 * own default). --no-sandbox is set because the sandbox container runs as root.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

function parseArgs(argv) {
  const a = { width: 1440, height: 900, full: false, wait: null, delay: 0 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--full') a.full = true;
    else if (t === '--width') a.width = Number(argv[++i]);
    else if (t === '--height') a.height = Number(argv[++i]);
    else if (t === '--wait') a.wait = argv[++i];
    else if (t === '--delay') a.delay = Number(argv[++i]);
    else pos.push(t);
  }
  a.url = pos[0];
  a.out = pos[1];
  return a;
}

/** Best-effort path to a Chromium the sandbox already has. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const cacheRoots = [
    path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'),
    '/root/.cache/puppeteer/chrome',
  ];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    const builds = fs
      .readdirSync(root)
      .filter(d => d.startsWith('linux-'))
      .sort(); // lexical sort ≈ newest build last
    for (const build of builds.reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined; // let puppeteer fall back to its own default
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.url || !a.out) {
    console.error('usage: node tools/screenshot.js <url> <out.png> [--width N] [--height N] [--full] [--wait <sel>] [--delay <ms>]');
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
