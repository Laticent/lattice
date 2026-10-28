#!/usr/bin/env node
/**
 * fit-harness — score split policies on real decks, perturbed, at every box and venue.
 *
 * WHY. Fit has been janky for months because each policy was judged on a handful of slides.
 * A rule that looked right on the gallery broke on another deck or size, and a small edit
 * moved the pages. This samples the whole space at once and measures the failure rates
 * directly (engineering/decisions/2026-10-28-fit-everywhere-model.md §3–§4).
 *
 * WHAT IT DOES.
 *   1. Content: every slide of every source deck, plus perturbed copies of each slide that has a
 *      collection (one member more or fewer, text ±10% and ±40%, long words;
 *      tools/lib/fit-harness/perturb.js). The copies ride in the same deck as the original, so a
 *      batch renders in one CLI call.
 *   2. Renders each batch at every box × venue twice: as the CLI exports it (arm `structural`,
 *      today's split) and whole (tools/lib/fit-harness/render-whole.js).
 *   3. Builds the fit-first arms in the page on the whole render (tools/lib/fit-harness/page.js),
 *      and computes `fit-then-structural`: the whole slide when it fits, today's pages otherwise.
 *   4. Scores every arm with ONE oracle, the export's own overflow probes, in the export's own
 *      browser (CHROME_PATH). Hard rules first (a page the probe rejects; content lost), then
 *      stability, page count, thin pages and timing.
 *
 * MAPPING. A batch slide can render as more than one section (a panes slide at a non-wide box
 * emits one per pane), so the harness renders each batch slide alone with the engine and counts
 * its sections. A batch whose browser section count disagrees with that sum, or whose sections
 * the CLI's own `deckSlideSections` does not all find (broken markup reparents them), is REJECTED
 * and named in the report, never scored by a shifted map.
 *
 *   node tools/fit-harness.js                        # galleries, square + story, laptop + hall
 *   node tools/fit-harness.js --sizes hd,square,portrait,story --venues laptop,conference,hall
 *   node tools/fit-harness.js --corpus all           # galleries + examples
 *   node tools/fit-harness.js --only inventory       # source decks whose path contains this
 *   node tools/fit-harness.js --jobs 4 --out .scratch/fit-harness
 *
 * Writes <out>/results.json (every slide × arm × box × venue) and <out>/report.md, and prints
 * the report. Advisory: exit 0 unless the harness itself fails. Needs CHROME_PATH.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EDITS, slidesOf } = require('./lib/fit-harness/perturb.js');
const { PAGE_SRC } = require('./lib/fit-harness/page.js');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, IGNORED_BEARER_SELECTOR, PROBE_SRC, CONTENT_CLIPPED_SRC, FRAME_TOLERANCE } = require('../lib/core/overflow-probe');
const { DECK_SLIDES_SRC } = require('../lib/core/deck-slides');
const { createEngine } = require('../lib/engine');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const SIZES = flag('sizes', 'square,story').split(',');
const VENUES = flag('venues', 'laptop,hall').split(',');
const JOBS = Number(flag('jobs', '4'));
const OUT = path.resolve(ROOT, flag('out', '.scratch/fit-harness'));
const ONLY = flag('only', '');
const CORPUS = flag('corpus', 'galleries');
// Temp decks sit beside their source (so relative assets resolve); the run tag keeps two runs
// from deleting each other's inputs.
const RUN = `${process.pid}-${Date.now().toString(36)}`;
// Spare room, as a share of the content area, for the margin and hysteresis arms.
const MARGINS = [0.05, 0.1, 0.2];
const FIT_ARMS = [
  { name: 'fit-greedy', policy: { pack: 'greedy' } },
  { name: 'fit-balanced', policy: { pack: 'balanced' } },
];

function sources() {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  let list = [path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), ...walk(path.join(ROOT, 'lib/components')).filter((f) => f.endsWith('.gallery.md'))];
  if (CORPUS === 'all') list = list.concat(fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).map((f) => path.join(ROOT, 'examples', f)));
  return list.filter((f) => !ONLY || f.includes(ONLY)).sort();
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

/** One batch deck per source: each slide, then its perturbed copies, with a map of what is where. */
function batch(src) {
  // A markdown ingest: strip the BOM and fold CRLF and lone CR before splitting into slides.
  const raw = fs.readFileSync(src, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const keep = fm ? fm[1].split('\n').filter((l) => !/^(size|venue|class)\s*:/.test(l)).join('\n') : '';
  const slides = slidesOf(fm ? raw.slice(fm[0].length) : raw);
  const out = [];
  const map = [];
  slides.forEach((s, k) => {
    out.push(s);
    map.push({ slide: k + 1, variant: 'orig' });
    for (const [name, edit] of Object.entries(EDITS)) {
      const v = edit(s);
      // A variant that only moves whitespace changes nothing, and would dilute the jank rate.
      if (v && squash(v) !== squash(s)) { out.push(v); map.push({ slide: k + 1, variant: name }); }
    }
  });
  return { keep, slides: out, map };
}

/** Sections each batch slide renders as at one box: the engine, one slide at a time. */
function sectionCounts(engine, keep, slides, size) {
  return slides.map((s) => {
    const md = `---\n${keep ? `${keep}\n` : ''}size: ${size}\n---\n\n${s}\n`;
    return (engine.render(md, 'indaco', { preview: true }).html.match(/<section\b/g) || []).length;
  });
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, err }));
  });
}
async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); });
  await Promise.all(workers);
}

