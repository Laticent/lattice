// Layer-delta census for ../2026-10-15-bridges-and-two-hosts.md §3.1 and §9 (D2, items a and c).
//
// WHAT IT MEASURES. For each deck, how many elements change computed style when Lattice's
// engine CSS is layered, rendered the way an author sees the Marp bundle (real allowlist,
// runtime loaded and settled, ::before/::after/::marker), and which rules cause each change.
// It is runtime-census.cjs's D-vs-C comparison made cheap enough for every example deck:
//
//   - Two renders per deck instead of four. runtime-census renders D, L, C and E and builds the
//     reference A from L and E. The census showed A equals C on all 277 decks it rendered and on
//     the gallery with the runtime, so D vs C is the layering delta and A is not rebuilt here.
//     (A third render, C0, runs with --experiment: see below.)
//   - The pages are censused in parallel, and decks run in parallel shards (one browser each).
//
// HOW A CHANGE IS ATTRIBUTED. Every style rule of the engine CSS and of the palette gets one
// extra declaration, `--zsrc: <id>`, before the sheets are built. The id indexes a table of
// {source file, layer, selector}. The tag survives Marp's minifier and the flattener, so the
// browser can say which rule won. The census excludes `--zsrc` from what it compares; a
// validation run without tags gives the same counts (see the README). For each element that
// differs, Chrome DevTools Protocol `CSS.getMatchedStylesForNode` lists the matched rules in
// cascade order; the winner of each differing property is computed from that list in D and in
// C. A differing property whose winning rule is the same in both is a knock-on (layout,
// inheritance or a var() resolved differently upstream); one whose winner changed is a FLIP,
// and a flip is the unit of migration work: one rule pair to move or re-scope.
//
// --experiment adds C0: the layered sheet with every specificity bump removed (a class,
// attribute or argument-less pseudo-class repeated in one compound selector is kept once),
// then flattened. C vs C0 is the elements where a bump still matters once layers exist.
//
// --tax runs the specificity-tax walk (item a) on the D page: every element and pseudo-element,
// every property, every pair of rules that both declare it. See specificityTax() below.
//
// --control renders D only and loads it twice: the elements that differ between two loads of the
// SAME sheet are noise (an animation caught mid-frame), not layering. --reduced-motion emulates
// `prefers-reduced-motion: reduce` in every page; the examples-wide run reran the decks the
// control flagged with it.
//
// Its dependencies are layer-census.cjs's plus postcss-selector-parser, deliberately NOT repo
// dependencies:
//   mkdir -p /tmp/census && cd /tmp/census && npm init -y && npm i @marp-team/marp-cli@4.2.3 \
//     @csstools/postcss-cascade-layers@6.0.2 postcss postcss-selector-parser playwright-core@1.56.1
// Then, from the repo root after `npm run build`:
//   CENSUS_DIR=/tmp/census node <this file> [--experiment] [--tax] [--out=<file.jsonl>] <deck.md>…
// One JSON line per deck goes to --out (default $CENSUS_DIR/matrix/delta.jsonl).
// `--validate` instead checks that the untagged sheets this file builds are byte-identical to
// layer-census.cjs's, then exits.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const S = process.env.CENSUS_DIR;
if (!S) throw new Error('set CENSUS_DIR (see the header)');
const need = require('node:module').createRequire(path.join(S, 'package.json'));
const postcss = need('postcss');
const layersPlugin = need('@csstools/postcss-cascade-layers');
const sp = need('postcss-selector-parser');
const { chromium } = need('playwright-core');
const REPO = process.cwd();
const W = path.join(S, 'matrix');
fs.mkdirSync(W, { recursive: true });
const MARP = path.join(S, 'node_modules/.bin/marp');
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// ── The sheets: the same construction as layer-census.cjs, with tags and de-bumping optional ──
const ORDER = ['root', 'base', 'scaffold', 'components', 'semi-universal', 'universal', 'diagram-overrides', 'theme'];
const RAW = fs.readFileSync(path.join(REPO, 'dist/lattice.css'), 'utf8').replace(/@theme lattice/g, 'theme-lattice').replace(/@size /g, 'size ');
const MARKER = /^\/\* === ([^*]*?) === \*\//;
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

