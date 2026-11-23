#!/usr/bin/env node
// Golden bisect — trace each drifted golden to the commit on main that moved it.
//
// The nightly bless re-renders whatever drifted, and rule 4 of its verdict asks whether a
// person saw each change. When a night carries hundreds of goldens, this is how you find out
// which merged PR moved which golden. For each commit it renders, it checks the commit out into
// its own worktree under .scratch/golden-bisect/, runs `npm ci` and `npm run build` there (so
// the dependency versions are that commit's own), re-blesses each golden being traced with that
// commit's own regression gate, and compares the result against the golden at `--from` (OLD) and
// at `--to` (NEW) with this checkout's pixelDiff. It then bisects every golden at once, sharing
// a render between goldens whose windows meet (tools/lib/golden-bisect.mjs).
//
// Only commits that touch the render path are candidates (RENDER_PATHS below), so a docs-only
// commit is never rendered. A golden that two PRs moved finds the bigger move: a reading counts
// as moved once it passes half the drift at the window's end. Drift inside the machine's noise
// (a few tenths of a percent of a page between this sandbox and the GitHub runner) cannot be
// traced this way; the report says so instead of naming a commit.
//
// Each commit costs about 2.5 minutes to install and build, then 30 to 60 seconds per golden.
// Readings are cached in .scratch/golden-bisect/<sha>.json, so a rerun picks up where it stopped.
// Design and the first trace (#2987, 2026-11-09):
// engineering/decisions/2026-10-06-goldens-bot-blessed.md §5.
//
// Usage:
//   node tools/golden-bisect.mjs --from 6e7c7388 --to 978728bb examples/funnel.pdf lib/components/legal/legal.gallery.light.pdf
//   node tools/golden-bisect.mjs --from A --to B --goldens list.txt --jobs 3 --json
//   (--old-ref / --new-ref read the two goldens from other refs, e.g. the bless branch for NEW)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { done, narrow, nextProbes } from './lib/golden-bisect.mjs';

const require = createRequire(import.meta.url);
const { pixelDiff } = require('./pixel-check.js');
const { pool } = require('./lib/pool.js');
const { FUZZ } = await import('./lib/golden-render.mjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.scratch', 'golden-bisect');
const RENDER_PATHS = ['lib', 'themes', 'assets', 'package-lock.json', 'lattice.js', 'tools/build-css.js', 'tools/build-galleries.js'];

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const from = opt('--from');
const to = opt('--to');
const oldRef = opt('--old-ref', to);
const newRef = opt('--new-ref', null);
const listFile = opt('--goldens', null);
const jobs = Number(opt('--jobs', '3'));
const asJson = flag('--json');
if (!from || !to) {
  console.error('usage: node tools/golden-bisect.mjs --from <sha> --to <sha> [--old-ref R] [--new-ref R] [--jobs N] [--json] <golden.pdf>... | --goldens list.txt');
  process.exit(2);
}
const goldens = [...args, ...(listFile ? readFileSync(listFile, 'utf8').split('\n').filter(Boolean) : [])];

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const short = (r) => git('rev-parse', '--short=8', r);
const commits = git('log', '--first-parent', '--reverse', '--format=%h', `${from}..${to}`, '--', ...RENDER_PATHS)
  .split('\n')
  .filter(Boolean)
  .map(short);
// The window ends at `--to` itself, render-path commit or not: that is the state being explained.
if (commits.at(-1) !== short(to)) commits.push(short(to));
const at = (i) => (i < 0 ? short(from) : commits[i]);
mkdirSync(WORK, { recursive: true });

