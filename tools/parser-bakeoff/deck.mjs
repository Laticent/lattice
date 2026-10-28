#!/usr/bin/env node
/**
 * parser:bakeoff:deck — the numbers the deck-parser pipeline is held to (P0 of
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md). Three arms, each on its own flag:
 *
 *   --audit    What a render and a lint do with a deck today: the share of a render that markdown-it's
 *              parse takes, the time of one lint, how often lint calls `parse`, and how often the
 *              line-ending normalization (`\r\n?`) runs. Three decks: the 59 KB gallery, a 12 KB deck
 *              and a 3 KB deck. The default when no flag is given.
 *   --census   Which modules read the structure of a deck themselves. A static count (the syntax
 *              tree, tools/parser-bakeoff/deck/census.mjs) and a runtime count: the functions that
 *              ran in one render plus one lint of the gallery, from V8's precise coverage, joined to
 *              the static readers.
 *   --arms     The corpus differential harness: markdown-it's block structure against the staged
 *              arms (hand-written and Segno-generated line pass) on every tracked deck and doc. An
 *              arm counts only when its structure matches markdown-it's on every file.
 *   --runs N   Repeat --arms (or --audit) in N separate processes and print the median and range of
 *              each figure, with the CPU model. A single run on a shared sandbox moves by up to 19%.
 *   --json     Machine output.
 *
 * On-demand, not a gate. Needs a built tree for the engine (`npm run build`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import inspector from 'node:inspector';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const asJson = has('--json');

const DECKS = [
  ['gallery (59 KB)', 'test/integration/baseline-decks/gallery.md'],
  ['data-viz (12 KB)', 'examples/data-viz-gallery.md'],
  ['card-tags (3 KB)', 'examples/card-tags.md'],
];

const ms = (ns) => Number(ns) / 1e6;
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const best = (fn, rounds = 15, warm = 3) => {
  for (let i = 0; i < warm; i++) fn();
  let b = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rounds; i++) {
    const t = process.hrtime.bigint();
    fn();
    b = Math.min(b, ms(process.hrtime.bigint() - t));
  }
  return b;
};

// ── audit ─────────────────────────────────────────────────────────────────────────────────
function audit() {
  const MarkdownIt = require('markdown-it');
  const { createEngine } = require('./lib/engine/index.js');
  const { lintText } = require('./lib/authoring/lint.js');
  const engine = createEngine();
  const out = [];
  for (const [label, rel] of DECKS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // markdown-it as Lattice configures it for structure: CommonMark, html and breaks on, table and strikethrough
    const md = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
    for (let i = 0; i < 3; i++) {
      engine.render(src);
      lintText(src);
    }
    const parse = best(() => md.parse(src, {}));
    const render = best(() => engine.render(src), 9, 0);
    const lint = best(() => lintText(src), 9, 0);

    // counts: wrap, run once, unwrap
    const origParse = MarkdownIt.prototype.parse;
    const origReplace = String.prototype.replace;
    let parses = 0;
    let norms = 0;
    MarkdownIt.prototype.parse = function (...a) {
      parses++;
      return origParse.apply(this, a);
    };
    String.prototype.replace = function (pat, rep) {
      if (pat instanceof RegExp && pat.source === '\\r\\n?') norms++;
      return origReplace.call(this, pat, rep);
    };
    try {
      lintText(src);
    } finally {
      MarkdownIt.prototype.parse = origParse;
      String.prototype.replace = origReplace;
    }
    out.push({ deck: label, bytes: src.length, parseMs: parse, renderMs: render, parseShare: parse / render, parseSharePct: (100 * parse) / render, lintMs: lint, lintParseCalls: parses, lintNormalizations: norms });
  }
  return out;
}

// ── census ────────────────────────────────────────────────────────────────────────────────
async function census() {
  const { census: staticCensus, summarize } = await import('./deck/census.mjs');
  const rows = staticCensus();
  const s = summarize(rows);
  const readers = new Set(s.readerFiles.map((r) => r.file));
  const factsOf = new Map(s.readerFiles.map((r) => [r.file, r.facts]));

  // runtime: one render and one lint of the gallery, after warm-up, with V8's precise coverage
  const { createEngine } = require('./lib/engine/index.js');
  const { lintText } = require('./lib/authoring/lint.js');
  const src = fs.readFileSync(path.join(ROOT, DECKS[0][1]), 'utf8');
  const engine = createEngine();
  for (let i = 0; i < 3; i++) {
    engine.render(src);
    lintText(src);
  }
  const session = new inspector.Session();
  session.connect();
  const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  await post('Profiler.enable');
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  engine.render(src);
  const renderCov = await post('Profiler.takePreciseCoverage');
  lintText(src);
  const lintCov = await post('Profiler.takePreciseCoverage');
  await post('Profiler.stopPreciseCoverage');
  session.disconnect();

  const ran = (cov) => {
    const files = new Map();
    for (const sc of cov.result) {
      if (!sc.url.startsWith('file://')) continue;
      const f = path.relative(ROOT, fileURLToPath(sc.url));
      const calls = sc.functions.reduce((n, fn) => n + (fn.ranges[0]?.count || 0), 0);
      if (calls) files.set(f, calls);
    }
    return files;
  };
  const renderRan = ran(renderCov);
  const lintRan = ran(lintCov);
  const touched = (m) => [...m.keys()].filter((f) => readers.has(f));
  const both = [...new Set([...touched(renderRan), ...touched(lintRan)])].sort();
  return {
    static: { scanned: s.scanned, readers: s.readers, buildsMd: s.buildsMd, fence: s.fence.length, boundary: s.boundary.length, directive: s.directive.length, sharedCallers: s.sharedCallers.length, sharedFiles: s.sharedFiles, byArea: s.byArea },
    staticProduct: { readers: s.readerFiles.filter((r) => /^(lib|docs\/src)\//.test(r.file)).length, readersInTools: s.readerFiles.filter((r) => r.file.startsWith('tools/')).length },
    runtime: {
      deck: DECKS[0][1],
      renderReaders: touched(renderRan).length,
      lintReaders: touched(lintRan).length,
      eitherReaders: both.length,
      eitherList: both.map((f) => ({ file: f, facts: factsOf.get(f), renderCalls: renderRan.get(f) || 0, lintCalls: lintRan.get(f) || 0 })),
    },
    unparsed: s.unparsed,
  };
}

// ── arms ──────────────────────────────────────────────────────────────────────────────────
function arms() {
  const text = execFileSync(process.execPath, [path.join(HERE, 'deck/run-staged.mjs')], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const rows = [];
  let identical = null;
  for (const line of text.split('\n')) {
    let m = line.match(/^stage arrays, hand vs Segno: (\d+)\/(\d+) identical/);
    if (m) identical = [Number(m[1]), Number(m[2])];
    m = line.match(/^(.*?)\s+([\d.]+) MB\/s\s+([\d.]+)x\s+parity (\d+)\/(\d+)/);
    if (m) rows.push({ arm: m[1].trim(), mbps: Number(m[2]), ratio: Number(m[3]), parity: [Number(m[4]), Number(m[5])] });
    m = line.match(/^the stage alone: hand (\d+) MB\/s, Segno (\d+) MB\/s/);
    if (m) rows.push({ arm: 'line pass alone: hand', mbps: Number(m[1]) }, { arm: 'line pass alone: Segno', mbps: Number(m[2]) });
  }
  // vacuous truth is the failure to avoid: a changed output shape must void the run, not pass it
  const withParity = rows.filter((r) => r.parity);
  const parityOk = !!identical && identical[0] === identical[1] && identical[1] > 0 && withParity.length === 4 && withParity.every((r) => r.parity[0] === r.parity[1] && r.parity[1] === identical[1]) && rows.length === 6;
  return { identical, rows, parityOk };
}

function machine() {
  const c = os.cpus();
  return { cpu: c[0]?.model?.replace(/\s+/g, ' '), cores: c.length, node: process.version, mhz: c[0]?.speed, host: os.hostname(), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
}

// ── --runs N: separate processes, median and range ────────────────────────────────────────
function repeat(n, flag) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    const one = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), flag, '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 }));
    // an arm counts only at exact parity with markdown-it's block structure, so a miss voids the run
    if (flag === '--arms' && !one.arms?.parityOk) throw new Error(`run ${i + 1}: an arm lost parity with markdown-it`);
    runs.push(one);
    if (!asJson) process.stderr.write(`run ${i + 1}/${n} done\n`);
  }
  const keyed = new Map();
  for (const r of runs) {
    for (const row of flag === '--arms' ? r.arms.rows : r.audit) {
      const label = row.arm ?? row.deck;
      for (const [k, v] of Object.entries(row)) {
        if (typeof v !== 'number' || k === 'parseShare' || k === 'bytes') continue;
        const key = `${label}|${k}`;
        keyed.set(key, [...(keyed.get(key) || []), v]);
      }
    }
  }
  return { runs: n, machine: machine(), figures: [...keyed.entries()].map(([key, xs]) => ({ key, median: median(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs })) };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────
const n = Number(arg('--runs', 0));
const result = { machine: machine() };
if (n > 0) {
  if (has('--census')) throw new Error('--runs repeats --audit or --arms; the census is deterministic');
  const flag = has('--audit') ? '--audit' : '--arms';
  const rep = repeat(n, flag);
  if (asJson) console.log(JSON.stringify(rep));
  else {
    console.log(`${rep.runs} runs on ${rep.machine.cpu} (${rep.machine.cores} cores, ${rep.machine.node}) at ${rep.machine.commit}`);
    for (const f of rep.figures) console.log(`${f.key.padEnd(58)} median ${f.median.toFixed(2).padStart(8)}   range ${f.min.toFixed(2)}-${f.max.toFixed(2)}`);
  }
  process.exit(0);
}
const wantAll = !has('--audit') && !has('--census') && !has('--arms');
if (wantAll || has('--audit')) result.audit = audit();
if (has('--census')) result.census = await census();
if (has('--arms')) result.arms = arms();

if (asJson) console.log(JSON.stringify(result));
else {
  const m = result.machine;
  console.log(`${m.cpu}, ${m.cores} cores, node ${m.node}, ${m.commit}\n`);
  if (result.audit) {
    console.log('deck               bytes   parse ms  render ms  parse share   lint ms  lint parse() calls  lint \\r\\n? runs');
    for (const r of result.audit) {
      console.log(`${r.deck.padEnd(18)} ${String(r.bytes).padStart(6)} ${r.parseMs.toFixed(2).padStart(10)} ${r.renderMs.toFixed(1).padStart(10)} ${(r.parseShare * 100).toFixed(1).padStart(10)}% ${r.lintMs.toFixed(1).padStart(9)} ${String(r.lintParseCalls).padStart(19)} ${String(r.lintNormalizations).padStart(17)}`);
    }
  }
  if (result.census) {
    const c = result.census;
    console.log('\nreaders of deck structure (a file with a private markdown-it, fence, boundary or directive reader):');
    console.log(`  scanned ${c.static.scanned} source files; ${c.static.readers} readers (${c.staticProduct.readers} in lib/ and docs/src/, ${c.staticProduct.readersInTools} in tools/)`);
    console.log(`  private markdown-it: ${c.static.buildsMd.length} files (${c.static.buildsMd.filter((f) => f.startsWith('lib/')).length} under lib/)`);
    console.log(`  fence readers ${c.static.fence}, boundary/front-matter readers ${c.static.boundary}, directive readers ${c.static.directive}`);
    console.log(`  callers of the shared splitters: ${c.static.sharedCallers}`);
    console.log(`  readers that ran in one render + one lint of ${c.runtime.deck}: render ${c.runtime.renderReaders}, lint ${c.runtime.lintReaders}, either ${c.runtime.eitherReaders}`);
    for (const r of c.runtime.eitherList) console.log(`    ${r.file.padEnd(52)} ${r.facts.join(',').padEnd(26)} render ${String(r.renderCalls).padStart(7)}  lint ${String(r.lintCalls).padStart(7)} calls in file`);
  }
  if (result.arms) {
    console.log(`\nstage arrays, hand vs Segno: ${result.arms.identical?.join('/')} identical; every arm at parity: ${result.arms.parityOk}`);
    for (const r of result.arms.rows) console.log(`${r.arm.padEnd(40)} ${String(r.mbps).padStart(6)} MB/s${r.ratio ? `  ${r.ratio}x  parity ${r.parity.join('/')}` : ''}`);
  }
}
if (result.arms && !result.arms.parityOk) {
  console.error('an arm lost parity with markdown-it, or the harness output changed shape');
  process.exitCode = 1;
}
