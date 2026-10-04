#!/usr/bin/env node
/**
 * segno-codemod — rewrite inline-code directives from their old spellings into Segno's notation.
 *
 *   `{BETA}:tag:c4`       →  `{BETA, tag, c4}`
 *   `~{12 14 17}:bar:lg`  →  `~{12 14 17, bar, lg}`
 *   `\{LIVE}:tag`         →  `\{LIVE, tag}`        (an escaped example stays escaped)
 *
 * Segno phase 2 is a clean break (engineering/decisions/2026-09-28-segno-unified-inline-notation.md,
 * decisions 9 and 21): this rewrites every shipped deck and doc, and the old parsers are deleted.
 * It recognizes the OLD spellings with the frozen kernels in tools/segno-legacy/ — never with
 * lib/, which no longer reads them — and rewrites a span only when the old kernel would have read
 * it as that directive (or as a broken attempt at one, so a doc that teaches an error keeps
 * teaching it, in the new spelling). Anything it cannot rewrite safely is REPORTED, not guessed.
 *
 * Grammars are switched on one at a time as each phase-2 slice moves its kernel (`--only`).
 *
 * Usage:
 *   node tools/segno-codemod.mjs                     rewrite the default corpus (all grammars)
 *   node tools/segno-codemod.mjs --only pill,spark   only these rewriters
 *   node tools/segno-codemod.mjs --check             exit 1 if anything would change (no writes)
 *   node tools/segno-codemod.mjs path/to/deck.md …   these files instead of the corpus
 *
 * The corpus is every tracked `*.md` except dated records (engineering/decisions/**, CHANGELOG.md,
 * changelog.d/**), which keep the spellings of their day. Inside a fenced block, only a
 * `markdown`/`md` fence (a deck example in a doc) is rewritten.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const legacyPills = require('./segno-legacy/inline-pills.js');

/** A span's text split on top-level `:` after a `{…}` head: `{A}:b:c` → ['{A}', 'b', 'c']. */
function headAndMods(text, open) {
  if (!text.startsWith(open)) return null;
  const close = text.indexOf('}', open.length);
  if (close < 0) return null;
  const tail = text.slice(close + 1);
  if (tail && tail[0] !== ':') return null;
  return { body: text.slice(open.length, close), mods: tail ? tail.slice(1).split(':') : [] };
}

const PILL_WORD = new Set([...legacyPills.SHAPES, ...legacyPills.SIZES]);
const isPillWord = (m) => PILL_WORD.has(m) || /^c\d+$/.test(m);

/**
 * Old pill → new, or null. A pill the OLD kernel read (`parse` gave a label and `resolveMods`
 * accepted the words), or an attempt at one whose words are all pill words (`{X}:c9`, `{X}:tag:tag`).
 */
function rewritePill(text) {
  const parsed = legacyPills.parse(text);
  if (!parsed?.mods.length) return null; // `{LIVE}` is spelled the same in both
  if (!parsed.mods.every(isPillWord)) return null;
  return `{${parsed.value}, ${parsed.mods.join(', ')}}`;
}

const SPARK_WORDS = new Set([
  'line', 'area', 'bar', 'step', 'winloss', 'ring', 'bullet', 'sm', 'md', 'lg', 'end', 'minmax',
  'fill', 'zero', 'framed', 'bare', 'pigment', 'etching', 'tone', 'square', 'rounded',
]);
const isSparkWord = (m) => SPARK_WORDS.has(m) || /^c\d+$/.test(m);

/**
 * Old spark → new, or null. Any `~{DATA}:words` whose words are spark words (so a broken demo
 * like `~{3 5 4}:c13` keeps teaching its error). Data with a comma is left alone: in the new
 * notation a comma separates items, so `~{1,200}` would change meaning — it is reported instead.
 */
function rewriteSpark(text) {
  const hm = headAndMods(text, '~{');
  if (!hm?.mods.length) return null;
  if (!hm.mods.every((m) => m && isSparkWord(m))) return null;
  if (hm.body.includes(',')) return { unsafe: 'the data holds a comma, which the new notation reads as a separator' };
  return `~{${hm.body.trim()}, ${hm.mods.join(', ')}}`;
}

const REWRITERS = { pill: rewritePill, spark: rewriteSpark };

