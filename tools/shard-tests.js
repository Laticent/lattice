#!/usr/bin/env node
/**
 * Run one time-balanced shard of a test glob set with `node --test`.
 *
 * Why this exists: `node --test --test-shard=K/N` deals files out by COUNT, so a leg that
 * draws three of the slowest files finishes minutes after one that draws none. On the first
 * real runs of the four-way integration matrix the test steps took 9:43 / 5:42 / 7:05 / 3:51,
 * so the slowest leg was 1.49x the mean and set the whole run's length. This script deals the
 * files out by recorded duration instead (longest-processing-time-first: each file, slowest
 * first, goes to the currently lightest shard), so the legs finish together.
 *
 * Weights are seconds per file in a committed JSON map (`--weights`). A file with no weight
 * gets the median weight, so a new test is never dropped or double-counted, just roughly
 * placed until the next `--bless`. The split is a pure function of (file list, weights, N),
 * so every leg computes the same plan and no file lands in two shards or none.
 *
 * Usage:
 *   node tools/shard-tests.js --weights W.json [--shard K/N] <glob>...   run shard K of N (all if omitted)
 *   node tools/shard-tests.js --weights W.json --shard K/N --list <glob>... print the plan, run nothing
 *   node tools/shard-tests.js --weights W.json --bless TIMES.tsv       rewrite W.json from "file<TAB>seconds" lines
 *
 * `--shard` can also come from the SHARD env var, so a CI matrix sets one variable.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** Longest-processing-time-first. Returns N arrays of file paths. Pure and deterministic. */
function plan(files, weights, n) {
  const known = Object.values(weights).filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 1;
  const w = (f) => (Number.isFinite(weights[f]) ? weights[f] : median);
  const bins = Array.from({ length: n }, () => ({ load: 0, files: [] }));
  const order = [...files].sort((a, b) => w(b) - w(a) || a.localeCompare(b));
  for (const f of order) {
    let best = bins[0];
    for (const b of bins) if (b.load < best.load) best = b;
    best.files.push(f);
    best.load += w(f);
  }
  return bins.map((b) => ({ load: b.load, files: b.files.sort() }));
}

function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(spec || '');
  if (!m) return null;
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (k < 1 || k > n) throw new Error(`--shard ${spec}: K must be 1..N`);
  return { k, n };
}

/** Expand `dir/*.test.js` style globs (a single trailing * segment) without a dependency. */
function expand(patterns) {
  const out = [];
  for (const p of patterns) {
    if (!p.includes('*')) { out.push(p); continue; }
    const dir = path.dirname(p);
    const re = new RegExp(`^${path.basename(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    for (const f of fs.readdirSync(dir).sort()) if (re.test(f)) out.push(path.posix.join(dir, f));
  }
  return [...new Set(out)];
}

function main(argv) {
  const opt = { weights: null, shard: process.env.SHARD || null, list: false, bless: null, globs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--weights') opt.weights = argv[++i];
    else if (a === '--shard') opt.shard = argv[++i];
    else if (a === '--list') opt.list = true;
    else if (a === '--bless') opt.bless = argv[++i];
    else opt.globs.push(a);
  }
  if (!opt.weights) throw new Error('--weights <file.json> is required');

  if (opt.bless) {
    const next = {};
    for (const line of fs.readFileSync(opt.bless, 'utf8').split('\n')) {
      const [file, secs] = line.split('\t');
      if (file && Number.isFinite(Number(secs))) next[file] = Math.round(Number(secs) * 10) / 10;
    }
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(opt.weights, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`[shard-tests] wrote ${Object.keys(sorted).length} weights to ${opt.weights}`);
    return 0;
  }

  const files = expand(opt.globs);
  if (!files.length) throw new Error('no test files matched');
  const weights = fs.existsSync(opt.weights) ? JSON.parse(fs.readFileSync(opt.weights, 'utf8')) : {};
  const shard = parseShard(opt.shard);
  const mine = shard ? plan(files, weights, shard.n)[shard.k - 1] : { load: 0, files: files.sort() };
  const tag = shard ? `shard ${shard.k}/${shard.n}` : 'all files';
  console.log(`[shard-tests] ${tag}: ${mine.files.length} of ${files.length} files, planned ${mine.load.toFixed(0)}s`);
  if (opt.list) { for (const f of mine.files) console.log(f); return 0; }
  const r = spawnSync(process.execPath, ['--test', ...mine.files], { stdio: 'inherit' });
  return r.status ?? 1;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (err) { console.error(`[shard-tests] ${err.message}`); process.exit(2); }
}

module.exports = { plan, parseShard, expand };
