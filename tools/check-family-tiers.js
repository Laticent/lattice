#!/usr/bin/env node
/**
 * check-family-tiers — does each adaptive family tier actually FIRE at each deck
 * size, and reflow the way the component intends?
 *
 * This is the gate #1218 needed and did not have. The old
 * `check-adaptive-families.js` compared two CLASSIFIERS (the JS verdict against a
 * `--lat-family` stamp the CSS computed) — but both halves were internally
 * consistent, so it could only ever catch them disagreeing, never catch a whole
 * tier being INERT. The square tier was dead for the entire life of that gate.
 *
 * So this asserts BEHAVIOR instead of agreement: render one deck per family
 * through the real emulator, then read the COMPUTED style of a property only that
 * family's rule can produce. A tier that stops matching flips the value and fails
 * here, whatever the cause — a bad selector, a lost stamp, a cascade change.
 *
 * TWO HALVES, because the first one alone is not enough. The probe half above
 * reads three components at four sizes, so it proves the MECHANISM works — but
 * it cannot see a clip, and it says nothing about the other 27 components whose
 * square tier fired for the first time in #1218. A red-team pass found exactly
 * that hole: `cycle`, `authority-chain` and `regulatory-update` rendered clean on
 * `main` and CLIPPED on the branch, with this gate, `build:check`, `npm test` and
 * `lint:deck` all green.
 *
 * So the second half is an OVERFLOW ORACLE. It renders one gallery slide per
 * family-reflowing component at every family size and records which components
 * clip, against a committed baseline (`test/oracle/family-overflow.json`). A NEW
 * clip fails; a clip that disappears fails too, asking to be re-blessed, so the
 * record cannot rot. Keyed on component NAME, not page number, so inserting a
 * slide does not churn the record.
 *
 * The baseline is not "zero" — several gallery slides already overflow at square
 * on `main`. The oracle's job is to freeze that set, not to assert it is empty.
 *
 * Usage: node tools/check-family-tiers.js [--bless]
 *        node tools/check-family-tiers.js --ladder    # reconcile the two blessed
 *          oracles per @size (reads committed JSON only — no browser, no render)
 *        node tools/check-family-tiers.js --presets   # what differs per @size:
 *          family, orientation, --canvas-scale, measured body/h2 px (report only)
 * Exit 1 on any disagreement; skips loudly with no Chromium.
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const ROOT = process.cwd();

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const r of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(r)) continue;
    for (const b of fs.readdirSync(r).filter(d => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(r, b, 'chrome-linux64', 'chrome'); if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// Three probes, chosen so the harness proves BOTH directions:
//   stats       — the SQUARE probe, and the only family that WRAPS: wide is a
//                 nowrap row, square a 2-up wrapped row, tall/strip a column. So
//                 its flex-wrap alone separates square from every other family —
//                 if the square tier stopped firing, square would read `nowrap`
//                 like wide and this fails. Direction alone is no longer enough
//                 (square and wide are both `row` since stats went 2-up).
//   decision    — keeps its 2-up at square, collapses only at tall/strip.
//   matrix-2x2  — same, and always did ("a square box reads the quadrants fine").
// Without the stats probe, decision and matrix-2x2 now expect the same thing at
// wide and square, so the harness would pass even with the stamp broken.
const DECK = `---
theme: indaco
---

<!-- _class: decision -->

## Which path

- Rebuild in place
  - Keeps the data model; six weeks.
- Replatform
  - Clean slate; four months.

---

<!-- _class: matrix-2x2 -->

## Effort vs impact

- Quick wins
  - Ship this quarter.
- Big bets
  - Fund next year.
- Fill-ins
  - When idle.
- Money pits
  - Decline.

---

<!-- _class: stats -->

## The quarter in three numbers

1. 73%
   - faster close
2. 18 min
   - p99 decision
3. 4.2x
   - pipeline lift
`;

// One entry per registered non-landscape @size, not one per FAMILY — `portrait`
// and `story` are both `tall`, and covering only one of them was a real hole.
// A clip is a function of the BOX, not the family: `story` is 570px taller than
// `portrait` at the same width, so the same component can clip in one and not the
// other. Measured while auditing this note — `kpi` clips 7 gallery slides at
// portrait and 0 at story. Family-KEYED behavior must be identical across the two
// (that is the model's whole claim, and the probe below asserts it); OVERFLOW must
// be measured separately in each.
const SIZES = [
  { size: 'hd', vp: [1920, 1080], family: 'wide' },
  { size: 'square', vp: [1080, 1080], family: 'square' },
  { size: 'portrait', vp: [1080, 1350], family: 'tall' },
  { size: 'story', vp: [1080, 1920], family: 'tall' },
  { size: 'mobile', vp: [1080, 2340], family: 'strip' },
];

// ── The overflow oracle ────────────────────────────────────────────────────
const ORACLE = path.join(ROOT, 'test', 'oracle', 'family-overflow.json');
const BLESS = process.argv.includes('--bless');

/** Every component whose stylesheet carries a `[data-family]` reflow rule. */
function familyReflowingComponents() {
  const out = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.css')) continue;
      // Comment-stripped: a `[data-family]` quoted in prose is not a rule.
      if (/\[data-family/.test(fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))) {
        out.add(path.basename(path.dirname(p)));
      }
    }
  };
  walk(path.join(ROOT, 'lib', 'components'));
  // Real components only. `_chart-family` is a SHARED stylesheet directory, not a
  // component — it has no manifest and no slide, so rostering it was a phantom
  // entry the record then claimed coverage for.
  const real = new Set(require('../lib/components').loadAll().map((m) => m.name));
  return [...out].filter((c) => real.has(c)).sort();
}