/** One span's text → its new text, or null; `{unsafe}` when it looks old but cannot be rewritten. */
export function rewriteSpan(text, active = Object.keys(REWRITERS)) {
  // A double-backtick span that QUOTES markdown (`` `{X}:c4` ``, `` 1. cards-grid `{X}:c2` ``):
  // rewrite the single-backtick spans inside it, as a reader would see them rendered.
  if (text.includes('`')) {
    let out = '';
    let at = 0;
    for (const { from, to } of spansOf(text)) {
      const r = rewriteSpan(text.slice(from, to), active);
      if (r == null) continue;
      if (typeof r === 'object') return r;
      out += text.slice(at, from) + r;
      at = to;
    }
    return at ? out + text.slice(at) : null;
  }
  const escaped = text.startsWith('\\');
  const body = escaped ? text.slice(1) : text;
  for (const name of active) {
    const out = REWRITERS[name](body);
    if (out == null) continue;
    if (typeof out === 'object') return out;
    return escaped ? `\\${out}` : out;
  }
  return null;
}

/** The inline code spans on one line, CommonMark's way (a port of lint-core's inlineCodeSpans). */
function spansOf(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch !== '`') { i++; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') { j++; continue; }
      let m = 0;
      while (line[j + m] === '`') m++;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close < 0) { i += n; continue; }
    let from = i + n;
    let to = close;
    if (to - from > 1 && line[from] === ' ' && line[to - 1] === ' ' && line.slice(from, to).trim()) { from++; to--; }
    out.push({ from, to });
    i = close + n;
  }
  return out;
}

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w-]*)/;

/** Rewrite one file's text. Returns { text, changes: [{line, from, to}], unsafe: [{line, span, why}] }. */
export function rewriteText(src, active = Object.keys(REWRITERS)) {
  const lines = src.split('\n');
  const changes = [];
  const unsafe = [];
  let fence = null; // { marker, prose: boolean }
  lines.forEach((line, n) => {
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[2][0] === fence.marker[0] && f[2].length >= fence.marker.length && !f[3]) { fence = null; return; }
      if (!fence.prose) return;
    } else if (f) {
      fence = { marker: f[2], prose: /^(markdown|md)$/i.test(f[3]) };
      return;
    }
    let out = '';
    let at = 0;
    for (const { from, to } of spansOf(line)) {
      const text = line.slice(from, to);
      const r = rewriteSpan(text, active);
      if (r == null) continue;
      if (typeof r === 'object') { unsafe.push({ line: n + 1, span: text, why: r.unsafe }); continue; }
      out += line.slice(at, from) + r;
      at = to;
      changes.push({ line: n + 1, from: text, to: r });
    }
    if (at) lines[n] = out + line.slice(at);
  });
  return { text: lines.join('\n'), changes, unsafe };
}

function corpus() {
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  return files.filter((f) => !f.startsWith('engineering/decisions/') && !f.startsWith('changelog.d/') && f !== 'CHANGELOG.md' && !f.includes('/segno-legacy/'));
}

function main(argv) {
  const check = argv.includes('--check');
  const onlyAt = argv.indexOf('--only');
  const active = onlyAt >= 0 ? argv[onlyAt + 1].split(',') : Object.keys(REWRITERS);
  for (const a of active) if (!REWRITERS[a]) throw new Error(`segno-codemod: no rewriter "${a}" (have: ${Object.keys(REWRITERS).join(', ')})`);
  const named = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--only');
  const files = named.length ? named : corpus();
  let changed = 0;
  let spans = 0;
  const unsafeAll = [];
  for (const rel of files) {
    const file = path.resolve(ROOT, rel);
    const src = fs.readFileSync(file, 'utf8');
    const r = rewriteText(src, active);
    for (const u of r.unsafe) unsafeAll.push(`${rel}:${u.line}  \`${u.span}\` — ${u.why}`);
    if (!r.changes.length) continue;
    changed++;
    spans += r.changes.length;
    if (!check) fs.writeFileSync(file, r.text);
  }
  console.log(`[segno-codemod] ${check ? 'would rewrite' : 'rewrote'} ${spans} span(s) in ${changed} file(s) (${active.join(', ')})`);
  if (unsafeAll.length) console.log(`[segno-codemod] left alone, rewrite by hand:\n  ${unsafeAll.join('\n  ')}`);
  if (check && spans) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
