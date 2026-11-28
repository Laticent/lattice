#!/usr/bin/env node
/**
 * Launch probe: how long does a plain `puppeteer.launch` take on this machine, right now?
 *
 * Runs W workers. Each one loops launch -> newPage -> setContent -> close, with calco-chips' exact
 * launch options, until --seconds runs out (a script deadline, not a test assertion), and prints one
 * JSON line per launch plus a summary: count, p50, p95, max, and every launch over --slow ms. A launch
 * that fails (puppeteer's own 30 s WS-endpoint timeout) is recorded with its message.
 *
 *   node tools/shared-chrome-lab/launch-probe.mjs --workers 3 --seconds 300 [--slow 5000] [--label x]
 *
 * Run it beside whatever is suspected of starving Chrome's startup (`npm run build` in a loop,
 * `npm run test:integration:pr`) and compare against a quiet run.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const puppeteer = createRequire(import.meta.url)('puppeteer');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? d : argv[i + 1];
};
const workers = Number(opt('workers', 3));
const seconds = Number(opt('seconds', 120));
const slow = Number(opt('slow', 5000));
const label = opt('label', 'probe');
const out = opt('out', null);
const end = Date.now() + seconds * 1000;
const recs = [];
const emit = (r) => {
  recs.push(r);
  if (out) fs.appendFileSync(out, `${JSON.stringify({ label, ...r })}\n`);
};

async function worker(w) {
  while (Date.now() < end) {
    const t0 = process.hrtime.bigint();
    const at = new Date().toISOString();
    try {
      const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const launchMs = Number(process.hrtime.bigint() - t0) / 1e6;
      const p = await b.newPage();
      await p.setContent('<p>probe</p>', { waitUntil: 'load' });
      await b.close();
      emit({ w, at, ok: true, launchMs: Math.round(launchMs) });
    } catch (e) {
      emit({ w, at, ok: false, launchMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e6), err: String(e.message).slice(0, 160) });
    }
  }
}

await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
const ok = recs.filter((r) => r.ok).map((r) => r.launchMs).sort((a, b) => a - b);
const q = (p) => (ok.length ? ok[Math.min(ok.length - 1, Math.floor(p * ok.length))] : null);
console.log(
  JSON.stringify({
    label,
    workers,
    seconds,
    launches: recs.length,
    failures: recs.filter((r) => !r.ok).length,
    p50: q(0.5),
    p95: q(0.95),
    max: ok.at(-1) ?? null,
    slow: recs.filter((r) => r.launchMs > slow).map((r) => ({ at: r.at, ms: r.launchMs, ok: r.ok, err: r.err })),
  }),
);