/**
 * One gallery slide per component, in a deck at `size`. The gallery is the
 * repo's own canonical authoring — if a component clips THERE, it clips for a
 * user who followed the docs.
 */
function sweepDeck(size, comps) {
  const gallery = fs.readFileSync(path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md'), 'utf8');
  const slides = gallery.split(/^---\s*$/m);
  const picked = [];
  // Read the `_class:` directive's TOKENS and compare by value. An earlier cut
  // built a RegExp per component from its name with only `-` hand-escaped, which
  // CodeQL flagged (incomplete escaping) and which would misfire on any name
  // carrying a regex metacharacter. Comparing tokens has no escaping problem to
  // get wrong, and it is also more accurate: a substring match would let
  // `list` claim a `list-tabular` slide.
  const classTokens = (slide) => {
    const out = new Set();
    for (const m of slide.matchAll(/<!--\s*_?class:([^-]*(?:-(?!->)[^-]*)*)-->/g)) {
      for (const t of m[1].trim().split(/\s+/)) if (t) out.add(t);
    }
    return out;
  };
  const tokenised = slides.map((s) => ({ s, tokens: classTokens(s) }));
  // FALL BACK to the component's OWN gallery deck when the shared baseline has no
  // slide for it, and hard-fail if neither does. Silently skipping is how the
  // record came to claim 34 components while rendering 31: `premise` and `video`
  // have no baseline slide, so the two components this change gave new reflows
  // were the two it never measured — which is exactly why a regression that put
  // premise's own `<h2>` off the top of the frame passed every gate.
  // Falling back rather than adding slides to the baseline deck is deliberate:
  // HARD RULE #8 keeps feature work out of the six long-running galleries.
  const { loadAll, manifestBucket } = require('../lib/components');
  const byName = new Map(loadAll().map((m) => [m.name, m]));
  const ownGallerySlide = (c) => {
    const m = byName.get(c);
    if (!m) return null;
    const p = path.join(ROOT, 'lib', 'components', manifestBucket(m), c, `${c}.gallery.md`);
    if (!fs.existsSync(p)) return null;
    const own = fs.readFileSync(p, 'utf8').split(/^---\s*$/m);
    const hit = own.map((s) => ({ s, tokens: classTokens(s) }))
      .find((x) => x.tokens.has(c) && !x.tokens.has('title'));
    return hit ? hit.s.trim() : null;
  };
  const unrenderable = [];
  for (const c of comps) {
    const hit = tokenised.find((x) => x.tokens.has(c));
    if (hit) { picked.push({ comp: c, body: hit.s.trim() }); continue; }
    const own = ownGallerySlide(c);
    if (own) { picked.push({ comp: c, body: own }); continue; }
    unrenderable.push(c);
  }
  if (unrenderable.length) {
    throw new Error(
      `family-overflow oracle: no slide to render for ${unrenderable.join(', ')} — neither the `
      + 'baseline gallery nor the component\'s own gallery deck has one. The record must not claim '
      + 'coverage it does not have; give the component a gallery slide or remove it from the roster.',
    );
  }
  // `autosplit: off` EXPLICITLY. This record measures the UN-SPLIT terminal of the Fit
  // Ladder on purpose — "what clips when the author has not opted into splitting" — and
  // it used to get that by relying on the flag being off by DEFAULT. #1234 flipped the
  // default to on, so the reliance had to become a declaration: without it the sweep
  // would paginate, the 1:1 page↔component mapping below would break, and the record
  // would quietly start measuring something else entirely.
  const src = `---\nmarp: true\ntheme: indaco\nsize: ${size}\nautosplit: off\npaginate: true\n---\n\n`
    + picked.map((p) => p.body).join('\n\n---\n\n') + '\n';
  return { src, comps: picked.map((p) => p.comp) };
}

/** Render one sweep and return the component names whose slide overflowed. */
function clippedAt(size, comps) {
  const { src, comps: order } = sweepDeck(size, comps);
  const file = path.join(ROOT, '.scratch', `family-sweep-${size}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
  let log = '';
  try {
    // BOTH streams. The overflow warning goes to STDERR, and an stdout-only read
    // returned "nothing clipped" for every size — a gate that reports success
    // because it is looking at the wrong pipe. That is the same shape of silent
    // pass this oracle exists to prevent, so the sentinel below guards it.
    // NOT `-q`: quiet mode prints nothing on a clean deck, so "no output" and
    // "no overflow" become the same string and the sentinel below has nothing to
    // check. The `HTML: N slides` tally is the proof the read worked.
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'lattice-emulator.js'), file, path.join(os.tmpdir(), `fs-${size}-${process.pid}.pdf`), 'indaco'],
      { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`emulator exited ${r.status} for ${size}:\n${r.stderr || r.stdout}`);
    log = `${r.stdout || ''}\n${r.stderr || ''}`;
  } finally {
    fs.rmSync(file, { force: true });
  }
  // Sentinel: the emulator always prints `HTML: N slides → …`. If that is
  // missing, the read is broken (wrong stream, changed format, silent failure)
  // and "no overflow" means nothing — fail rather than record a false clean.
  // This exact guard caught an stdout-only read that recorded 0 clips at every
  // size while the deck really clipped four slides at square.
  if (!/HTML:\s*\d+\s*slides?/i.test(log)) {
    throw new Error(`family-overflow oracle: unrecognizable emulator output for ${size} — cannot tell "clean" from "not read". Output was:\n${log.slice(0, 400)}`);
  }
  // The emitted line wraps, so match across it: "⚠ OVERFLOW … pages 3, 7, 11."
  const m = log.match(/OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/);
  if (!m) return [];
  // Page N is slide N — the front matter emits no slide, and the sweep sets no
  // `autosplit`, so the 1:1 page↔component mapping holds. A component that split
  // would break it, which is why a page number past the roster is a hard error.
  return m[1].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean).map((n) => {
    const c = order[n - 1];
    if (!c) throw new Error(`family-overflow oracle: page ${n} has no component (a slide split?) — the page↔component mapping is broken; fix the sweep before trusting this record.`);
    return c;
  }).sort();
}

function overflowOracle() {
  const comps = familyReflowingComponents();
  const fresh = {};
  for (const s of SIZES) fresh[s.size] = clippedAt(s.size, comps);

  if (BLESS) {
    fs.mkdirSync(path.dirname(ORACLE), { recursive: true });
    // The record carries its own semantics. Without this the `clipped` lists read
    // as "these components are broken at this size", and they do not mean that: the
    // sweep deliberately sets NO `autosplit`, so a clip here is "overflows when the
    // author has not opted into splitting". Many of these entries are components
    // `split-oracle.json` records as enrolled and splittable — i.e. two blessed
    // records appearing to disagree, reconciled only by a comment in this file. A
    // record that needs an out-of-band comment to read correctly is a trap for
    // whoever inherits it.
    // This comment used to quote the overlap as "16 of the 22 portrait entries".
    // Re-derived it is 18 — it drifted the moment `roadmap` gained a carousel recipe
    // and `premise` was enrolled. `--ladder` computes it instead; the note says the
    // command, not the count.
    const note = [
      'Components whose GALLERY SLIDE overflows at each @size, with NO `autosplit`.',
      'A name here means "clips when the author has not opted into splitting" — NOT',
      '"broken". Many of these are enrolled in test/oracle/split-oracle.json and fit',
      'once `autosplit: on` is set. The two records measure different terminals of',
      'the Fit Ladder and do not contradict each other — run',
      '`node tools/check-family-tiers.js --ladder` for the overlap per @size, and for',
      'which components still ring because no split is available to them at all.',
      'One entry per registered @size, not per family: `portrait` and `story` are both',
      '`tall`, but a clip is a function of the BOX — story is 570px taller at the same',
      'width, and the two clip sets differ substantially.',
    ].join(' ');
    fs.writeFileSync(ORACLE, `${JSON.stringify({ note, components: comps, clipped: fresh }, null, 2)}\n`);
    console.log(`\nblessed ${path.relative(ROOT, ORACLE)} — ${comps.length} components across ${SIZES.length} families.`);
    return 0;
  }

  let blessed;
  try { blessed = JSON.parse(fs.readFileSync(ORACLE, 'utf8')); } catch {
    console.log(`\noverflow oracle: no record at ${path.relative(ROOT, ORACLE)} — run \`node tools/check-family-tiers.js --bless\`.`);
    return 1;
  }

  let bad = 0;
  console.log('\noverflow oracle — gallery slide per family-reflowing component');
  for (const s of SIZES) {
    const now = fresh[s.size];
    const was = (blessed.clipped?.[s.size] || []).slice().sort();
    const added = now.filter((c) => !was.includes(c));
    const gone = was.filter((c) => !now.includes(c));
    if (added.length) {
      bad++;
      console.log(`  ${s.size.padEnd(9)} NEW CLIPS: ${added.join(', ')} — this family's reflow now overflows the frame where it did not. Fix the layout; do not bless it away.`);
    }
    if (gone.length) {
      bad++;
      console.log(`  ${s.size.padEnd(9)} FIXED (re-bless): ${gone.join(', ')} — run \`node tools/check-family-tiers.js --bless\` and say so in the PR.`);
    }
    if (!added.length && !gone.length) console.log(`  ${s.size.padEnd(9)} ${now.length} clipped, as recorded${now.length ? ` (${now.join(', ')})` : ''}`);
  }
  const roster = (blessed.components || []).slice().sort();
  if (JSON.stringify(roster) !== JSON.stringify(comps)) {
    bad++;
    const added = comps.filter((c) => !roster.includes(c));
    const gone = roster.filter((c) => !comps.includes(c));
    console.log(`  roster    CHANGED — ${added.length ? `+${added.join(', ')} ` : ''}${gone.length ? `-${gone.join(', ')}` : ''}. A component gaining or losing family reflow is a decision; re-bless and justify it.`);
  }
  return bad;
}