/** Leaves of the source not found on any page, counted as a multiset of exact strings. */
function lostCount(source, pages) {
  const have = new Map();
  for (const pg of pages) for (const l of pg.leaves) have.set(l, (have.get(l) || 0) + 1);
  let lost = 0;
  for (const l of source) {
    const n = have.get(l) || 0;
    if (n > 0) have.set(l, n - 1); else lost++;
  }
  return lost;
}

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(path.join(OUT, 'html'), { recursive: true });
  const engine = createEngine();
  const srcs = sources();
  const jobs = [];
  const decks = {};
  const temps = [];
  for (const src of srcs) {
    const { keep, slides, map } = batch(src);
    const id = path.relative(ROOT, src).replace(/[/.]/g, '_');
    decks[id] = { src: path.relative(ROOT, src), map, counts: Object.fromEntries(SIZES.map((size) => [size, sectionCounts(engine, keep, slides, size)])) };
    const body = slides.join('\n\n---\n\n');
    for (const size of SIZES) for (const venue of VENUES) {
      const deck = path.join(path.dirname(src), `.fit-harness-${RUN}-${id}-${size}-${venue}.md`);
      fs.writeFileSync(deck, `---\n${keep ? `${keep}\n` : ''}size: ${size}\nvenue: ${venue}\n---\n\n${body}\n`);
      temps.push(deck);
      const key = `${id}@${size}@${venue}`;
      jobs.push({ key, args: ['lattice.js', deck, path.join(OUT, 'html', `${key}-A.html`)] });
      jobs.push({ key, args: ['tools/lib/fit-harness/render-whole.js', deck, path.join(OUT, 'html', `${key}-W.html`)] });
    }
  }
  const problems = [];
  try {
    await pool(jobs, JOBS, async (j) => { const r = await run(process.execPath, j.args); if (r.code) problems.push(`render failed: ${path.basename(j.args[2])}`); });
  } finally {
    for (const t of temps) fs.rmSync(t, { force: true });
  }
  const tRender = Date.now();

  const { chromium } = require('playwright');
  // The export's own browser: Playwright's bundled build flips a verdict now and then.
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const cfg = { probeSrc: PROBE_SRC, ccSrc: CONTENT_CLIPPED_SRC, slidesSrc: DECK_SLIDES_SRC, clipSel: CLIP_CELL_SELECTOR, ignoreSel: IGNORED_CLIP_SELECTOR, bearerSel: IGNORED_BEARER_SELECTOR, tol: FRAME_TOLERANCE };
  const open = async (file) => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 2400 } });
    await p.goto(`file://${file}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    await p.evaluate(`${PAGE_SRC}(${JSON.stringify(cfg)})`);
    return p;
  };
  const rows = [];
  const keys = [...new Set(jobs.map((j) => j.key))];
  await pool(keys, Math.max(1, Math.min(JOBS, 4)), async (key) => {
    const [id, size, venue] = key.split('@');
    const { src, map, counts } = decks[id];
    const A = path.join(OUT, 'html', `${key}-A.html`);
    const W = path.join(OUT, 'html', `${key}-W.html`);
    if (!fs.existsSync(A) || !fs.existsSync(W)) { problems.push(`missing render: ${key}`); return; }
    // W section number (1-based, document order) → batch slide index.
    const owner = [];
    counts[size].forEach((c, i) => { for (let k = 0; k < c; k++) owner.push(i); });

    const pw = await open(W);
    const wInfo = await pw.evaluate((margins) => ({
      check: window.__fit.census(),
      leaves: window.__fit.sections().map((s) => window.__fit.leaves(s)),
      // Per section: does it fit with each margin of spare room (for the margin and hysteresis arms)?
      margin: window.__fit.sections().map((s) => Object.fromEntries(margins.map((m) => [m, window.__fit.fitsWithMargin(s, m)]))),
    }), MARGINS);
    await pw.close();
    if (!wInfo.check.ok || wInfo.leaves.length !== owner.length) {
      problems.push(`rejected ${key} (whole): ${wInfo.leaves.length} sections, engine says ${owner.length}; deckSlideSections ${wInfo.check.deck} of ${wInfo.check.all}`);
      return;
    }
    const pa = await open(A);
    const aInfo = await pa.evaluate(() => ({
      check: window.__fit.census(),
      pages: window.__fit.sections().map((s) => ({ run: Number(s.dataset.splitRun || s.dataset.latticeSlide), ...window.__fit.page(s) })),
    }));
    await pa.close();
    if (!aInfo.check.ok) { problems.push(`rejected ${key} (structural): deckSlideSections ${aInfo.check.deck} of ${aInfo.check.all} — broken markup`); return; }

    const arms = { structural: map.map(() => ({ pages: [], how: 'whole', ms: null })) };
    for (const pg of aInfo.pages) {
      const i = owner[pg.run - 1];
      if (i === undefined) { problems.push(`unmapped structural page in ${key}: run ${pg.run}`); continue; }
      arms.structural[i].pages.push(pg);
    }
    for (const r of arms.structural) if (r.pages.length > 1) r.how = 'split';
    for (const arm of FIT_ARMS) {
      const p = await open(W);
      const built = await p.evaluate((policy) => window.__fit.sections().map((s) => {
        const r = window.__fit.build(s, policy);
        return { pages: r.pages.map((pg) => window.__fit.page(pg)), how: r.how, ms: r.ms };
      }), arm.policy);
      await p.close();
      const per = map.map(() => ({ pages: [], how: 'fits', ms: 0 }));
      built.forEach((b, w) => {
        const r = per[owner[w]];
        r.pages.push(...b.pages);
        r.ms += b.ms;
        if (b.how !== 'fits') r.how = r.how === 'fits' ? b.how : r.how;
      });
      arms[arm.name] = per;
    }
    // A batch slide fits with a margin when every one of its sections does.
    const margin = map.map(() => Object.fromEntries(MARGINS.map((m) => [m, true])));
    wInfo.margin.forEach((mm, w) => { for (const m of MARGINS) if (!mm[m]) margin[owner[w]][m] = false; });
    const source = map.map(() => []);
    wInfo.leaves.forEach((l, w) => { source[owner[w]].push(...l); });
    map.forEach((meta, i) => {
      for (const [arm, per] of Object.entries(arms)) {
        const r = per[i];
        if (!r.pages.length) { problems.push(`no pages: ${key} ${arm} slide ${meta.slide} ${meta.variant}`); continue; }
        const where = {};
        for (const l of source[i]) if (!(l in where)) where[l] = r.pages.findIndex((pg) => pg.leaves.includes(l));
        rows.push({ src, slide: meta.slide, variant: meta.variant, size, venue, arm, how: r.how, ms: r.ms, lost: lostCount(source[i], r.pages), margin: margin[i],
          pages: r.pages.map((pg) => ({ fits: pg.fits, px: pg.px, cut: pg.cut, fill: pg.fill })), where });
      }
    });
    process.stdout.write('.');
  });
  await browser.close();
  // The hybrid's trigger, computed from the two arms already scored: the whole slide when it
  // fits at its box and venue, today's structural pages otherwise. Packing members per page
  // inside today's builders needs the engine change P2 makes; this arm isolates the trigger.
  const fg = new Map(rows.filter((r) => r.arm === 'fit-greedy').map((r) => [`${r.src}#${r.slide}#${r.variant}#${r.size}#${r.venue}`, r]));
  for (const r of rows.filter((x) => x.arm === 'structural')) {
    const g = fg.get(`${r.src}#${r.slide}#${r.variant}#${r.size}#${r.venue}`);
    if (!g) continue;
    const whole = g.how === 'fits';
    rows.push({ ...(whole ? g : r), arm: 'fit-then-structural', how: whole ? 'fits' : r.how, ms: whole ? g.ms : null });
  }
  // Margin (stateless; what a file can do): whole only when the slide fits with room to spare.
  // Hysteresis (stateful; what a live screen can do): an edit keeps the original's decision unless
  // it must change. A whole slide stays whole until it overflows; a split slide rejoins only with
  // room to spare. Scored on the edit pairs: each variant's decision depends on its original's.
  const byStructural = new Map(rows.filter((r) => r.arm === 'structural').map((r) => [`${r.src}#${r.slide}#${r.variant}#${r.size}#${r.venue}`, r]));
  const greedy = rows.filter((r) => r.arm === 'fit-greedy');
  const greedyOrig = new Map(greedy.filter((r) => r.variant === 'orig').map((r) => [`${r.src}#${r.slide}#${r.size}#${r.venue}`, r]));
  const pick = (g, whole, arm) => {
    const st = byStructural.get(`${g.src}#${g.slide}#${g.variant}#${g.size}#${g.venue}`);
    if (!st) return;
    rows.push({ ...(whole ? g : st), arm, how: whole ? 'fits' : st.how, ms: whole ? g.ms : null });
  };
  for (const m of MARGINS) for (const g of greedy) pick(g, g.how === 'fits' && g.margin[m], `margin-${m * 100}`);
  // Hysteresis with two thresholds: the FIRST decision (the original) keeps a slide whole only with
  // `enter` to spare; after that, a whole slide stays whole until it overflows, and a split slide
  // rejoins only with `exit` to spare. enter = 0 is plain hysteresis.
  const hyst = (enter, exit) => {
    const firstWhole = (g) => g.how === 'fits' && (enter === 0 || g.margin[enter]);
    for (const g of greedy) {
      const o = greedyOrig.get(`${g.src}#${g.slide}#${g.size}#${g.venue}`);
      const fits = g.how === 'fits';
      const whole = g.variant === 'orig' || !o ? firstWhole(g) : firstWhole(o) ? fits : fits && g.margin[exit];
      pick(g, whole, `hysteresis-${enter * 100}-${exit * 100}`);
    }
  };
  hyst(0, 0.2);
  hyst(0.1, 0.2);
  const tScore = Date.now();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(rows));
  const report = summarize(rows, { renders: jobs.length, problems, renderS: (tRender - t0) / 1000, scoreS: (tScore - tRender) / 1000, sources: srcs.length });
  fs.writeFileSync(path.join(OUT, 'report.md'), report);
  console.log(`\n${report}`);
}

