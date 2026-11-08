#!/usr/bin/env node
/**
 * overflow-corpus — how many slides in the SHIPPED corpus does the export clip?
 *
 * WHY THIS EXISTS. Nothing in this repo measured that. `build:galleries:check`
 * verifies the gallery PDFs are up to date, not that they are clean; the
 * integration tier asserts page counts, not fit. So an engine change that moved
 * every slide's geometry could add fifty clipped slides across decks nobody
 * thought to open, regenerate their committed PDFs, and go green
 * (engineering/decisions/2026-07-30-slide-geometry-emitted-not-measured.md §4).
 * A number that nothing watches is a number that drifts.
 *
 * WHAT IT DOES. Renders every deck in the corpus through the real emulator and
 * reads the emulator's OWN "⚠ OVERFLOW — N slides … pages X, Y" report — the
 * same oracle a human sees on the terminal — then compares the per-deck page
 * lists against the committed baseline. It is a RATCHET: a deck that clips more
 * pages than its baseline fails; a deck that clips fewer is a win you must bank
 * with `--bless` so the floor never rises back.
 *
 * Some clipping is intentional: `examples/overflow-fix-me.md` exists to
 * demonstrate overflow. Those decks stay in the baseline with their pages listed
 * rather than being special-cased, so "intentional" is visible, not hidden.
 *
 * NOT A BLOCKING CI GATE, by design. A full corpus sweep is ~185 renders, tens of
 * minutes of real Chromium — the same reason `bench:check` (HARD RULE #19) is
 * on-demand. Run it when you change the engine, the scaffold, the token scale, or
 * anything that moves a box:
 *
 *   node tools/check-overflow-corpus.js               # check against the baseline
 *   node tools/check-overflow-corpus.js --bless       # re-record it (say why in the PR)
 *   node tools/check-overflow-corpus.js --jobs 6      # parallelism (default min(4, cpus-2))
 *   node tools/check-overflow-corpus.js --json
 *   node tools/check-overflow-corpus.js --format html  # skip the PDF writer (prototype)
 *   node tools/check-overflow-corpus.js examples/foo.md …   # just these decks
 *
 * THE BASELINE RECORDS ITS OWN DENOMINATOR (`decksSwept`). Only CLIPPING decks are
 * listed, so a deck missing from the map is indistinguishable from a deck nobody
 * swept — and that is not hypothetical: seven component galleries authored after the
 * last full bless were read as clean for a week, because the file had last been
 * hand-edited to add one deck rather than re-blessed. A count could say THAT, never
 * WHICH, so (#2060) the baseline also lists the decks by name (`swept`), and a deck
 * outside that list has NO FLOOR and fails by name, clean or not. The verdict is the
 * pure `judge()` in tools/lib/overflow-corpus-ratchet.js. Every run also prints its
 * cost per deck (`⏱ sweep cost`), so a slowdown shows before the job ceiling does.
 *
 * Exit 0 when no deck exceeds its baseline and none is unfloored; 1 otherwise; 2 on a setup error.
 * Needs CHROME_PATH (the SessionStart hook exports it).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { judge, blessed, costLine } = require('./lib/overflow-corpus-ratchet');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const BASELINE = path.join(ROOT, 'test', 'integration', 'overflow-baseline.json');
// PER-RUN scratch dir. Two concurrent invocations (a `--bless` while CI runs a
// check, or two agents sweeping at once) previously derived the SAME output path
// per deck and unlinked each other's HTML sidecars mid-navigation — which surfaces
// as `net::ERR_FILE_NOT_FOUND` render failures and phantom regressions on decks
// that are actually clean. The verdict must not depend on who else is running.
const WORK = path.join(ROOT, '.scratch', 'overflow-corpus', `run-${process.pid}`);

/**
 * The shipped corpus — everything a reader can open.
 *
 * The first cut of this globbed only top-level `examples/*.md`, the component
 * galleries and the baseline deck, which quietly excluded `exemplars/**` (45
 * worked boardroom decks that ship committed PDFs AND are bundled into the docs
 * Playground), `design/*.gallery.md`, and every `examples/` SUBDIRECTORY. A gate
 * whose denominator omits a third of the corpus can be satisfied without the
 * corpus being fixed — which is exactly what happened, so the glob is now the
 * set of decks that ship, not the set someone remembered.
 */
