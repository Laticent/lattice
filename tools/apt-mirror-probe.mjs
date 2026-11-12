#!/usr/bin/env node
/**
 * tools/apt-mirror-probe.mjs — measure Ubuntu's package mirrors from where CI actually runs, and rank them.
 *
 *   node tools/apt-mirror-probe.mjs measure [--rounds 3] [--out probe.json]   time every mirror apt-setup.sh lists
 *   node tools/apt-mirror-probe.mjs report <file-or-dir>...                   rank the mirrors over every probe file found
 *
 * Why: .github/actions/apt-cached/apt-setup.sh orders its mirror list by measurement, and the only measurements behind
 * that order (2026-11-11) came from a cloud sandbox behind a proxy, not a GitHub runner. GitHub's runners sit in Azure,
 * where azure.archive.ubuntu.com may be the fastest mirror whenever its DNS works (followups.d 3139-p3). The
 * apt-mirror-probe.yml workflow runs `measure` on a runner every four hours and `report` over the past week of its runs,
 * and prints the table in the run's summary.
 *
 * What one sample is, per mirror and round: a DNS lookup straight to the configured resolver (`resolve4`, timed, 5 s and two tries at most;
 * a failure is the 2026-11-11 outage shape), then two curl fetches of the security pocket, which every mirror in the
 * list carries: `dists/noble-security/InRelease` for time to first byte, and the pocket's main amd64 `Packages.gz` for
 * download speed. A sample fails when the lookup fails, curl fails, or either fetch is not HTTP 200.
 *
 * The mirror list is read from apt-setup.sh itself, so the probe can never measure a different list from the one CI
 * uses. The ranking is: fewest failed samples (as a share), then the lowest median time to first byte. `measure` needs
 * the network; `report` is pure and is what test/unit/tools/apt-mirror-probe.test.js covers.
 */
import { execFile } from 'node:child_process';
import { promises as dnsPromises } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APT_SETUP = path.join(ROOT, '.github', 'actions', 'apt-cached', 'apt-setup.sh');
const SMALL = 'dists/noble-security/InRelease';
const LARGE = 'dists/noble-security/main/binary-amd64/Packages.gz';

