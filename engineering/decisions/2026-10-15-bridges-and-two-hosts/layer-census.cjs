// Layer census for ../2026-10-15-bridges-and-two-hosts.md §3.1. For each deck: export it to Marp,
// build a layered (L), a flattened (C) and an empty (E) theme for its palette, render each through
// marp-cli, build the reference A (L with Marp's own CSS layered lowest), and compare computed styles.
// Its dependencies are deliberately NOT repo dependencies; install them in a scratch directory:
//   mkdir -p /tmp/census && cd /tmp/census && npm init -y && \
//     npm i @marp-team/marp-cli@4.2.3 @csstools/postcss-cascade-layers@6.0.2 postcss playwright-core
// Then, from the repo root after `npm run build`:
//   CENSUS_DIR=/tmp/census CHROMIUM=/path/to/chrome node <this file> examples/*.md
// Results append to $CENSUS_DIR/matrix/results.jsonl, one JSON line per deck.
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const S = process.env.CENSUS_DIR; if (!S) throw new Error('set CENSUS_DIR (see the header)');
const need = require('node:module').createRequire(path.join(S, 'package.json'));
const postcss = need('postcss'); const layersPlugin = need('@csstools/postcss-cascade-layers');
const { chromium } = need('playwright-core');
const REPO = process.cwd(), W = path.join(S, 'matrix'); fs.mkdirSync(W, { recursive: true });
const MARP = path.join(S, 'node_modules/.bin/marp');
const ORDER = ['root', 'base', 'scaffold', 'components', 'semi-universal', 'universal', 'diagram-overrides', 'theme'];
const lat = fs.readFileSync(path.join(REPO, 'dist/lattice.css'), 'utf8').replace(/@theme lattice/g, 'theme-lattice').replace(/@size /g, 'size ');
function layerFor(name, cur) {
  let want;
  if (name === '(preamble)' || /_theme\.css|text-faces|base\.tokens|scale\.js/.test(name)) want = 'root';
  else if (/base\.elements/.test(name)) want = 'base';
  else if (/scaffold\.css/.test(name)) want = 'scaffold';
  else if (/KaTeX|lib\/components\/|card-tag/.test(name)) want = 'components';
  else if (/modifiers|highlight-js|treatments|base\.finish|focus|base\.build|sketch|shared\.styles/.test(name)) want = 'semi-universal';
  else if (/variants|lib\/forms\/|accent-finish/.test(name)) want = 'universal';
  else want = 'diagram-overrides';
  return ORDER.indexOf(want) < ORDER.indexOf(cur) ? cur : want;
}
let latLayered = null;
let latFlat = null;
function latUnlayered() {
  if (latFlat) return latFlat;
  const root = postcss.parse(lat);
  root.walkAtRules('layer', (a) => { if (!a.nodes) a.remove(); });
  return (latFlat = root.toString());
}
function layeredLattice() {
  if (latLayered) return latLayered;
  let cur = 'root', hoisted = '', body = '';
  for (const p of lat.split(/(?=\/\* === [^*]*? === \*\/)/)) {
    const m = p.match(/^\/\* === ([^*]*?) === \*\//); cur = layerFor(m ? m[1] : '(preamble)', cur);
    const root = postcss.parse(p);
    root.walkAtRules((a) => { if (/^(font-face|property)$/.test(a.name)) { hoisted += a.toString() + '\n'; a.remove(); } });
    root.walkAtRules('layer', (a) => { if (!a.nodes) a.remove(); });
    body += `@layer ${cur} {\n${root.toString()}\n}\n`;
  }
  return (latLayered = { hoisted, body });
}
function paletteBody(themesDir, name, seen = new Set()) {
  if (seen.has(name)) return ''; seen.add(name);
  let f = path.join(themesDir, name + '.css'); if (!fs.existsSync(f)) { f = path.join(REPO, 'dist/themes', name + '-min.css'); missing.add(name); } if (!fs.existsSync(f)) throw new Error('no palette ' + name);
  const css = fs.readFileSync(f, 'utf8'); let out = '';
  for (const m of css.matchAll(/@import\s*["']([^"']+)["']\s*;/g)) if (m[1] !== 'lattice') out += paletteBody(themesDir, m[1], seen);
  return out + css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '') + '\n';
}
const themeCache = {}; const missing = new Set();
async function themes(themesDir, pal) {
  if (themeCache[pal]) return themeCache[pal];
  const css = fs.readFileSync(path.join(themesDir, pal + '.css'), 'utf8');
  const header = css.match(/\/\*\s*@theme [\s\S]*?\*\//)[0];
  const pb = paletteBody(themesDir, pal); const { hoisted, body } = layeredLattice();
  const L = `${header}\n@layer ${ORDER.join(', ')};\n${hoisted}${body}@layer theme {\n${pb}\n}\n`;
  const r = await postcss([layersPlugin()]).process(L, { from: undefined });
  const C = r.css.includes('@theme ') ? r.css : header + '\n' + r.css;
  const dir = path.join(W, 'themes-' + pal); fs.mkdirSync(dir, { recursive: true });
  // D: today's sheet, unlayered, with the inert @layer declaration dropped the same way as in L.
  const Dsheet = `${header}\n${latUnlayered()}\n${pb}\n`;
  const out = {}; for (const [k, v] of Object.entries({ L, C, D: Dsheet, E: header + '\n' })) { fs.mkdirSync(path.join(dir, k), { recursive: true }); out[k] = path.join(dir, k, pal + '.css'); fs.writeFileSync(out[k], v); }
  return (themeCache[pal] = out);
}
function marpStyle(h) { const ss = [...h.matchAll(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g)]; return ss.find((m) => m[2].includes('foreignObject > section{')); }
function makeA(hL, hE, _pal) {
  const mL = marpStyle(hL), E = marpStyle(hE)[2], L = mL[2];
  let p = 0; while (p < Math.min(E.length, L.length) && E[p] === L[p]) p++;
  let s = 0; while (s < Math.min(E.length, L.length) - p && E[E.length - 1 - s] === L[L.length - 1 - s]) s++;
  const A = `@layer marp-base, ${ORDER.join(', ')};@layer marp-base{${L.slice(0, p)}}${L.slice(p, L.length - s)}@layer marp-base{${L.slice(L.length - s)}}`;
  const i = mL.index + mL[1].length; return hL.slice(0, i) + A + hL.slice(i + L.length);
}
const PSEUDOS = [null, '::before', '::after'];
async function census(page, pseudos = PSEUDOS) {
  return page.evaluate((pseudos) => {
    const h = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
    const ser = (cs) => { const a = []; for (let i = 0; i < cs.length; i++) a.push(cs[i] + ':' + cs.getPropertyValue(cs[i])); return a.sort().join(';'); };
    return [...document.querySelectorAll('foreignObject > section, foreignObject > section *')].map((e) => pseudos.map((pe) => h(ser(getComputedStyle(e, pe)))).join('.'));
  }, pseudos);
}
async function detail(page, idxs, pseudos = PSEUDOS) {
  return page.evaluate(([idxs, pseudos]) => { const els = [...document.querySelectorAll('foreignObject > section, foreignObject > section *')];
    return idxs.map((i) => { const e = els[i], o = {}; for (const pe of pseudos) { const cs = getComputedStyle(e, pe); for (let k = 0; k < cs.length; k++) o[(pe || '') + cs[k]] = cs.getPropertyValue(cs[k]); } return { el: e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className : ''), o }; }); }, [idxs, pseudos]);
}
async function main() {
  const decks = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const log = fs.createWriteStream(path.join(W, 'results.jsonl'), { flags: 'a' });
  for (const deck of decks) {
    const slug = path.basename(deck, '.md'); const rec = { deck };
    try {
      const out = path.join(W, 'b-' + slug); fs.rmSync(out, { recursive: true, force: true });
      cp.execFileSync('node', ['tools/export-marp.js', deck, out, '--no-agent'], { cwd: REPO, stdio: 'pipe', timeout: 120000 });
      const bdir = path.join(out, slug); const md = fs.readFileSync(path.join(bdir, slug + '.md'), 'utf8');
      const pal = (md.match(/^theme:\s*["']?([\w-]+)/m) || [])[1]; rec.palette = pal;
      missing.clear(); const t = await themes(path.join(bdir, 'themes'), pal); if (missing.size) rec.bundleMissingPalettes = [...missing]; const html = {};
      for (const k of ['L', 'C', 'E']) { const o = path.join(W, `o-${slug}-${k}.html`); cp.execFileSync(MARP, [slug + '.md', '--html=false', '-o', o, '--theme-set', t[k]], { cwd: bdir, stdio: 'pipe', timeout: 180000 }); html[k] = fs.readFileSync(o, 'utf8'); fs.rmSync(o); }
      html.A = makeA(html.L, html.E, pal); const res = {}, pages = {};
      for (const k of ['A', 'C', 'L']) { const f = path.join(W, `o-${slug}-${k}.html`); fs.writeFileSync(f, html[k]); const p = await browser.newPage(); await p.goto('file://' + f); res[k] = await census(p); pages[k] = p; }
      rec.elements = res.A.length;
      const diffs = (x, y) => res[x].map((h, i) => (h !== res[y][i] ? i : -1)).filter((i) => i >= 0);
      const dAC = diffs('A', 'C'); rec.AvsC = dAC.length; rec.AvsL = diffs('A', 'L').length;
      if (dAC.length) { const a = await detail(pages.A, dAC.slice(0, 20)), c = await detail(pages.C, dAC.slice(0, 20)); rec.examples = a.map((x, i) => ({ el: x.el, props: Object.keys(x.o).filter((k) => x.o[k] !== c[i].o[k]).slice(0, 6).map((k) => `${k}: ${x.o[k].slice(0, 60)} | ${c[i].o[k].slice(0, 60)}`) })).slice(0, 5); }
      for (const p of Object.values(pages)) await p.close();
      for (const k of ['A', 'C', 'L']) fs.rmSync(path.join(W, `o-${slug}-${k}.html`));
      fs.rmSync(out, { recursive: true, force: true });
    } catch (e) { rec.error = String(e.message || e).slice(0, 300); }
    log.write(JSON.stringify(rec) + '\n'); console.log(JSON.stringify({ deck: rec.deck, pal: rec.palette, n: rec.elements, AvsC: rec.AvsC, AvsL: rec.AvsL, err: rec.error?.slice(0, 80) }));
  }
  await browser.close();
}

module.exports = { themes, makeA, census, detail, ORDER, W };
if (require.main === module) main();
