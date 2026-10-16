// Runtime-loaded census for ../2026-10-15-bridges-and-two-hosts.md §3.1. Same comparison as
// layer-census.cjs, but rendered the way an author sees the bundle: through the bundle's own
// marp.config.cjs (its real HTML allowlist, which lets the runtime's <script> tags through), with
// the runtime loaded and settled, and ::marker included. It also renders D (today's unlayered
// sheet), so it measures what layering changes in Lattice itself.
// Setup is layer-census.cjs's (see its header). Then, from the repo root after `npm run build`:
//   CENSUS_DIR=/tmp/census node <this file> test/integration/baseline-decks/gallery.md [--media=print]
// Writes $CENSUS_DIR/matrix/runtime-<deck>.json and prints a one-line summary per comparison.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { themes, makeA, census, detail, W } = require('./layer-census.cjs');

const S = process.env.CENSUS_DIR;
const need = require('node:module').createRequire(path.join(S, 'package.json'));
const { chromium } = need('playwright-core');
const MARP = path.join(S, 'node_modules/.bin/marp');
const PSEUDOS = [null, '::before', '::after', '::marker'];
const REPO = process.cwd();

async function settled(page) {
  // The runtime marks <html data-lattice-runtime="loaded">; drawn figures carry a settle state.
  await page.waitForFunction(() => document.documentElement.dataset.latticeRuntime === 'loaded', null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-lattice-settle="pending"]'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => document.documentElement.dataset.latticeRuntime);
}

(async () => {
  const deck = process.argv[2];
  const media = (process.argv.find((a) => a.startsWith('--media=')) || '--media=screen').slice(8);
  const slug = path.basename(deck, '.md');
  const out = path.join(W, 'rt-' + slug);
  fs.rmSync(out, { recursive: true, force: true });
  cp.execFileSync('node', ['tools/export-marp.js', deck, out, '--no-agent'], { cwd: REPO, stdio: 'pipe', timeout: 120000 });
  const bdir = path.join(out, slug);
  const md = fs.readFileSync(path.join(bdir, `${slug}.md`), 'utf8');
  const pal = (md.match(/^theme:\s*["']?([\w-]+)/m) || [])[1];
  // Build every variant from a pristine copy of the bundle's palette before overwriting it.
  const pristine = path.join(out, 'themes-pristine');
  fs.cpSync(path.join(bdir, 'themes'), pristine, { recursive: true });
  const t = await themes(pristine, pal);
  const html = {};
  for (const k of ['D', 'L', 'C', 'E']) {
    // The bundle's config registers themes/; the variant replaces the deck's palette in place, so
    // the real allowlist and the runtime's script tags apply exactly as they do for an author.
    fs.copyFileSync(t[k], path.join(bdir, 'themes', `${pal}.css`));
    const o = path.join(bdir, `out-${k}.html`);
    cp.execFileSync(MARP, ['--config-file', 'marp.config.cjs', `${slug}.md`, '-o', o], { cwd: bdir, stdio: 'pipe', timeout: 180000 });
    html[k] = fs.readFileSync(o, 'utf8');
  }
  fs.writeFileSync(path.join(bdir, 'out-A.html'), makeA(html.L, html.E, pal));
  // What ships: the theme stylesheet Marp writes into the page, today (D) vs flattened (C).
  const zlib = require('node:zlib');
  const sheet = (h) => [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).find((c) => c.includes('foreignObject > section{'));
  const size = (k) => { const c = Buffer.from(sheet(html[k])); return { raw: c.length, gzip: zlib.gzipSync(c).length }; };
  const sizes = { D: size('D'), C: size('C') };
  console.log(`${slug} theme stylesheet D ${JSON.stringify(sizes.D)} C ${JSON.stringify(sizes.C)}`);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const res = {};
  const pages = {};
  const runtime = {};
  for (const k of ['D', 'A', 'C']) {
    const p = await browser.newPage();
    await p.emulateMedia({ media });
    await p.goto(`file://${path.join(bdir, `out-${k}.html`)}`);
    runtime[k] = await settled(p);
    res[k] = await census(p, PSEUDOS);
    pages[k] = p;
  }
  const report = { deck, palette: pal, media, runtime, elements: res.A.length, sizes, comparisons: {} };
  for (const [x, y] of [['A', 'C'], ['D', 'C'], ['D', 'A']]) {
    const diff = res[x].map((h, i) => (h !== res[y][i] ? i : -1)).filter((i) => i >= 0);
    const a = await detail(pages[x], diff.slice(0, 12), PSEUDOS);
    const b = await detail(pages[y], diff.slice(0, 12), PSEUDOS);
    report.comparisons[`${x}vs${y}`] = {
      differ: diff.length,
      examples: a.map((e, i) => ({ el: e.el, props: Object.keys(e.o).filter((k) => e.o[k] !== b[i].o[k]).slice(0, 4).map((k) => `${k}: ${e.o[k].slice(0, 50)} | ${b[i].o[k].slice(0, 50)}`) })),
    };
    console.log(`${slug} ${media} ${x} vs ${y}: ${diff.length} / ${res[x].length}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(W, `runtime-${slug}-${media}.json`), `${JSON.stringify(report, null, 2)}\n`);
})();
