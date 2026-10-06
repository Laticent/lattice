/**
 * parser-bakeoff corpus — the inputs every candidate is held to, drawn from what this repo
 * actually authors, plus a seeded fuzz and an adversarial scaling set.
 *
 *   real     every inline-code span in the shipped decks (examples/, the baseline deck) and
 *            the component docs, as markdown-it tokenizes them — so a candidate is tested on
 *            what the dispatcher really sees, including the 99%+ of spans it must REJECT;
 *            plus every string literal in the kernels' own unit tests, which is where the
 *            adversarial reviews pinned the cases that broke earlier versions.
 *   flow     one row per list item of every flowchart / state-chart slide, read with the
 *            kernel's own `outlineFromMarkdown`, plus the arrow-bearing test literals.
 *   fuzz     seeded mutations of the real set over each target's own alphabet — a grammar
 *            that matches on the corpus and drifts one character off it is the failure a
 *            migration ships.
 *   scaling  pathological inputs at three sizes, because the kernels exist partly to be
 *            linear on untrusted input in the browser linter (HARD RULE #22).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const MarkdownIt = require('markdown-it');
const { outlineFromMarkdown } = require('../../lib/core/flowchart-grammar.js');

const ROOT = new URL('../../', import.meta.url).pathname;
const md = new MarkdownIt({ html: true });

function walk(dir, pred, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

function codeSpans(src) {
  const out = [];
  const visit = (toks) => {
    for (const t of toks) {
      if (t.type === 'code_inline') out.push(t.content);
      if (t.children) visit(t.children);
    }
  };
  visit(md.parse(src, {}));
  return out;
}

const TEST_FILES = [
  'test/unit/core/bracket-list.test.js',
  'test/unit/core/flowchart-grammar.test.js',
  'test/unit/core/inline-pills.test.js',
  'test/unit/core/lift-bracket-span.test.js',
].concat(walk(join(ROOT, 'test/unit'), (p) => /(chart-values|gantt|state-marks|inline-code)[^/]*\.test\.js$/.test(p)).map((p) => p.slice(ROOT.length)));

const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** Decode a JS string literal's body in one left-to-right pass: every backslash is read
 *  exactly once, so an escaped backslash can never be re-read as the start of another
 *  escape (the replace-chain this replaced could, and CodeQL flagged it). */
function unescapeJs(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\' || i + 1 >= raw.length) { out += c; continue; }
    const n = raw[++i];
    if (n in SIMPLE_ESCAPES) { out += SIMPLE_ESCAPES[n]; continue; }
    if (n === 'x' && /^[0-9a-f]{2}$/i.test(raw.slice(i + 1, i + 3))) { out += String.fromCharCode(Number.parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; continue; }
    if (n === 'u' && raw[i + 1] === '{') {
      const end = raw.indexOf('}', i);
      const cp = Number.parseInt(raw.slice(i + 2, end), 16);
      if (end > 0 && Number.isFinite(cp) && cp <= 0x10ffff) { out += String.fromCodePoint(cp); i = end; continue; }
    }
    if (n === 'u' && /^[0-9a-f]{4}$/i.test(raw.slice(i + 1, i + 5))) { out += String.fromCharCode(Number.parseInt(raw.slice(i + 1, i + 5), 16)); i += 4; continue; }
    out += n; // `\\` `\'` `\"` `\``, and any other escaped character, stand for themselves
  }
  return out;
}

/** String literals in a JS test file — single, double and simple template quotes. */
function literals(src) {
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`/g;
  for (const m of src.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3];
    out.push(unescapeJs(raw));
  }
  return out;
}

function decks() {
  return [
    ...walk(join(ROOT, 'examples'), (p) => p.endsWith('.md')),
    ...walk(join(ROOT, 'test/integration/baseline-decks'), (p) => p.endsWith('.md')),
  ];
}

export function realCorpus() {
  const files = [...decks(), ...walk(join(ROOT, 'lib/components'), (p) => p.endsWith('.docs.md'))];
  const spans = [];
  for (const f of files) spans.push(...codeSpans(readFileSync(f, 'utf8')));
  const lits = [];
  for (const f of TEST_FILES) {
    try { lits.push(...literals(readFileSync(join(ROOT, f), "utf8")).filter((s) => s.length <= 200)); } catch { /* file moved */ }
  }
  return { spans, literals: lits, files: files.length, testFiles: TEST_FILES.length };
}

/** Rows of every flowchart / state-chart slide, as one text string each. */
/** Every outline item on a flowchart or state-chart slide in the shipped decks, in deck order. */
function flowItems() {
  const items = [];
  for (const f of decks()) {
    const src = readFileSync(f, 'utf8');
    if (!/_class:\s*[^>]*\b(flowchart|state-chart)\b/.test(src)) continue;
    for (const slide of src.split(/^---$/m)) {
      if (!/_class:\s*[^>]*\b(flowchart|state-chart)\b/.test(slide)) continue;
      const visit = (list) => {
        for (const it of list) { items.push(it); visit(it.children || []); }
      };
      visit(outlineFromMarkdown(slide).items);
    }
  }
  return items;
}

/** The rows whose segments are more than one text run (a code span, an escaped `\{literal}`, or
 *  text split around one), as whole segment lists: `splitRow` carries state across them. */
export function flowSegCorpus() {
  return flowItems().map((it) => it.segs).filter((segs) => segs.length > 1 || segs.some((s) => s.kind !== 'text'));
}

export function flowCorpus() {
  const rows = [];
  for (const it of flowItems()) for (const s of it.segs) if (s.kind === 'text' && s.value.trim()) rows.push(s.value);
  // The test file's markdown: each `- …` line is a row.
  const t = readFileSync(join(ROOT, 'test/unit/core/flowchart-grammar.test.js'), 'utf8');
  for (const lit of literals(t)) {
    for (const line of lit.split('\n')) {
      const m = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (m) rows.push(m[1].replace(/`[^`]*`/g, ' ').trimEnd());
      else if (/[-=<]/.test(lit) && !lit.includes('\n')) rows.push(lit);
    }
  }
  return rows;
}

