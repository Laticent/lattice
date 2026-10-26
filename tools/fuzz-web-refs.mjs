#!/usr/bin/env node
/**
 * fuzz-web-refs — a seeded fuzz of the web-reference scanners (lib/core/remote-ref.js) in Chromium,
 * WebKit and Firefox. It generates CSS and HTML from the tokenizer rules (test/fixtures/web-ref-fuzz.js),
 * rewrites each input with `blockWebImages` and `blockWebCss`, loads the result two ways against a
 * loopback server, and fails on any request at all (HARD RULE #22; the request log is the evidence, HARD RULE #23).
 * Each input is also loaded unrewritten, so the report says how many fetch as written: a fuzz whose inputs never
 * fetch has proved nothing. A request is pinned on an input only when it reproduces with that input alone.
 *
 * Usage: node tools/fuzz-web-refs.mjs [--seed N] [--count N] [--from N] [--engines chromium,webkit,firefox]
 *                                     [--batch N] [--ref <git ref>] [--compose plain|reading|preview] [--playwright-chromium] [--scanner-file <path>] [--json]
 *   --seed     default 1. Same seed and count give the same inputs everywhere.
 *   --count    inputs per engine, default 2000. The published run is 100000.
 *   --ref      scan with that ref's lib/core/remote-ref.js instead of the working tree's. Run it against the
 *              commit before a fix to see the fuzz fail: an arm that cannot fail proves nothing.
 *   --compose  how the scanners are composed before the load. plain (default): the scanner alone. reading: the Studio's
 *              Reading view (scanner, slide sanitizer, scanner; stylesheet through scanner and style sanitizer).
 *              preview: a preview frame (fonts:false, own origin allowed, sanitizer, the content-security policy).
 *   --scanner-file  scan with the module at that path (a stub that refuses nothing shows what the other layers stop alone)
 *   --playwright-chromium  use the Chromium Playwright installs (newer than the puppeteer build CHROME_PATH names).
 *   Exit 1 on any leak, unattributed request, scanner error or hung input.
 * Chromium uses the build `CHROME_PATH` names, else Playwright's; WebKit and Firefox install through
 * `npx playwright install` in docs/ (about 30 s, once; the system libraries via `install-deps`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'docs/package.json'));
const { chromium, firefox, webkit } = require('@playwright/test');
const F = createRequire(import.meta.url)('../test/helpers/web-ref-fuzz.js');

const argv = process.argv.slice(2);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const seed = Number(arg('--seed', 1));
const count = Number(arg('--count', 2000));
const from = Number(arg('--from', 0));
const batch = Number(arg('--batch', 300));
const ref = arg('--ref', '');
const scannerFile = arg('--scanner-file', '');
const compose = arg('--compose', 'plain');
const engines = arg('--engines', 'chromium,webkit,firefox').split(',');
const asJson = argv.includes('--json');
const TYPES = { chromium, firefox, webkit };

/** The scanner bundle: the working tree's, or `ref`'s (with its one dependency). */
async function bundle() {
  const withCompose = compose !== 'plain';
  if (scannerFile) return F.bundleRemoteRef(path.resolve(scannerFile), { withCompose });
  if (!ref) return F.bundleRemoteRef(undefined, { withCompose });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-ref-'));
  for (const f of ['remote-ref.js', 'media-sources.js']) fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${ref}:lib/core/${f}`], { cwd: ROOT }));
  return F.bundleRemoteRef(path.join(dir, 'remote-ref.js'), { withCompose: compose !== 'plain' });
}

const out = { compose, seed, from, count, ref: ref || 'working tree', commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), engines: {} };
const code = await bundle();
for (const name of engines) {
  const server = await F.startServer();
  // CHROME_PATH is the puppeteer build (131); --playwright-chromium uses the newer build Playwright installs
  const executablePath = name === 'chromium' && !argv.includes('--playwright-chromium') ? process.env.CHROME_PATH || undefined : undefined;
  const browser = await TYPES[name].launch({ headless: true, executablePath, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
  const context = await browser.newContext();
  const openPage = () => context.newPage();
  const page = await openPage();
  await F.loadPage(page, code, server.home);
  const t = Date.now();
  const report = await F.runFuzz({ page, openPage, bundle: code, home: server.home, compose, hits: server.hits, base: server.base, seed, count, from, batch, log: (m) => process.stderr.write(`[${name}] ${m}\n`) });
  out.engines[name] = { version: browser.version(), seconds: Math.round((Date.now() - t) / 1000), inputs: count, css: report.kinds.css, html: report.kinds.html, controlFetched: report.controlFetched, controlRan: report.controlRan, controlByKind: report.controlByKind, requestsAllLoads: report.requests, requestsRewritten: report.rewrittenRequests, leaks: report.leaks, bent: report.bent.length, unattributed: report.unattributed, hung: report.hung, errors: report.errors, slowestMs: report.slowest };
  await browser.close();
  await server.close();
}

const bad = Object.values(out.engines).some((e) => e.requestsRewritten || e.leaks.length || e.unattributed.length || e.errors.length || e.hung.length);
if (asJson) console.log(JSON.stringify(out));
else {
  console.log(`composition ${compose}; seed ${seed}, inputs ${from}..${from + count - 1}, scanner ${scannerFile || out.ref}, repo at ${out.commit}`);
  for (const [name, e] of Object.entries(out.engines)) {
    console.log(`${name.padEnd(9)} ${e.version}  ${e.inputs} inputs (${e.css} css, ${e.html} html) in ${e.seconds}s`);
    console.log(`          fetch as written, css ${e.controlByKind.css.join('/')}, html ${e.controlByKind.html.join('/')}`);
    console.log(`          fetch as written: ${e.controlFetched}/${e.controlRan} (${((100 * e.controlFetched) / e.controlRan).toFixed(1)}%)   requests after rewrite: ${e.requestsRewritten}   leaks ${e.leaks.length}, unattributed ${e.unattributed.length}, scanner errors ${e.errors.length}, hung ${e.hung.length}, slowest rewrite ${e.slowestMs.ms} ms`);
    for (const l of e.leaks.slice(0, 10)) console.log(`          LEAK ${l.name} via ${l.via}: ${JSON.stringify(l.text).slice(0, 240)}`);
  }
  console.log(bad ? 'FAIL' : 'ok: no request at all after the rewrite');
}
process.exitCode = bad ? 1 : 0;
