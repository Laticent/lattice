#!/usr/bin/env node
/**
 * THROWAWAY measurement driver for engineering/decisions/2026-11-27-shared-chrome-for-tests.md.
 * Runs one arm of the shared-Chrome experiment over a fixed list of integration test files and
 * prints one JSON result line. Not a test, not a gate, wired into nothing: a measurement script
 * (HARD RULE #32 puts timing in scripts, never in pass/fail tests).
 *
 *   node tools/shared-chrome-lab/run-arm.mjs --arm baseline|global|group|context|pool \
 *     --files list.txt [--concurrency 4] [--pool 2] [--load] [--kill-after 20] [--label x]
 *
 * --load        runs a CPU + memory burner beside the suite for its whole run: one busy loop per
 *               CPU plus 2 GiB held resident, standing in for the release build that was running
 *               when calco-chips timed out.
 * --load-factor K  K busy loops per CPU (default 1); 4 oversubscribes the machine four times over.
 * --mem-gib G  hold G GiB resident (default 2). --io  also loop 256 MiB fsync'd writes.
 * --kill-after  SIGKILLs the shared browser (the first one, in group/pool) N seconds in, to measure
 *               a crash's blast radius.
 *
 * It samples /proc every 250 ms for the peak memory in use (MemTotal - MemAvailable, minus the
 * reading before the run) and the mean CPU busy share, and counts live chrome processes.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const arm = opt('arm', 'baseline');
const files = fs.readFileSync(opt('files'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const concurrency = Number(opt('concurrency', 4));
const poolN = Number(opt('pool', 2));
const load = opt('load', false) === true;
// --load-factor K runs K busy loops per CPU instead of one (K=4 oversubscribes the machine 4x).
const loadFactor = Number(opt('load-factor', 1));
// --mem-gib G holds G GiB resident instead of 2; --io adds a loop writing and syncing 256 MiB files.
const memGiB = Number(opt('mem-gib', 2));
const io = opt('io', false) === true;
const killAfter = Number(opt('kill-after', 0));
const label = opt('label', arm);

// One flag set for every shared browser: the union of what the subset's own launches ask for.
const SHARED_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--allow-file-access-from-files'];
const launchShared = () => puppeteer.launch({ headless: 'new', args: SHARED_ARGS });

const meminfo = () => {
  const m = Object.fromEntries(
    fs
      .readFileSync('/proc/meminfo', 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [k, v] = l.split(':');
        return [k, Number.parseInt(v, 10)];
      }),
  );
  return (m.MemTotal - m.MemAvailable) / 1024; // MiB in use
};
const cpuStat = () => {
  const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = f[3] + f[4];
  return { idle, total: f.reduce((a, b) => a + b, 0) };
};
const chromeCount = () => {
  let n = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      if (/chrom/i.test(fs.readFileSync(`/proc/${d}/comm`, 'utf8'))) n++;
    } catch {}
  }
  return n;
};

// ── the burner ──────────────────────────────────────────────────────────────
const burners = [];
function startLoad() {
  const spin = 'let x=0;for(;;){x=(x*1103515245+12345)%2147483647}';
  for (let i = 0; i < os.availableParallelism() * loadFactor; i++) burners.push(spawn(process.execPath, ['-e', spin], { stdio: 'ignore' }));
  const hold = `const b=[];for(let i=0;i<${memGiB * 16};i++){const a=Buffer.alloc(64*1024*1024);a.fill(i);b.push(a)}setInterval(()=>{for(const a of b)a[0]++},1000)`;
  burners.push(spawn(process.execPath, ['--max-old-space-size=16384', '-e', hold], { stdio: 'ignore' }));
  if (io) burners.push(spawn('bash', ['-c', `while :; do dd if=/dev/zero of=${os.tmpdir()}/sc-io.bin bs=1M count=256 conv=fsync status=none; done`], { stdio: 'ignore' }));
}

// ── the shared browsers ─────────────────────────────────────────────────────
const env = { ...process.env, SC_ARM: arm, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.join(ROOT, 'tools/shared-chrome-lab/preload.cjs')}`.trim() };
const logFile = path.join(os.tmpdir(), `sc-${label}-${process.pid}.jsonl`);
env.SC_LOG = logFile;
fs.rmSync(logFile, { force: true });
const shared = [];
let poolServer;
const mem0 = meminfo();
const tStart = process.hrtime.bigint();
if (load) startLoad();

if (arm === 'global' || arm === 'context') {
  const b = await launchShared();
  shared.push(b);
  env.SC_WS = b.wsEndpoint();
} else if (arm === 'group') {
  const groups = [...new Set(files.map((f) => f.split('/').slice(0, 3).join('/')))];
  const map = {};
  for (const g of groups) {
    const b = await launchShared();
    shared.push(b);
    map[g] = b.wsEndpoint();
  }
  env.SC_WS_MAP = JSON.stringify(map);
} else if (arm === 'pool') {
  for (let i = 0; i < poolN; i++) shared.push(await launchShared());
  const leases = shared.map(() => 0);
  let nextId = 0;
  const held = new Map();
  poolServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/lease') {
      // Least-leased browser, lowest index on a tie: deterministic, no randomness.
      let k = 0;
      for (let i = 1; i < leases.length; i++) if (leases[i] < leases[k]) k = i;
      leases[k]++;
      const id = nextId++;
      held.set(id, k);
      res.end(JSON.stringify({ id, ws: shared[k].wsEndpoint(), index: k }));
    } else if (u.pathname === '/release') {
      const id = Number(u.searchParams.get('id'));
      if (held.has(id)) leases[held.get(id)]--;
      held.delete(id);
      res.end('{}');
    } else res.end('{}');
  });
  await new Promise((r) => poolServer.listen(0, '127.0.0.1', r));
  env.SC_POOL = `http://127.0.0.1:${poolServer.address().port}`;
}

// ── sampling ────────────────────────────────────────────────────────────────
let peakMem = 0;
let peakChrome = 0;
const c0 = cpuStat();
const sampler = setInterval(() => {
  peakMem = Math.max(peakMem, meminfo() - mem0);
  peakChrome = Math.max(peakChrome, chromeCount());
}, 250);

let killed = false;
if (killAfter > 0 && shared.length) {
  setTimeout(() => {
    shared[0].process()?.kill('SIGKILL');
    killed = true;
  }, killAfter * 1000);
}

// ── the run ─────────────────────────────────────────────────────────────────
const child = spawn(process.execPath, ['--test', `--test-concurrency=${concurrency}`, '--test-reporter=tap', ...files], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let tap = '';
child.stdout.on('data', (d) => {
  tap += d;
});
child.stderr.on('data', (d) => {
  tap += d;
});
const code = await new Promise((r) => child.on('close', r));
const wallS = Number(process.hrtime.bigint() - tStart) / 1e9;
clearInterval(sampler);
const c1 = cpuStat();
for (const b of burners) b.kill('SIGKILL');
for (const b of shared) await b.close().catch(() => {});
poolServer?.close();

const count = (k) => Number((tap.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] || 0);
// The files that failed: TAP's top-level `not ok N - <file>` lines.
// Every failing leaf: its name and the file from the `location:` line TAP prints under it.
const failedTests = [...tap.matchAll(/^\s*not ok \d+ - ([^\n]*)\n(?:[^\n]*\n){0,6}?\s*location: '([^:']+)/gm)].map((m) => `${path.relative(ROOT, m[2])} :: ${m[1].slice(0, 90)}`);
const failedFiles = [...new Set(failedTests.map((t) => t.split(' :: ')[0]))];
const recs = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const acq = recs.filter((r) => r.ev === 'acquire');
const okMs = acq.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => (okMs.length ? Math.round(okMs[Math.min(okMs.length - 1, Math.floor(p * okMs.length))]) : null);
const firstErr = (tap.match(/(Timed out after[^\n]*|Protocol error[^\n]*|Target closed[^\n]*|Connection closed[^\n]*)/) || [])[1] || null;

const out = {
  label,
  arm,
  load,
  loadFactor: load ? loadFactor : undefined,
  memGiB: load ? memGiB : undefined,
  io: load ? io : undefined,
  concurrency,
  pool: arm === 'pool' ? poolN : undefined,
  files: files.length,
  exit: code,
  wallS: +wallS.toFixed(1),
  pass: count('pass'),
  fail: count('fail'),
  cancelled: count('cancelled'),
  failedFiles,
  failedTests,
  acquires: acq.length,
  acquireFailures: acq.filter((r) => !r.ok).length,
  acquireMsP50: pct(0.5),
  acquireMsP95: pct(0.95),
  acquireMsMax: okMs.length ? Math.round(okMs.at(-1)) : null,
  sharedBrowsers: shared.length,
  peakMemMiB: Math.round(peakMem),
  meanCpuBusy: +(1 - (c1.idle - c0.idle) / (c1.total - c0.total)).toFixed(2),
  peakChromeProcs: peakChrome,
  killed,
  firstErr,
};
console.log(JSON.stringify(out));
fs.mkdirSync(process.env.SC_KEEP_TAP || '.scratch/sc/tap', { recursive: true });
fs.writeFileSync(`${process.env.SC_KEEP_TAP || '.scratch/sc/tap'}/${label}.tap`, tap);
fs.rmSync(logFile, { force: true });