/** Stability: of the leaves an edit did not touch, the share of pairs whose same-page status flipped. */
function pairFlips(a, b) {
  const shared = Object.keys(a.where).filter((l) => l in b.where && a.where[l] >= 0 && b.where[l] >= 0);
  let pairs = 0;
  let flips = 0;
  for (let i = 0; i < shared.length; i++) for (let j = i + 1; j < shared.length; j++) {
    pairs++;
    const x = shared[i];
    const y = shared[j];
    if ((a.where[x] === a.where[y]) !== (b.where[x] === b.where[y])) flips++;
  }
  return pairs ? flips / pairs : 0;
}

function summarize(rows, run) {
  const q = (xs, k) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(k * (s.length - 1))] : 0; };
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const clipsContent = (r) => r.pages.some((p) => !p.fits && p.cut !== 'footer');
  const lines = [];
  lines.push('# Fit harness report', '');
  lines.push(`${run.sources} source decks, ${run.renders} renders. Render ${run.renderS.toFixed(0)} s, score ${run.scoreS.toFixed(0)} s. ${run.problems.length} problem(s)${run.problems.length ? ' (listed at the end)' : ''}.`, '');
  lines.push('**Clips** are slides with a page the export\'s overflow probe rejects for content (a cut that lands only in chrome, such as a long footer line, is counted apart as **footer only**). **Unfixable** of those are slides that clip in BOTH today\'s split (one member a page) and the fit-first arm, so no split policy here fixes them; the rest are the arm\'s own. **Lost** counts slides with a text leaf on no page. **Jank** is the share of ±10% text edits that change the page count; **pair flips** the share of untouched leaf pairs that change pages under a ±1-member edit; **±40% text** how often a large edit changes the page count, which is correct for a fit policy. Pair flips favor today\'s split by construction (one member a page).', '');
  lines.push('| Box | Venue | Arm | Slides | Footer only | Clips | of which unfixable | Lost | Pages | Thin pages | Fill p50 | Jank ±10% | Pair flips ±1 | ±40% text | ms/slide p50 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const key = (r) => `${r.src}#${r.slide}#${r.size}#${r.venue}`;
  const origOf = (arm) => new Set(rows.filter((r) => r.arm === arm && r.variant === 'orig' && clipsContent(r)).map(key));
  const sClip = origOf('structural');
  const fClip = origOf('fit-greedy');
  const unfixable = new Set([...sClip].filter((k) => fClip.has(k)));
  const cells = new Map();
  for (const r of rows) {
    const k = `${r.size}|${r.venue}|${r.arm}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(r);
  }
  for (const [k, rs] of [...cells.entries()].sort()) {
    const [size, venue, arm] = k.split('|');
    const orig = rs.filter((r) => r.variant === 'orig');
    const pages = orig.flatMap((r) => r.pages);
    const byKey = new Map(rs.map((r) => [`${r.src}#${r.slide}#${r.variant}`, r]));
    const flips = [];
    const jank = [];
    const big = [];
    for (const o of orig) {
      for (const v of ['add', 'remove']) { const e = byKey.get(`${o.src}#${o.slide}#${v}`); if (e) flips.push(pairFlips(o, e)); }
      for (const v of ['nudgeUp', 'nudgeDown']) { const e = byKey.get(`${o.src}#${o.slide}#${v}`); if (e) jank.push(e.pages.length !== o.pages.length ? 1 : 0); }
      for (const v of ['longer', 'shorter']) { const e = byKey.get(`${o.src}#${o.slide}#${v}`); if (e) big.push(e.pages.length !== o.pages.length ? 1 : 0); }
    }
    const footerOnly = orig.filter((r) => r.pages.some((p) => !p.fits) && !clipsContent(r)).length;
    const clips = orig.filter(clipsContent);
    const unfix = clips.filter((r) => unfixable.has(key(r))).length;
    const ms = orig.map((r) => r.ms).filter((x) => x !== null);
    lines.push(`| ${size} | ${venue} | ${arm} | ${orig.length} | ${footerOnly} | ${clips.length} | ${unfix} | ${orig.filter((r) => r.lost).length} | ${pages.length} | ${pages.filter((p) => p.fill < 0.4).length} | ${q(pages.map((p) => p.fill), 0.5)} | ${pct(mean(jank))} | ${pct(mean(flips))} | ${pct(mean(big))} | ${ms.length ? q(ms, 0.5) : 'n/a'} |`);
  }
  lines.push('', 'Perturbed slides count toward stability only; the per-cell counts are the original slides. `ms/slide` is the fit-first build in the page; today\'s split runs in the export and is not timed here.');
  if (run.problems.length) lines.push('', '## Problems', '', ...run.problems.map((p) => `- ${p}`));
  return `${lines.join('\n')}\n`;
}

main().catch((e) => { console.error(e); process.exit(2); });