function corpus() {
  const g = (p) => {
    const out = [];
    const walk = (dir) => {
      let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && p(full)) out.push(path.relative(ROOT, full));
      }
    };
    walk(ROOT);
    return out;
  };
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const isDeck = (f) => /\.md$/.test(f) && !/\.(docs|gallery)\.md$/.test(path.basename(f));
  return [...new Set([
    // Worked examples, including subdirectories (token-contrast/, …).
    ...g((f) => rel(f).startsWith('examples/') && isDeck(f)),
    // Every component's specimen gallery, the design-system galleries, and the
    // hand-authored ones under lib/base — `lib/base/_logo/logo.gallery.md` ships two
    // committed PDFs and this glob could not see the deck, so a page that genuinely
    // clips had never entered the ratchet (#1279).
    ...g((f) => /\.gallery\.md$/.test(f) && (rel(f).startsWith('lib/') || rel(f).startsWith('design/'))),
    // The worked boardroom decks — committed PDFs, and bundled into the Playground.
    ...g((f) => rel(f).startsWith('exemplars/') && isDeck(f)),
    ...g((f) => /^test\/integration\/baseline-decks\/[^/]+\.md$/.test(rel(f))),
  ])].sort();
}

/** Render one deck; return the pages the emulator reports as clipped. */
function probe(deck, ext = 'pdf') {
  return new Promise((resolve) => {
    const out = path.join(WORK, deck.replace(/[/\\]/g, '_').replace(/\.md$/, '') + '.' + ext);
    const child = spawn(process.execPath, [EMULATOR, path.join(ROOT, deck), out, '--size', 'deck'], { cwd: ROOT, env: process.env });
    let buf = '';
    const grab = (d) => { buf += d.toString(); };
    child.stdout.on('data', grab);
    child.stderr.on('data', grab);
    const timer = setTimeout(() => child.kill('SIGKILL'), 300000);
    child.on('close', (code) => {
      clearTimeout(timer);
      for (const f of [out, out.replace(/\.pdf$/, '.html')]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
      if (code !== 0) return resolve({ deck, error: buf.trim().split('\n').slice(-2).join(' ').slice(0, 200) });
      // BOTH channels, unioned. The emulator reports geometric overflow on the
      // "⚠ OVERFLOW" line and content lost inside a clipping box that did NOT
      // exceed the frame — an ellipsed footer, a line-clamped card, a sheared
      // panel head — on "⚠ CONTENT CLIPPED". This gate's question is "how many
      // slides does the export CLIP", and both answers are yes (#1300).
      const grabPages = (re) => {
        const m = buf.match(re);
        return m ? m[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite) : [];
      };
      const pages = [...new Set([
        ...grabPages(/OVERFLOW[^\n]*?pages? ([\d,\s]+)/),
        ...grabPages(/CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/),
      ])].sort((a, b) => a - b);
      resolve({ deck, pages });
    });
  });
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k]); }
  }));
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(`--${f}`);
  const val = (f, d) => { const i = argv.indexOf(`--${f}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const bless = flag('bless');
  const json = flag('json');
  const jobs = Math.max(1, Math.min(Number(val('jobs', Math.min(4, Math.max(1, os.cpus().length - 2)))) || 3, 12));
  // --format html (PROTOTYPE, #2060): render each deck to the `.html` format, which runs the same
  // Chromium layout, auto-split and overflow / content-clipped probes and skips the PDF writer
  // (SVG twins, finish bake, in-page compose). The verdict is the console line, never the file,
  // so the PDF bytes were pure cost here. Default stays `pdf` until a full-corpus parity sweep
  // (same verdict on every deck in both formats) is on record.
  const format = val('format', 'pdf');
  if (!['pdf', 'html'].includes(format)) { console.error('✗ --format is pdf or html'); process.exit(2); }
  const only = argv.filter((a) => !a.startsWith('--') && a !== val('jobs', null) && a !== val('format', null));

  if (!process.env.CHROME_PATH) {
    console.error('✗ CHROME_PATH is not set — the SessionStart hook exports it.');
    process.exit(2);
  }
  fs.mkdirSync(WORK, { recursive: true });

  // Deck arguments are normalized to the repo-relative POSIX names the baseline keys on, so
  // `./examples/foo.md` or an absolute path is judged against its floor, not read as NO FLOOR.
  const decks = only.length
    ? only.map((a) => path.relative(ROOT, path.resolve(a)).split(path.sep).join('/'))
    : corpus();
  if (!json) console.error(`  sweeping ${decks.length} decks at ${jobs}× … (real renders; this takes a while)`);
  const t0 = performance.now();
  const rows = await pool(decks, jobs, (d) => probe(d, format));
  // COST PER DECK, printed every run (#2060). The nightly's wall clock tripled per deck in six weeks
  // while the corpus grew 1.6x, and nothing said so until runs hit the job ceiling and measured nothing.
  const cost = { decks: rows.length, seconds: (performance.now() - t0) / 1000, jobs, format };
  // The per-run dir is ours alone, so it is safe to remove wholesale.
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* best effort */ }

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { decks: {} };
  const errors = rows.filter((r) => r.error);
  if (bless) {
    if (only.length) { console.error('✗ --bless re-records the WHOLE corpus; drop the deck arguments.'); process.exit(2); }
    if (errors.length) { console.error(`✗ refusing to bless: ${errors.length} deck(s) failed to render.`); for (const e of errors.slice(0, 5)) console.error(`  • ${e.deck}: ${e.error}`); process.exit(2); }
    // THE DECKS ARE RECORDED BY NAME (#2060), not only counted. A count could say THAT some decks had
    // no floor, never WHICH: fourteen sat unfloored and one of them was born clipping.
    const next = blessed(rows);
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`✓ blessed — ${next.totalSlides} clipped slides across ${Object.keys(next.decks).length} decks of ${next.decksSwept} → ${path.relative(ROOT, BASELINE)}`);
    process.exit(0);
  }

  const { regressions, improvements, unfloored, clipped, total, legacy } = judge(rows, base);
  // A deck-subset run judges only the decks it was given, so `unfloored` there names exactly those.

  if (json) {
    console.log(JSON.stringify({ ok: !regressions.length && !errors.length && !unfloored.length, total, unfloored, cost: { ...cost, perDeck: cost.seconds / Math.max(1, cost.decks) }, swept: rows.length, baselineSwept: base.decksSwept ?? null, baseline: base.totalSlides ?? null, regressions, improvements, errors }, null, 2));
    process.exit(regressions.length || errors.length || unfloored.length ? 1 : 0);
  }

  console.error(`  ${costLine(cost)}`);

  for (const e of errors) console.error(`  ! ${e.deck} failed to render: ${e.error}`);
  // A LEGACY baseline (no `swept` list) cannot tell a clean deck from one no bless ever swept.
  if (legacy) {
    console.error('  ⓘ the baseline lists no `swept` decks, so a deck missing from it reads as CLEAN and ' +
      'nothing can name the decks that have no floor. The next --bless writes the list.');
  }
  if (improvements.length) {
    console.log(`\n  ${improvements.length} deck(s) improved — bank them with --bless:`);
    for (const i of improvements.slice(0, 12)) console.log(`    ${i.deck}  (fixed p${i.gone.join(', p')})`);
  }
  if (!regressions.length && !errors.length && !unfloored.length) {
    console.log(`\n✓ overflow corpus — ${total} clipped slide(s) across ${clipped.length} deck(s) of ${rows.length} swept, none above baseline (${base.totalSlides ?? '?'}).`);
    process.exit(0);
  }
  if (unfloored.length) {
    // `have NO FLOOR` is a stable marker line. overflow-nightly.yml classifies a failing run by grepping
    // for markers; until its grep names this one, an unfloored-only run files as `kind=unknown`.
    console.error(`\n✗ ${unfloored.length} deck(s) have NO FLOOR in the baseline — no bless ever swept them, so the ratchet cannot vouch for them:\n`);
    for (const d of unfloored) {
      const r = rows.find((x) => x.deck === d);
      console.error(`  • ${d}  ${r.pages.length ? `clips p${r.pages.join(', p')}` : 'clean today'} (no floor)`);
    }
    console.error('\nA clean one needs only a bless; a clipping one needs its slides fixed first.');
  }
  if (regressions.length) {
    console.error(`\n✗ ${regressions.length} deck(s) clip MORE slides than the baseline:\n`);
    for (const r of regressions) {
      console.error(`  • ${r.deck}\n      now clips p${r.now.join(', p')}${r.was.length ? `  (baseline: p${r.was.join(', p')})` : '  (baseline: clean)'}\n      new: p${r.added.join(', p')}`);
    }
    console.error('\nA slide that clips is a slide that ships cut off. Trim the deck, or — if the change is\n' +
      'deliberate and the content is right — re-bless with `node tools/check-overflow-corpus.js --bless`\n' +
      'and justify the new floor in the PR.');
  }
  process.exit(1);
}

main().catch((e) => { console.error('overflow-corpus error:', e.message); process.exit(2); });
