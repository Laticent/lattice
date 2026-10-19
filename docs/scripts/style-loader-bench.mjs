#!/usr/bin/env node
/**
 * What the Playground's on-demand style loader changes for the FIRST SLIDE, cold and warm.
 *
 * For each deck, on each engine, in each mode (`?styles=full`, the whole `lattice.css`, and the
 * loader), it loads the real Playground and records:
 *   - style bytes the page fetched (the index and modules, or the whole sheet), raw and on the wire;
 *   - requests for them;
 *   - milliseconds from navigation start to the first slide in the preview frame being STYLED (its
 *     computed `container-type` is `size`, the base rule every slide needs);
 *   - the same page loaded a second time in the same browser context, with the HTTP cache warm.
 * Each number is the median of `--runs` fresh contexts. The harness is the evidence HARD RULE #19 asks
 * for on a performance change; `tools/style-baseline.mjs` is the sheet-side baseline it is read against
 * (engineering/decisions/2026-10-18-on-demand-styles.md §2 and §11).
 *
 * Usage (from docs/, with the site served: `npm run build:e2e && npm run preview:e2e`):
 *   node scripts/style-loader-bench.mjs [--engine chromium|webkit] [--runs 5] [--base http://localhost:4321]
 *                                       [--throttle cable|4g] [--json out.json] [deck.md ...]
 * `--throttle` (Chromium only) shapes the network through the DevTools protocol: `cable` is 5 Mbps down,
 * 28 ms round trip; `4g` is 1.6 Mbps, 150 ms. On loopback bytes are nearly free, so the unthrottled
 * numbers show the engine's own cost and hide the trade the loader makes (fewer bytes, more round trips).
 * Decks default to examples/focus.md (14 slides) and the 120-slide gallery. Not a gate: wall-clock
 * time on a shared box is noise, so nothing here fails; read the bytes first and the times second.
 * Linux engines only; real iOS is not measured (HARD RULE #23).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const valueArgs = new Set(['--engine', '--runs', '--base', '--json', '--throttle']);
const decks = argv.filter((a, i) => !a.startsWith('--') && !valueArgs.has(argv[i - 1]));
if (!decks.length) decks.push('examples/focus.md', 'test/integration/baseline-decks/gallery.md');
const engineName = opt('--engine', 'chromium');
const runs = Number(opt('--runs', '5'));
const PROFILES = {
  cable: { latency: 28, downloadThroughput: (5 * 1e6) / 8, uploadThroughput: (1 * 1e6) / 8 },
  '4g': { latency: 150, downloadThroughput: (1.6 * 1e6) / 8, uploadThroughput: (0.75 * 1e6) / 8 },
};
const throttle = opt('--throttle', '');
if (throttle && (!PROFILES[throttle] || engineName !== 'chromium')) {
  console.error('--throttle is cable or 4g, and Chromium only');
  process.exit(2);
}
const base = opt('--base', 'http://localhost:4321').replace(/\/$/, '');
const SOURCE_KEY = 'lattice-docs-pg-source';
const STYLE_ASSET = /\/playground\/v\/[^/]+\/(?:styles\/|themes\/lattice\.css)/;

const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function visit(page, mode) {
  await page.goto(`${base}/playground/${mode === 'full' ? '?styles=full' : ''}`, { waitUntil: 'domcontentloaded' });
  // Styled, not merely present: the first slide's computed container-type is `size`.
  const at = await page.waitForFunction(
    () => {
      for (const f of document.querySelectorAll('iframe')) {
        const s = f.contentDocument?.querySelector('.lattice > section');
        if (s && f.contentWindow.getComputedStyle(s).containerType === 'size') return performance.now();
      }
      return false;
    },
    null,
    { polling: 'raf', timeout: 90000 },
  );
  const ms = await at.jsonValue();
  // The loader's second pass can land after the first styled paint; let the page go quiet before counting bytes.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const res = await page.evaluate((re) => {
    const rx = new RegExp(re);
    return performance
      .getEntriesByType('resource')
      .filter((e) => rx.test(e.name))
      .map((e) => ({ wire: e.encodedBodySize, raw: e.decodedBodySize, transferred: e.transferSize }));
  }, STYLE_ASSET.source);
  return {
    ms,
    requests: res.length,
    raw: res.reduce((a, r) => a + r.raw, 0),
    wire: res.reduce((a, r) => a + r.wire, 0),
    network: res.filter((r) => r.transferred > 0).length,
  };
}

async function oneRun(browser, md, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([k, s]) => localStorage.setItem(k, s), [SOURCE_KEY, md]);
  const page = await ctx.newPage();
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[throttle] });
  }
  const cold = await visit(page, mode);
  const warm = await visit(page, mode);
  await ctx.close();
  return { cold, warm };
}

const browser = await (engineName === 'webkit' ? webkit : chromium).launch(engineName === 'chromium' ? { executablePath: process.env.CHROME_PATH || undefined } : {});
const out = [];
for (const deck of decks) {
  const md = fs.readFileSync(path.join(ROOT, deck), 'utf8');
  const row = { deck, engine: engineName, throttle: throttle || 'none' };
  for (const mode of ['full', 'loader']) {
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await oneRun(browser, md, mode));
    row[mode] = {
      coldMs: med(samples.map((s) => s.cold.ms)),
      warmMs: med(samples.map((s) => s.warm.ms)),
      requests: med(samples.map((s) => s.cold.requests)),
      raw: med(samples.map((s) => s.cold.raw)),
      wire: med(samples.map((s) => s.cold.wire)),
      warmNetwork: med(samples.map((s) => s.warm.network)),
    };
  }
  out.push(row);
  const f = row.full;
  const l = row.loader;
  console.log(
    `${engineName}${throttle ? ` (${throttle})` : ''} ${deck}\n` +
      `  bytes      whole ${kb(f.raw)} raw / ${kb(f.wire)} wire in ${f.requests} request(s);  loader ${kb(l.raw)} raw / ${kb(l.wire)} wire in ${l.requests} requests\n` +
      `  cold       whole ${Math.round(f.coldMs)} ms;  loader ${Math.round(l.coldMs)} ms  (first slide styled, median of ${runs})\n` +
      `  warm       whole ${Math.round(f.warmMs)} ms;  loader ${Math.round(l.warmMs)} ms  (same context, HTTP cache warm; ${l.warmNetwork} style request(s) hit the network)`,
  );
}
await browser.close();
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
