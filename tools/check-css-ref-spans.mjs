#!/usr/bin/env node
/**
 * check-css-ref-spans — does the grammar-driven `cssRefSpans` (lib/core/remote-ref.js, reading CSS
 * through lib/core/css-ref.generated.js) leave the sanitizer's answers byte-identical?
 *
 * The R2 gate of engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md: "rewrite and
 * `blocked` lists byte-identical on the decks". It loads `lib/core/remote-ref.js` as it was at `--ref`
 * (default 242de4a, the last commit with the hand-written tokenizer), runs `blockWebCss` and
 * `webRefsInCss` from both over every CSS text the repo carries, and compares the JSON of what they
 * return, with allowed origins empty and with one allowed. Exit 1 on any difference.
 *
 * The CSS texts: every tracked `*.css` file, every `<style>` body and `style:` front-matter block in
 * every deck markdown the golden corpus covers (galleries and decks, the set tools/lib/golden-set.mjs
 * derives from `git ls-files`), and the same decks' HTML as the engine renders it. Spans are compared
 * too (tools/segno-legacy/css-ref-spans.js is the oracle), which is stricter than the blocked lists.
 *
 * Usage: node tools/check-css-ref-spans.mjs [--ref <git ref>] [--json]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckGoldenPdfs } from './lib/golden-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const ref = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : '242de4a';

// The old module with its one dependency, from git.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-old-'));
for (const f of ['remote-ref.js', 'media-sources.js', 'css-ref.generated.js']) {
  try {
    fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${ref}:lib/core/${f}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    // a ref before the CSS parser has no such file
  }
}
const oldMod = require(path.join(dir, 'remote-ref.js'));
const newMod = require('../lib/core/remote-ref.js');
const cssRefSpans = newMod.cssRefSpans;
const legacy = require('./segno-legacy/css-ref-spans.js');
const engine = require('../lib/engine/index.js');

const tracked = (glob) => execFileSync('git', ['ls-files', glob], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const decks = [
  ...new Set([
    ...deckGoldenPdfs(ROOT).map((f) => f.replace(/\.pdf$/, '.md')),
    ...tracked('lib/**/*.gallery.md'),
    ...tracked('lib/**/gallery.md'),
    ...tracked('test/integration/baseline-decks/*.md'),
  ]),
].filter((f) => fs.existsSync(path.join(ROOT, f)));

const texts = [];
for (const f of tracked('*.css')) texts.push([f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const cssCount = texts.length;
for (const f of decks) {
  const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of md.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) texts.push([f, m[1]]);
  const fm = /^---\n([\s\S]*?)\n---/.exec(md);
  if (fm) {
    const s = /^style:\s*\|?\n?([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(fm[1]);
    if (s) texts.push([`${f} (front matter)`, s[1]]);
  }
  try {
    const { html, css } = engine.render(md, 'indaco');
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) texts.push([`${f} (rendered)`, m[1]]);
    if (css) texts.push([`${f} (engine css)`, css]);
  } catch {
    // a deck the engine refuses has no rendered CSS to compare
  }
}

const diffs = [];
let blockedTotal = 0;
for (const [name, css] of texts) {
  for (const allowed of [[], ['https://allowed.example']]) {
    const a = JSON.stringify([oldMod.blockWebCss(css, allowed), oldMod.webRefsInCss ? oldMod.webRefsInCss(css) : null]);
    const b = JSON.stringify([newMod.blockWebCss(css, allowed), newMod.webRefsInCss ? newMod.webRefsInCss(css) : null]);
    if (a !== b) diffs.push(`${name} (allowed ${allowed.length})`);
    blockedTotal += (oldMod.blockWebCss(css, allowed).blocked || []).length;
  }
  if (JSON.stringify(legacy.cssRefSpans(css)) !== JSON.stringify(cssRefSpans(css))) diffs.push(`${name} (spans)`);
}
const summary = { ref, decks: decks.length, cssFiles: cssCount, texts: texts.length, blockedAddresses: blockedTotal, differences: diffs.length };
if (argv.includes('--json')) console.log(JSON.stringify({ ...summary, first: diffs.slice(0, 10) }));
else {
  console.log(`check-css-ref-spans: ${summary.decks} decks, ${summary.cssFiles} CSS files, ${summary.texts} CSS texts, ${summary.blockedAddresses} blocked addresses; ${summary.differences} differences vs ${ref}`);
  for (const d of diffs.slice(0, 10)) console.log(`  DIFFERS ${d}`);
}
process.exit(diffs.length ? 1 : 0);
