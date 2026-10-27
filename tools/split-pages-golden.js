#!/usr/bin/env node
/**
 * split-pages-golden — the per-page record of what the structural split EMITS.
 *
 * `test/oracle/split-oracle.json` records each component's split FACTS (axis, strategy,
 * enrollment). Nothing recorded what the split actually produces, page by page, so a refactor
 * of the kernels had no byte-level check. This tool is that check, for Fluid P0 and P1
 * (engineering/decisions/2026-10-27-fluid-layout-library.md §7 "Parity"): the connector over
 * the new core must reproduce today's output exactly before any surface switches over.
 *
 * For every gallery (the baseline gallery plus each component's `*.gallery.md`), at each of
 * the three sizes that split (`square`, `portrait` = tall, `mobile` = strip), it renders the
 * deck with the engine, runs `structuralSplit` — the one preprocessor every surface calls —
 * and hashes each emitted top-level section, once as the CLI calls it and once with `settle: true`
 * as the live previews do. It does not model the Studio's one-slide renders (`firstSlide` > 1). The record keeps the page count and one short
 * hash per page, so a drift names the deck, the size and the first page that moved.
 *
 *   node tools/split-pages-golden.js           # rewrite test/oracle/split-pages.json
 *   node tools/split-pages-golden.js --check   # exit 1 on drift, naming each moved page
 *   node tools/split-pages-golden.js --check --only <substring>   # one deck family
 *
 * On demand, not in CI: the sweep renders 80 decks at three sizes (8.6 s measured). It hashes
 * engine output, so a gallery or markup change anywhere moves it, and gating every PR on it
 * would make each such PR re-bless. Run it before
 * and after any change to the split kernels, and re-bless only when the PR says why each moved
 * page is correct. A diff in the record is a behavior change to review, not noise.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ss = require('../lib/core/structural-split');
const { loadAll } = require('../lib/components');
const { createEngine } = require('../lib/engine');

const ROOT = path.join(__dirname, '..');
const RECORD = path.join(ROOT, 'test', 'oracle', 'split-pages.json');
const SIZES = ['square', 'portrait', 'mobile'];
const THEME = 'indaco';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const onlyAt = args.indexOf('--only');
const ONLY = onlyAt >= 0 ? args[onlyAt + 1] : '';

function galleries() {
  const out = ['test/integration/baseline-decks/gallery.md'];
  const comps = path.join(ROOT, 'lib', 'components');
  for (const bucket of fs.readdirSync(comps).sort()) {
    const dir = path.join(comps, bucket);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name, `${name}.gallery.md`);
      if (fs.existsSync(file)) out.push(path.relative(ROOT, file));
    }
  }
  return out.filter((f) => !ONLY || f.includes(ONLY));
}

// The same front-matter rewrite the unit tests use: drop any authored `size:` and set ours.
function atSize(md, size) {
  const src = md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^---\n[\s\S]*?\n---\n/.test(src)) return `---\nsize: ${size}\n---\n\n${src}`;
  return src.replace(/^(---\n[\s\S]*?)\n---\n/, (_m, fm) => `${fm.replace(/^size:.*$/m, '')}\nsize: ${size}\n---\n`);
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

function sweep() {
  const capacity = ss.splitCapacityFrom(loadAll(path.join(ROOT, 'lib', 'components')));
  const engine = createEngine();
  const record = {};
  for (const file of galleries()) {
    const md0 = fs.readFileSync(path.join(ROOT, file), 'utf8');
    record[file] = {};
    for (const size of SIZES) {
      const md = atSize(md0, size);
      const out = engine.render(md, THEME, { preview: true });
      const opts = { deckSource: md, width: out.width, height: out.height, capacity };
      const r = ss.structuralSplit(out.html, opts);
      const pages = ss.splitTopLevelSections(r.html).map(hash);
      // The live previews (Playground, Studio) call it with `settle: true`, which runs the masthead
      // lift on the emitted pages. Record only the pages that lift changes, keyed by page number.
      const lifted = ss.splitTopLevelSections(ss.structuralSplit(out.html, { ...opts, settle: true }).html).map(hash);
      const settled = Object.fromEntries(lifted.flatMap((h, i) => (h === pages[i] ? [] : [[i + 1, h]])));
      record[file][size] = { split: r.changed, pages, settled };
    }
  }
  return record;
}

function diff(want, got) {
  const lines = [];
  for (const file of new Set([...Object.keys(want), ...Object.keys(got)])) {
    if (!want[file]) { lines.push(`+ ${file}: not in the record`); continue; }
    if (!got[file]) { lines.push(`- ${file}: in the record, not swept`); continue; }
    for (const size of SIZES) {
      const a = want[file][size];
      const b = got[file][size];
      if (!a || !b) { lines.push(`~ ${file} @${size}: missing`); continue; }
      if (a.pages.length !== b.pages.length) lines.push(`~ ${file} @${size}: ${a.pages.length} → ${b.pages.length} pages`);
      const first = a.pages.findIndex((h, i) => h !== b.pages[i]);
      if (first >= 0) lines.push(`~ ${file} @${size}: page ${first + 1} moved first (${a.pages.filter((h, i) => h !== b.pages[i]).length} differ)`);
      if (JSON.stringify(a.settled) !== JSON.stringify(b.settled)) lines.push(`~ ${file} @${size}: the settled (live preview) pages moved`);
    }
  }
  return lines;
}

const t0 = Date.now();
const got = sweep();
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const decks = Object.keys(got).length;
const pages = Object.values(got).reduce((n, d) => n + SIZES.reduce((m, s) => m + d[s].pages.length, 0), 0);

if (CHECK) {
  if (!fs.existsSync(RECORD)) {
    console.error(`split-pages-golden: no record at ${path.relative(ROOT, RECORD)}; run without --check to write it`);
    process.exit(1);
  }
  const all = JSON.parse(fs.readFileSync(RECORD, 'utf8')).decks;
  const want = ONLY ? Object.fromEntries(Object.entries(all).filter(([f]) => f.includes(ONLY))) : all;
  const lines = diff(want, got);
  if (lines.length) {
    console.error(`split-pages-golden: ${lines.length} drift(s) across ${decks} deck(s):`);
    for (const l of lines) console.error(`  ${l}`);
    process.exit(1);
  }
  console.log(`split-pages-golden: OK — ${decks} decks × ${SIZES.length} sizes, ${pages} pages byte-identical (${secs}s)`);
} else {
  if (ONLY) {
    console.error('split-pages-golden: --only is for --check; a bless always sweeps every gallery');
    process.exit(2);
  }
  const body = { about: 'Per-page hashes of structuralSplit output. Written by tools/split-pages-golden.js; a diff is a behavior change to review.', theme: THEME, sizes: SIZES, decks: got };
  fs.writeFileSync(RECORD, `${JSON.stringify(body, null, 1)}\n`);
  console.log(`split-pages-golden: wrote ${path.relative(ROOT, RECORD)} — ${decks} decks × ${SIZES.length} sizes, ${pages} pages (${secs}s)`);
}
