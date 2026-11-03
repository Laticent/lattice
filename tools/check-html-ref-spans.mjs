#!/usr/bin/env node
/**
 * check-html-ref-spans — does remote-ref.js's grammar-driven `scanHtml` (Segno R3: lib/core/html-ref.generated.js
 * and html-ref-reader.js) leave the sanitizer's answers byte-identical, and does it read markup the way a spec
 * parser does?
 *
 * The R3 gate of engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md, on every deck
 * markdown the golden corpus covers (the set tools/check-css-ref-spans.mjs reads), each as written and
 * as the engine renders it; with `--fuzz N`, on N seeded inputs of each of three streams instead (the
 * web-reference fuzz's HTML, token soups and foreign-content structures, test/fixtures/html-ref-soups.js).
 *   1. Byte identity. On the corpus, `blockWebImages` from the working tree and from `--ref` (default
 *      e6c3a4a, the last commit before R3's work) return the same JSON, with no origin allowed and with one,
 *      `fonts` off and on, with no spec parser and with jsdom's, except on a text the working tree is newly
 *      `risky` on, where asking the spec parser is the fix.
 *   2. The oracle. The reader's tags equal the hand-written scanner's it replaced (frozen in
 *      tools/segno-legacy/scan-html-fixed.js), and it is unsure exactly where that scanner is `risky`.
 *   3. The platform-parser differential. parse5 (a WHATWG tree builder, scripting on, as every surface
 *      that shows a deck runs scripts) parses each text as a body fragment. Every element it builds
 *      outside raw text, `<template>` contents included, must be a tag the reader read AT THE SAME
 *      OFFSET, with the same name and attributes (first of a duplicate, values decoded); an element with
 *      no start tag of its own (a formatting element the tree builder clones) must match some tag the
 *      reader read. Chromium agrees with parse5 on every case this found: what the browser builds and
 *      the reader did not see is a fetch the sanitizer cannot rewrite. A text the reader is unsure of
 *      is counted apart: there the spec parser is the answer by design (D7).
 *   4. The `unsure` rate: how many texts carry an unsure span, by reason. A high rate means the island
 *      is not yet useful, because the spec parser is doing its job.
 * Exit 1 on any difference in 1 or 2, or any element in 3 the reader missed on a text it was sure of.
 *
 * Usage: node tools/check-html-ref-spans.mjs [--ref <git ref>] [--fuzz <N> [--seed <S>]] [--json]
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
const ref = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : 'e6c3a4a';
const fuzz = argv.includes('--fuzz') ? Number(argv[argv.indexOf('--fuzz') + 1]) : 0;
const seed = argv.includes('--seed') ? Number(argv[argv.indexOf('--seed') + 1]) : 1;

// The old module with its siblings, from git.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-old-'));
for (const f of ['remote-ref.js', 'media-sources.js', 'css-ref.generated.js', 'css-ref-reader.js', 'html-ref.generated.js', 'html-ref-reader.js']) {
  try {
    fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${ref}:lib/core/${f}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    // a ref before a parser has no such file
  }
}
const oldMod = require(path.join(dir, 'remote-ref.js'));
fs.rmSync(dir, { recursive: true, force: true });
const newMod = require('../lib/core/remote-ref.js');
const fixed = require('./segno-legacy/scan-html-fixed.js');
const legacy = require('./segno-legacy/scan-html.js');
const engine = require('../lib/engine/index.js');
const parse5 = require('parse5');
const { JSDOM } = require('jsdom');
const { DOMParser } = new JSDOM('').window;

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
if (fuzz) {
  const { fuzzInputs } = require('../test/fixtures/web-ref-fuzz.js');
  const soups = require('../test/fixtures/html-ref-soups.js');
  const r = soups.rng(seed);
  for (const x of fuzzInputs(seed, 2 * fuzz, 'http://127.0.0.1:9').filter((x) => x.kind === 'html').slice(0, fuzz)) texts.push([x.name, x.text]);
  for (let k = 0; k < fuzz; k++) texts.push([`soup-${seed}-${k}`, soups.gen(r)]);
  for (let k = 0; k < fuzz; k++) texts.push([`foreign-${seed}-${k}`, soups.genForeign(r)]);
}
for (const f of fuzz ? [] : decks) {
  const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
  texts.push([f, md]);
  try {
    texts.push([`${f} (rendered)`, engine.render(md, 'indaco').html]);
  } catch {
    // a deck the engine refuses has no rendered markup to compare
  }
}

const RAW = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'title', 'plaintext']);
/** The elements a spec parser builds from `html` as a body fragment, in tree order, raw-text content left out. */
function parsedElements(html) {
  const out = [];
  const walk = (node) => {
    for (const c of node.childNodes || []) {
      if (!c.tagName) continue;
      out.push({ name: c.tagName, at: c.sourceCodeLocation ? c.sourceCodeLocation.startOffset : -1, attrs: c.attrs.map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]) });
      if (c.tagName === 'template' && c.content) walk(c.content);
      if (!RAW.has(c.tagName) || c.namespaceURI !== 'http://www.w3.org/1999/xhtml') walk(c);
    }
  };
  walk(parse5.parseFragment(html, { scriptingEnabled: true, sourceCodeLocationInfo: true }));
  return out;
}
// What the parser does before and after tokenizing, which the comparison undoes: the input stream folds CR
// and CRLF to LF and turns NUL into U+FFFD in names and values; the tree builder restores SVG's camel case
// (`viewBox`, `radialGradient`) the tokenizer lowered, and renames an HTML `<image>` to `<img>`.
const pre = (s) => s.replace(/\r\n?/g, '\n').replace(/\0/g, '�');
const key = (name, attrs) => {
  const n = pre(name).toLowerCase();
  return `${n === 'image' ? 'img' : n} ${JSON.stringify(attrs.map(([a, v]) => [pre(a).toLowerCase(), v]))}`;
};
const OPTIONS = fuzz ? [] : [[], ['https://allowed.example']].flatMap((a) => [false, true].flatMap((f) => [null, DOMParser].map((p) => [a, f, p])));