// ── The ladder report ──────────────────────────────────────────────────────
/**
 * Reconcile the TWO blessed records against each other, per @size.
 *
 * They look like they contradict: `family-overflow.json` names components as CLIPPED
 * at a size, while `split-oracle.json` records many of the same ones as ENROLLED and
 * splittable. They do not. They measure two different terminals of the same Fit
 * Ladder — this sweep sets NO `autosplit`, so a clip here means "overflows when the
 * author has not opted in", and an enrolled component paginates instead once
 * `autosplit: on` is set.
 *
 * That reconciliation used to live in a COMMENT in this file, quoting "16 of the 22
 * portrait entries". Re-derived today it is 18 of 22 — the number drifted the moment
 * `roadmap` gained a carousel recipe (#1209) and `premise` was enrolled, and nobody
 * re-ran it. So the constant is deleted and this prints it instead. Both decision
 * notes name this command rather than a figure.
 *
 * Reads the two committed records only — no browser, no render, so it is safe to
 * quote from a doc and cheap to run.
 */
function ladderReport() {
  const fam = JSON.parse(fs.readFileSync(ORACLE, 'utf8'));
  const splitPath = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');
  const split = JSON.parse(fs.readFileSync(splitPath, 'utf8')).components;
  console.log('The Fit Ladder, per @size — REFLOW\'s clipped set against SPLIT\'s enrolled set.');
  console.log('A component in both columns clips un-split and paginates once `autosplit: on`.\n');
  console.log('size      clipped  enrolled  rings  components that still ring (no opt-in)');
  for (const s of SIZES) {
    const clipped = (fam.clipped?.[s.size] || []).slice().sort();
    const enrolled = clipped.filter((c) => split[c]?.enrolled);
    const rings = clipped.filter((c) => !split[c]?.enrolled);
    console.log(
      `${s.size.padEnd(9)} ${String(clipped.length).padEnd(8)} ${String(enrolled.length).padEnd(9)} `
      + `${String(rings.length).padEnd(6)} ${rings.join(', ') || '—'}`,
    );
  }
  console.log(
    '\nA name in the last column is the honest terminal of the ladder: no reflow fits it,'
    + '\nand no split is available, so the export rings it. That is the set worth shrinking.',
  );
  return 0;
}