/** The mirrors apt-setup.sh writes, unrotated: its `ORDER=( … )` list, then `SECURITY=`, which it always puts last. */
export function mirrorsFrom(src) {
  const order = src.match(/^ORDER=\(([\s\S]*?)^\)/m)?.[1] ?? '';
  const security = src.match(/^SECURITY=(\S+)/m)?.[1];
  return [...order.matchAll(/https?:\/\/\S+\//g)].map((m) => m[0]).concat(security ? [security] : []);
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Rank mirrors over a set of samples (`{ mirror, ok, dnsOk, dnsMs, ttfbMs, mbps }`). `order` is the current list, which
 * breaks ties and keeps a mirror with no samples visible at the end.
 */
export function rank(samples, order = []) {
  const by = new Map(order.map((m) => [m, []]));
  for (const s of samples) {
    if (!by.has(s.mirror)) by.set(s.mirror, []);
    by.get(s.mirror).push(s);
  }
  const rows = [...by].map(([mirror, xs]) => {
    const ok = xs.filter((s) => s.ok);
    return {
      mirror,
      samples: xs.length,
      failed: xs.length - ok.length,
      dnsFailed: xs.filter((s) => !s.dnsOk).length,
      failRate: xs.length ? (xs.length - ok.length) / xs.length : 1,
      dnsMs: median(xs.filter((s) => s.dnsOk && s.dnsMs != null).map((s) => s.dnsMs)),
      ttfbMs: median(ok.map((s) => s.ttfbMs)),
      mbps: median(ok.map((s) => s.mbps)),
    };
  });
  const pos = (m) => (order.includes(m) ? order.indexOf(m) : order.length);
  return rows.sort((a, b) => a.failRate - b.failRate || (a.ttfbMs ?? Infinity) - (b.ttfbMs ?? Infinity) || pos(a.mirror) - pos(b.mirror));
}

const fmt = (v, d = 0) => (v == null ? '—' : v.toFixed(d));

/** The Markdown report: the window, the ranked table, and the order it suggests next to apt-setup.sh's. */
export function report(probes, order) {
  const samples = probes.flatMap((p) => p.samples || []);
  const times = probes.map((p) => p.at).filter(Boolean).sort();
  const rows = rank(samples, order);
  const out = [
    `**${probes.length} probe run(s), ${samples.length} samples**${times.length ? `, ${times[0]} to ${times[times.length - 1]}` : ''}.`,
    '',
    '| rank | mirror | samples | failed | DNS failed | DNS ms (median) | first byte ms (median) | MB/s (median) | apt-setup.sh position |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${r.mirror} | ${r.samples} | ${r.failed} | ${r.dnsFailed} | ${fmt(r.dnsMs)} | ${fmt(r.ttfbMs)} | ${fmt(r.mbps, 1)} | ${order.includes(r.mirror) ? order.indexOf(r.mirror) + 1 : 'not listed'} |`,
    ),
    '',
  ];
  // security.ubuntu.com carries only the security pocket, so it stays last however it measures.
  const isSecurity = (m) => new URL(m).hostname === 'security.ubuntu.com';
  const suggested = [...rows.map((r) => r.mirror).filter((m) => !isSecurity(m)), ...rows.map((r) => r.mirror).filter(isSecurity)];
  const same = suggested.length === order.length && suggested.every((m, i) => m === order[i]);
  out.push(same ? 'The measured order matches apt-setup.sh.' : `Measured order: ${suggested.map((m) => `\`${m}\``).join(' → ')}. apt-setup.sh: ${order.map((m) => `\`${m}\``).join(' → ')}.`);
  out.push('', 'Ranked by share of failed samples, then median time to first byte. The measured order keeps `security.ubuntu.com` last whatever it measures: it carries only the security pocket.');
  return out.join('\n');
}

async function curl(url) {
  const fmtArg = '%{http_code} %{time_starttransfer} %{speed_download}';
  try {
    const { stdout } = await promisify(execFile)('curl', ['-sS', '-o', '/dev/null', '--max-time', '30', '-w', fmtArg, url]);
    const [code, ttfb, speed] = stdout.trim().split(' ');
    return { ok: code === '200', ttfbMs: Number(ttfb) * 1000, mbps: Number(speed) / 1e6, code };
  } catch (e) {
    return { ok: false, code: `curl exit ${e.code}` };
  }
}

// Bounded: Node's default resolver retries with backoff and no ceiling of ours, and a DNS outage is exactly when the
// probe must still finish and upload its samples. 5 s, two tries.
const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 2 });

async function sample(mirror) {
  const host = new URL(mirror).hostname;
  const t0 = performance.now();
  let dnsOk = true;
  let dnsError = null;
  try {
    await resolver.resolve4(host);
  } catch (e) {
    dnsOk = false;
    dnsError = e.code;
  }
  const dnsMs = performance.now() - t0;
  const small = await curl(mirror + SMALL);
  const large = small.ok ? await curl(mirror + LARGE) : { ok: false };
  return {
    mirror,
    dnsOk,
    dnsError,
    dnsMs: Math.round(dnsMs),
    ok: dnsOk && small.ok && large.ok,
    ttfbMs: small.ok ? Math.round(small.ttfbMs) : null,
    mbps: large.ok ? Number(large.mbps.toFixed(2)) : null,
    error: small.ok ? (large.ok ? null : large.code) : small.code,
  };
}

function readProbes(paths) {
  const files = [];
  const walk = (p) => {
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
    else if (p.endsWith('.json')) files.push(p);
  };
  for (const p of paths) if (fs.existsSync(p)) walk(p);
  return files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const order = mirrorsFrom(fs.readFileSync(APT_SETUP, 'utf8'));
  if (!order.length) throw new Error(`no mirrors found in ${APT_SETUP}`);
  const flag = (name, dflt) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : dflt;
  };
  if (mode === 'measure') {
    const rounds = Number(flag('--rounds', '3'));
    const samples = [];
    // Rounds interleave the mirrors, so a slow minute on the network lands on all of them rather than one.
    for (let r = 0; r < rounds; r++) for (const m of order) samples.push(await sample(m));
    const probe = { at: new Date().toISOString(), runner: process.env.RUNNER_NAME || null, image: process.env.ImageVersion || null, samples };
    const out = flag('--out', null);
    if (out) fs.writeFileSync(out, `${JSON.stringify(probe, null, 2)}\n`);
    console.log(report([probe], order));
    return;
  }
  if (mode === 'report') {
    if (!rest.length) throw new Error('report needs probe files or folders');
    console.log(report(readProbes(rest), order));
    return;
  }
  throw new Error('usage: apt-mirror-probe.mjs measure [--rounds N] [--out file] | report <file-or-dir>...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`apt-mirror-probe: ${e.message}`);
    process.exit(1);
  });
}
