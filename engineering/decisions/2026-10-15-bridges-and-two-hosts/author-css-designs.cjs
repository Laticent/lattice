// Author-CSS designs for ../2026-10-15-bridges-and-two-hosts.md §4.4 and §9 (D2, item b).
//
// QUESTION. Once the engine CSS is layered, which design keeps an author's own CSS (front-matter
// `style:`, `<style>`, `<style scoped>`) winning exactly where it wins today?
//
// METHOD. For each deck, render the Marp bundle (real allowlist, runtime loaded) WITH and WITHOUT
// the author's CSS, under each design. An element is "author-affected" under a design when its
// computed style (with ::before/::after/::marker) differs between the two renders; at property
// level, an (element, property) pair is author-affected when its value differs. Today's set (D)
// is the target. Against it, each design's set splits into: the same pairs; pairs the author
// newly wins; pairs the author newly loses. A pair in both sets whose value differs from today's
// is counted apart ("same pair, other value"), because the engine's own layering delta can move
// a value the author also touches.
//
// THE DESIGNS (each name is the key in the results):
//   D   today: unlayered engine CSS, author CSS as Marp places it (after the theme).
//   C   the bridge as measured in §4.4: engine flattened by @csstools/postcss-cascade-layers
//       (raised ranks), author CSS untouched.
//   A1  design 1, the layered meaning: Marp's own CSS in the lowest layer, Lattice layered,
//       author CSS UNLAYERED. This is what Lattice's own host gives once it activates layers
//       (an unlayered rule beats every layered one at normal importance; at !important the
//       order inverts and every layer beats it). It is built the way layer-census.cjs builds A,
//       with sentinel rules marking where the theme and the author CSS sit in Marp's output.
//   C2  design 2, lowered flattening: no rank IDs; every engine selector's compounds wrapped in
//       :where() (the slide's leading `section` and pseudo-elements kept outside; `:root` written
//       as `section`), layers unwrapped in order, the palette at natural specificity.
//   C3  designs 3 and 4: C, with every author selector raised above the top rank
//       (`:not(#\#)` repeated once more than the flattener's highest rank). Design 3 is the
//       bridge doing this at export; design 4 is a documented override form an author types
//       after export. On a given CSS file they render identically, so they are measured once.
// Engine fidelity, without any author CSS: C2 vs C (the layered meaning; C equals A, §3.1).
//
// Setup is layer-delta-census.cjs's. From the repo root after `npm run build`:
//   CENSUS_DIR=/tmp/census node <this file> <deck.md>… [--out=<file.json>]
// The gallery fixture of §4.4 (a `style:` rule coloring h2 rgb(1,2,3), a `<style scoped>` rule
// coloring one slide's h2 rgb(4,5,6)) is generated from the baseline gallery with --gallery-fixture.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const M = require('./layer-delta-census.cjs');

const S = process.env.CENSUS_DIR;
const need = require('node:module').createRequire(path.join(S, 'package.json'));
const postcss = need('postcss');
const sp = need('postcss-selector-parser');
const { chromium } = need('playwright-core');
const REPO = process.cwd();

const SENT_BEGIN = '.zz-theme-begin{--zz:1}';
const SENT_END = '.zz-theme-end{--zz:2}';