if (process.argv.includes('--ladder')) process.exit(ladderReport());

// ── The preset report ──────────────────────────────────────────────────────
/**
 * What actually differs between the registered @sizes: the family stamp, the deck
 * orientation, `--canvas-scale`, and the MEASURED body / `h2` px.
 *
 * The split note's §0b asserted "every portrait preset is 1080 wide, so body type is
 * one size across them; a taller preset simply holds more units", and reasoned about
 * one budget across a bucket that included `square`. Two of the three claims in that
 * sentence are false, and no command existed to check any of them — so this prints
 * the numbers instead of the note quoting them. `portrait`/`story`/`mobile` share the
 * `portrait` type category and agree exactly; `square` is its own category and does
 * not.
 *
 * A REPORT, not a gate: it asserts nothing and exits 0. The tier assertions are the
 * default run above; this exists so a doc can name a command rather than a constant.
 */
const PRESET_DECK = `<!-- _class: content -->

## A heading for the probe

A plain body paragraph carrying the container default type role, long enough to wrap
at any preset and be measured honestly.
`;

async function presetReport() {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  console.log('Per-@size render facts — the family stamp, the type category, and the measured result.\n');
  console.log('size      family   orientation  --canvas-scale  body px    h2 px');
  for (const s of SIZES) {
    const src = path.join(ROOT, '.scratch', `preset-${s.size}.md`);
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, `---\nmarp: true\ntheme: indaco\nsize: ${s.size}\n---\n\n${PRESET_DECK}`);
    const base = path.join(os.tmpdir(), `preset-${s.size}-${process.pid}`);
    execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), src, `${base}.pdf`, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    const page = await browser.newPage();
    await page.setViewport({ width: s.vp[0], height: s.vp[1] });
    await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    const r = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('section')].find((x) => x.className.includes('content'));
      const px = (el) => (el ? getComputedStyle(el).fontSize : 'MISSING');
      return {
        stamp: sec?.getAttribute('data-family') || '(none → wide)',
        orientation: sec?.getAttribute('data-orientation') || '(none)',
        scale: sec ? (getComputedStyle(sec).getPropertyValue('--canvas-scale').trim() || '1 (unset)') : '?',
        body: px(sec?.querySelector('.cell-stage p') || sec?.querySelector('p')),
        h2: px(sec?.querySelector('h2')),
      };
    });
    console.log(
      `${s.size.padEnd(9)} ${s.family.padEnd(8)} ${r.orientation.padEnd(12)} `
      + `${r.scale.padEnd(15)} ${r.body.padEnd(10)} ${r.h2}`,
    );
    await page.close();
    fs.rmSync(src, { force: true });
  }
  await browser.close();
  console.log(
    '\nType is `coefficient × cqi` per ORIENTATION category (lib/typography/scale.js), not one'
    + '\nscale × a multiplier — so portrait/story/mobile agree exactly (same category, all 1080'
    + '\nwide) and square does not (its own category). `--canvas-scale` still ramps by aspect but'
    + '\nno longer multiplies type; it drives spacing.',
  );
  return 0;
}

