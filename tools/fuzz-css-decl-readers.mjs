#!/usr/bin/env node
/**
 * fuzz-css-decl-readers — the browser oracle for the CSS declaration channel (security spine P2): whether the two
 * refusal readers rebuilt on it (lib/core/css-scan.js `findAddressStrings`, through the whole `findCssExfil` gate, and
 * lib/core/door-attr.mjs `cssRefTargets`, through `attrRefTargets`) let through anything a real browser fetches, against
 * the walks they replaced (frozen in tools/segno-legacy/).
 *
 * Two loads per engine, each against the web-reference fuzz's loopback beacon (test/helpers/web-ref-fuzz.js):
 *   sheets        every CSS input of the fuzz (test/fixtures/web-ref-fuzz.js) as a `<style>`, in its own frame, with
 *                 consumers that read `--q` and `--a` through `image-set(var(…))`. A sheet LEAKS when it fetched and
 *                 the gate does not refuse it.
 *   declarations  each input cut at `{` and `}` into declarations, each set as a `style` attribute (with a child that
 *                 reads its custom properties), rechecked alone. One LEAKS when it fetched and the door would keep it.
 * Usage: node tools/fuzz-css-decl-readers.mjs [--seed N] [--count N] [--engines chromium,webkit,firefox]
 * Prints one JSON report; exit 1 on any leak by the rebuilt readers. The browsers install with
 * `npx playwright install --with-deps webkit firefox` in docs/ (as tools/fuzz-web-refs.mjs needs them).
 * Results for seeds 7 and 11: engineering/decisions/2026-11-03-security-findings-spine.md, "P2, the declaration channel".
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRequire = createRequire(path.join(ROOT, 'docs/package.json'));
const R = createRequire(path.join(ROOT, 'package.json'));
const { chromium, firefox, webkit } = docsRequire('@playwright/test');
const F = R('./test/helpers/web-ref-fuzz.js');
const { fuzzInputs } = R('./test/fixtures/web-ref-fuzz.js');
const oldFind = R('./tools/segno-legacy/find-address-strings.js').findAddressStrings;
const oldDoor = R('./tools/segno-legacy/css-ref-targets.js').cssRefTargets;
const scan = R('./lib/core/css-scan.js');
const { decodeEntities } = R('./lib/core/remote-ref.js');
const { maskCssComments } = await import(path.join(ROOT, 'lib/core/css-comments.mjs'));
const door = await import(path.join(ROOT, 'lib/core/door-attr.mjs'));

const argv = process.argv.slice(2);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const seed = Number(arg('--seed', 7));
const count = Number(arg('--count', 3000));
const engines = arg('--engines', 'chromium,webkit,firefox').split(',');
const TYPES = { chromium, firefox, webkit };

const CONSUMERS = '<style>p,div,span,a{background-image:image-set(var(--q) 1x),image-set(var(--a) 1x);list-style-image:var(--q);border-image-source:var(--a)}</style>';
const sheetDoc = (css) => `<!doctype html><style>${css}</style>${CONSUMERS}<p class="x">x</p><div><span>x</span></div><a href="#x">x</a>`;
const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const declDoc = (d) => `<!doctype html>${CONSUMERS}<div style="${esc(d)}">x<span>y</span></div><svg width="9" height="9"><rect width="9" height="9" style="${esc(d)}"/></svg>`;

const refuses = (items) => items.some((a) => a.kind === 'var' || !scan.urlIsLocal(a.value));
// The whole gate: the address reader plus its keyword rules. The old gate is the same rules with the old reader.
const keywordRefuses = (css) => scan.findCssExfil(css).some((f) => f.rule !== 'css-url-remote' && f.rule !== 'css-var-address');
const gateNew = (css) => scan.findCssExfil(css).length > 0;
const gateOld = (css) => keywordRefuses(css) || refuses(oldFind(maskCssComments(css)));
const doorKeeps = (targets) => !targets.some((t) => !door.isPageOwnRef(t));
const oldAttrTargets = (v) => (v.includes('(') || v.includes('--') ? oldDoor(v) : []).filter(Boolean);

/** Load `docs` (one frame each) and return the names the beacon heard from. */
async function fetchedBy(page, srv, docs) {
  srv.hits.length = 0;
  await page.evaluate(async (list) => {
    const root = document.getElementById('root');
    root.textContent = '';
    await Promise.all(list.map((h) => new Promise((res) => { const f = document.createElement('iframe'); f.onload = res; setTimeout(res, 4000); f.srcdoc = h; root.appendChild(f); })));
  }, docs).catch(() => {});
  await F.settle(srv.hits);
  return new Set(srv.hits.map((h) => F.nameOf(h)));
}

const srv = await F.startServer();
const inputs = fuzzInputs(seed, count, srv.base).filter((x) => x.kind === 'css');
const decls = inputs.flatMap((x) => x.text.split(/[{}]/).filter((d) => d.includes(':')).map((text) => ({ name: x.name, text })));
const report = { seed, count, sheets: inputs.length, declarations: decls.length, engines: {} };
let leaked = false;
for (const e of engines) {
  const browser = await TYPES[e].launch();
  const page = await browser.newPage();
  await page.goto(srv.home);
  const sheetHits = new Set();
  for (let i = 0; i < inputs.length; i += 100) {
    const names = await fetchedBy(page, srv, inputs.slice(i, i + 100).map((x) => sheetDoc(x.text)));
    for (const n of names) sheetHits.add(n);
  }
  const fetchedSheets = inputs.filter((x) => sheetHits.has(x.name));
  const gateLeaks = { old: fetchedSheets.filter((x) => !gateOld(x.text)).map((x) => x.name), new: fetchedSheets.filter((x) => !gateNew(x.text)).map((x) => x.name) };
  const candidates = [];
  for (let i = 0; i < decls.length; i += 150) {
    const batch = decls.slice(i, i + 150);
    const names = await fetchedBy(page, srv, batch.map((d) => declDoc(d.text)));
    batch.forEach((d, k) => {
      if (names.has(d.name)) candidates.push(i + k);
    });
  }
  const alone = [];
  for (const k of candidates) if ((await fetchedBy(page, srv, [declDoc(decls[k].text)])).has(decls[k].name)) alone.push(k);
  const doorLeaks = {
    old: alone.filter((k) => doorKeeps(oldAttrTargets(decodeEntities(decls[k].text)))).map((k) => decls[k].text),
    new: alone.filter((k) => doorKeeps(door.attrRefTargets('div', 'style', decodeEntities(decls[k].text)))).map((k) => decls[k].text),
  };
  report.engines[e] = { sheetsFetched: fetchedSheets.length, gateLeaks, declarationsFetched: alone.length, doorLeaks };
  if (gateLeaks.new.length || doorLeaks.new.length) leaked = true;
  await browser.close();
}
await srv.close();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(leaked ? 1 : 0);