const diffs = [];
const missed = [];
const unsureWhy = {};
let unsureTexts = 0;
let elements = 0;
let missedOnUnsure = 0;
let blockedTotal = 0;
let newlyRisky = 0;
for (const [name, html] of texts) {
  const r = newMod.scanHtml(html);
  const l = fixed.scanHtml(html);
  const o = fuzz ? null : legacy.scanHtml(html);
  if (o && l.risky && !o.risky) newlyRisky++;
  // 1. Byte identity.
  for (const [allowed, fonts, parser] of OPTIONS) {
    const opts = { fonts, DOMParser: parser };
    const c = JSON.stringify(newMod.blockWebImages(html, allowed, opts));
    const label = `allowed ${allowed.length}, fonts ${fonts}, parser ${parser ? 'jsdom' : 'none'}`;
    if (!(l.risky && !o.risky) && JSON.stringify(oldMod.blockWebImages(html, allowed, opts)) !== c) diffs.push(`${name} (working tree against ${ref}, ${label})`);
    if (!fonts && !parser && !allowed.length) blockedTotal += JSON.parse(c).blocked.length;
  }
  // 2. The oracle: the hand-written scanner R3 replaced, with nothing left out.
  if (JSON.stringify([l.tags, l.risky]) !== JSON.stringify([r.tags, r.unsure.length > 0])) diffs.push(`${name} (tags)`);
  // 4. The unsure rate.
  if (r.unsure.length) {
    unsureTexts++;
    for (const why of new Set(r.unsure.map((u) => u.why))) unsureWhy[why] = (unsureWhy[why] || 0) + 1;
  }
  // 3. The platform-parser differential: every element parse5 builds is a tag the reader read.
  const byFrom = new Map();
  const anywhere = new Set();
  for (const t of r.tags) {
    const attrs = [];
    const names = new Set();
    for (const a of t.attrs) {
      if (names.has(a.name)) continue;
      names.add(a.name);
      attrs.push([a.name, a.vFrom < 0 ? '' : newMod.decodeEntities(pre(html.slice(a.vFrom, a.vTo)), { attribute: true })]);
    }
    const k = key(t.name, attrs);
    byFrom.set(t.from, k);
    anywhere.add(k);
  }
  for (const el of parsedElements(html)) {
    // Elements the tree builder makes with no start tag of their own (an implied `<tbody>`, the `<p>` a stray
    // `</p>` opens, the `<br>` a `</br>` is read as) carry no attributes, so no address.
    if (!el.attrs.length && ['html', 'head', 'body', 'tbody', 'colgroup', 'tr', 'p', 'br'].includes(el.name)) continue;
    elements++;
    const k = key(el.name, el.attrs);
    // A start tag in the markup must be the reader's tag at the same offset. A clone of a formatting element
    // (`<a>`, `<b>`, reopened by the tree builder) has no tag of its own and carries one the reader read.
    if (el.at >= 0 ? byFrom.get(el.at) === k : anywhere.has(k)) continue;
    if (r.unsure.length) missedOnUnsure++;
    else missed.push(`${name}: <${el.name}> at ${el.at} ${JSON.stringify(el.attrs).slice(0, 160)} in ${JSON.stringify(html.slice(0, 160))}`);
  }
}
const summary = {
  ref,
  fuzz: fuzz ? { seed, perStream: fuzz } : false,
  decks: fuzz ? 0 : decks.length,
  texts: texts.length,
  blockedAddresses: blockedTotal,
  newlyRisky,
  differences: diffs.length,
  parsedElements: elements,
  missedOnSure: missed.length,
  missedOnUnsure,
  unsureTexts,
  unsureRate: texts.length ? unsureTexts / texts.length : 0,
  unsureWhy,
};
if (argv.includes('--json')) console.log(JSON.stringify({ ...summary, first: diffs.slice(0, 10), missed: missed.slice(0, 10) }));
else {
  const what = fuzz ? `fuzz seed ${seed}, ${fuzz} per stream` : `${summary.decks} decks`;
  console.log(`check-html-ref-spans: ${what}, ${summary.texts} texts, ${summary.blockedAddresses} blocked addresses; ${summary.differences} differences${fuzz ? '' : ` (vs ${ref}; ${newlyRisky} texts newly risky)`}`);
  console.log(`  spec parser: ${elements} elements built, ${missed.length} missed on texts the reader was sure of, ${missedOnUnsure} on texts it was unsure of`);
  console.log(`  unsure: ${unsureTexts} of ${texts.length} texts (${(summary.unsureRate * 100).toFixed(2)}%) ${JSON.stringify(unsureWhy)}`);
  for (const d of diffs.slice(0, 10)) console.log(`  DIFFERS ${d}`);
  for (const d of missed.slice(0, 10)) console.log(`  MISSED ${d}`);
}
process.exit(diffs.length || missed.length ? 1 : 0);