// The golden at `ref`, written to a file; the OLD golden is `--old-ref` (the golden main holds,
// which the bless will replace), the NEW one is `--new-ref` (the bless branch) or `--to`'s render.
function goldenAt(ref, golden, out) {
  const r = spawnSync('git', ['-C', ROOT, 'show', `${ref}:${golden}`], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  writeFileSync(out, r.stdout);
  return out;
}

// Worst page's share of over-FUZZ pixels, the regression gate's measure; -1 when a page was
// added, removed or resized.
function worst(a, b) {
  if (readFileSync(a).equals(readFileSync(b))) return 0;
  const r = pixelDiff(a, b, `gbisect-${process.pid}-${Math.random().toString(36).slice(2)}`, { fuzz: FUZZ });
  rmSync(r.tmpDir, { recursive: true, force: true });
  let w = 0;
  for (const p of r.perPage) {
    if (p.pixels < 0) return -1;
    w = Math.max(w, p.pixels / p.total);
  }
  return w;
}

const cachePath = (sha) => join(WORK, `${sha}.json`);
const readCache = (sha) => (existsSync(cachePath(sha)) ? JSON.parse(readFileSync(cachePath(sha), 'utf8')) : {});

// Render `want` goldens at `sha`; returns { golden: { old, new } } drift readings.
async function probe(sha, want) {
  const cache = readCache(sha);
  const need = want.filter((g) => !(g in cache));
  if (!need.length) return cache;
  const wt = join(WORK, `wt-${sha}`);
  const log = join(WORK, `${sha}.log`);
  const run = (cmd, a, cwd = wt) => spawnSync(cmd, a, { cwd, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28 });
  if (!existsSync(wt)) git('worktree', 'add', '--quiet', '--detach', wt, sha);
  if (!existsSync(join(wt, '.gbisect-built'))) {
    for (const [cmd, a] of [
      ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
      ['npm', ['run', 'build']],
    ]) {
      const r = run(cmd, a);
      if (r.status !== 0) {
        writeFileSync(log, r.stderr || '');
        throw new Error(`${sha}: ${cmd} ${a.join(' ')} failed; see ${log}`);
      }
    }
    writeFileSync(join(wt, '.gbisect-built'), '');
  }
  for (const g of need) {
    const gallery = /^lib\/.*\.gallery\.(light|dark)\.pdf$/.test(g);
    const only = gallery ? g.split('/').pop().replace(/\.gallery\.(light|dark)\.pdf$/, '') : g.replace(/\.pdf$/, '');
    run('node', ['tools/regression-gate.mjs', ...(gallery ? [] : ['--scope', 'decks']), '--bless', '--only', only]);
    const fresh = join(wt, g);
    const o = goldenAt(oldRef, g, join(WORK, `${sha}.old.pdf`));
    const n = newRef ? goldenAt(newRef, g, join(WORK, `${sha}.new.pdf`)) : null;
    cache[g] = {
      old: existsSync(fresh) && o ? worst(fresh, o) : null,
      new: existsSync(fresh) && n ? worst(fresh, n) : null,
    };
  }
  writeFileSync(cachePath(sha), JSON.stringify(cache, null, 1));
  return cache;
}

// The window's end sets each golden's target drift.
const end = await probe(at(commits.length - 1), goldens);
let tracks = goldens.map((g) => ({ golden: g, lo: -1, hi: commits.length - 1, target: end[g]?.old ?? null }));
const untraceable = tracks.filter((t) => t.target == null || (t.target >= 0 && t.target < 0.005));
tracks = tracks.filter((t) => !untraceable.includes(t));

while (!done(tracks)) {
  const plan = [...nextProbes(tracks)];
  const readings = new Map();
  await pool(plan, jobs, async ([i, gs]) => readings.set(i, await probe(at(i), gs)));
  tracks = tracks.map((t) => {
    if (t.hi - t.lo <= 1) return t;
    const i = Math.floor((t.lo + t.hi) / 2);
    const d = readings.get(i)?.[t.golden]?.old;
    return d == null ? { ...t, lo: t.hi - 1, unread: i } : narrow(t, i, d);
  });
  if (!asJson) console.error(`… ${tracks.filter((t) => t.hi - t.lo > 1).length} golden(s) still open`);
}

const subject = (sha) => git('log', '-1', '--format=%s', sha);
const report = tracks.map((t) => {
  const before = readCache(at(t.lo))[t.golden]?.old ?? null;
  const after = readCache(at(t.hi))[t.golden]?.old ?? null;
  return { golden: t.golden, commit: at(t.hi), subject: subject(at(t.hi)), before, after, end: t.target, ...(t.unread != null ? { unread: at(t.unread) } : {}) };
});
const left = untraceable.map((t) => ({ golden: t.golden, end: t.target, why: t.target == null ? 'not rendered at --to' : 'drift inside machine noise (<0.5% of a page)' }));
for (const f of [...new Set(commits)].map((s) => join(WORK, `wt-${s}`)).filter(existsSync)) git('worktree', 'remove', '--force', f);

if (asJson) console.log(JSON.stringify({ from: short(from), to: short(to), candidates: commits.length, traced: report, untraceable: left }, null, 1));
else {
  const pct = (x) => (x == null ? '?' : x < 0 ? 'pages' : `${(x * 100).toFixed(2)}%`);
  for (const r of report) console.log(`${r.golden}\t${r.commit} ${r.subject}\t${pct(r.before)} -> ${pct(r.after)} (end ${pct(r.end)})`);
  for (const r of left) console.log(`${r.golden}\tuntraceable: ${r.why}`);
}
