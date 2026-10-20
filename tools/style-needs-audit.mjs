/**
 * Audit the style-needs scanner against the real renderer: zero false negatives, and what the false
 * positives cost.
 *
 * `tools/style-needs.js` says which style modules (dist/styles/) a document needs, from the tokens
 * (classes, attributes, tags, ids) it carries. This harness checks that claim on real decks. For each
 * deck it:
 *   1. renders the deck with the CLI, then opens it in a browser and scans the DOM (the HTML scanner);
 *   2. computes the SELECTOR TRUTH: a module is truly used when any of its rules' selectors matches
 *      an element (querySelector, pseudo-elements and interaction states stripped). A scanner miss
 *      against this is a false negative;
 *   3. runs a second scanner that reads only the Markdown (the `_class` / `class` directives), to
 *      show what hints alone would miss;
 *   4. COMPUTED-STYLE GATE: re-renders the deck with a layout stylesheet made of only the modules the
 *      HTML scan says are needed (`lattice -c subset.css`), and compares every element's computed
 *      style, plus ::before and ::after, against the full render. Run in screen, print and dark
 *      color-scheme. Elements that differ between two loads of the SAME full render (animations,
 *      time) are noise and subtracted. Any remaining difference means a needed module was dropped.
 *
 * Usage:  node tools/style-needs-audit.mjs [deck.md ...] [--all] [--sample N] [--jobs 3]
 *                                          [--engine chromium|webkit] [--no-gate] [--json out.json]
 * `--all` is the 280 decks in examples/ plus the 120-slide gallery. Needs `npm run css:build` first.
 * Linux engines only; real iOS is not measured (HARD RULE #23).
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { buildIndex, scanDocument, neededModules } = require('./style-needs.js');
const { runtimeTokensFor } = require('./style-needs-lattice.js');
const { fingerprints, open } = await import('./style-gate-lib.mjs');
const { chromium, webkit } = await import(path.join(ROOT, 'docs/node_modules/@playwright/test/index.mjs'));

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const flag = (n) => argv.includes(n);
const valueArgs = new Set(['--sample', '--jobs', '--engine', '--json']);
let decks = argv.filter((a, i) => !a.startsWith('--') && !valueArgs.has(argv[i - 1]));
if (flag('--all') || decks.length === 0) {
  decks = fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).sort().map((f) => path.join('examples', f));
  decks.push('test/integration/baseline-decks/gallery.md');
}
const sample = Number(opt('--sample', '0'));
if (sample > 0) decks = decks.filter((_, i) => i % Math.ceil(decks.length / sample) === 0);
const jobs = Math.max(1, Number(opt('--jobs', '3')));
const engine = opt('--engine', 'chromium');
const gate = !flag('--no-gate');
if (!['chromium', 'webkit'].includes(engine)) {
  console.error('--engine must be chromium or webkit');
  process.exit(2);
}

// The Lattice adapter's RUNTIME TOKENS live in tools/style-needs-lattice.js (shared with the docs sync).
let runtime;

const manifestPath = path.join(ROOT, 'dist/styles/manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('dist/styles/ is missing; run `npm run css:build` first');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const modules = manifest.modules.map((m) => ({ ...m, text: fs.readFileSync(path.join(ROOT, 'dist/styles', m.file), 'utf8') }));
// The minified twin: same ids, same order, joined with nothing between them to make lattice-min.css.
const manifestMin = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/styles-min/manifest.json'), 'utf8'));
const modulesMin = manifestMin.modules.map((m) => ({ ...m, text: fs.readFileSync(path.join(ROOT, 'dist/styles-min', m.file), 'utf8') }));
if (modulesMin.length !== modules.length || modulesMin.some((m, i) => m.id !== modules[i].id)) {
  console.error('dist/styles and dist/styles-min list different modules; run `npm run css:build`');
  process.exit(2);
}
if (modulesMin.map((m) => m.text).join('') !== fs.readFileSync(path.join(ROOT, 'dist/lattice-min.css'), 'utf8')) {
  console.error('dist/styles-min does not join back into dist/lattice-min.css; run `npm run css:build`');
  process.exit(2);
}
const index = buildIndex(modules);
runtime = runtimeTokensFor(index);
const indexSel = buildIndex(modules, { selectors: true });
const bytes = modules.map((m) => m.bytes);
const sum = (flags) => flags.reduce((a, f, i) => a + (f ? bytes[i] : 0), 0);

// ---- the Markdown scanner: what hints alone know -------------------------------------------------
function markdownTokens(md) {
  const classes = new Set();
  for (const m of md.matchAll(/(?:^|[\s<!-])_?class:\s*([^\n]*?)\s*(?:-->|\n|$)/g)) for (const x of m[1].split(/\s+/)) if (x) classes.add(x.replace(/['"]/g, '').toLowerCase());
  for (const m of md.matchAll(/(?<![\w-])class="([^"]+)"/g)) for (const x of m[1].split(/\s+/)) classes.add(x.toLowerCase());
  return classes;
}
// Hints cannot see attributes, tags or ids, so grant them everything the index could ask of those:
// this is the BEST case for hints, and they still miss.
function hintFlags(classes) {
  const all = new Set(['*']);
  const tokens = { c: classes, a: new Proxy(all, { get: () => () => true }), t: new Proxy(all, { get: () => () => true }), i: new Proxy(all, { get: () => () => true }) };
  const has = (s) => (x) => s.has(x);
  return index.map((m) => m.always || m.alts.some((alt) => alt[0].every(has(tokens.c))));
}

// ---- page-side helpers (serialized into the browser; self-contained) ------------------------------
function pageTruth(mods) {
  // The loosest reading of "this rule could match": state pseudo-classes and pseudo-elements removed
  // at the top level; a selector that still carries one (inside :not/:is/:has) counts as matched.
  const STATE = 'hover|focus-visible|focus-within|focus|active|visited|link|any-link|target-within|target|checked|indeterminate|default|enabled|disabled|required|optional|valid|invalid|user-valid|user-invalid|in-range|out-of-range|read-only|read-write|placeholder-shown|autofill|open|popover-open|modal|fullscreen|picture-in-picture|playing|paused|seeking|buffering|stalled|muted|current|past|future|defined';
  const stateRe = new RegExp(`:(?:${STATE})(?![-\\w])`, 'gi');
  // A functional pseudo whose arguments are interaction state (`:not(:hover)`, `:is(:hover, :focus)`) is
  // removed whole: taking just the state out would leave `:not()`, a selector that matches nothing.
  const dropStateFns = (s) => {
    let prev;
    let out = s;
    do {
      prev = out;
      out = out.replace(/:(?:not|is|where|has|matches)\(([^()]*)\)/gi, (m, inner) => (stateRe.test(inner) || /::/.test(inner) ? '' : m));
      stateRe.lastIndex = 0;
    } while (out !== prev);
    return out;
  };
  const strip = (s) => dropStateFns(s).replace(/::[\w-]+(\([^)]*\))?/g, '').replace(stateRe, '');
  const stillDynamic = (s) => new RegExp(`:(?:${STATE})(?![-\\w])`, 'i').test(s) || /::|&|:scope/.test(s);
  // Per module: the bytes of its rules that match some element (0 = no rule matches).
  return mods.map((text) => {
    const sh = new CSSStyleSheet();
    try {
      sh.replaceSync(text.replace(/@import[^;]+;/g, ''));
    } catch {
      return -1;
    }
    let matched = 0;
    const walk = (list) => {
      for (const r of list) {
        if (r.type === 1) {
          try {
            const q = strip(r.selectorText);
            if (stillDynamic(q) || document.querySelector(q)) matched += r.cssText.length;
          } catch {
            matched += r.cssText.length; // unparseable in this engine: assume it could match
          }
        } else if (r.type === 5 || r.type === 7) {
          // @font-face / @keyframes: defined by name, not matched
        } else if (r.cssRules) walk(r.cssRules);
      }
    };
    walk(sh.cssRules);
    return matched;
  });
}

// ---- one deck ------------------------------------------------------------------------------------
async function auditDeck(browser, deck, tmp) {
  const name = path.basename(deck, '.md');
  const md = fs.readFileSync(path.join(ROOT, deck), 'utf8');
  const html = path.join(tmp, `${name}.html`);
  const r = { deck, ok: false };
  try {
    // The baseline is the DEFAULT render (no -c). A subset rides `-c <file>` made of the MINIFIED modules
    // (dist/styles-min), because the engine's content mask (lib/engine/css.js `isPaginationTarget`) reads
    // the selector's spelling: on the minified spelling the default render ships, `-c` is byte-identical
    // to it (checked below on every run); on the source spelling it is not, which is what made claim.md
    // differ when this harness fed unminified modules (followups.d/2780-p8, found here). The subset
    // therefore takes the same mask and the same minified text as the default path.
    await run('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, deck), html, '-q'], { timeout: 240000, maxBuffer: 1 << 26 });
  } catch (e) {
    r.error = `render: ${String(e.message).split('\n')[0].slice(0, 120)}`;
    return r;
  }
  const page = await open(browser, html);
  if ((await page.$$eval('section', (s) => s.length)) === 0) {
    await page.close();
    r.error = 'no <section>';
    return r;
  }
  const tokens = await page.evaluate(`(() => { const scan = ${scanDocument.toString()}; const t = scan(document.documentElement); return { c: [...t.c], a: [...t.a], t: [...t.t], i: [...t.i], s: t.s }; })()`);
  const tok = { c: new Set(tokens.c), a: new Set(tokens.a), t: new Set(tokens.t), i: new Set(tokens.i), s: tokens.s };
  const t0 = performance.now();
  const tokenNeed = neededModules(index, tok, undefined, runtime);
  r.indexMs = +(performance.now() - t0).toFixed(2);
  // Pane decks (<lat-pane>) are styled by selectors the engine rewrites per deck (lib/core/pane-css.js
  // adds `section lat-pane.x …` twins), which the raw module selectors cannot be asked about: they
  // fall back to the token filter. Found by the computed-style gate on examples/chart-lead-blocks.md.
  const verifiable = !tokens.t.includes('lat-pane');
  // The verified scan runs in the page, where `querySelector` can answer for the met alternatives.
  // Data goes in as an ARGUMENT, never spliced into code: the tokens come from the deck being audited.
  // Only the scanner's own function text is turned back into code in the page.
  const ver = await page.evaluate(
    ({ fnSrc, index: idx, tok, rt, useDoc }) => {
      const need = new Function(`return (${fnSrc})`)();
      const t = { c: new Set(tok.c), a: new Set(tok.a), t: new Set(tok.t), i: new Set(tok.i), s: tok.s };
      const t0 = performance.now();
      const flags = need(idx, t, useDoc ? document : undefined, rt);
      return { flags, ms: performance.now() - t0 };
    },
    { fnSrc: neededModules.toString(), index: indexSel, tok: tokens, rt: runtime, useDoc: verifiable },
  );
  const need = ver.flags;
  r.verifiedMs = +ver.ms.toFixed(2);
  const matchedBytes = await page.evaluate(pageTruth, modules.map((m) => m.text));
  const truth = matchedBytes.map((b) => b !== 0); // -1 (unparseable) counts as used
  const hint = hintFlags(markdownTokens(md));
  const fn = (flags) => flags.map((f, i) => (truth[i] && !f ? i : -1)).filter((i) => i >= 0);
  const fnHtml = fn(need);
  const fnHint = fn(hint);
  Object.assign(r, {
    ok: true,
    modules: modules.length,
    totalBytes: sum(modules.map(() => true)),
    matchedRuleBytes: matchedBytes.reduce((a, b) => a + Math.max(b, 0), 0),
    perModule: need.map((f, i) => (f ? [i, Math.max(matchedBytes[i], 0)] : null)).filter(Boolean),
    truthModules: truth.filter(Boolean).length,
    truthBytes: sum(truth),
    tokenModules: tokenNeed.filter(Boolean).length,
    tokenBytes: sum(tokenNeed),
    tokenFalseNegatives: fn(tokenNeed).map((i) => modules[i].id),
    htmlModules: need.filter(Boolean).length,
    htmlBytes: sum(need),
    htmlFalseNegatives: fnHtml.map((i) => modules[i].id),
    htmlFalsePositives: need.map((f, i) => (f && !truth[i] ? i : -1)).filter((i) => i >= 0).map((i) => modules[i].id),
    hintModules: hint.filter(Boolean).length,
    hintBytes: sum(hint),
    hintFalseNegatives: fnHint.map((i) => modules[i].id),
    hintFalseNegativeBytes: sum(modules.map((_, i) => fnHint.includes(i))),
    elements: await page.evaluate(() => document.querySelectorAll('section, section *').length),
  });
  if (gate) {
    const full1 = await fingerprints(page);
    await page.close();
    const again = await open(browser, html);
    const full2 = await fingerprints(again);
    await again.close();
    const subsetCss = path.join(tmp, `${name}.subset.css`);
    const subsetHtml = path.join(tmp, `${name}.subset.html`);
    fs.writeFileSync(subsetCss, modulesMin.filter((_, i) => need[i]).map((m) => m.text).join(''));
    await run('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, deck), subsetHtml, '-c', subsetCss, '-q'], { timeout: 240000, maxBuffer: 1 << 26 });
    const sub = await open(browser, subsetHtml);
    const subFp = await fingerprints(sub);
    await sub.close();
    r.gate = {};
    for (const k of Object.keys(full1)) {
      let noise = 0;
      let diff = 0;
      full1[k].forEach((h, i) => {
        if (h !== full2[k][i]) noise++;
        else if (h !== subFp[k][i]) diff++;
      });
      if (full1[k].length !== subFp[k].length) diff += Math.abs(full1[k].length - subFp[k].length);
      r.gate[k] = { elements: full1[k].length, noise, differing: diff };
    }
    // tokens are informational: how many slides see a different custom-property set
    r.tokensDiffering = r.gate.tokens.differing;
    delete r.gate.tokens;
  } else await page.close();
  return r;
}

// ---- main ------------------------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'style-needs-'));
const browser = await (engine === 'webkit' ? webkit : chromium).launch();
const results = [];
let next = 0;
const worker = async () => {
  while (next < decks.length) {
    const deck = decks[next++];
    const t = performance.now();
    let r;
    try {
      r = await auditDeck(browser, deck, tmp);
    } catch (e) {
      r = { deck, ok: false, error: String(e.message).split('\n')[0].slice(0, 160) };
    }
    r.ms = Math.round(performance.now() - t);
    results.push(r);
    const g = r.gate ? Object.values(r.gate).reduce((a, x) => a + x.differing, 0) : '-';
    console.error(`[${results.length}/${decks.length}] ${r.deck} ${r.ok ? `html-FN ${r.htmlFalseNegatives.length} hint-FN ${r.hintFalseNegatives.length} gate-diff ${g}` : `SKIP ${r.error}`}`);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

results.sort((a, b) => a.deck.localeCompare(b.deck));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(results, null, 1));
const ok = results.filter((r) => r.ok);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`\n${engine}: ${ok.length} decks audited, ${results.length - ok.length} skipped${gate ? '' : ' (gate off)'}`);
for (const r of results.filter((x) => !x.ok)) console.log(`  skipped ${r.deck}: ${r.error}`);
const total = ok[0]?.totalBytes || 0;
console.log(`all ${modules.length} modules: ${kb(total)}`);
console.log(`selector truth      median ${kb(med(ok.map((r) => r.truthBytes)))} (${med(ok.map((r) => r.truthModules))} modules)`);
console.log(`token scan loads    median ${kb(med(ok.map((r) => r.tokenBytes)))} (${med(ok.map((r) => r.tokenModules))} modules); false negatives ${ok.reduce((a, r) => a + r.tokenFalseNegatives.length, 0)}; index lookup ${med(ok.map((r) => r.indexMs))} ms`);
console.log(`index size          tokens only ${kb(JSON.stringify(index).length)}, with selectors ${kb(JSON.stringify(indexSel).length)}`);
console.log(`verified scan loads median ${kb(med(ok.map((r) => r.htmlBytes)))} (${med(ok.map((r) => r.htmlModules))} modules); max ${kb(Math.max(...ok.map((r) => r.htmlBytes)))}`);
console.log(`  false negatives   ${ok.reduce((a, r) => a + r.htmlFalseNegatives.length, 0)} modules across ${ok.filter((r) => r.htmlFalseNegatives.length).length} decks`);
console.log(`  scan cost         median ${med(ok.map((r) => r.verifiedMs))} ms in the page (token filter, then querySelector on the met alternatives)`);
console.log(`hints alone load    median ${kb(med(ok.map((r) => r.hintBytes)))}`);
console.log(`  false negatives   ${ok.reduce((a, r) => a + r.hintFalseNegatives.length, 0)} modules across ${ok.filter((r) => r.hintFalseNegatives.length).length} decks (${kb(ok.reduce((a, r) => a + r.hintFalseNegativeBytes, 0))} of CSS missing in total)`);
if (gate) {
  const bad = ok.filter((r) => r.gate && Object.values(r.gate).some((x) => x.differing > 0));
  console.log(`custom-property sets differing (informational): ${ok.filter((r) => r.tokensDiffering > 0).length} of ${ok.length} decks`);
  console.log(`computed-style gate ${ok.length - bad.length} of ${ok.length} decks identical in screen, print and dark; ${bad.length} differ`);
  for (const r of bad) console.log(`  DIFF ${r.deck}: ${JSON.stringify(r.gate)}`);
}
{
  console.log(`rules that match   median ${kb(med(ok.map((r) => r.matchedRuleBytes)))} of the ${kb(med(ok.map((r) => r.htmlBytes)))} loaded`);
  // Regroup candidates: modules loaded by many decks that carry mostly unmatched rules.
  const stat = new Map();
  for (const r of ok) for (const [i, m] of r.perModule) {
    const e = stat.get(i) || { decks: 0, matched: 0 };
    e.decks++;
    e.matched += m;
    stat.set(i, e);
  }
  const rows = [...stat].map(([i, e]) => ({ id: modules[i].id, bytes: bytes[i], decks: e.decks, avgMatched: e.matched / e.decks }))
    .map((x) => ({ ...x, waste: x.decks * Math.max(0, x.bytes - x.avgMatched) }))
    .sort((a, b) => b.waste - a.waste);
  const totalWaste = rows.reduce((a, x) => a + x.waste, 0);
  console.log(`regroup candidates (loaded bytes whose rules do not match, summed over decks; ${kb(totalWaste / ok.length)} per deck on average):`);
  for (const x of rows.slice(0, 15)) console.log(`    ${x.id}  ${kb(x.bytes)}, loaded by ${x.decks}/${ok.length} decks, ${(100 * x.avgMatched / x.bytes).toFixed(0)}% matched, ${(100 * x.waste / totalWaste).toFixed(0)}% of all waste`);
  const fp = new Map();
  for (const r of ok) for (const id of r.htmlFalsePositives) fp.set(id, (fp.get(id) || 0) + 1);
  const byId = new Map(modules.map((m) => [m.id, m.bytes]));
  const top = [...fp].map(([id, n]) => [id, n, byId.get(id)]).sort((a, b) => b[1] * b[2] - a[1] * a[2]).slice(0, 12);
  const wasted = ok.map((r) => r.htmlBytes - r.truthBytes);
  console.log(`false positives     median ${kb(med(wasted))} loaded but no rule matches; worst offenders (decks x size):`);
  for (const [id, n, b] of top) console.log(`    ${id}  ${n} decks, ${kb(b)}`);
}
for (const r of ok.filter((x) => x.htmlFalseNegatives.length)) console.log(`  HTML FN ${r.deck}: ${r.htmlFalseNegatives.join(', ')}`);