/** Remove a class, attribute or argument-less pseudo-class repeated inside one compound. */
function debumpSelector(sel) {
  let removed = 0;
  const out = sp((root) => {
    root.walk((n) => {
      if (n.type !== 'selector') return;
      let seen = new Set();
      for (const c of [...n.nodes]) {
        if (c.type === 'combinator') { seen = new Set(); continue; }
        const dup = c.type === 'class' || c.type === 'attribute' || (c.type === 'pseudo' && !c.nodes.length && !c.value.startsWith('::'));
        if (!dup) continue;
        const k = `${c.type}:${String(c).trim()}`;
        if (seen.has(k)) { c.remove(); removed++; } else seen.add(k);
      }
    });
  }).processSync(sel);
  return { sel: out, removed };
}

/** Selector specificity [a, b, c], Selectors Level 4 (:is/:not/:has take the max argument, :where is 0). */
function specificity(sel) {
  const ast = sp().astSync(sel);
  const ofList = (container) => container.nodes.map(ofSelector).reduce((m, s) => (cmp(s, m) > 0 ? s : m), [0, 0, 0]);
  function ofSelector(node) {
    // A selector's nodes are flat: compound parts and combinators. Pseudo arguments are lists.
    const s = [0, 0, 0];
    for (const n of node.nodes) {
      if (n.type === 'id') s[0]++;
      else if (n.type === 'class' || n.type === 'attribute') s[1]++;
      else if (n.type === 'tag' && n.value !== '*') s[2]++;
      else if (n.type === 'pseudo') {
        const v = n.value.toLowerCase();
        if (v.startsWith('::') || /^:(before|after|first-line|first-letter|marker)$/.test(v)) s[2]++;
        else if (v === ':where') { /* zero */ }
        else if (/^:(is|not|has|matches|-webkit-any)$/.test(v)) { const m = ofList(n); s[0] += m[0]; s[1] += m[1]; s[2] += m[2]; }
        else if (/^:nth-(last-)?child$/.test(v)) { s[1]++; const t = String(n); const ofIdx = t.indexOf(' of '); if (ofIdx > 0) { const m = specificity(t.slice(ofIdx + 4, t.lastIndexOf(')'))); s[0] += m[0]; s[1] += m[1]; s[2] += m[2]; } }
        else s[1]++;
      }
    }
    return s;
  }
  return ofList(ast);
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/**
 * Parse `css`, optionally de-bump every selector and tag every style rule with `--zsrc:<id>`.
 * `srcAt(node)` names the source of a top-level node; meta collects one row per tag.
 */
function transform(css, { tag, debump, meta, srcAt, layerAt }) {
  if (!tag && !debump) return css;
  const root = postcss.parse(css);
  for (const top of root.nodes) {
    const src = srcAt(top);
    const visit = (r) => {
      if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
      if (debump) r.selectors = r.selectors.map((s) => debumpSelector(s).sel);
      if (tag && r.nodes.some((n) => n.type === 'decl')) {
        const id = meta.length;
        const bumps = r.selectors.map((s) => debumpSelector(s).removed);
        meta.push({ src, layer: layerAt(top), sel: r.selector.replace(/\s+/g, ' ').slice(0, 240), bumped: bumps.some((b) => b > 0), lowered: r.selector.includes(':where(') });
        r.append({ prop: '--zsrc', value: String(id) });
      }
    };
    if (top.type === 'rule') visit(top);
    if (top.walkRules) top.walkRules(visit);
  }
  return root.toString();
}

/** The engine CSS, tagged and/or de-bumped, plus the meta rows and each section's layer. */
const engineCache = new Map();
function engine({ tag = false, debump = false } = {}) {
  const key = `${tag}/${debump}`;
  if (engineCache.has(key)) return engineCache.get(key);
  const meta = [];
  // Sections are top-level comments; walk them in order to know each node's source and layer.
  let cur = '(preamble)', layer = 'root';
  const srcOf = new Map(), layerOf = new Map();
  const root = postcss.parse(RAW);
  for (const n of root.nodes) {
    if (n.type === 'comment') { const m = String(n).match(MARKER); if (m) { cur = m[1]; layer = layerFor(cur, layer); } }
    srcOf.set(n, cur); layerOf.set(n, layer);
  }
  let css = RAW;
  if (tag || debump) {
    // transform() re-parses; give it the same positions by source offset.
    const bySrc = [...srcOf.entries()].map(([n, s]) => [n.source.start.offset, s, layerOf.get(n)]);
    const lookup = (n) => { const o = n.source.start.offset; let best = bySrc[0]; for (const e of bySrc) { if (e[0] <= o) best = e; else break; } return best; };
    css = transform(RAW, { tag, debump, meta, srcAt: (n) => lookup(n)[1], layerAt: (n) => lookup(n)[2] });
  }
  const out = { css, meta };
  engineCache.set(key, out);
  return out;
}

function unlayered(css) {
  const root = postcss.parse(css);
  root.walkAtRules('layer', (a) => { if (!a.nodes) a.remove(); });
  return root.toString();
}
function layered(css) {
  let cur = 'root', hoisted = '', body = '';
  for (const p of css.split(/(?=\/\* === [^*]*? === \*\/)/)) {
    const m = p.match(MARKER); cur = layerFor(m ? m[1] : '(preamble)', cur);
    const root = postcss.parse(p);
    root.walkAtRules((a) => { if (/^(font-face|property)$/.test(a.name)) { hoisted += `${a.toString()}\n`; a.remove(); } });
    root.walkAtRules('layer', (a) => { if (!a.nodes) a.remove(); });
    body += `@layer ${cur} {\n${root.toString()}\n}\n`;
  }
  return { hoisted, body };
}
function paletteBody(themesDir, name, opts, meta, seen = new Set()) {
  if (seen.has(name)) return ''; seen.add(name);
  let f = path.join(themesDir, `${name}.css`); if (!fs.existsSync(f)) f = path.join(REPO, 'dist/themes', `${name}-min.css`);
  if (!fs.existsSync(f)) throw new Error(`no palette ${name}`);
  const css = fs.readFileSync(f, 'utf8'); let out = '';
  for (const m of css.matchAll(/@import\s*["']([^"']+)["']\s*;/g)) if (m[1] !== 'lattice') out += paletteBody(themesDir, m[1], opts, meta, seen);
  const own = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  return `${out}${transform(own, { ...opts, meta, srcAt: () => `themes/${name}`, layerAt: () => 'theme' })}\n`;
}

/**
 * D (today), L (layered), C (L flattened) for one palette; with debump, the de-bumped L and C.
 * `meta` rows are shared: the engine's first, then the palette chain's, in source order.
 */
async function sheets(themesDir, pal, { tag = false, debump = false } = {}) {
  const css = fs.readFileSync(path.join(themesDir, `${pal}.css`), 'utf8');
  const header = css.match(/\/\*\s*@theme [\s\S]*?\*\//)[0];
  const eng = engine({ tag, debump });
  const meta = [...eng.meta];
  const pb = paletteBody(themesDir, pal, { tag, debump }, meta);
  const { hoisted, body } = layered(eng.css);
  const L = `${header}\n@layer ${ORDER.join(', ')};\n${hoisted}${body}@layer theme {\n${pb}\n}\n`;
  const r = await postcss([layersPlugin()]).process(L, { from: undefined });
  const C = r.css.includes('@theme ') ? r.css : `${header}\n${r.css}`;
  const D = `${header}\n${unlayered(eng.css)}\n${pb}\n`;
  return { L, C, D, meta };
}

// ── Rendering and the census ──
async function settled(page) {
  await page.waitForFunction(() => document.documentElement.dataset.latticeRuntime === 'loaded', null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('[data-lattice-settle="pending"]'), null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(1500);
}
// Census until two samples taken a second apart agree. Under load the runtime can still be moving
// after `settled` (measured: two loads of one file differed on all 140 elements of a deck while four
// shards ran, and on none when run alone). A page that never agrees is reported, not trusted.
async function stableCensus(page, tries = 5) {
  let prev = await census(page);
  for (let k = 1; k < tries; k++) {
    await page.waitForTimeout(1000);
    const cur = await census(page);
    if (cur.length === prev.length && cur.every((h, i) => h === prev[i])) return { res: cur, rounds: k + 1, stable: true };
    prev = cur;
  }
  return { res: prev, rounds: tries, stable: false };
}
const PSEUDOS = [null, '::before', '::after', '::marker'];
// runtime-census.cjs's census, with the tag excluded from what is compared, and the element list
// kept on window for the DevTools walk that follows.
async function census(page) {
  return page.evaluate((pseudos) => {
    const h = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
    const ser = (cs) => { const a = []; for (let i = 0; i < cs.length; i++) { const k = cs[i]; if (k !== '--zsrc') a.push(`${k}:${cs.getPropertyValue(k)}`); } return a.sort().join(';'); };
    const els = [...document.querySelectorAll('foreignObject > section, foreignObject > section *')];
    window.__zels = els;
    return els.map((e) => pseudos.map((pe) => h(ser(getComputedStyle(e, pe)))).join('.'));
  }, PSEUDOS);
}
async function detail(page, idxs) {
  return page.evaluate(([idxs, pseudos]) => idxs.map((i) => {
    const e = window.__zels[i], o = {};
    for (const pe of pseudos) { const cs = getComputedStyle(e, pe); for (let k = 0; k < cs.length; k++) if (cs[k] !== '--zsrc') o[(pe || '') + cs[k]] = cs.getPropertyValue(cs[k]); }
    return { el: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/).join('.')}` : ''), o };
  }), [idxs, PSEUDOS]);
}

// ── DevTools: matched rules and the winner of each property ──
async function devtools(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); await cdp.send('DOM.getDocument', { depth: 0 });
  return cdp;
}
async function matchedFor(cdp, i) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: `window.__zels[${i}]` });
  const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
  await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
  const m = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
  const lists = { '': m.matchedCSSRules || [] };
  for (const pe of m.pseudoElements || []) if (/^(before|after|marker)$/.test(pe.pseudoType)) lists[`::${pe.pseudoType}`] = pe.matches;
  return { lists, inline: m.inlineStyle };
}
/** One rule match → { id, tagged, spec, sel, decls: Map(name → important) }. */
function ruleOf(rm) {
  const r = rm.rule; const decls = new Map(); let id = null;
  for (const p of r.style.cssProperties) {
    if (p.disabled || p.parsedOk === false || p.value === undefined) continue;
    if (p.name === '--zsrc') { id = Number(p.value); continue; }
    if (p.longhandProperties?.length) for (const l of p.longhandProperties) decls.set(l.name, !!p.important);
    else decls.set(p.name, !!p.important);
  }
  const sels = r.selectorList.selectors;
  const matching = rm.matchingSelectors.map((k) => sels[k]);
  const best = matching.reduce((b, s) => { const sp3 = s.specificity ? [s.specificity.a, s.specificity.b, s.specificity.c] : specificity(s.text); return !b || cmp(sp3, b.spec) > 0 ? { spec: sp3, text: s.text } : b; }, null);
  return { id, origin: r.origin, spec: best ? best.spec : [0, 0, 0], sel: best ? best.text : '', decls };
}
function inlineDecls(st) {
  const d = new Map(); if (!st) return d;
  for (const p of st.cssProperties) { if (p.disabled || p.parsedOk === false || p.value === undefined) continue; if (p.longhandProperties?.length) for (const l of p.longhandProperties) d.set(l.name, !!p.important); else d.set(p.name, !!p.important); }
  return d;
}
/** The declarations of `prop` in cascade order (CDP lists matched rules lowest precedence first). */
function contenders(rules, prop) {
  const out = [];
  rules.forEach((r, pos) => { if (r.origin === 'regular' && r.decls.has(prop)) out.push({ r, pos, important: r.decls.get(prop) }); });
  return out;
}
function winnerOf(rules, inline, prop) {
  if (inline?.has(prop) && (inline.get(prop) || !contenders(rules, prop).some((c) => c.important))) return { inline: true };
  const cs = contenders(rules, prop); if (!cs.length) return null;
  const imp = cs.filter((c) => c.important); return (imp.length ? imp : cs).at(-1);
}
// Marp scopes every theme selector under its own container; the prefix says nothing about the rule.
const stripScope = (sel) => sel.replace(/^div#\S+ > svg > foreignObject > /, '').replace(/\s+/g, ' ').slice(0, 200);
const ruleKey = (w, meta) => (!w ? 'none' : w.inline ? 'inline' : w.r.id != null ? `#${w.r.id}` : `other:${w.r.sel.slice(0, 80)}`);
const ruleSrc = (w, meta) => (!w ? 'none' : w.inline ? 'inline style' : w.r.id != null ? meta[w.r.id].src : 'marp/author/runtime (untagged)');

async function flips(cdpD, cdpC, i, props, meta) {
  const [a, b] = [await matchedFor(cdpD, i), await matchedFor(cdpC, i)];
  const out = [];
  for (const key of props) {
    const m = key.match(/^(::(?:before|after|marker))?(.*)$/); const pe = m[1] || ''; const prop = m[2];
    const ra = (a.lists[pe] || []).map(ruleOf), rb = (b.lists[pe] || []).map(ruleOf);
    const wa = winnerOf(ra, pe ? null : inlineDecls(a.inline), prop), wb = winnerOf(rb, pe ? null : inlineDecls(b.inline), prop);
    if (ruleKey(wa, meta) === ruleKey(wb, meta)) continue;
    out.push({ prop: pe + prop, D: { rule: ruleKey(wa, meta), src: ruleSrc(wa, meta), sel: wa?.r ? stripScope(wa.r.sel) : '' }, C: { rule: ruleKey(wb, meta), src: ruleSrc(wb, meta), sel: wb?.r ? stripScope(wb.r.sel) : '' } });
  }
  return out;
}

// ── Item (a): the specificity tax, on the D page ──
// For every element and pseudo-element, every property, every pair (W wins, X loses) of tagged
// rules that both declare it at the same importance:
//   - "specificity-decided": W sits EARLIER in source than X, so W wins only by specificity.
//   - "bump-necessary": W's matching selector carries a bump, and with the bump removed W would
//     lose to X (lower specificity, or equal and earlier).
// Each pair is classed by where X sits relative to W: the same source file; another file in the
// same layer; an earlier layer (layers make the bump unnecessary); a later layer (layering flips
// the pair: X would win).
async function specificityTax(page, cdp, n, meta) {
  const LI = Object.fromEntries(ORDER.map((l, k) => [l, k]));
  const where = (w, x) => (meta[w].src === meta[x].src ? 'same-file' : meta[w].layer === meta[x].layer ? 'same-layer-other-file' : LI[meta[x].layer] < LI[meta[w].layer] ? 'loser-in-earlier-layer' : 'loser-in-later-layer');
  const debumpMemo = new Map();
  // W's specificity with its bump removed: CDP's figure minus what the bump adds (computed both ways here).
  const w0 = (r) => {
    if (!debumpMemo.has(r.sel)) {
      const d = debumpSelector(r.sel);
      if (!d.removed) debumpMemo.set(r.sel, null);
      else { const a = specificity(r.sel), b = specificity(d.sel); debumpMemo.set(r.sel, [a[0] - b[0], a[1] - b[1], a[2] - b[2]]); }
    }
    const dl = debumpMemo.get(r.sel);
    return dl ? r.spec.map((v, k) => v - dl[k]) : null;
  };
  // A `:where()`-lowered loser Y, with its :where() read as :is() (natural specificity). Marp writes
  // `:root` as `:where(section):not([\20 root])`; that one is Marp's, so it is read as `:root`.
  const natMemo = new Map();
  const natural = (sel) => { if (!natMemo.has(sel)) natMemo.set(sel, specificity(sel.split(':where(section):not([\\20 root])').join(':root').replace(/:where\(/g, ':is('))); return natMemo.get(sel); };
  const tally = { specDecided: {}, bumpNecessary: {}, bumpNecessaryByTechnique: {}, loweringNecessary: {} };
  const matchedBumped = new Set(), matchedLowered = new Set();
  const pairs = { specDecided: new Map(), bumpNecessary: new Map(), loweringNecessary: new Map() };
  const perBumpedRule = new Map();
  const matchSel = new Map();
  let specMismatch = 0, orderViolations = 0, checked = 0;
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (let i = 0; i < n; i++) {
    const { lists, inline } = await matchedFor(cdp, i);
    for (const [pe, list] of Object.entries(lists)) {
      const rules = list.map(ruleOf);
      // Sanity: CDP's order must be ascending (specificity, source) for tagged rules.
      const tagged = rules.filter((r) => r.origin === 'regular' && r.id != null);
      for (const r of tagged) { if (meta[r.id].bumped) matchedBumped.add(r.id); if (meta[r.id].lowered) matchedLowered.add(r.id); }
      for (let k = 1; k < tagged.length; k++) { const c = cmp(tagged[k - 1].spec, tagged[k].spec); if (c > 0 || (c === 0 && tagged[k - 1].id > tagged[k].id)) orderViolations++; }
      for (const r of tagged.slice(0, 3)) { checked++; if (cmp(specificity(r.sel), r.spec) !== 0) specMismatch++; }
      const il = pe ? null : inlineDecls(inline);
      const props = new Set(); for (const r of rules) for (const p of r.decls.keys()) props.add(p);
      for (const prop of props) {
        if (prop.startsWith('--zsrc')) continue;
        const win = winnerOf(rules, il, prop); if (!win || win.inline || win.r.id == null) continue;
        const W_ = win.r;
        if (!matchSel.has(W_.id)) matchSel.set(W_.id, stripScope(W_.sel));
        const W0 = meta[W_.id].bumped ? w0(W_) : null;
        for (const c of contenders(rules, prop)) {
          if (c.r === W_ || c.important !== win.important || c.r.id == null) continue;
          const X = c.r;
          if (!matchSel.has(X.id)) matchSel.set(X.id, stripScope(X.sel));
          if (W_.id < X.id) {
            const cat = where(W_.id, X.id); bump(tally.specDecided, cat);
            const pk = `${cat}|${W_.id}|${X.id}`; pairs.specDecided.set(pk, (pairs.specDecided.get(pk) || 0) + 1);
          }
          if (W0) {
            const c0 = cmp(W0, X.spec);
            const winsWithout = c0 > 0 || (c0 === 0 && W_.id > X.id);
            if (!winsWithout) {
              const cat = where(W_.id, X.id); bump(tally.bumpNecessary, cat);
              const pk = `${cat}|${W_.id}|${X.id}`; pairs.bumpNecessary.set(pk, (pairs.bumpNecessary.get(pk) || 0) + 1);
              const tech = /(\[[^\]]+\])\1/.test(W_.sel) ? 'repeated-attribute' : 'repeated-class';
              bump(tally.bumpNecessaryByTechnique, `${tech}|${cat}`);
              if (!perBumpedRule.has(W_.id)) perBumpedRule.set(W_.id, new Set()); perBumpedRule.get(W_.id).add(cat);
            }
          }
          if (W0 && !perBumpedRule.has(W_.id)) perBumpedRule.set(W_.id, new Set());
          // W wins only because X was lowered: X at natural specificity would beat W.
          if (meta[X.id].lowered) {
            const xn = natural(X.sel); const cn = cmp(xn, W_.spec);
            if (cmp(xn, X.spec) !== 0 && (cn > 0 || (cn === 0 && X.id > W_.id))) {
              const cat = where(W_.id, X.id); bump(tally.loweringNecessary, cat);
              const pk = `${cat}|${W_.id}|${X.id}`; pairs.loweringNecessary.set(pk, (pairs.loweringNecessary.get(pk) || 0) + 1);
            }
          }
        }
      }
    }
  }
  const byFiles = (m) => { const t = {}; for (const [k, v] of m) { const [cat, w, x] = k.split('|'); const fk = `${cat}|${meta[w].src}|${meta[x].src}`; t[fk] = (t[fk] || 0) + v; } return t; };
  const pairTally = (m) => { const t = {}; for (const k of m.keys()) bump(t, k.split('|')[0]); return t; };
  return {
    instances: tally, distinctRulePairs: { specDecided: pairTally(pairs.specDecided), bumpNecessary: pairTally(pairs.bumpNecessary), loweringNecessary: pairTally(pairs.loweringNecessary) },
    byFilePair: { specDecided: byFiles(pairs.specDecided), bumpNecessary: byFiles(pairs.bumpNecessary), loweringNecessary: byFiles(pairs.loweringNecessary) },
    coverage: { bumpedRulesMatched: [...matchedBumped], loweredRulesMatched: matchedLowered.size },
    loweringNecessaryPairs: [...pairs.loweringNecessary.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => { const [cat, w, x] = k.split('|'); return { cat, n: v, W: { src: meta[w].src, sel: matchSel.get(Number(w)) }, X: { src: meta[x].src, sel: matchSel.get(Number(x)) } }; }),
    bumpNecessaryPairs: [...pairs.bumpNecessary.entries()].map(([k, v]) => { const [cat, w, x] = k.split('|'); return { cat, n: v, W: { src: meta[w].src, sel: matchSel.get(Number(w)) }, X: { src: meta[x].src, sel: matchSel.get(Number(x)) } }; }),
    specDecidedPairs: [...pairs.specDecided.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => { const [cat, w, x] = k.split('|'); return { cat, n: v, W: { src: meta[w].src, layer: meta[w].layer, sel: matchSel.get(Number(w)) }, X: { src: meta[x].src, layer: meta[x].layer, sel: matchSel.get(Number(x)) } }; }),
    bumpedRulesSeen: [...perBumpedRule.entries()].map(([id, cats]) => ({ id: Number(id), src: meta[id].src, sel: matchSel.get(Number(id)), neededAgainst: [...cats] })),
    sanity: { orderViolations, specChecked: checked, specMismatch },
  };
}

// ── One deck ──
async function deck(browser, deckPath, opts) {
  const t0 = Date.now();
  const slug = path.basename(deckPath, '.md');
  const out = path.join(W, `dl-${slug}`);
  fs.rmSync(out, { recursive: true, force: true });
  cp.execFileSync('node', ['tools/export-marp.js', deckPath, out, '--no-agent'], { cwd: REPO, stdio: 'pipe', timeout: 180000 });
  const bdir = path.join(out, slug);
  const md = fs.readFileSync(path.join(bdir, `${slug}.md`), 'utf8');
  const pal = (md.match(/^theme:\s*["']?([\w-]+)/m) || [])[1];
  const rec = { deck: deckPath, palette: pal };
  if (!pal) { rec.skipped = 'no theme: in front matter (Marp renders its own default theme)'; fs.rmSync(out, { recursive: true, force: true }); return rec; }
  const pristine = path.join(out, 'themes-pristine');
  fs.cpSync(path.join(bdir, 'themes'), pristine, { recursive: true });
  const t = await sheets(pristine, pal, { tag: opts.tag });
  const variants = { D: t.D, C: t.C };
  if (opts.control) delete variants.C; // --control: D only, loaded twice, to find elements that move on their own
  if (opts.experiment) variants.C0 = (await sheets(pristine, pal, { tag: opts.tag, debump: true })).C;
  const files = {};
  for (const [k, css] of Object.entries(variants)) {
    fs.writeFileSync(path.join(bdir, 'themes', `${pal}.css`), css);
    files[k] = path.join(bdir, `out-${k}.html`);
    cp.execFileSync(MARP, ['--config-file', 'marp.config.cjs', `${slug}.md`, '-o', files[k]], { cwd: bdir, stdio: 'pipe', timeout: 240000 });
  }
  rec.tRender = Date.now() - t0;
  const pages = {};
  if (opts.control) files.D2 = files.D;
  await Promise.all(Object.keys(files).map(async (k) => { const p = await browser.newPage(); await p.emulateMedia({ media: opts.media, reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference' }); await p.goto(`file://${files[k]}`); await settled(p); pages[k] = p; }));
  const res = {};
  rec.settle = {};
  await Promise.all(Object.keys(pages).map(async (k) => { const c = await stableCensus(pages[k]); res[k] = c.res; rec.settle[k] = c.rounds; if (!c.stable) (rec.unstable = rec.unstable || []).push(k); }));
  rec.tCensus = Date.now() - t0 - rec.tRender;
  rec.elements = res.D.length;
  if (Object.values(res).some((r) => r.length !== rec.elements)) rec.elementCountMismatch = Object.fromEntries(Object.entries(res).map(([k, r]) => [k, r.length]));
  const diff = (x, y) => res[x].map((h, i) => (h !== res[y][i] ? i : -1)).filter((i) => i >= 0);
  if (opts.control) { const dd = diff('D', 'D2'); rec.DvsD = dd.length; if (dd.length) { const a = await detail(pages.D, dd.slice(0, 3)), b = await detail(pages.D2, dd.slice(0, 3)); rec.noise = a.map((x, j) => ({ el: x.el, props: Object.keys(x.o).filter((k) => x.o[k] !== b[j].o[k]).slice(0, 4).map((k) => `${k}: ${x.o[k].slice(0, 40)} | ${b[j].o[k].slice(0, 40)}`) })); } rec.reducedMotion = !!opts.reducedMotion; for (const p of Object.values(pages)) await p.close(); fs.rmSync(out, { recursive: true, force: true }); rec.tTotal = Date.now() - t0; return rec; }
  if (opts.reducedMotion) rec.reducedMotion = true;
  const dDC = diff('D', 'C'); rec.DvsC = dDC.length;
  if (opts.experiment) { rec.CvsC0 = diff('C', 'C0').length; rec.DvsC0 = diff('D', 'C0').length; }
  if (dDC.length && opts.tag) {
    const cdpD = await devtools(pages.D), cdpC = await devtools(pages.C);
    const cap = dDC.slice(0, opts.cap);
    const a = await detail(pages.D, cap), b = await detail(pages.C, cap);
    rec.changed = [];
    for (let j = 0; j < cap.length; j++) {
      const props = Object.keys(a[j].o).filter((k) => a[j].o[k] !== b[j].o[k]);
      const f = await flips(cdpD, cdpC, cap[j], props, t.meta);
      rec.changed.push({ i: cap[j], el: a[j].el.slice(0, 80), props: props.length, sample: props.slice(0, 4).map((k) => `${k}: ${a[j].o[k].slice(0, 40)} | ${b[j].o[k].slice(0, 40)}`), flips: f });
    }
    if (dDC.length > cap.length) rec.changedTruncated = dDC.length - cap.length;
  }
  if (opts.tax && opts.tag) { const t1 = Date.now(); const cdp = await devtools(pages.D); rec.tax = await specificityTax(pages.D, cdp, rec.elements, t.meta); rec.tTax = Date.now() - t1; }
  for (const p of Object.values(pages)) await p.close();
  fs.rmSync(out, { recursive: true, force: true });
  rec.tTotal = Date.now() - t0;
  rec.tAttribution = rec.tTotal - rec.tRender - rec.tCensus - (rec.tTax || 0);
  return rec;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const val = (f, d) => (args.find((a) => a.startsWith(`${f}=`)) || `${f}=${d}`).slice(f.length + 1);
  if (flag('--validate')) {
    const LC = require('./layer-census.cjs');
    const dir = path.join(REPO, 'dist/themes'), tmp = path.join(W, 'validate'); fs.mkdirSync(tmp, { recursive: true });
    for (const pal of (val('--palettes', 'mustard,indaco-dark,a11y-protanopia')).split(',')) {
      fs.copyFileSync(path.join(REPO, `themes/${pal}/${pal}.css`), path.join(tmp, `${pal}.css`));
      for (const m of fs.readFileSync(path.join(tmp, `${pal}.css`), 'utf8').matchAll(/@import\s*["']([^"']+)["']/g)) if (m[1] !== 'lattice' && fs.existsSync(path.join(REPO, `themes/${m[1]}/${m[1]}.css`))) fs.copyFileSync(path.join(REPO, `themes/${m[1]}/${m[1]}.css`), path.join(tmp, `${m[1]}.css`));
      const mine = await sheets(tmp, pal), theirs = await LC.themes(tmp, pal);
      for (const k of ['L', 'C', 'D']) console.log(pal, k, fs.readFileSync(theirs[k], 'utf8') === mine[k] ? 'identical' : 'DIFFERENT');
    }
    void dir; return;
  }
  const decks = args.filter((a) => !a.startsWith('--'));
  const opts = { control: flag('--control'), reducedMotion: flag('--reduced-motion'), experiment: flag('--experiment'), tax: flag('--tax'), tag: !flag('--no-tag'), media: val('--media', 'screen'), cap: Number(val('--cap', '400')) };
  const outFile = val('--out', path.join(W, 'delta.jsonl'));
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  for (const d of decks) {
    let rec;
    try { rec = await deck(browser, d, opts); } catch (e) { rec = { deck: d, error: String(e.message || e).slice(0, 400) }; }
    fs.appendFileSync(outFile, `${JSON.stringify(rec)}\n`);
    console.log(JSON.stringify({ deck: rec.deck, pal: rec.palette, n: rec.elements, unstable: rec.unstable, DvsD: rec.DvsD, DvsC: rec.DvsC, CvsC0: rec.CvsC0, DvsC0: rec.DvsC0, s: Math.round((rec.tTotal || 0) / 1000), err: rec.error?.slice(0, 120), skip: rec.skipped }));
  }
  await browser.close();
}

module.exports = { sheets, engine, debumpSelector, specificity, census, stableCensus, detail, devtools, matchedFor, ruleOf, winnerOf, contenders, inlineDecls, settled, ORDER, layerFor, W, MARP, CHROMIUM };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
