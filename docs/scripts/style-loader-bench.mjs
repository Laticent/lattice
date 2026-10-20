#!/usr/bin/env node
/**
 * What the Playground's style-loading strategies cost for the FIRST SLIDE, cold and warm, with the request counts,
 * bytes and per-request latency behind each number.
 *
 * Arms (each a fresh browser context per run, so nothing is cached between runs):
 *   full     the default: one `lattice.css` request
 *   modules  `?styles=modules`: the index, then one request per style module (about 60 for a typical deck)
 *   floor    `?styles=floor`: the index, the start-up set as ONE prebuilt file, later modules one request each
 *   bundle   `?styles=bundle`: the same, and every later batch of modules as ONE request to a composing endpoint
 *
 * Per visit it records, from the Resource Timing entries of the style assets: requests, decoded bytes, bytes on the
 * wire, the protocol, the span from the first style request starting to the last one ending, and the median and
 * worst time to first byte; plus the milliseconds from navigation to the first slide being STYLED (its computed
 * `container-type` is `size`, the base rule every slide needs). Then the same page loads again in the same context
 * (HTTP cache warm). Each number is the median of `--runs` fresh contexts. Read the bytes and requests first and the
 * times second: wall-clock time on a shared box is noise, and nothing here fails.
 *
 * Needs a server for the built site. `astro preview` (HTTP/1.1, plain) serves `full` and `modules` only, because the
 * composing endpoint is not part of the site; `scripts/style-bench-server.mjs` serves all four over HTTP/1.1 or HTTP/2
 * with brotli, and is the one to use for a comparison:
 *
 *   node scripts/style-bench-server.mjs --port 4443 --proto h2 &    (prints `spki <hash>`; pass it as --spki)
 *   node scripts/style-loader-bench.mjs --base https://localhost:4443 --spki <hash> --label h2 [--engine chromium|webkit] [--runs 5]
 *        [--modes full,modules,floor,bundle] [--throttle cable|4g] [--no-preload|--with-preload] [--json out.json] [deck.md ...]
 *
 * `--throttle` (Chromium only) shapes the network through the DevTools protocol: `cable` is 5 Mbps down, 28 ms round
 * trip; `4g` is 1.6 Mbps, 150 ms. Loopback makes bytes nearly free, so the unthrottled rows show the engine's own cost
 * and hide the trade each strategy makes between bytes and round trips. The 4 s idle backstop (which fetches the whole
 * sheet) is outside the 1.5 s measurement window on purpose: the numbers are the first-slide cost.
 * Linux engines only; real iOS is not measured (HARD RULE #23).
 */
import fs from 'node:fs';
import https from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const valueArgs = new Set(['--engine', '--runs', '--base', '--json', '--throttle', '--modes', '--label', '--spki']);
const decks = argv.filter((a, i) => !a.startsWith('--') && !valueArgs.has(argv[i - 1]));
if (!decks.length) decks.push('examples/focus.md', 'examples/data-viz-gallery.md', 'test/integration/baseline-decks/gallery.md');
const engineName = opt('--engine', 'chromium');
const runs = Number(opt('--runs', '5'));
const modes = opt('--modes', 'full,modules,floor,bundle').split(',');
const label = opt('--label', '');
// `--no-preload` strips the page's head <link rel=modulepreload> and the script that adds them at first paint, before the browser sees it: the engine then starts from the idle
// callback as it did before followup 2794-p6, so one build gives both arms of the comparison.
const noPreload = argv.includes('--no-preload');
// An A/B run sends the document through the same Node fetch in BOTH arms (`--with-preload` keeps the links), so the only difference is the links.
const routeDoc = noPreload || argv.includes('--with-preload');
// The bench server's certificate hash, so Chromium treats a self-signed TLS origin as valid and caches (see style-bench-server.mjs).
const spki = opt('--spki', '');
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
// A mode is a fetch mode, optionally `+source` (guess the first render's modules from the Markdown) or `+oracle` (hand the loader
// the modules the rendered HTML really needs, an upper bound on what any guess can buy). e.g. `bundle+oracle`.
const query = (mode, oracle) => {
  if (mode === 'full') return '';
  const [fetchMode, guess] = mode.split('+');
  const predict = guess === 'source' ? '&predict=source' : guess === 'oracle' && oracle?.length ? `&predict=${oracle.join(',')}` : '';
  return `?styles=${fetchMode}${predict}`;
};

