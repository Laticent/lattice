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
 *   node tools/check-overflow-corpus.js --bless examples/new.md   # record just these decks' floors
 *   node tools/check-overflow-corpus.js --jobs 6      # parallelism (default min(4, cpus-2))
 *   node tools/check-overflow-corpus.js --json        # includes `clipped`, every deck's pages, for diffing two runs
 *   node tools/check-overflow-corpus.js --writer shared   # render with the shared PDF writer (slow; parity checks only)
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
const { judge, blessed, blessedSubset, staleNames, costLine } = require('./lib/overflow-corpus-ratchet');

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

/**
 * Render one deck; return the pages the emulator reports as clipped.
 *
 * `--chrome-pdf` BY DEFAULT, because the sweep reads a console line and throws the PDF away.
 * Since 268f0a3f9 (#2404, 2026-09-27) the CLI writes PDFs with the shared vector writer
 * (lib/core/pdf-compose), which costs about 3 s a deck on its own: 4.6 s against 1.6 s with
 * Chrome's printer for one gallery rendered alone on a 4-vCPU sandbox. It is the bulk of the
 * nightly's 1.2 s to 4.2 s per-deck jump (not bisected; the corpus grew in the same weeks). The writer runs AFTER `measureOverflow()` in lattice.js and
 * `CHROME_PDF` gates nothing else, so both writers print the same ⚠ OVERFLOW and ⚠ CONTENT
 * CLIPPED lines; a full sweep in each, diffed with `--json`, agreed on every deck (#3081 P1).
 * `--writer shared` renders the slow way, to re-prove that parity after a change near the writer.
 *
 * Not `.html`: a plain .html export skips the guards trim and the card-tag equalize pass, so it
 * can report a verdict the PDF does not have. It measured only 11% faster than `--chrome-pdf`
 * (572 s against 643 s for 504 decks), which does not pay for that risk (#3081 P2).
 */
