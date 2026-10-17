#!/usr/bin/env node
/**
 * A SKETCH of the bridge conformance harness (the bridge-spec note, §5). It is not the harness: it
 * runs the two checks the spec would run on every bridge, one per entry point, over a few decks and
 * prints what they find, so the note can say what the checks cost and whether they can fail.
 *
 *   from source          tools/export-marp.js  ->  marp-cli PDF
 *   from rendered slide  lattice deck.pptx --editable (Calco)  ->  LibreOffice PDF
 *
 * Both are compared with Lattice's own PDF of the same deck, page by page:
 *   - TEXT check   words in the reference page vs words in the bridge's page.
 *                  recall    = reference words the bridge kept (as editable text, for Calco)
 *                  precision = bridge words that are in the reference (no invented text)
 *   - PIXEL check  RMSE between the two raster pages (ImageMagick `compare`), 0 = identical, 1 = opposite.
 *
 * Needs: Chromium (CHROME_PATH), pdftotext, pdftoppm, ImageMagick, LibreOffice, and marp-cli 4.5.1
 * (not a repo dependency): pass its bin as MARP=/path/to/marp. Usage:
 *   MARP=... node bridge-harness-sketch.mjs <workdir> examples/a11y.md [more decks...]
 * Output: <workdir>/harness-sketch.json and a table on stdout.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const JSZip = require(path.join(ROOT, 'node_modules/jszip'));
const [work, ...decks] = process.argv.slice(2);
const MARP = process.env.MARP;
if (!work || !decks.length) { console.error('usage: MARP=<bin> node bridge-harness-sketch.mjs <workdir> <deck.md>...'); process.exit(2); }
fs.mkdirSync(work, { recursive: true });

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 300000, ...opts });
// A step that must succeed: a failed render must stop the run, not turn into an empty score.
function must(label, r, outFile) {
  if (r.status !== 0 || (outFile && !fs.existsSync(outFile))) {
    throw new Error(`${label} failed (status ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  }
  return r;
}
const words = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const bag = (ws) => ws.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
const overlap = (a, b) => { let n = 0; for (const [w, c] of a) n += Math.min(c, b.get(w) || 0); return n; };

function pdfPages(pdf) {
  const out = run('pdftotext', ['-layout', pdf, '-']).stdout || '';
  return out.split('\f').slice(0, -1);
}
function raster(pdf, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  run('pdftoppm', ['-r', '30', '-png', pdf, path.join(dir, 'p')]);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(dir, f));
}
function rmse(a, b) {
  // Stretch the bridge page onto the reference page's box. A page-size difference is hidden, an
  // aspect-ratio difference is not (it shows up as a pixel difference); every deck here is 16:9.
  const dims = run('identify', ['-format', '%wx%h', a]).stdout;
  const tmp = `${b}.sized.png`;
  run('convert', [b, '-resize', `${dims}!`, tmp]);
  const r = run('compare', ['-metric', 'RMSE', a, tmp, 'null:']);
  const m = /\(([\d.e-]+)\)/.exec(r.stderr || '');
  return m ? Number(m[1]) : null;
}
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Pages are paired by index, which is only meaningful when the counts match. A mismatch (panes,
// focus steps) is reported by the caller as a failure of its own; the rows below are then unreliable.
function score(refPages, gotPages, refPng, gotPng, textOf = (x) => x) {
  const rows = [];
  const n = Math.min(refPages.length, gotPages.length);
  for (let i = 0; i < n; i++) {
    const r = bag(words(refPages[i])); const g = bag(words(textOf(gotPages[i])));
    const rn = [...r.values()].reduce((x, y) => x + y, 0); const gn = [...g.values()].reduce((x, y) => x + y, 0);
    const o = overlap(r, g);
    rows.push({ slide: i + 1, refWords: rn, gotWords: gn, recall: rn ? +(o / rn).toFixed(3) : null, precision: gn ? +(o / gn).toFixed(3) : null, rmse: refPng[i] && gotPng[i] ? rmse(refPng[i], gotPng[i]) : null });
  }
  return rows;
}

const report = [];
for (const deck of decks) {
  const name = path.basename(deck, '.md');
  const dir = path.join(work, name); fs.mkdirSync(dir, { recursive: true });
  const t = {};
  let t0 = Date.now();
  const refPdf = path.join(dir, 'ref.pdf');
  must('reference render', run('node', [path.join(ROOT, 'lattice.js'), deck, refPdf, '--quiet'], { cwd: ROOT }), refPdf);
  t.reference = Date.now() - t0;
  const refPages = pdfPages(refPdf); const refPng = raster(refPdf, path.join(dir, 'ref-png'));
  const entry = { deck: name, slides: refPages.length, ms: t };

  // Entry point 1: from source (the Marp bridge).
  if (MARP) {
    t0 = Date.now();
    const bun = path.join(dir, 'bundle'); fs.rmSync(bun, { recursive: true, force: true });
    must('export-marp', run('node', [path.join(ROOT, 'tools/export-marp.js'), deck, bun], { cwd: ROOT }));
    const mdir = path.join(bun, name);
    const mpdf = path.join(dir, 'marp.pdf');
    const r = run(MARP, ['-c', path.join(mdir, 'marp.config.cjs'), path.join(mdir, `${name}.md`), '--pdf', '--allow-local-files', '-o', mpdf], { env: { ...process.env } });
    t.marp = Date.now() - t0;
    if (fs.existsSync(mpdf)) {
      const pages = pdfPages(mpdf);
      const rows = score(refPages, pages, refPng, raster(mpdf, path.join(dir, 'marp-png')));
      entry.marp = { pages: pages.length, pageCountMatches: pages.length === refPages.length, medianRecall: median(rows.map((x) => x.recall)), medianPrecision: median(rows.map((x) => x.precision)), medianRmse: median(rows.map((x) => x.rmse)), worstRmse: Math.max(...rows.map((x) => x.rmse)), slides: rows };
    } else entry.marp = { error: (r.stderr || '').slice(0, 300) };
  }

  // Entry point 2: from the rendered slide (Calco).
  t0 = Date.now();
  const pptx = path.join(dir, 'calco.pptx');
  must('calco export', run('node', [path.join(ROOT, 'lattice.js'), deck, pptx, '--editable', '--quiet'], { cwd: ROOT }), pptx);
  t.calco = Date.now() - t0;
  if (fs.existsSync(pptx)) {
    const zip = await JSZip.loadAsync(fs.readFileSync(pptx));
    const names = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
    const slideText = [];
    // Runs inside one paragraph join with no space (a style change mid-word is still one word);
    // paragraphs join with a space. One decode pass, so `&amp;lt;` stays `&lt;`.
    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    const decode = (t) => t.replace(/&(amp|lt|gt|quot|apos);|&#(\d+);/g, (_, n, d) => (n ? ENT[n] : String.fromCodePoint(Number(d))));
    for (const f of names) {
      const xml = await zip.file(f).async('string');
      const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join(''));
      slideText.push(paras.join(' '));
    }
    // Text check on the file itself: no office suite needed.
    const textRows = score(refPages, slideText, [], []);
    t0 = Date.now();
    const lo = path.join(dir, 'lo'); fs.mkdirSync(lo, { recursive: true });
    must('libreoffice', run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', lo, pptx], { env: { ...process.env, HOME: path.join(work, 'lohome') } }), path.join(lo, 'calco.pdf'));
    t.libreoffice = Date.now() - t0;
    const lpdf = path.join(lo, 'calco.pdf');
    const loPages = pdfPages(lpdf);
    const pixRows = score(refPages, loPages, refPng, raster(lpdf, path.join(dir, 'lo-png')));
    entry.calco = {
      slidesInFile: names.length, pageCountMatches: names.length === refPages.length && loPages.length === refPages.length,
      editableTextRecall: median(textRows.map((x) => x.recall)), editableTextPrecision: median(textRows.map((x) => x.precision)),
      slidesWithNoEditableText: textRows.filter((x) => !x.gotWords).length,
      medianRmse: median(pixRows.map((x) => x.rmse)), worstRmse: pixRows.length ? Math.max(...pixRows.map((x) => x.rmse)) : null,
      slides: textRows.map((x, i) => ({ ...x, rmse: pixRows[i]?.rmse ?? null })),
    };
  }
  report.push(entry);
  console.error(`done ${name}`);
}
fs.writeFileSync(path.join(work, 'harness-sketch.json'), JSON.stringify(report, null, 2));
const f = (x) => (x == null ? '  - ' : x.toFixed(3));
console.log('deck'.padEnd(22), 'slides', ' marp:recall prec  rmse(med/worst)', '  calco:text-recall prec  rmse(med/worst)  no-text');
for (const e of report) console.log(e.deck.padEnd(22), String(e.slides).padStart(6), '   ', f(e.marp?.medianRecall), f(e.marp?.medianPrecision), f(e.marp?.medianRmse), '/', f(e.marp?.worstRmse), '     ', f(e.calco?.editableTextRecall), f(e.calco?.editableTextPrecision), f(e.calco?.medianRmse), '/', f(e.calco?.worstRmse), '   ', e.calco?.slidesWithNoEditableText);
