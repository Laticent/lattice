/**
 * The reader census: which modules read the structure of a deck themselves.
 *
 * A grep for "---" or "_class" matches 175-210 files and most only touch the text, so this walks
 * the syntax tree instead. It parses every tracked, non-generated, non-test source file under
 * lib/, docs/src/ and tools/ (TypeScript and TSX go through esbuild first) and records four facts:
 *
 *   builds-md   a call to `new MarkdownIt(...)` or `markdownit(...)`: a private parser.
 *   fence       a regular expression (literal or `new RegExp` string) that matches a run of three or
 *               more backticks or tildes: a private reader of fenced code.
 *   boundary    a regular expression that matches a thematic-break line (`---`, `***`, `___`) or the
 *               front-matter delimiter: a private slide split or front-matter reader.
 *   directive   a regular expression that opens an HTML comment (`<!--`): a private directive reader.
 *
 * and, separately, which modules import one of the shared readers (`slide-boundaries`,
 * `boundary-parser`, `split-slides`, `section-source-split`, `slide-split`): those are callers of
 * the one agreed reading, not re-derivations.
 *
 * A "reader" in the headline count is a file with at least one of the four facts, outside the file
 * that IS the shared reader. The counts are deterministic for a commit, so the note can quote them
 * and a later run can check the number went down.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(ROOT, 'package.json'));
const acorn = require('acorn');
const esbuild = require('esbuild');

/** The modules that ARE the shared reading of slide boundaries; they define it, so they do not count as re-derivers. */
export const SHARED = ['slide-boundaries', 'boundary-parser', 'split-slides', 'section-source-split', 'slide-split'];

const SOURCE_RE = /\.(js|mjs|cjs|ts|tsx|jsx)$/;
// the harness reads patterns on purpose, so it is not a reader of decks
const SKIP_RE = /(^tools\/parser-bakeoff\/deck(\.mjs|\/)|\.generated\.|\.min\.|(^|\/)vendor\/|\.test\.|\.spec\.|\.d\.ts$|(^|\/)(test|tests|__tests__|dist|node_modules)\/)/;

