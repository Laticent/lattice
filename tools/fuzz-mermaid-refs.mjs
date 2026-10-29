#!/usr/bin/env node
/**
 * fuzz-mermaid-refs — a seeded fuzz of how the web-reference scanner reads Mermaid diagrams, against
 * the real Mermaid drawing them, in Chromium, WebKit and Firefox (HARD RULE #22; the request log is
 * the evidence, HARD RULE #23). Followups 2909-p3; the cases it generates are measured in
 * engineering/decisions/2026-10-26-web-ref-fuzz.md §Mermaid.
 *
 * Each input is a Markdown document with one fenced diagram (test/fixtures/mermaid-ref-fuzz.js). It is
 * rendered by the real engine (lib/engine `render`), and the diagrams the runtime draws are the
 * elements its own selector picks (`DRAWN_FENCE_CODE`, lib/plugins/drawn-probe.mjs). Each
 * is drawn with the vendored Mermaid at the runtime's config (`engineInitConfig`, `securityLevel:
 * 'strict'`), and every link it draws is clicked in a frame of its own, against a loopback server:
 *
 *   control    every input drawn and clicked as written: how many fetch or navigate at all. A fuzz
 *              whose inputs never reach the server has proved nothing, so the report counts them.
 *   scanned    what a reader sees: `blockWebImages` reads the rendered page, and a diagram whose
 *              address it refuses is held back (the Studio does not draw it until the reader allows
 *              it). Only the inputs it lets through are drawn and clicked. Any request is a leak.
 *
 * Each arm runs in a fresh browser context, so the control's memory cache cannot answer a request
 * the scanned arm would make.
 *
 * Usage: node tools/fuzz-mermaid-refs.mjs [--seed N] [--count N] [--from N] [--engines chromium,webkit,firefox]
 *                                         [--ref <git ref>] [--scanner-file <path>] [--json]
 *   --ref  scan with that ref's lib/core/remote-ref.js: run it against an older scanner to see the fuzz fail.
 *   --scanner-file  scan with the module at that path (a stub that refuses nothing shows the arm can fail).
 *   Exit 1 on any leak, unattributed request or hung input.
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
const local = createRequire(import.meta.url);
const F = local('../test/helpers/web-ref-fuzz.js');
const { mermaidInputs } = local('../test/fixtures/mermaid-ref-fuzz.js');
const { render } = local('../lib/engine');
const { engineInitConfig } = local('../lib/plugins/mermaid/shared/init-directive.js');
// The runtime's own selector for a block it draws, from the plugin registry (never a hand-written class).
const { DRAWN_FENCE_CODE } = await import('../lib/plugins/drawn-probe.mjs');

const argv = process.argv.slice(2);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const seed = Number(arg('--seed', 1));
const count = Number(arg('--count', 300));
const from = Number(arg('--from', 0));
const ref = arg('--ref', '');
const scannerFile = arg('--scanner-file', '');
const engines = arg('--engines', 'chromium,webkit,firefox').split(',');
const asJson = argv.includes('--json');
const TYPES = { chromium, firefox, webkit };
const MERMAID = path.join(ROOT, 'lib/plugins/mermaid/vendor/mermaid.min.js');
// The runtime's security keys and layout without the deck palette: the palette changes no fetch.
const CONFIG = engineInitConfig({}, { omitPalette: true });

/** The scanner: the working tree's, a file's, or `ref`'s (with its one dependency). */
function scanner() {
  if (scannerFile) return local(path.resolve(scannerFile));
  if (!ref) return local('../lib/core/remote-ref.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-ref-'));
  for (const f of ['remote-ref.js', 'media-sources.js']) fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${ref}:lib/core/${f}`], { cwd: ROOT }));
  return local(path.join(dir, 'remote-ref.js'));
}
const R = scanner();

/** Draw every runtime-picked diagram in `html`, then click every link each one drew, each in a frame of its own. */
async function drawAndClick(page, docs) {
  return page.evaluate(async ({ docs: d, config, selector }) => {
    if (!window.__mmInit) { window.mermaid.initialize(config); window.__mmInit = true; }
    const root = document.getElementById('root');
    root.textContent = '';
    const out = { drawn: 0, links: 0, failed: 0 };
    let k = 0;
    for (const html of d) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      for (const code of tpl.content.querySelectorAll(selector)) {
        let svg;
        try {
          ({ svg } = await window.mermaid.render(`fz${k++}`, code.textContent || ''));
        } catch {
          out.failed++;
          continue;
        }
        out.drawn++;
        const host = document.createElement('div');
        host.innerHTML = svg;
        root.appendChild(host);
        if (!host.querySelector('a')) continue;
        // A click navigates, so it happens in a frame: the harness page stays where it is.
        await new Promise((resolve) => {
          const f = document.createElement('iframe');
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          f.onload = () => {
            if (f.dataset.clicked) return finish();
            f.dataset.clicked = '1';
            try {
              const as = f.contentDocument.querySelectorAll('a');
              out.links += as.length;
              for (const a of as) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: f.contentWindow }));
            } catch {}
            setTimeout(finish, 600);
          };
          setTimeout(finish, 4000);
          f.srcdoc = `<!doctype html><meta charset="utf-8">${svg}`;
          root.appendChild(f);
        });
      }
    }
    return out;
  }, { docs, config: CONFIG, selector: DRAWN_FENCE_CODE });
}

const out = { seed, from, count, scanner: scannerFile || ref || 'working tree', commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), engines: {} };
for (const name of engines) {
  const server = await F.startServer();
  const inputs = mermaidInputs(seed, count, server.base, { from });
  const rows = inputs.map((p) => {
    const html = render(p.text).html;
    let held = false;
    let error = null;
    try {
      held = R.blockWebImages(html, [], { fonts: true }).blocked.some((b) => b.kind === 'diagram');
    } catch (e) {
      error = String(e?.message || e);
    }
    return { ...p, html, held, error };
  });
  const executablePath = name === 'chromium' ? process.env.CHROME_PATH || undefined : undefined;
  const browser = await TYPES[name].launch({ headless: true, executablePath, args: name === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
  const t = Date.now();
  const arm = async (docs, label) => {
    // a fresh context per arm and per input: the memory cache answers a repeated address without a request
    const fetched = new Set();
    const unattributed = [];
    const hung = [];
    const totals = { drawn: 0, links: 0, failed: 0 };
    const known = new Set(docs.map((r) => r.name));
    for (const r of docs) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(server.home);
      await page.addScriptTag({ path: MERMAID });
      server.hits.length = 0;
      try {
        const got = await Promise.race([drawAndClick(page, [r.html]), new Promise((_, no) => setTimeout(() => no(new Error('deadline')), 20000))]);
        for (const k of Object.keys(totals)) totals[k] += got[k];
      } catch {
        hung.push(r.name);
      }
      await F.settle(server.hits, { quiet: 300, min: 200, max: 4000 });
      for (const h of server.hits) {
        const n = F.nameOf(h);
        if (known.has(n)) fetched.add(n);
        // one input per context, so a request whose path names no input still belongs to this one
        else unattributed.push({ arm: label, input: r.name, url: h, text: r.text });
      }
      await context.close();
    }
    return { fetched, unattributed, hung, totals };
  };
  const control = await arm(rows, 'control');
  const passed = rows.filter((r) => !r.held && !r.error);
  const scanned = await arm(passed, 'scanned');
  const byClass = {};
  for (const r of rows) {
    const c = (byClass[r.fetch] ??= { inputs: 0, reachAsWritten: 0, held: 0, leaks: 0 });
    c.inputs++;
    if (control.fetched.has(r.name)) c.reachAsWritten++;
    if (r.held) c.held++;
    if (scanned.fetched.has(r.name)) c.leaks++;
  }
  out.engines[name] = {
    version: browser.version(),
    seconds: Math.round((Date.now() - t) / 1000),
    inputs: rows.length,
    drawnAsWritten: control.totals.drawn,
    linksClicked: control.totals.links,
    reachAsWritten: control.fetched.size,
    held: rows.filter((r) => r.held).length,
    byClass,
    leaks: rows.filter((r) => scanned.fetched.has(r.name)).map((r) => ({ name: r.name, fetch: r.fetch, text: r.text })),
    unattributed: [...control.unattributed, ...scanned.unattributed],
    hung: [...control.hung, ...scanned.hung],
    errors: rows.filter((r) => r.error).map((r) => ({ name: r.name, error: r.error })),
  };
  await browser.close();
  await server.close();
}

// An unattributed request in the control is an input whose address the browser read differently (a path cut short),
// reported but not a failure; in the scanned arm it is a request the scanner let through, and fails like a leak.
const bad = Object.values(out.engines).some((e) => e.leaks.length || e.unattributed.some((u) => u.arm === 'scanned') || e.hung.length || e.errors.length);
if (asJson) console.log(JSON.stringify(out));
else {
  console.log(`seed ${seed}, inputs ${from}..${from + count - 1}, scanner ${out.scanner}, repo at ${out.commit}`);
  for (const [name, e] of Object.entries(out.engines)) {
    console.log(`${name.padEnd(9)} ${e.version}  ${e.inputs} inputs in ${e.seconds}s; drawn as written ${e.drawnAsWritten}, links clicked ${e.linksClicked}`);
    console.log(`          reach the server as written: ${e.reachAsWritten}/${e.inputs}   held back by the scanner: ${e.held}   leaks ${e.leaks.length}, unattributed ${e.unattributed.length} (${e.unattributed.filter((u) => u.arm === 'scanned').length} after the scanner), hung ${e.hung.length}, scanner errors ${e.errors.length}`);
    for (const [c, v] of Object.entries(e.byClass)) console.log(`          ${c.padEnd(10)} ${v.reachAsWritten}/${v.inputs} reach as written, ${v.held} held, ${v.leaks} leaked`);
    for (const u of e.unattributed.slice(0, 5)) console.log(`          UNATTRIBUTED (${u.arm}) ${u.url} from ${u.input}: ${JSON.stringify(u.text).slice(0, 200)}`);
    for (const l of e.leaks.slice(0, 8)) console.log(`          LEAK ${l.name} (${l.fetch}): ${JSON.stringify(l.text).slice(0, 240)}`);
  }
  console.log(bad ? 'FAIL' : 'ok: no diagram the scanner let through reached the server');
}
process.exitCode = bad ? 1 : 0;