// ── Author CSS in a Marp markdown file ──
const STYLE_FM_RE = /^style:\s*\|\n((?:[ \t]+.*\n|\n)*)/m;
const STYLE_FM_LINE_RE = /^style:\s*(["']?)(.*)\1\s*$/m;
// `<style>` elements are found by scanning, not by one regex that cuts them out: this script reads
// only the example decks in this repo, but a removal regex that can leave `<style` behind is the
// shape CodeQL flags, and a scan has no such leftover.
function replaceStyleEls(md, fn) {
  let out = '';
  let i = 0;
  const lower = md.toLowerCase();
  for (;;) {
    const open = lower.indexOf('<style', i);
    if (open < 0) break;
    const openEnd = md.indexOf('>', open);
    const close = openEnd < 0 ? -1 : lower.indexOf('</style', openEnd);
    const closeEnd = close < 0 ? -1 : md.indexOf('>', close);
    if (closeEnd < 0) break;
    out += md.slice(i, open) + fn(md.slice(open, openEnd + 1), md.slice(openEnd + 1, close), md.slice(close, closeEnd + 1));
    i = closeEnd + 1;
  }
  return out + md.slice(i);
}
function frontMatter(md) { const m = md.match(/^---\n([\s\S]*?)\n---\n/); return m ? { fm: m[1], start: 4, end: 4 + m[1].length } : null; }
function stripAuthor(md) {
  const f = frontMatter(md); let out = md;
  if (f) { let fm = f.fm.concat('\n').replace(STYLE_FM_RE, ''); fm = fm.replace(STYLE_FM_LINE_RE, '').replace(/\n$/, ''); out = `---\n${fm}\n---\n${md.slice(f.end + 5)}`; }
  return replaceStyleEls(out, () => '');
}
function mapAuthorCss(md, fn) {
  const f = frontMatter(md); let out = md;
  if (f && STYLE_FM_RE.test(`${f.fm}\n`)) {
    const fm = `${f.fm}\n`.replace(STYLE_FM_RE, (_m, body) => {
      const ind = (body.match(/^[ \t]+/) || ['  '])[0];
      const css = body.split('\n').map((l) => l.slice(ind.length)).join('\n');
      return `style: |\n${fn(css).split('\n').map((l) => (l ? ind + l : l)).join('\n')}\n`;
    }).replace(/\n$/, '');
    out = `---\n${fm}\n---\n${md.slice(f.end + 5)}`;
  }
  return replaceStyleEls(out, (a, css, b) => a + fn(css) + b);
}
const hasAuthor = (md) => stripAuthor(md) !== md;

// ── Selector rewrites ──
const isPseudoEl = (n) => n.type === 'pseudo' && (n.value.startsWith('::') || /^:(before|after|first-line|first-letter)$/i.test(n.value));
/** Design 3/4: append `:not(#\#)` × k to the subject compound, before any pseudo-element. */
function raiseSelector(sel, k) {
  const raise = ':not(#\\#)'.repeat(k);
  return sp((root) => {
    root.each((s) => {
      const nodes = s.nodes; let last = -1; nodes.forEach((n, i) => { if (n.type === 'combinator') last = i; });
      let at = nodes.length; for (let i = last + 1; i < nodes.length; i++) if (isPseudoEl(nodes[i])) { at = i; break; }
      const parts = nodes.map(String); parts.splice(at, 0, raise);
      s.replaceWith(sp().astSync(parts.join('')).nodes[0]);
    });
  }).processSync(sel);
}
/** Design 2: wrap each compound in :where(), keeping the leading `section`, `:root` (as section) and pseudo-elements. */
function lowerSelector(sel) {
  return sp((root) => {
    root.each((s) => {
      const out = []; let comp = []; let first = true;
      const flush = () => {
        if (!comp.length) return;
        const els = comp.filter(isPseudoEl); let rest = comp.filter((n) => !isPseudoEl(n));
        let lead = '';
        if (first && rest[0]?.type === 'tag' && rest[0].value === 'section') { lead = 'section'; rest = rest.slice(1); }
        else if (first && rest[0]?.type === 'pseudo' && rest[0].value === ':root') { lead = 'section'; rest = rest.slice(1); }
        const body = rest.map(String).join('').trim();
        out.push(`${lead}${body ? `:where(${body})` : lead ? '' : '*'}${els.map(String).join('')}`);
        comp = []; first = false;
      };
      for (const n of s.nodes) { if (n.type === 'combinator') { flush(); out.push(String(n)); } else comp.push(n); }
      flush();
      s.replaceWith(sp().astSync(out.join('')).nodes[0]);
    });
  }).processSync(sel);
}
function rewriteRules(css, fn) {
  const root = postcss.parse(css);
  root.walkRules((r) => { if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return; r.selectors = r.selectors.map(fn); });
  return root.toString();
}
/** C2: lower every engine layer, unwrap all layers in order, keep the palette natural. */
function lowered(L) {
  const root = postcss.parse(L);
  root.walkAtRules('layer', (a) => {
    if (!a.nodes) { a.remove(); return; }
    if (a.params.trim() !== 'theme') a.walkRules((r) => { if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return; r.selectors = r.selectors.map(lowerSelector); });
    a.replaceWith(a.nodes);
  });
  return root.toString();
}
function maxRank(C) { let m = 0; postcss.parse(C).walkRules((r) => { for (const s of r.selectors) m = Math.max(m, (s.match(/:not\(#\\#\)/g) || []).length); }); return m; }

// ── Splice: the layered meaning with author CSS unlayered (A1), or absent (A) ──
const themeStyle = (h) => [...h.matchAll(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g)].find((m) => m[2].includes('foreignObject > section{'));
function splice(hL, hE) {
  const mL = themeStyle(hL), mE = themeStyle(hE);
  const cut = (t) => { const b = t.indexOf('.zz-theme-begin'), e = t.indexOf('.zz-theme-end'); if (b < 0 || e < 0) throw new Error('sentinel missing'); const bs = t.lastIndexOf('}', b) + 1; const ee = t.indexOf('}', e) + 1; return { pre: t.slice(0, bs), theme: t.slice(bs, ee), post: t.slice(ee) }; };
  const l = cut(mL[2]), e = cut(mE[2]);
  // After the theme, Marp writes the author CSS, then its own trailing rules. E carries the same
  // author CSS; its trailing rules are what is left after the author CSS in the noauth E render.
  return { l, e, build: (author, Q) => {
    authorPieces(l.post, Q); // throws unless this render's trailing CSS is Q plus author insertions
    const A = `@layer marp-base, ${M.ORDER.join(', ')};@layer marp-base{${l.pre}}${l.theme}${author}@layer marp-base{${Q}}`;
    const i = mL.index + mL[1].length; return hL.slice(0, i) + A + hL.slice(i + mL[2].length);
  } };
}

/** Top-level rules (and at-rules) of a stylesheet, as strings, by brace depth. */
function topLevelRules(css) {
  const out = [];
  let depth = 0, start = 0;
  for (let k = 0; k < css.length; k++) {
    const ch = css[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { out.push(css.slice(start, k + 1)); start = k + 1; } }
  }
  if (start < css.length) out.push(css.slice(start));
  return out;
}

/**
 * The rules `withAuthor` has beyond `base`, when `base` is `withAuthor` with whole rules inserted.
 * Compares whole top-level rules, not characters: a character diff can shift an inserted piece onto
 * the start of the next Marp rule when the two begin with the same text (`section`).
 */
function authorPieces(withAuthor, base) {
  const a = topLevelRules(withAuthor), b = topLevelRules(base);
  let i = 0, out = '';
  for (const rule of b) {
    while (i < a.length && a[i] !== rule) out += a[i++];
    if (i >= a.length) throw new Error('author CSS is not an insertion of whole rules into Marp\'s trailing rules');
    i++;
  }
  while (i < a.length) out += a[i++];
  return out;
}

async function run(deckPath, browser) {
  const t0 = Date.now();
  const slug = path.basename(deckPath, '.md');
  const out = path.join(M.W, `ad-${slug}`); fs.rmSync(out, { recursive: true, force: true });
  cp.execFileSync('node', ['tools/export-marp.js', deckPath, out, '--no-agent'], { cwd: REPO, stdio: 'pipe', timeout: 180000 });
  const bdir = path.join(out, slug);
  const mdAuth = fs.readFileSync(path.join(bdir, `${slug}.md`), 'utf8');
  if (!hasAuthor(mdAuth)) return { deck: deckPath, skipped: 'no author CSS in the exported bundle' };
  const pal = (mdAuth.match(/^theme:\s*["']?([\w-]+)/m) || [])[1];
  const pristine = path.join(out, 'themes-pristine'); fs.cpSync(path.join(bdir, 'themes'), pristine, { recursive: true });
  const t = await M.sheets(pristine, pal);
  const header = t.D.match(/\/\*\s*@theme [\s\S]*?\*\//)[0];
  const K = maxRank(t.C) + 1;
  const sheets = {
    D: t.D, C: t.C, C2: lowered(t.L),
    L: t.L.replace(`${header}\n`, `${header}\n${SENT_BEGIN}\n`).replace(/\n$/, `\n${SENT_END}\n`),
    E: `${header}\n${SENT_BEGIN}\n${SENT_END}\n`,
  };
  // The sentinels sit outside every layer; they match nothing, so they change no computed style.
  const mds = { auth: mdAuth, noauth: stripAuthor(mdAuth), raised: mapAuthorCss(mdAuth, (css) => rewriteRules(css, (s) => raiseSelector(s, K))) };
  for (const [k, v] of Object.entries(mds)) fs.writeFileSync(path.join(bdir, `md-${k}.md`), v);
  const html = {};
  const render = (sheet, md) => {
    fs.writeFileSync(path.join(bdir, 'themes', `${pal}.css`), sheets[sheet]);
    const o = path.join(bdir, `out-${sheet}-${md}.html`);
    cp.execFileSync(M.MARP, ['--config-file', 'marp.config.cjs', `md-${md}.md`, '-o', o], { cwd: bdir, stdio: 'pipe', timeout: 240000 });
    return fs.readFileSync(o, 'utf8');
  };
  for (const s of ['D', 'C', 'C2', 'L', 'E']) for (const m of ['auth', 'noauth']) html[`${s}-${m}`] = render(s, m);
  html['C3-auth'] = render('C', 'raised');
  html['C3-noauth'] = html['C-noauth'];
  // A1 / A from the sentinel-marked L and E renders.
  const sa = splice(html['L-auth'], html['E-auth']), sn = splice(html['L-noauth'], html['E-noauth']);
  const Q = sn.e.post; // Marp's trailing rules, with no author CSS before them
  // Author CSS can sit in several places among Marp's trailing rules (a `style:` block, then a
  // `<style scoped>` block that Marp scopes per slide). The reference needs only the author pieces,
  // in order, unlayered: an unlayered rule beats every layered one wherever it sits, so the
  // pieces' position among the layered Marp rules does not change the reference's meaning.
  const author = authorPieces(sa.e.post, Q);
  html['A1-auth'] = sa.build(author, Q); html['A1-noauth'] = sn.build('', Q);
  const keys = ['D-auth', 'D-noauth', 'C-auth', 'C-noauth', 'C2-auth', 'C2-noauth', 'C3-auth', 'A1-auth', 'A1-noauth'];
  const pages = {}, res = {}, unstable = [];
  const load = async (k) => { const f = path.join(bdir, `page-${k}.html`); fs.writeFileSync(f, html[k]); const p = await browser.newPage(); await p.goto(`file://${f}`); await M.settled(p); pages[k] = p; const c = await M.stableCensus(p); res[k] = c.res; if (!c.stable) unstable.push(k); };
  for (let j = 0; j < keys.length; j += 3) await Promise.all(keys.slice(j, j + 3).map(load)); // three pages at a time
  pages['C3-noauth'] = pages['C-noauth']; res['C3-noauth'] = res['C-noauth'];
  const n = res['D-auth'].length;
  const rec = { deck: deckPath, palette: pal, elements: n, raiseK: K, authorCssBytes: author.length, unstablePages: unstable, designs: {} };
  for (const k of Object.keys(res)) if (res[k].length !== n) throw new Error(`element count differs: ${k} ${res[k].length} vs ${n}`);
  const D = ['D', 'C', 'A1', 'C2', 'C3'];
  const eff = {}; for (const d of D) eff[d] = res[`${d}-auth`].map((h, i) => (h !== res[`${d}-noauth`][i] ? i : -1)).filter((i) => i >= 0);
  const unionAll = [...new Set(D.flatMap((d) => eff[d]))].sort((a, b) => a - b);
  // Reading every computed property of thousands of elements on eleven pages took over 30 minutes and
  // 7 GB on the gallery, so a large union is sampled evenly. The sample size is recorded in the result.
  const CAP = 600, step = Math.max(1, Math.ceil(unionAll.length / CAP));
  const union = unionAll.filter((_, i) => i % step === 0);
  rec.sampled = { affectedElements: unionAll.length, compared: union.length, every: step };
  // `detail` returns every computed property of each element; on the gallery one call for the whole
  // union is over Node's 512 MB string limit (ERR_STRING_TOO_LONG), so ask in chunks.
  const det = {};
  await Promise.all(Object.keys(pages).map(async (k) => {
    det[k] = [];
    for (let c = 0; c < union.length; c += 120) det[k].push(...(await M.detail(pages[k], union.slice(c, c + 120))));
  }));
  // `--style` carries the author's CSS text itself and is inherited by every element, so it is not styling.
  const pairs = (d) => { const m = new Map(); union.forEach((i, j) => { const a = det[`${d}-auth`][j].o, b = det[`${d}-noauth`][j].o; for (const p of Object.keys(a)) if (a[p] !== b[p] && !p.endsWith('--style')) m.set(`${i}|${p}`, a[p]); }); return m; };
  const today = pairs('D');
  for (const d of D) {
    const v = d === 'D' ? today : pairs(d);
    let same = 0, otherValue = 0, newlyLoses = 0, newlyWins = 0; const ex = { newlyLoses: [], newlyWins: [], otherValue: [] };
    const el = (key) => { const [i, p] = key.split('|'); const j = union.indexOf(Number(i)); return `${det['D-auth'][j].el.slice(0, 50)} ${p}`; };
    for (const [key, val] of today) { if (!v.has(key)) { newlyLoses++; if (ex.newlyLoses.length < 8) ex.newlyLoses.push(`${el(key)}: today ${val.slice(0, 40)}`); } else if (v.get(key) === val) same++; else { otherValue++; if (ex.otherValue.length < 5) ex.otherValue.push(`${el(key)}: today ${val.slice(0, 30)} | ${v.get(key).slice(0, 30)}`); } }
    for (const [key, val] of v) if (!today.has(key)) { newlyWins++; if (ex.newlyWins.length < 8) ex.newlyWins.push(`${el(key)}: ${val.slice(0, 40)}`); }
    rec.designs[d] = { affectedElements: eff[d].length, affectedPairs: v.size, same, otherValue, newlyLoses, newlyWins, examples: ex };
  }
  // The headline the note quotes: h2 color per design (gallery fixture).
  const h2 = await Promise.all(keys.filter((k) => k.endsWith('auth') && !k.endsWith('noauth')).map(async (k) => [k, await pages[k].evaluate(() => { const c = {}; for (const e of document.querySelectorAll('foreignObject > section h2')) { const v = getComputedStyle(e).color; c[v] = (c[v] || 0) + 1; } return c; })]));
  rec.h2Colors = Object.fromEntries(h2);
  const fid = res['C2-noauth'].filter((h, i) => h !== res['C-noauth'][i]).length;
  rec.engineFidelity = { C2vsC_noAuthor: fid, A1vsC_noAuthor: res['A1-noauth'].filter((h, i) => h !== res['C-noauth'][i]).length };
  for (const p of new Set(Object.values(pages))) await p.close();
  fs.rmSync(out, { recursive: true, force: true });
  rec.seconds = Math.round((Date.now() - t0) / 1000);
  return rec;
}

async function main() {
  const args = process.argv.slice(2);
  const outFile = (args.find((a) => a.startsWith('--out=')) || `--out=${path.join(M.W, 'author-css.json')}`).slice(6);
  const decks = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--gallery-fixture')) {
    let s = fs.readFileSync(path.join(REPO, 'test/integration/baseline-decks/gallery.md'), 'utf8');
    s = s.replace(/^---\n/, '---\nstyle: |\n  h2 { color: rgb(1, 2, 3); }\n');
    s = s.replace('## The landscape has shifted. Here is what that means for us.\n', '## The landscape has shifted. Here is what that means for us.\n\n<style scoped>\nh2 { color: rgb(4, 5, 6); }\n</style>\n');
    const f = path.join(M.W, 'fixture', 'gallery-authored.md'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); decks.unshift(f);
  }
  const browser = await chromium.launch({ executablePath: M.CHROMIUM });
  const results = [];
  for (const d of decks) {
    let r; try { r = await run(d, browser); } catch (e) { r = { deck: d, error: String(e.stack || e).slice(0, 600) }; }
    results.push(r);
    console.log(JSON.stringify({ deck: r.deck, n: r.elements, err: r.error, designs: r.designs && Object.fromEntries(Object.entries(r.designs).map(([k, v]) => [k, [v.affectedPairs, v.same, v.otherValue, v.newlyLoses, v.newlyWins]])), h2: r.h2Colors, fid: r.engineFidelity }));
  }
  await browser.close();
  fs.writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
}
module.exports = { raiseSelector, lowerSelector, lowered, stripAuthor, mapAuthorCss };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
