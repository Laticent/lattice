#!/usr/bin/env node
/**
 * bench-preview-diagrams — how long the LIVE PREVIEW takes to bake a deck's diagrams.
 *
 * WHY THIS EXISTS ALONGSIDE `npm run bench`. That harness drives the NODE render path
 * (`lib/playground/index.js`: markdown → HTML+CSS). The cost this measures is in
 * `lib/runtime/index.js`, which only runs in a browser: since #1332 step 3 the Mermaid
 * palette is resolved per BAND rather than once per document, so `mermaid.initialize`
 * runs per band and the 166 theme variables are read through a probe element per band.
 * No Node dataset can exercise that — there is no `getComputedStyle` to be slow — so
 * `engine-bench.mjs` is reported for the path it does cover and this covers the path
 * that changed (HARD RULE #19).
 *
 * WHAT IT REPORTS, from the real docs Playground:
 *   distinctBakedPalettes  how many distinct baked stylesheets the deck ended up with.
 *                          This is a CORRECTNESS number as much as a perf one: 1 on a
 *                          two-band deck means the deck-wide bake is back.
 *   firstPassMs            source applied → every fence out of `pending`.
 *   keystrokeRepassMs      the same after editing ONE diagram, which is the path the
 *                          150 ms debounce protects and where a per-slide rebuild would
 *                          be felt. Everything but the edited fence should come from the
 *                          (scope, source) cache.
 *
 * The deck ALTERNATES bands, which is the worst case for a per-band configure: every
 * slide is a new run, so the reconfigure count is maximal while the palette build count
 * must stay at 2.
 *
 * Needs the docs site running (`cd docs && npm run dev`) and a Chromium (CHROME_PATH).
 * Compare two arms by building each runtime, re-running `npm run sync:playground`, and
 * running this against both — head-vs-base on one machine is the only honest read.
 *
 * Usage:
 *   cd docs && npm run dev &
 *   node tools/bench-preview-diagrams.mjs [--url=http://localhost:4321] [--slides=20]
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = (process.argv.find((a) => a.startsWith('--url=')) || '--url=http://localhost:4321').slice(6);
const SLIDES = Number((process.argv.find((a) => a.startsWith('--slides=')) || '--slides=20').slice(9));
const MERMAID_LOCAL = path.join(process.cwd(), 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

// A deck that ALTERNATES bands, which is the worst case for a per-band configure:
// every slide is a new run, so the reconfigure count is maximal while the palette
// build count must stay at 2.
function deck(n) {
  const slides = [];
  for (let i = 0; i < n; i++) {
    const dark = i % 2 === 1;
    slides.push([
      `<!-- _class: diagram${dark ? ' dark' : ''} -->`,
      '',
      `## Slide ${i + 1}`,
      '',
      '```mermaid',
      'flowchart LR',
      `  subgraph G${i}`,
      `    A${i}[Alpha ${i}] --> B${i}[Bravo ${i}]`,
      '  end',
      '```',
      '',
    ].join('\n'));
  }
  return `---\nmarp: true\ntheme: onyx\n---\n\n${slides.join('\n---\n\n')}`;
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const mermaidJs = fs.readFileSync(MERMAID_LOCAL, 'utf8');
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('cdn.jsdelivr.net') && u.includes('mermaid')) {
    req.respond({ status: 200, contentType: 'application/javascript', body: mermaidJs });
    return;
  }
  req.continue();
});

// COUNT `mermaid.initialize` from the page side, before the runtime ever sees it.
// A property setter on `window.mermaid` wraps `initialize` as soon as the library
// installs itself, which is earlier than any polling could reach.
await page.evaluateOnNewDocument(() => {
  window.__llPerf = { initCalls: 0 };
  let real;
  Object.defineProperty(window, 'mermaid', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      if (v && typeof v.initialize === 'function' && !v.__llWrapped) {
        const orig = v.initialize.bind(v);
        v.initialize = (cfg) => { window.__llPerf.initCalls++; return orig(cfg); };
        v.__llWrapped = true;
      }
    },
  });
});

await page.goto(`${BASE}/playground/`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.mouse.click(71, 87); // pencil → editor
await new Promise((r) => setTimeout(r, 800));

const SRC = deck(SLIDES);
await page.evaluate((md) => {
  const cm = document.querySelector('.cm-content');
  cm.focus();
  document.execCommand?.('selectAll');
  const dt = new DataTransfer();
  dt.setData('text/plain', md);
  cm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, SRC);
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(35, 87); // eye → preview

/** Wait until every fence has left pending/rendering inside the deck frame. */
async function settle(expected) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    for (const f of [page, ...page.frames()]) {
      const st = await f
        .evaluate(() => ({
          svgs: document.querySelectorAll('.mermaid svg').length,
          busy: document.querySelectorAll('[data-mermaid-state="pending"],[data-mermaid-state="rendering"]').length,
        }))
        .catch(() => null);
      if (st && st.svgs >= expected && st.busy === 0) return f;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

const t0 = Date.now();
const scope = await settle(SLIDES);
const firstPassMs = Date.now() - t0;
if (!scope) {
  console.error('TIMED OUT waiting for the first render pass');
  await browser.close();
  process.exit(2);
}

const initCalls = await page.evaluate(() => window.__llPerf.initCalls);

// A KEYSTROKE: change one diagram's source, then time the re-render. This is the
// path the 150 ms debounce protects, and where a per-slide palette rebuild would be
// felt. Everything but the edited fence should come from the (scope, source) cache.
await page.mouse.click(71, 87);
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const cm = document.querySelector('.cm-content');
  cm.focus();
  document.execCommand?.('selectAll');
});
const EDITED = SRC.replace('Alpha 0', 'Alpha zero');
const tEditStart = Date.now();
await page.evaluate((md) => {
  const cm = document.querySelector('.cm-content');
  const dt = new DataTransfer();
  dt.setData('text/plain', md);
  cm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, EDITED);
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(35, 87);
const scope2 = await settle(SLIDES);
const editPassMs = Date.now() - tEditStart;
const initCallsAfterEdit = await page.evaluate(() => window.__llPerf.initCalls);

const bands = scope2
  ? await scope2.evaluate(() => {
      const digests = new Set();
      for (const svg of document.querySelectorAll('.mermaid svg')) {
        const baked = [...svg.querySelectorAll('style')].map((s) => s.textContent).join('').replace(/lattice-mermaid-\d+/g, 'ID');
        let h = 0;
        for (let i = 0; i < baked.length; i++) h = (h * 31 + baked.charCodeAt(i)) | 0;
        digests.add((h >>> 0).toString(16));
      }
      return digests.size;
    })
  : null;

console.log(JSON.stringify({
  slides: SLIDES,
  diagrams: SLIDES,
  bandsInDeck: 2,
  distinctBakedPalettes: bands,
  mermaidInitializeCalls_firstPass: initCalls,
  mermaidInitializeCalls_afterOneKeystroke: initCallsAfterEdit - initCalls,
  firstPassMs,
  keystrokeRepassMs: editPassMs,
}, null, 2));

await browser.close();