function probe(deck, { sharedWriter = false } = {}) {
  return new Promise((resolve) => {
    const out = path.join(WORK, deck.replace(/[/\\]/g, '_').replace(/\.md$/, '') + '.pdf');
    const args = [EMULATOR, path.join(ROOT, deck), out, '--size', 'deck'];
    if (!sharedWriter) args.push('--chrome-pdf');
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
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
  // `--flag value` or `--flag=value`. The `=` form used to fall through to the default without a
  // word, so `--writer=shared` ran the Chrome printer while the user believed it re-proved parity.
  const val = (f, d) => {
    const eq = argv.find((a) => a.startsWith(`--${f}=`));
    if (eq) return eq.slice(f.length + 3) || d;
    const i = argv.indexOf(`--${f}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const bless = flag('bless');
  const json = flag('json');
  const jobs = Math.max(1, Math.min(Number(val('jobs', Math.min(4, Math.max(1, os.cpus().length - 2)))) || 3, 12));
  const writer = val('writer', 'chrome');
  if (writer !== 'chrome' && writer !== 'shared') { console.error(`✗ --writer takes chrome or shared, not ${writer}.`); process.exit(2); }
  const only = argv.filter((a) => !a.startsWith('--') && a !== val('jobs', null) && a !== val('writer', null));

  if (!process.env.CHROME_PATH) {
    console.error('✗ CHROME_PATH is not set — the SessionStart hook exports it.');
    process.exit(2);
  }
  fs.mkdirSync(WORK, { recursive: true });

  // Deck arguments are normalized to the repo-relative POSIX names the baseline keys on, so
  // `./examples/foo.md` or an absolute path is judged against its floor, not read as NO FLOOR.
  // A relative argument resolves against the repo root first (so the tool works from any folder,
  // as it always has), and against the current folder only when the root has no such file.
  const toDeck = (a) => {
    const abs = path.isAbsolute(a) || !fs.existsSync(path.resolve(ROOT, a)) ? path.resolve(a) : path.resolve(ROOT, a);
    return path.relative(ROOT, abs).split(path.sep).join('/');
  };
  const decks = only.length ? only.map(toDeck) : corpus();
  if (!json) console.error(`  sweeping ${decks.length} decks at ${jobs}× … (real renders; this takes a while)`);
  const t0 = performance.now();
  const rows = await pool(decks, jobs, (d) => probe(d, { sharedWriter: writer === 'shared' }));
  // COST PER DECK, printed every run (#2060). The nightly's wall clock tripled per deck in six weeks
  // while the corpus grew 1.6x, and nothing said so until runs hit the job ceiling and measured nothing.
  const cost = { decks: rows.length, seconds: (performance.now() - t0) / 1000, jobs, writer };
  // The per-run dir is ours alone, so it is safe to remove wholesale.
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* best effort */ }

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { decks: {} };
  const errors = rows.filter((r) => r.error);
  if (bless) {
    if (errors.length) { console.error(`✗ refusing to bless: ${errors.length} deck(s) failed to render.`); for (const e of errors.slice(0, 5)) console.error(`  • ${e.deck}: ${e.error}`); process.exit(2); }
    // THE DECKS ARE RECORDED BY NAME (#2060), not only counted. A count could say THAT some decks had
    // no floor, never WHICH: fourteen sat unfloored and one of them was born clipping.
    // With deck arguments, only those decks' floors are recorded (blessedSubset), which a legacy
    // baseline cannot take: it has no `swept` list to merge into.
    const next = only.length ? blessedSubset(base, rows) : blessed(rows);
    if (!next) { console.error('✗ the baseline lists no `swept` decks, so it cannot take a partial bless; run --bless with no deck arguments once.'); process.exit(2); }
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`✓ blessed — ${next.totalSlides} clipped slides across ${Object.keys(next.decks).length} decks of ${next.decksSwept} → ${path.relative(ROOT, BASELINE)}`);
    process.exit(0);
  }

  const { regressions, improvements, unfloored, clipped, total, legacy } = judge(rows, base);
  // A deck-subset run judges only the decks it was given, so `unfloored` there names exactly those.

  if (json) {
    console.log(JSON.stringify({ ok: !regressions.length && !errors.length && !unfloored.length, total, unfloored, cost: { ...cost, perDeck: cost.seconds / Math.max(1, cost.decks) }, swept: rows.length, baselineSwept: base.decksSwept ?? null, baseline: base.totalSlides ?? null, regressions, improvements, errors, clipped: Object.fromEntries(clipped.map((r) => [r.deck, r.pages])) }, null, 2));
    process.exit(regressions.length || errors.length || unfloored.length ? 1 : 0);
  }

  console.error(`  ${costLine(cost)}`);

  for (const e of errors) console.error(`  ! ${e.deck} failed to render: ${e.error}`);
  // A LEGACY baseline (no `swept` list) cannot tell a clean deck from one no bless ever swept.
  if (legacy) {
    console.error('  ⓘ the baseline lists no `swept` decks, so a deck missing from it reads as CLEAN and ' +
      'nothing can name the decks that have no floor. The next --bless writes the list.');
  }
  // NAMES THE CORPUS NO LONGER HOLDS (a deck deleted or renamed) stay in the baseline until a bless
  // prunes them. Informational only: a stale name hides nothing, it just costs nothing to drop.
  if (!only.length) {
    const stale = staleNames(base, decks);
    if (stale.length) console.error(`  ⓘ the baseline names ${stale.length} deck(s) the corpus no longer holds (${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ', …' : ''}); the next full --bless drops them.`);
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
    // `have NO FLOOR in the baseline` is a marker: overflow-nightly.yml greps for this exact phrase to
    // file the run as a finding, and test/unit/tools/overflow-corpus-ratchet.test.js pins the pair.
    console.error(`\n✗ ${unfloored.length} deck(s) have NO FLOOR in the baseline — no bless ever swept them, so the ratchet cannot vouch for them:\n`);
    for (const d of unfloored) {
      const r = rows.find((x) => x.deck === d);
      console.error(`  • ${d}  ${r.pages.length ? `clips p${r.pages.join(', p')}` : 'clean today'} (no floor)`);
    }
    console.error('\nA clean one needs only `--bless <deck>`; a clipping one needs its slides fixed first.');
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