/** The module indexes beyond the start-up floor that a deck's rendered HTML needs (what a perfect guess would name). */
async function oracleIds(md) {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require(path.join(ROOT, 'node_modules/jsdom'));
  const engine = require(path.join(ROOT, 'lib/engine')).createEngine({});
  const { neededModules, scanDocument } = await import(path.join(ROOT, 'lib/core/style-needs-scan.mjs'));
  const { buildLatticeIndex, runtimeTokensFor } = require(path.join(ROOT, 'tools/style-needs-lattice.js'));
  const built = buildLatticeIndex({ verified: false });
  engine.addThemes([
    { name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice-min.css'), 'utf8') },
    { name: 'indaco', css: fs.readFileSync(path.join(ROOT, 'dist/themes/indaco-min.css'), 'utf8') },
  ]);
  const html = engine.render(md, 'indaco').html;
  const flags = neededModules(built.index, scanDocument(new JSDOM(html).window.document.documentElement), undefined, runtimeTokensFor(built.index));
  const floor = new Set(built.floor);
  built.index.forEach((m, i) => {
    if (m.always) floor.add(i);
  });
  for (const i of floor) for (const j of built.index[i].requires) floor.add(j);
  return flags.flatMap((f, i) => (f && !floor.has(i) ? [i] : []));
}

async function visit(page, mode, oracle) {
  await page.goto(`${base}/playground/${query(mode, oracle)}`, { waitUntil: 'domcontentloaded' });
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
  // The loader's second pass can land after the first styled paint; let the page go quiet before counting.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const res = await page.evaluate((re) => {
    const rx = new RegExp(re);
    return performance
      .getEntriesByType('resource')
      .filter((e) => rx.test(e.name))
      .map((e) => ({ start: e.startTime, end: e.responseEnd, ttfb: e.responseStart - e.requestStart, wire: e.encodedBodySize, raw: e.decodedBodySize, transferred: e.transferSize, proto: e.nextHopProtocol }));
  }, STYLE_ASSET.source);
  // When the engine bundle was first REQUESTED (ms from navigation): the figure followup 2794-p6 moves.
  const engineStart = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource').filter((x) => /\/esm\/engine\.js|lattice-playground\.js/.test(x.name));
    return e.length ? Math.min(...e.map((x) => x.startTime)) : 0;
  });
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  const start = Math.min(...res.map((r) => r.start));
  const end = Math.max(...res.map((r) => r.end));
  return {
    ms,
    engineStart,
    fcp,
    requests: res.length,
    raw: res.reduce((a, r) => a + r.raw, 0),
    wire: res.reduce((a, r) => a + r.wire, 0),
    span: res.length ? end - start : 0,
    ttfbMed: res.length ? med(res.map((r) => r.ttfb)) : 0,
    ttfbMax: res.length ? Math.max(...res.map((r) => r.ttfb)) : 0,
    network: res.filter((r) => r.transferred > 0).length,
    proto: res[0]?.proto || '',
  };
}

async function oneRun(browser, md, mode, oracle) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ignoreHTTPSErrors: engineName !== 'chromium' || !spki });
  await ctx.addInitScript(([k, s]) => localStorage.setItem(k, s), [SOURCE_KEY, md]);
  const page = await ctx.newPage();
  if (routeDoc) {
    // Playwright's own fetch does not trust the pinned certificate, so the document comes from Node with verification off.
    await page.route(/\/playground\/(\?.*)?$/, async (route) => {
      const html = await new Promise((resolve, reject) => {
        https
          .get(route.request().url(), { rejectUnauthorized: false }, (res) => {
            const parts = [];
            res.on('data', (c) => parts.push(c));
            res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
          })
          .on('error', reject);
      });
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: noPreload ? html.replace(/<link rel="modulepreload"[^>]*>/g, '').replace(/<script>[^<]*?engineWarm[\s\S]*?<\/script>/, '') : html });
    });
  }
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[throttle] });
  }
  const cold = await visit(page, mode, oracle);
  const warm = await visit(page, mode, oracle);
  await ctx.close();
  return { cold, warm };
}

const browser = await (engineName === 'webkit' ? webkit : chromium).launch(engineName === 'chromium' ? { executablePath: process.env.CHROME_PATH || undefined, args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] } : {});
const out = [];
for (const deck of decks) {
  const md = fs.readFileSync(path.join(ROOT, deck), 'utf8');
  const row = { deck, engine: engineName, throttle: throttle || 'none', label, modes: {} };
  const oracle = modes.some((m) => m.endsWith('+oracle')) ? await oracleIds(md) : [];
  for (const mode of modes) {
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await oneRun(browser, md, mode, oracle));
    const pick = (f) => med(samples.map(f));
    row.modes[mode] = {
      proto: samples[0].cold.proto,
      requests: pick((s) => s.cold.requests),
      raw: pick((s) => s.cold.raw),
      wire: pick((s) => s.cold.wire),
      spanMs: pick((s) => s.cold.span),
      ttfbMedMs: pick((s) => s.cold.ttfbMed),
      ttfbMaxMs: pick((s) => s.cold.ttfbMax),
      engineStartMs: pick((s) => s.cold.engineStart),
      fcpMs: pick((s) => s.cold.fcp),
      coldMs: pick((s) => s.cold.ms),
      warmMs: pick((s) => s.warm.ms),
      warmNetwork: pick((s) => s.warm.network),
    };
  }
  out.push(row);
  console.log(`\n${engineName}${throttle ? ` (${throttle})` : ''}${label ? ` [${label}]` : ''}  ${deck}  (median of ${runs})`);
  console.log('  arm            proto  reqs   raw      wire    fetch span  ttfb med/max   engine req at  FCP   first slide styled: cold   warm');
  for (const mode of modes) {
    const m = row.modes[mode];
    console.log(
      `  ${mode.padEnd(14)} ${String(m.proto).padEnd(5)} ${String(m.requests).padStart(4)}  ${kb(m.raw).padStart(7)}  ${kb(m.wire).padStart(6)}  ${String(Math.round(m.spanMs)).padStart(6)} ms  ${String(Math.round(m.ttfbMedMs)).padStart(4)}/${String(Math.round(m.ttfbMaxMs)).padEnd(4)} ms ${String(Math.round(m.engineStartMs)).padStart(10)} ms ${String(Math.round(m.fcpMs)).padStart(5)} ms ${String(Math.round(m.coldMs)).padStart(14)} ms ${String(Math.round(m.warmMs)).padStart(5)} ms  (warm: ${m.warmNetwork} hit the network)`,
    );
  }
}
await browser.close();
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