/** mulberry32 — seeded, so every run and every candidate sees the same fuzz. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two astral-plane characters ride in every alphabet (a checker found none were tested, and
// two candidates count a surrogate PAIR as one character where the kernels count two UTF-16
// units). The fuzz draws whole CODE POINTS, so a pair is never split into lone halves.
const ASTRAL = '\u{1F600}\u{1D538}';
export const ALPHABET = {
  axis: `[]{},"' ..0123456789-aZ\t\u3000\u00a0x${ASTRAL}`,
  flow: `-=<>\\& aZ0123456789\t|-->${ASTRAL}`,
  gantt: `..Qq1234 2026-03-15JanSeptember\t${ASTRAL}`,
  value: `$\u20ac(+-\u2212)0123456789.,%\u2030kKmMBTbn \t${ASTRAL}`,
  inline: `{}[]:\\ x-/!?c1c9c12tagpillsmlg,chevron-rightdiamond${ASTRAL}`,
};

/** Seeds the real corpus lacks: braced members of 3+ parts (the cap only bites there) and
 *  arrow labels near the 61-unit cap, some of them in emoji. */
const EXTRA_SEEDS = {
  axis: ['[{a, b, c, d}]', '[{Effort, 0..10, 5, extra}, {x, y, z, w}]', "[{'a, b', c, d, e}, f]", '[{1, Good, better, best}]'],
  flow: [`A -${'x'.repeat(59)}-> B`, `A -${'\u{1F600}'.repeat(30)}-> B`, `A -${'\u{1F600}'.repeat(31)}-> B`, 'A -\u{1F600}-> B', 'A =\u{1D538} x=> B'],
  value: ['\u{1F600}21', '\u{1F600}\u{1F600}21', '$\u{1F600}5'],
};

export function fuzz(seeds, alphabet, n, seed = 1) {
  const r = rng(seed);
  const cps = [...alphabet];
  const pick = () => cps[Math.floor(r() * cps.length)];
  const out = [];
  const pool = seeds.length ? seeds : [''];
  for (let i = 0; i < n; i++) {
    // Edit by CODE POINT, so a surrogate pair is never split: a lone surrogate cannot come
    // out of a UTF-8 file, so fuzzing with one would test an input no deck can contain.
    let s = [...pool[Math.floor(r() * pool.length)]];
    const edits = 1 + Math.floor(r() * 3);
    for (let e = 0; e < edits; e++) {
      const at = Math.floor(r() * (s.length + 1));
      const op = r();
      if (op < 0.4) s.splice(at, 0, pick());
      else if (op < 0.7) s.splice(at, 1);
      else s.splice(at, 1, pick());
    }
    s = s.join('');
    out.push(s);
  }
  return out;
}

/** Inputs no author writes, at three sizes: the shapes that bit earlier regexes. */
export function scaling(target, n) {
  switch (target) {
    case 'axis': case 'axisUncapped': return [
      ['spaces in a member', `[a${' '.repeat(n)}b]`],
      ['unclosed quotes', `[${"'a, ".repeat(n / 4)}]`],
      ['nested braces', `[${'{'.repeat(n / 2)}${'}'.repeat(n / 2)}]`],
    ];
    case 'flow': return [
      ['dashes', '- '.repeat(n / 2)],
      ['open labels', '-a '.repeat(n / 3)],
      ['arrow chain', 'A -> '.repeat(n / 5) + 'B'],
    ];
    case 'gantt': return [['dots', '.'.repeat(n)], ['digits', '2'.repeat(n)]];
    case 'value': return [['digits', '1,'.repeat(n / 2)], ['spaces', `(${' '.repeat(n)}1`]];
    case 'inline': return [['open brace', `{${'a'.repeat(n)}`], ['mods', `{X}${':tag'.repeat(n / 4)}`]];
    default: return [];
  }
}

/** Per-target input sets. `real` is deduped; order is stable. */
export function inputsFor(target) {
  const { spans, literals: lits } = realCorpus();
  const uniq = (a) => [...new Set(a)];
  const extra = EXTRA_SEEDS[target === 'axisUncapped' ? 'axis' : target] || [];
  const base = target === 'flow' ? uniq(flowCorpus()) : uniq([...spans, ...lits]);
  const alpha = ALPHABET[target === 'axisUncapped' ? 'axis' : target];
  // Fuzz from the spans that are plausibly THIS grammar, so the mutations land near it.
  const near = base.filter((s) => {
    switch (target) {
      case 'axis': case 'axisUncapped': return s.trim().startsWith('[');
      case 'gantt': return /\.\.|Q[1-4]|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(s);
      case 'value': return /\d/.test(s) && s.length < 20;
      case 'inline': return /^\\?[{[]/.test(s);
      default: return true;
    }
  });
  // The extra seeds feed the FUZZ only; `real` stays what the repo actually authors.
  return { real: base, fuzz: fuzz([...near, ...extra], alpha, 20000, 7) };
}
