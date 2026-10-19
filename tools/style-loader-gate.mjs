/**
 * The Playground's on-demand style loader, checked on the surface it ships on.
 *
 * `tools/style-needs-audit.mjs` proves the scanner against CLI renders. This script proves the LOADER:
 * for each deck it opens the real Playground twice in a fresh browser context, once with the whole
 * sheet (the default) and once with the loader, and reads the stylesheet each frame actually built
 * (`#lattice-doc`, the composed sheet after the engine's own pack and mask steps and the host's
 * sanitizer, so it is the bytes the user's frame holds). It then puts the SAME slide HTML in a blank
 * page under each sheet and compares every element's computed style, plus ::before and ::after, in
 * screen, print and dark. Two loads of the whole-sheet page give the noise floor (animations, time).
 * Any difference left is a rule the loader dropped.
 *
 * The same comparison runs on the LIVE frame (the slides it holds after the host's split, the web-image block
 * and the runtime), screen only, with a second whole-sheet load as the noise floor: the static page cannot see
 * what those add, and that is where the review found three breaks.
 *
 * It also records what the loader cost: style bytes fetched (index + modules, raw and gzipped) against
 * the whole sheet, and the milliseconds from navigation to the first slide in the frame, cold.
 *
 * Usage:  node tools/style-loader-gate.mjs [deck.md ...] [--all] [--sample N] [--jobs 3]
 *                                          [--engine chromium|webkit] [--base http://localhost:4321]
 *                                          [--json out.json]
 * Needs the docs site serving at --base (`cd docs && npm run dev`, or `build:e2e` + `preview:e2e`).
 * Linux engines only; real iOS is not measured (HARD RULE #23).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { fingerprints, pageFingerprint } from './style-gate-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const latticeEngine = require('../lib/engine');
const { chromium, webkit } = await import(path.join(ROOT, 'docs/node_modules/@playwright/test/index.mjs'));

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const flag = (n) => argv.includes(n);
const valueArgs = new Set(['--sample', '--jobs', '--engine', '--json', '--base']);
let decks = argv.filter((a, i) => !a.startsWith('--') && !valueArgs.has(argv[i - 1]));
if (flag('--all') || decks.length === 0) {
  decks = fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).sort().map((f) => path.join('examples', f));
  decks.push('test/integration/baseline-decks/gallery.md');
}
const sample = Number(opt('--sample', '0'));
if (sample > 0) decks = decks.filter((_, i) => i % Math.ceil(decks.length / sample) === 0);
const jobs = Math.max(1, Number(opt('--jobs', '3')));
const engineName = opt('--engine', 'chromium');
const base = opt('--base', 'http://localhost:4321').replace(/\/$/, '');
const SOURCE_KEY = 'lattice-docs-pg-source';
const STYLE_ASSET = /\/playground\/v\/[^/]+\/(?:styles\/|themes\/lattice\.css)/;

/** One cold Playground session on `md`; returns the sheet its frame built and what the styles cost. */
async function session(browser, md, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([key, src]) => localStorage.setItem(key, src), [SOURCE_KEY, md]);
  const page = await ctx.newPage();
  const assets = [];
  page.on('response', async (r) => {
    if (!STYLE_ASSET.test(r.url()) || r.status() !== 200) return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    assets.push({ url: r.url(), raw: body.length, gz: zlib.gzipSync(body).length });
  });
  const t0 = Date.now();
  await page.goto(`${base}/playground/${mode === 'full' ? '' : '?styles=modules'}`, { waitUntil: 'domcontentloaded' });
  const frameOf = () => page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith('about:srcdoc'));
  // First slide in the frame, then the sheet stops changing (a second render pass lands late).
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => f.contentDocument?.querySelector('section')), null, { timeout: 60000 });
  const firstSlideMs = Date.now() - t0;
  let css = '';
  let same = 0;
  for (let i = 0; i < 80 && same < 5; i++) {
    await page.waitForTimeout(250);
    const f = frameOf();
    const now = f ? await f.evaluate(() => document.getElementById('lattice-doc')?.textContent || '').catch(() => '') : '';
    same = now && now === css ? same + 1 : 0;
    css = now;
  }
  // The LIVE frame: the slides it really holds, after the host's split, the web-image block and the runtime
  // have all run. The static comparison below cannot see anything those add; this can (the red team found three
  // breaks that way). Only the mounted slides, which are the same window in every session of one deck.
  const frame = frameOf();
  // Fingerprinted until two readings in a row agree. A reading taken while a web font is still arriving, or while
  // an animated scene moves, differs from the next one; the first stable pair is the page's settled state. (An
  // earlier version froze animations with an injected style tag instead; the injection forced a relayout at an
  // unlucky moment and made the two modes disagree about a paragraph's line count, so it was dropped.) A scene
  // that never settles falls through to its last reading, and the second whole-sheet session is its noise floor.
  let live = [];
  if (frame) {
    let prev = null;
    for (let i = 0; i < 10; i++) {
      live = await frame.evaluate(pageFingerprint).catch(() => []);
      if (prev && prev.length === live.length && prev.every((h, k) => h === live[k])) break;
      prev = live;
      await page.waitForTimeout(500);
    }
  }
  await ctx.close();
  return { css, firstSlideMs, assets, live };
}

