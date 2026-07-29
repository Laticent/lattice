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
 *   node tools/check-overflow-corpus.js --jobs 6      # parallelism (default 3)
 *   node tools/check-overflow-corpus.js --json
 *   node tools/check-overflow-corpus.js examples/foo.md …   # just these decks
 *
 * Exit 0 when no deck exceeds its baseline; 1 when one does; 2 on a setup error.
 * Needs CHROME_PATH (the SessionStart hook exports it).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const BASELINE = path.join(ROOT, 'test', 'integration', 'overflow-baseline.json');
const WORK = path.join(ROOT, '.scratch', 'overflow-corpus');

/** The shipped corpus: worked examples, every component's specimen gallery, the baseline deck. */
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
  return [
    ...g((f) => /^examples[/\\][^/\\]+\.md$/.test(path.relative(ROOT, f))),
    ...g((f) => /\.gallery\.md$/.test(f) && path.relative(ROOT, f).startsWith('lib' + path.sep + 'components')),
    ...g((f) => /^test[/\\]integration[/\\]baseline-decks[/\\][^/\\]+\.md$/.test(path.relative(ROOT, f))),
  ].sort();
}

/** Render one deck; return the pages the emulator reports as clipped. */
function probe(deck) {
  return new Promise((resolve) => {
    const out = path.join(WORK, deck.replace(/[/\\]/g, '_').replace(/\.md$/, '') + '.pdf');
    const child = spawn(process.execPath, [EMULATOR, path.join(ROOT, deck), out], { cwd: ROOT, env: process.env });
    let buf = '';
    const grab = (d) => { buf += d.toString(); };
    child.stdout.on('data', grab);
    child.stderr.on('data', grab);
    const timer = setTimeout(() => child.kill('SIGKILL'), 300000);
    child.on('close', (code) => {
      clearTimeout(timer);
      for (const f of [out, out.replace(/\.pdf$/, '.html')]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
      if (code !== 0) return resolve({ deck, error: buf.trim().split('\n').slice(-2).join(' ').slice(0, 200) });
      const m = buf.match(/OVERFLOW[^\n]*?pages? ([\d,\s]+)/);
      const pages = m ? m[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite) : [];
      resolve({ deck, pages });
    });
  });
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k], k); }
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
  const only = argv.filter((a) => !a.startsWith('--') && a !== val('jobs', null));

  if (!process.env.CHROME_PATH) {
    console.error('✗ CHROME_PATH is not set — the SessionStart hook exports it.');
    process.exit(2);
  }
  fs.mkdirSync(WORK, { recursive: true });

  const decks = only.length ? only : corpus();
  if (!json) console.error(`  sweeping ${decks.length} decks at ${jobs}× … (real renders; this takes a while)`);
  const rows = await pool(decks, jobs, probe);

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { decks: {} };
  const errors = rows.filter((r) => r.error);
  const clipped = rows.filter((r) => !r.error && r.pages.length);

  if (bless) {
    if (only.length) { console.error('✗ --bless re-records the WHOLE corpus; drop the deck arguments.'); process.exit(2); }
    if (errors.length) { console.error(`✗ refusing to bless: ${errors.length} deck(s) failed to render.`); for (const e of errors.slice(0, 5)) console.error(`  • ${e.deck}: ${e.error}`); process.exit(2); }
    const next = { $comment: 'Ratchet for tools/check-overflow-corpus.js — pages the export CLIPS, per deck. Lower is better; re-bless only with the PR that earns it.', totalSlides: clipped.reduce((n, r) => n + r.pages.length, 0), decks: Object.fromEntries(clipped.map((r) => [r.deck, r.pages])) };
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`✓ blessed — ${next.totalSlides} clipped slides across ${clipped.length} decks → ${path.relative(ROOT, BASELINE)}`);
    process.exit(0);
  }

  const regressions = [];
  const improvements = [];
  for (const r of rows) {
    if (r.error) continue;
    const was = base.decks?.[r.deck] || [];
    const added = r.pages.filter((p) => !was.includes(p));
    const gone = was.filter((p) => !r.pages.includes(p));
    if (added.length) regressions.push({ deck: r.deck, added, now: r.pages, was });
    else if (gone.length) improvements.push({ deck: r.deck, gone });
  }
  const total = clipped.reduce((n, r) => n + r.pages.length, 0);

  if (json) {
    console.log(JSON.stringify({ ok: !regressions.length && !errors.length, total, baseline: base.totalSlides ?? null, regressions, improvements, errors }, null, 2));
    process.exit(regressions.length || errors.length ? 1 : 0);
  }

  for (const e of errors) console.error(`  ! ${e.deck} failed to render: ${e.error}`);
  if (improvements.length) {
    console.log(`\n  ${improvements.length} deck(s) improved — bank them with --bless:`);
    for (const i of improvements.slice(0, 12)) console.log(`    ${i.deck}  (fixed p${i.gone.join(', p')})`);
  }
  if (!regressions.length && !errors.length) {
    console.log(`\n✓ overflow corpus — ${total} clipped slide(s) across ${clipped.length} deck(s), none above baseline (${base.totalSlides ?? '?'}).`);
    process.exit(0);
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
