#!/usr/bin/env node
/**
 * geometry-parity — does a slide measure the SAME on every surface it renders on?
 *
 * The bug this exists to catch, in one sentence: a slide's own geometry used to
 * depend on the window it was previewed in, so the Playground, the Studio and the
 * PDF disagreed about which slides overflow — a user reported one overflowing
 * slide in one surface and two in the other, on the same deck
 * (engineering/decisions/2026-07-29-section-cq-icb-leak.md).
 *
 * Two independent causes, and this tool is the regression test for both:
 *
 *   1. GEOMETRY. `section { container-type: size }` cannot query itself, so a
 *      `cq*` unit in the section's own declarations fell back to the initial
 *      containing block — the HOST VIEWPORT in a browser. The engine now emits
 *      the slide's own 1% (`--_sec-1cqi` / `--_sec-1cqh`) from the resolved
 *      `@size`, so the answer no longer depends on who is looking.
 *   2. MEASUREMENT. `getBoundingClientRect()` reports the VISUAL box, so on a
 *      host that scales the slide with a CSS transform (the docs filmstrip scales
 *      every section to the preview pane) any measurement that mixes a rect with
 *      `scrollHeight`/`offsetHeight` reads a different number per pane width.
 *
 * WHAT IT DOES. Renders each deck through the real emulator, then loads the real
 * exported HTML in real Chromium at several window sizes — including sizes that
 * are nothing like the slide box — and asserts that for every slide:
 *
 *   · the section's own padding box is identical at every window size;
 *   · the content stage's height is identical;
 *   · the overflow verdict AND the measured overshoot are identical;
 *   · and, with `--scaled`, that all of the above still hold when each section is
 *     CSS-transform-scaled the way the filmstrip preview scales it.
 *
 * The window sizes are deliberately hostile: 1280×720 is the slide itself, 900 and
 * 500 are ordinary panes, 390×844 is a phone — the surface the bug was reported
 * from. A pass means the deck measures the same whether it is a PDF, an HTML
 * sidecar someone opened on a laptop, or a scaled preview in a 355px pane.
 *
 * USAGE
 *   node tools/check-geometry-parity.js                        # the default deck set
 *   node tools/check-geometry-parity.js examples/foo.md …      # specific decks
 *   node tools/check-geometry-parity.js --scaled               # also test transform-scaled sections
 *   node tools/check-geometry-parity.js --json                 # machine-readable
 *   node tools/check-geometry-parity.js --keep                 # keep the rendered HTML
 *
 * Exit 0 when every slide agrees across every surface; 1 on any disagreement,
 * with the offending slide, property, and the two values printed.
 *
 * Needs CHROME_PATH (the SessionStart hook exports it) and writes its renders to
 * .scratch/geometry-parity/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, '.scratch', 'geometry-parity');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const { PROBE_SRC, CLIP_CELL_SELECTOR } = require('../lib/core/overflow-probe');

// The slide box, two ordinary panes, and a phone. The point is that NONE of these
// should matter — a window size that changes a slide's geometry is the bug.
const WINDOWS = [
  [1280, 720, 'slide box'],
  [900, 700, 'pane'],
  [500, 700, 'narrow pane'],
  [390, 844, 'phone'],
];

// A deck per shape that has historically been wrong in a different way: HD prose,
// a 4K component gallery, charts, imagery, and a portrait deck (whose orientation
// CSS is the one path that emits geometry-dependent tokens of its own).
const DEFAULT_DECKS = [
  'examples/bloom-engineering-journey.md',
  'examples/content-capacity.md',
  'examples/q-and-a.md',
  'examples/chart-family-coverage.md',
  'examples/social-portrait.md',
];

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    return spawnSync('bash', ['-lc', 'ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1'])
      .stdout.toString().trim() || undefined;
  } catch { return undefined; }
}

/** Render a deck's HTML sidecar through the real emulator. */
function renderDeck(deck) {
  fs.mkdirSync(WORK, { recursive: true });
  const out = path.join(WORK, path.basename(deck, '.md') + '.pdf');
  const r = spawnSync(process.execPath, [EMULATOR, path.join(ROOT, deck), out, '-q'], { cwd: ROOT, env: process.env });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || Buffer.from('')).toString().trim().split('\n').slice(-3).join(' ') };
  }
  return { ok: true, html: out.replace(/\.pdf$/, '.html') };
}