async function staticPage(browser, html, css) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function gateDeck(browser, deck) {
  const md = fs.readFileSync(path.join(ROOT, deck), 'utf8');
  const r = { deck, ok: false };
  let html;
  try {
    html = latticeEngine.render(md).html;
  } catch (e) {
    r.error = `render: ${String(e.message).split('\n')[0].slice(0, 120)}`;
    return r;
  }
  const full = await session(browser, md, 'full');
  const full2 = await session(browser, md, 'full');
  const mod = await session(browser, md, 'modules');
  if (!full.css || !mod.css) {
    r.error = 'no sheet from the frame';
    return r;
  }
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const a1 = await staticPage(browser, html, full.css);
  const fp1 = await fingerprints(a1);
  await a1.close();
  const a2 = await staticPage(browser, html, full.css);
  const fp2 = await fingerprints(a2);
  await a2.close();
  const b = await staticPage(browser, html, mod.css);
  const fpB = await fingerprints(b);
  await b.close();
  r.gate = {};
  for (const k of Object.keys(fp1)) {
    if (k === 'tokens') continue;
    let noise = 0;
    let diff = 0;
    fp1[k].forEach((h, i) => {
      if (h !== fp2[k][i]) noise++;
      else if (h !== fpB[k][i]) diff++;
    });
    if (fp1[k].length !== fpB[k].length) diff += Math.abs(fp1[k].length - fpB[k].length);
    r.gate[k] = { elements: fp1[k].length, noise, differing: diff };
  }
  // Live frame: elements that differ between two whole-sheet loads are noise; any other difference is the loader's.
  const n = Math.min(full.live.length, mod.live.length);
  let liveDiff = full.live.length === mod.live.length ? 0 : Math.abs(full.live.length - mod.live.length);
  for (let i = 0; i < n; i++) if (full.live[i] === full2.live[i] && full.live[i] !== mod.live[i]) liveDiff++;
  r.liveElements = n;
  r.liveDiff = liveDiff;
  Object.assign(r, {
    ok: true,
    fullCssBytes: full.css.length,
    modulesCssBytes: mod.css.length,
    fullFetchRaw: sum(full.assets, 'raw'),
    fullFetchGz: sum(full.assets, 'gz'),
    modFetchRaw: sum(mod.assets, 'raw'),
    modFetchGz: sum(mod.assets, 'gz'),
    modRequests: mod.assets.length,
    fullFirstSlideMs: full.firstSlideMs,
    modFirstSlideMs: mod.firstSlideMs,
  });
  return r;
}

const browser = await (engineName === 'webkit' ? webkit : chromium).launch(engineName === 'chromium' ? { executablePath: process.env.CHROME_PATH || undefined } : {});
const results = [];
let next = 0;
const worker = async () => {
  while (next < decks.length) {
    const deck = decks[next++];
    let r;
    try {
      r = await gateDeck(browser, deck);
    } catch (e) {
      r = { deck, ok: false, error: String(e.message).split('\n')[0].slice(0, 160) };
    }
    results.push(r);
    const g = r.gate ? Object.values(r.gate).reduce((a, x) => a + x.differing, 0) : '-';
    console.error(`[${results.length}/${decks.length}] ${r.deck} ${r.ok ? `gate-diff ${g} live-diff ${r.liveDiff}/${r.liveElements}  styles ${(r.modFetchGz / 1024).toFixed(0)}/${(r.fullFetchGz / 1024).toFixed(0)} KB gz` : `SKIP ${r.error}`}`);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));
await browser.close();

results.sort((a, b) => a.deck.localeCompare(b.deck));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(results, null, 1));
const ok = results.filter((r) => r.ok);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`\n${engineName}: ${ok.length} decks gated on the Playground, ${results.length - ok.length} skipped`);
for (const r of results.filter((x) => !x.ok)) console.log(`  skipped ${r.deck}: ${r.error}`);
const bad = ok.filter((r) => Object.values(r.gate).some((x) => x.differing > 0) || r.liveDiff > 0);
console.log(`computed-style gate (screen, print, dark; every element + ::before/::after): ${ok.length - bad.length} of ${ok.length} identical`);
for (const r of bad) console.log(`  DIFFERS ${r.deck}: ${Object.entries(r.gate).map(([k, x]) => `${k} ${x.differing}/${x.elements}`).join(', ')}, live frame ${r.liveDiff}/${r.liveElements}`);
console.log(`sheet in the frame   whole ${kb(med(ok.map((r) => r.fullCssBytes)))}, loader ${kb(med(ok.map((r) => r.modulesCssBytes)))} (median)`);
console.log(`fetched, raw         whole ${kb(med(ok.map((r) => r.fullFetchRaw)))}, loader ${kb(med(ok.map((r) => r.modFetchRaw)))} in ${med(ok.map((r) => r.modRequests))} requests`);
console.log(`fetched, gzipped     whole ${kb(med(ok.map((r) => r.fullFetchGz)))}, loader ${kb(med(ok.map((r) => r.modFetchGz)))}`);
console.log(`first slide, cold    whole ${med(ok.map((r) => r.fullFirstSlideMs))} ms, loader ${med(ok.map((r) => r.modFirstSlideMs))} ms (median)`);
process.exit(bad.length || ok.length === 0 ? 1 : 0);