// `--presets` short-circuits the assertion run below: it is a REPORT, and running the
// full tier probe + four emulator sweeps to print five rows would make a doc's cited
// command too slow to actually run.
const PRESETS_ONLY = process.argv.includes('--presets');

(async () => {
  if (PRESETS_ONLY) { process.exitCode = await presetReport(); return; }
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  const rows = [];
  for (const s of SIZES) {
    const src = path.join(ROOT, '.scratch', `vf-${s.size}.md`);
    // `.scratch/` is gitignored, so on a fresh checkout it does not exist and this
    // write threw ENOENT before the oracle half (which does mkdir) ever ran. It
    // only worked because something earlier in the session had created it — an
    // undeclared ordering dependency that the new nightly workflow step would
    // have inherited.
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, `---\nsize: ${s.size}\ntheme: indaco\n---\n\n` + DECK.split('---\ntheme: indaco\n---\n\n')[1]);
    const base = path.join(os.tmpdir(), `vf-${s.size}-${process.pid}`);
    execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), src, `${base}.pdf`, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    const page = await browser.newPage();
    await page.setViewport({ width: s.vp[0], height: s.vp[1] });
    await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    rows.push(await page.evaluate(() => {
      const pick = (cls) => [...document.querySelectorAll('section')].find(x => x.className.includes(cls));
      const dec = pick('decision'), mat = pick('matrix-2x2'), st = pick('stats');
      const dir = (sec, sel) => {
        const el = sec?.querySelector(sel);
        return el ? getComputedStyle(el).flexDirection : 'MISSING';
      };
      const sec = dec || mat;
      return {
        stamp: sec ? (sec.getAttribute('data-family') || '(none → wide)') : 'NO SECTION',
        orientation: sec ? sec.getAttribute('data-orientation') : null,
        decisionList: dir(dec, '.cell-stage > ul, .cell-stage > ol'),
        matrixList: dir(mat, '.cell-stage > ul, .cell-stage > ol'),
        statsList: dir(st, '.cell-stage > ol'),
        statsWrap: (() => {
          const el = st?.querySelector('.cell-stage > ol');
          return el ? getComputedStyle(el).flexWrap : 'MISSING';
        })(),
      };
    }));
    await page.close();
    fs.rmSync(src, { force: true });
  }
  await browser.close();

  console.log('size      expect   stamp             decision   matrix     stats      wrap');
  let bad = 0;
  SIZES.forEach((s, i) => {
    const r = rows[i];
    const stampOk = r.stamp === s.family || (s.family === 'wide' && r.stamp === '(none → wide)');
    // Both components keep their side-by-side set at SQUARE and collapse only on
    // tall/strip. That is the deliberate #1218 outcome, not a loosened assertion:
    // square is the `balanced` family, and a decision read side by side is the
    // point of the layout. As shipped, `node tools/calibrate-capacity.js decision
    // --family square` measures a ceiling of 4 at decision's own `density.soft`.
    const wantDec = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    const wantMat = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    // stats: wide = nowrap row · square = WRAPPED row (2-up) · tall/strip = column.
    // The wrap is what proves the square tier fired.
    const wantStats = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    const wantWrap = s.family === 'square' ? 'wrap' : 'nowrap';
    const ok = stampOk && r.decisionList === wantDec && r.matrixList === wantMat
      && r.statsList === wantStats && r.statsWrap === wantWrap;
    if (!ok) bad++;
    console.log(
      `${s.size.padEnd(9)} ${s.family.padEnd(8)} ${r.stamp.padEnd(17)} ` +
      `${r.decisionList.padEnd(10)} ${r.matrixList.padEnd(10)} ${r.statsList.padEnd(10)} ${r.statsWrap.padEnd(8)} ` +
      `${ok ? 'OK' : `FAIL (want ${wantDec}/${wantMat}/${wantStats}/${wantWrap})`}`);
  });
  console.log(bad ? `\n${bad} FAILURES` : '\nall tiers fire');
  bad += overflowOracle();
  process.exitCode = bad ? 1 : 0;
})();