// Runs IN the page. Returns one row per slide: the numbers that must not move.
const MEASURE = (probeSrc, clipSel, TOL, scale) => {
  const probe = new Function('return (' + probeSrc + ')')();
  const secs = [...document.querySelectorAll('article.lattice > section, section[data-lattice-slide]')];
  for (const s of secs) {
    s.style.transformOrigin = scale ? 'top left' : '';
    s.style.transform = scale ? 'scale(' + scale + ')' : '';
  }
  void document.body.offsetHeight;
  return secs.map((s, i) => {
    const cs = getComputedStyle(s);
    const stage = s.querySelector('.cell-stage, .panel-right, .compare-right');
    const k = scale || 1;
    const r = probe(s, clipSel, TOL);
    return {
      page: i + 1,
      padding: cs.padding,
      // The stage is the box every overflow verdict is measured against.
      stage: stage ? Math.round(stage.getBoundingClientRect().height / k) : null,
      over: r.over,
      overshoot: Math.round(r.scrollH - r.clientH),
      stamp: cs.getPropertyValue('--_sec-1cqi').trim() || '(unset)',
    };
  });
};

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const keep = argv.includes('--keep');
  const scaled = argv.includes('--scaled');
  const decks = argv.filter((a) => !a.startsWith('--'));
  const targets = decks.length ? decks : DEFAULT_DECKS;

  const exe = chromePath();
  if (!exe) {
    console.error('✗ no Chrome found — set CHROME_PATH (the SessionStart hook exports it).');
    process.exit(2);
  }
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const failures = [];
  const report = [];
  let slidesChecked = 0;

  for (const deck of targets) {
    if (!fs.existsSync(path.join(ROOT, deck))) {
      failures.push({ deck, error: 'source missing' });
      continue;
    }
    const rendered = renderDeck(deck);
    if (!rendered.ok) {
      failures.push({ deck, error: 'render failed: ' + rendered.error });
      continue;
    }
    // Surface 1..N: the same exported document at hostile window sizes. Optionally
    // each ALSO with the sections transform-scaled, which is what the filmstrip does.
    const surfaces = [];
    for (const [w, h, label] of WINDOWS) {
      surfaces.push({ w, h, label, scale: 0 });
      if (scaled) surfaces.push({ w, h, label: label + ' + scaled sections', scale: Number((w / 1280).toFixed(4)) || 0.5 });
    }
    const runs = [];
    for (const su of surfaces) {
      const page = await browser.newPage();
      await page.setViewport({ width: su.w, height: su.h, deviceScaleFactor: 1 });
      await page.goto('file://' + rendered.html, { waitUntil: 'networkidle0', timeout: 120000 });
      await new Promise((r) => setTimeout(r, 2500));
      runs.push({ su, rows: await page.evaluate(MEASURE, PROBE_SRC, CLIP_CELL_SELECTOR, 12, su.scale) });
      await page.close();
    }
    const base = runs[0];
    slidesChecked += base.rows.length;
    for (let i = 0; i < base.rows.length; i++) {
      for (const run of runs.slice(1)) {
        const a = base.rows[i];
        const b = run.rows[i];
        if (!b) continue;
        for (const key of ['padding', 'stage', 'over', 'overshoot']) {
          // `stage`/`overshoot` are px measured through a scale — allow 1px of
          // rounding when the sections are scaled, nothing otherwise.
          const tol = run.su.scale && (key === 'stage' || key === 'overshoot') ? 1 : 0;
          const differs = typeof a[key] === 'number' && typeof b[key] === 'number'
            ? Math.abs(a[key] - b[key]) > tol
            : a[key] !== b[key];
          if (differs) {
            failures.push({
              deck, page: a.page, key,
              at: `${base.su.w}×${base.su.h} (${base.su.label})`, value: a[key],
              vs: `${run.su.w}×${run.su.h} (${run.su.label})`, other: b[key],
            });
          }
        }
      }
    }
    report.push({ deck, slides: base.rows.length, surfaces: surfaces.length, stamp: base.rows[0]?.stamp });
    if (!keep) {
      for (const f of [rendered.html, rendered.html.replace(/\.html$/, '.pdf')]) {
        try { fs.unlinkSync(f); } catch { /* best effort */ }
      }
    }
  }
  await browser.close();

  if (json) {
    console.log(JSON.stringify({ ok: failures.length === 0, slidesChecked, decks: report, failures }, null, 2));
    process.exit(failures.length ? 1 : 0);
  }

  for (const r of report) {
    console.log(`  ${r.deck} — ${r.slides} slides × ${r.surfaces} surfaces  (stamp ${r.stamp})`);
  }
  if (!failures.length) {
    console.log(`\n✓ geometry parity — ${slidesChecked} slides measure identically on every surface` +
      (scaled ? ' (including transform-scaled sections)' : '') +
      `.\n  Re-run with --scaled to include the filmstrip's per-section transform.`);
    process.exit(0);
  }
  console.error(`\n✗ ${failures.length} geometry disagreement(s) — a slide measured differently depending on the window:\n`);
  for (const f of failures.slice(0, 25)) {
    if (f.error) { console.error(`  • ${f.deck}: ${f.error}`); continue; }
    console.error(`  • ${f.deck} p${f.page} ${f.key}: ${f.value}  at ${f.at}\n      vs ${f.other}  at ${f.vs}`);
  }
  if (failures.length > 25) console.error(`  … and ${failures.length - 25} more`);
  console.error('\nA slide\'s geometry must not depend on the window it is viewed in. Check for a bare `cq*` on the\n' +
    'section itself (gated by checkSectionCqAnchoring) or a JS measurement that reads getBoundingClientRect()\n' +
    'without normalizing the host\'s transform scale (lib/core/overflow-probe.js K, state-chart rectL).');
  process.exit(1);
}

main().catch((e) => { console.error('geometry-parity error:', e.message); process.exit(2); });