function trackedSources() {
  const out = execSync("git ls-files 'lib/**' 'docs/src/**' 'tools/**'", { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  return out.split('\n').filter((f) => f && SOURCE_RE.test(f) && !SKIP_RE.test(f));
}

function toJs(file, text) {
  if (!/\.(ts|tsx|jsx)$/.test(file)) return text;
  const loader = file.endsWith('.tsx') ? 'tsx' : file.endsWith('.jsx') ? 'jsx' : 'ts';
  return esbuild.transformSync(text, { loader, format: 'esm', target: 'esnext', tsconfigRaw: '{}' }).code;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, visit);
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

// A pattern is classified by what it MATCHES, not by how it is spelled: spelled-out forms
// (`[`~]{3,}`, `(?:`{3}|~{3})`, `\x60`) all read the same fence, and a text search for "---" also finds
// every em-dash replacement. Each probe is a short string; a pattern belongs to a class when it
// matches one of the class's positives and none of its negatives.
const MARKER = { fence: /`{3}|~{3}/, boundary: /-{3}|\*{3}|_{3}/, directive: /<!--/ };
const PROBES = {
  fence: { yes: ['```js\ncode\n```\n', '~~~\ncode\n~~~\n', 'text\n\n````md\nx\n````\n'], no: ['a `b` c', 'plain words only', 'a ``b`` c', 'line one\nline two\n\nline three\n', 'x `y`\nz\n', '  indented\n\ttabbed\n'] },
  boundary: { yes: ['---\nk: v\n---\nbody', 'a\n\n---\n\nb', 'a\n\n***\n\nb', 'a\n\n___\n\nb'], no: ['plain words\n- a list item\n', 'word --- word', 'one\ntwo\n\nthree', 'a\n\n# heading\n\nb\n', 'a * b _ c - d', 'title ---\nnext\n', '2026-10-26 12.5 - 14:30 / 3', 'key: value\nother: thing\n', 'x `y` _z_ *w* **v** ~~u~~', '~~struck~~ words', 'a | \u2014 | b', '--custom-prop', '1,2,3\n4,5\n', '  indented\n\ttabbed\n'] },
  directive: { yes: ['<!-- _class: x -->', 'a\n<!-- note -->\nb'], no: ['plain words only', 'key: value\nother: thing\n', '<div class="x"></div>', 'a --> b', 'line one\nline two\n\nline three\n', '  indented\n\ttabbed\n'] },
};

function compile(pattern, flags) {
  try {
    return new RegExp(pattern, flags.replace(/[gy]/g, ''));
  } catch {
    return null;
  }
}

export function classifyPattern(pattern, flags = '') {
  const re = compile(pattern, flags);
  if (!re) return [];
  // line readers anchor with ^ and $, which only mean "line" under the m flag, so try both spellings
  const reM = flags.includes('m') ? re : compile(pattern, `${flags.replace(/[gy]/g, '')}m`);
  const res = [re, reM].filter(Boolean).map((r) => new RegExp(r.source, `${r.flags}g`));
  const hit = (str) => res.some((r) => {
    r.lastIndex = 0;
    return r.test(str);
  });
  // a positive counts only when the text the pattern MATCHES holds the marker: `/^[a-z][a-z0-9-]*$/m`
  // accepts the probe line "a" but has read nothing of the break, the fence or the comment
  const hitsMarker = (str, marker) => res.some((r) => {
    r.lastIndex = 0;
    return [...str.matchAll(r)].some((m) => marker.test(m[0]));
  });
  return Object.entries(PROBES)
    .filter(([k, { yes, no }]) => !no.some(hit) && yes.some((y) => hitsMarker(y, MARKER[k])))
    .map(([k]) => k);
}

export function census() {
  const rows = [];
  for (const file of trackedSources()) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    let code;
    try {
      code = toJs(file, text);
    } catch {
      rows.push({ file, error: 'transform' });
      continue;
    }
    let ast;
    try {
      ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
    } catch {
      try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true });
      } catch {
        rows.push({ file, error: 'parse' });
        continue;
      }
    }
    const facts = new Set();
    const imports = new Set();
    walk(ast, (n) => {
      if (n.type === 'Literal' && n.regex) for (const c of classifyPattern(n.regex.pattern, n.regex.flags)) facts.add(c);
      else if ((n.type === 'NewExpression' || n.type === 'CallExpression') && n.callee.type === 'Identifier' && n.callee.name === 'RegExp' && n.arguments[0]?.type === 'Literal' && typeof n.arguments[0].value === 'string') {
        for (const c of classifyPattern(n.arguments[0].value, n.arguments[1]?.type === 'Literal' ? String(n.arguments[1].value) : '')) facts.add(c);
      } else if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && /^(MarkdownIt|markdownit|MarkdownIT)$/.test(n.callee.name)) facts.add('builds-md');
      else if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^(markdownit|MarkdownIt)$/.test(n.callee.name)) facts.add('builds-md');
      else if (n.type === 'CallExpression' && n.callee.type === 'CallExpression' && n.callee.callee.name === 'require' && n.callee.arguments[0]?.value === 'markdown-it') facts.add('builds-md');
      else if (n.type === 'ImportDeclaration' && typeof n.source.value === 'string') imports.add(n.source.value);
      else if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0]?.type === 'Literal') imports.add(String(n.arguments[0].value));
      else if (n.type === 'ImportExpression' && n.source.type === 'Literal') imports.add(String(n.source.value));
    });
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const isShared = SHARED.includes(base);
    const usesShared = [...imports].some((i) => SHARED.some((s) => path.basename(i).replace(/\.[^.]+$/, '') === s));
    rows.push({ file, facts: [...facts].sort(), isShared, usesShared });
  }
  return rows;
}

export function summarize(rows) {
  const ok = rows.filter((r) => !r.error);
  const readers = ok.filter((r) => r.facts.length && !r.isShared);
  const by = (fact) => readers.filter((r) => r.facts.includes(fact));
  const area = (r) => r.file.split('/').slice(0, r.file.startsWith('docs/') ? 3 : 2).join('/');
  return {
    scanned: ok.length,
    unparsed: rows.filter((r) => r.error).map((r) => r.file),
    readers: readers.length,
    buildsMd: ok.filter((r) => r.facts.includes('builds-md')).map((r) => r.file),
    fence: by('fence').map((r) => r.file),
    boundary: by('boundary').map((r) => r.file),
    directive: by('directive').map((r) => r.file),
    sharedCallers: ok.filter((r) => r.usesShared && !r.isShared).map((r) => r.file),
    sharedCallersOnly: ok.filter((r) => r.usesShared && !r.isShared && !r.facts.some((f) => f !== 'builds-md')).map((r) => r.file),
    sharedFiles: ok.filter((r) => r.isShared).map((r) => r.file),
    byArea: Object.fromEntries([...new Set(readers.map(area))].sort().map((a) => [a, readers.filter((r) => area(r) === a).length])),
    readerFiles: readers.map((r) => ({ file: r.file, facts: r.facts })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = summarize(census());
  console.log(JSON.stringify({ ...s, readerFiles: undefined }, null, 1));
}
