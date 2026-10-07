/**
 * parser-bakeoff languages arm, in three browser engines — is a generated Segno parser as fast in
 * Firefox and Safari as in Chrome, and did a generator change help all three?
 *
 * The `languages` arm (languages.mjs) times the CSS, HTML and Markdown grammars in Node, which is
 * V8. The Studio runs generated parsers in WebKit and SpiderMonkey too, and a generator tuned on V8
 * can lose elsewhere. This arm builds Segno twice — from the working tree and from `--base <ref>`
 * (default `origin/main`) — generates the three parsers from each with the SAME grammars, and times
 * both in Playwright's chromium, firefox and webkit over the corpus the languages arm reads (every
 * tracked .css, .html and .md file; front matter stripped from Markdown). Rounds alternate base and
 * head so a thermal or scheduler drift lands on both; each cell is the best of nine samples of 100 ms
 * or more (Firefox and WebKit coarsen the timer). Before timing,
 * each page checks that base and head agree on every file (same ok, same tree size).
 *
 * A browser that is not installed is skipped with a note: only Chromium is in the base image
 * (`npx playwright install webkit firefox`, then `install-deps`; engineering/development.md).
 *
 * Usage:  npm run parser:bakeoff:languages:browsers -- [--base <ref>] [--json]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { languageGrammars } from './languages-grammars.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const esbuild = require('esbuild');
const playwright = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'origin/main');
const LANGS = ['css', 'html', 'md'];

/** The three generated parsers, as plain scripts that set `globalThis[name] = { parse }`. */
async function parsersFrom(libDir, tag) {
  const built = await esbuild.build({ stdin: { contents: "export * from './index.ts';", resolveDir: libDir, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', tsconfigRaw: '{}', logLevel: 'silent' });
  const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  const G = languageGrammars(S);
  return Object.fromEntries(LANGS.map((l) => [l, esbuild.transformSync(S.generate(G[l]), { loader: 'ts', format: 'iife', globalName: `${tag}_${l}`, target: 'es2020' }).code]));
}
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'segno-base-'));
execSync(`git archive ${BASE} docs/src/lib/segno | tar -x -C ${baseDir}`, { cwd: ROOT });
const code = { base: await parsersFrom(path.join(baseDir, 'docs/src/lib/segno'), 'base'), head: await parsersFrom(path.join(ROOT, 'docs/src/lib/segno'), 'head') };
fs.rmSync(baseDir, { recursive: true, force: true });
const baseSha = execSync(`git rev-parse --short ${BASE}`, { cwd: ROOT }).toString().trim();

const files = (glob) => execSync(`git ls-files -z '${glob}'`, { cwd: ROOT }).toString().split('\0').filter(Boolean);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const corpus = {
  css: files('*.css').map(read),
  html: files('*.html').map(read),
  md: files('*.md').map((f) => read(f).replace(/^---\n[\s\S]*?\n---\n/, '')),
};
const MB = Object.fromEntries(LANGS.map((l) => [l, corpus[l].reduce((a, s) => a + s.length, 0) / 1e6]));

// Runs inside the page. Returns { agree, ms: { lang: { base, head } } }.
function race({ langs, rounds }) {
  const C = globalThis.__corpus;
  const agree = {};
  for (const l of langs) {
    agree[l] = C[l].every((s) => {
      const a = globalThis[`base_${l}`].parse(s); const at = a.ok ? a.tree.top : a.error.at;
      const b = globalThis[`head_${l}`].parse(s); const bt = b.ok ? b.tree.top : b.error.at;
      return a.ok === b.ok && at === bt;
    });
  }
  const ms = {};
  for (const l of langs) {
    const xs = C[l];
    const fn = { base: globalThis[`base_${l}`].parse, head: globalThis[`head_${l}`].parse };
    // Firefox and WebKit coarsen performance.now() to about a millisecond, and one pass over the
    // HTML corpus takes about that long: a sample repeats the corpus until it is 100 ms or more.
    let reps = 1;
    for (;;) {
      const t = performance.now();
      for (let p = 0; p < reps; p++) for (const k of ['base', 'head']) for (const s of xs) fn[k](s); // also the warm-up
      if (performance.now() - t >= 200) break;
      reps *= 2;
    }
    const best = { base: Infinity, head: Infinity };
    for (let r = 0; r < rounds; r++) for (const k of r % 2 ? ['head', 'base'] : ['base', 'head']) {
      const t = performance.now();
      for (let p = 0; p < reps; p++) for (const s of xs) fn[k](s);
      best[k] = Math.min(best[k], (performance.now() - t) / reps);
    }
    ms[l] = best;
  }
  return { agree, ms };
}

const out = { base: `${BASE} (${baseSha})`, MB: Object.fromEntries(LANGS.map((l) => [l, +MB[l].toFixed(2)])), engines: {} };
for (const name of ['chromium', 'firefox', 'webkit']) {
  let browser;
  try { browser = await playwright[name].launch(); } catch (e) { out.engines[name] = { skipped: String(e.message).split('\n')[0] }; continue; }
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const k of ['base', 'head']) for (const l of LANGS) await page.addScriptTag({ content: code[k][l] });
  await page.evaluate((c) => { globalThis.__corpus = c; }, corpus);
  const r = await page.evaluate(race, { langs: LANGS, rounds: 18 }); // 18 alternating rounds: nine of each
  out.engines[name] = { version: browser.version(), agree: r.agree, MBps: Object.fromEntries(LANGS.map((l) => [l, { base: +(MB[l] / (r.ms[l].base / 1e3)).toFixed(1), head: +(MB[l] / (r.ms[l].head / 1e3)).toFixed(1) }])) };
  await browser.close();
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`MB/s over every tracked file, best of nine, base ${out.base} vs the working tree`);
console.log(`corpus: css ${out.MB.css} MB, html ${out.MB.html} MB, md ${out.MB.md} MB\n`);
console.log(`| engine | ${LANGS.map((l) => `${l} base → head`).join(' | ')} |`);
console.log(`|---|${LANGS.map(() => '---').join('|')}|`);
for (const [name, e] of Object.entries(out.engines)) {
  if (e.skipped) { console.log(`| ${name} | skipped: ${e.skipped} |`); continue; }
  const cell = (l) => `${e.MBps[l].base} → ${e.MBps[l].head} (${(e.MBps[l].head / e.MBps[l].base).toFixed(2)}x)${e.agree[l] ? '' : ' DISAGREE'}`;
  console.log(`| ${name} ${e.version} | ${LANGS.map(cell).join(' | ')} |`);
}
