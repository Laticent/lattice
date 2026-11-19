#!/usr/bin/env node
/**
 * What a branch adds and removes, by kind, read from git: the GROWTH section of the 🚦 pre-merge card.
 *
 * `npm run card` calls `growth()` for a pre-merge card, so the owner sees at the merge gate how
 * much documentation, code, comments, CSS, tests and decks a PR adds or removes (owner's D3,
 * 2026-11-19, which replaced a CI size budget with this). It reads committed history only:
 * the merge base of the base ref and HEAD, against HEAD, the way GitHub diffs a PR.
 *
 * Why it is exact and cheap: ONE `git diff` gives every added and removed line with its line
 * number (the default 3-line-context diff, which is what `--numstat` and GitHub count), and ONE `git cat-file --batch` gives the before and after of every changed source file.
 * A line counts as a COMMENT when it has text and every character of that text sits inside a
 * comment, found by a real parser, never a regex:
 *   - JS / TS / JSX / TSX: the TypeScript parser (`typescript`, already a devDependency), so a `//`
 *     inside a string, a template literal or a regular expression is not a comment;
 *   - CSS: `maskCssComments` from lib/core/css-comments.mjs, the engine's own comment reader;
 *   - shell, YAML, Python, TOML: a line whose first non-blank character is `#` (not a `#!` shebang);
 *   - Astro, Svelte, Vue, HTML: `<!-- -->` comments, plus the script and style parts read as above.
 * The code, style and tests rows count NON-comment lines; the comments row counts the comment lines
 * across all of them, so no line is counted twice.
 *
 * Usage:
 *   node tools/pr-growth.js                  # table for HEAD against origin/main
 *   node tools/pr-growth.js --base main      # another base ref
 *   node tools/pr-growth.js --json           # machine-readable
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

/** Display order of the card's rows. */
const KINDS = ['docs', 'decks', 'code', 'comments', 'style', 'tests', 'config', 'generated'];

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const MARKUP_EXT = new Set(['.astro', '.svelte', '.vue', '.html', '.htm']);
const HASH_EXT = new Set(['.sh', '.bash', '.py', '.yml', '.yaml', '.toml']);
const STYLE_EXT = new Set(['.css']);

/**
 * Which row a path belongs to. Tests win over code (a test file is a test), generated output wins
 * over everything (nobody wrote it), and a deck is markdown that renders as slides.
 */
function classify(file) {
  const p = file.replace(/\\/g, '/');
  const base = path.posix.basename(p);
  const ext = path.posix.extname(p).toLowerCase();
  if (base === 'package-lock.json' || /\.generated\.[a-z]+$/.test(base) || p.includes('/__snapshots__/')) {
    return 'generated';
  }
  if (/^(test|tests)\//.test(p) || p.startsWith('docs/e2e/') || /\.(test|spec)\.[a-z]+$/.test(base)) return 'tests';
  if (ext === '.md') {
    if (/^(examples|exemplars)\//.test(p) || base.endsWith('.gallery.md')) return 'decks';
    return 'docs';
  }
  if (STYLE_EXT.has(ext)) return 'style';
  if (CODE_EXT.has(ext) || MARKUP_EXT.has(ext) || ['.sh', '.bash', '.py'].includes(ext)) return 'code';
  return 'config';
}

/** Kinds whose lines are split into comment and non-comment. */
const SPLIT_KINDS = new Set(['code', 'style', 'tests']);

let ts = null;
function typescript() {
  if (!ts) ts = require('typescript');
  return ts;
}

let cssMask = null;
function cssCommentMask() {
  // require(esm) is synchronous on Node 22; the module has no top-level await.
  if (!cssMask) cssMask = require('../lib/core/css-comments.mjs').maskCssComments;
  return cssMask;
}

/** `text` with the [start, end) ranges replaced by spaces, newlines kept. */
function blankRanges(text, ranges) {
  if (!ranges.length) return text;
  const chars = text.split('');
  for (const [start, end] of ranges) {
    for (let i = start; i < end && i < chars.length; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
  return chars.join('');
}

/** Every comment range in JS or TS source, from the TypeScript parser. */
function scriptCommentRanges(text, file) {
  const t = typescript();
  const ext = path.extname(file).toLowerCase();
  const kind = ext === '.tsx' ? t.ScriptKind.TSX : ext === '.jsx' ? t.ScriptKind.JSX
    : /\.[mc]?ts$/.test(ext) ? t.ScriptKind.TS : t.ScriptKind.JS;
  const sf = t.createSourceFile(file || 'x.js', text, t.ScriptTarget.Latest, true, kind);
  const seen = new Map();
  const add = (ranges) => { for (const r of ranges || []) seen.set(r.pos, r.end); };
  const visit = (node) => {
    add(t.getLeadingCommentRanges(text, node.getFullStart()));
    add(t.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...seen].map(([pos, end]) => [pos, end]);
}

/** Script text with its comments blanked. */
function maskScript(text, file) {
  return blankRanges(text, scriptCommentRanges(text, file));
}

/**
 * Astro / Svelte / Vue / HTML: blank `<!-- -->`, then read an Astro front matter fence and every
 * `<script>` body as script and every `<style>` body as CSS. Offsets are kept throughout.
 */
function maskMarkup(text, file) {
  let out = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, ' '));
  const region = (start, end, masker) => {
    out = out.slice(0, start) + masker(out.slice(start, end)) + out.slice(end);
  };
  if (path.extname(file).toLowerCase() === '.astro') {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(out);
    if (fm) region(fm.index + fm[0].indexOf(fm[1]), fm.index + fm[0].indexOf(fm[1]) + fm[1].length, (s) => maskScript(s, 'x.ts'));
  }
  for (const [re, masker] of [
    [/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (s) => maskScript(s, 'x.ts')],
    [/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (s) => cssCommentMask()(s)],
  ]) {
    for (const m of [...out.matchAll(re)]) {
      const start = m.index + m[1].length;
      region(start, start + m[2].length, masker);
    }
  }
  return out;
}

/** Hash-comment languages: a line whose first non-blank character is `#`, except a line-1 shebang. */
function maskHash(text) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('#')) return line;
    if (i === 0 && trimmed.startsWith('#!')) return line;
    return line.replace(/[^\r]/g, ' ');
  }).join('\n');
}

/**
 * The 1-based line numbers of `text` that are comment lines: they have text, and all of it is
 * comment. A line of code with a trailing comment is a code line. Unknown file types have none.
 */
function commentLines(file, text) {
  const ext = path.extname(file).toLowerCase();
  let masked;
  try {
    if (CODE_EXT.has(ext)) masked = maskScript(text, file);
    else if (STYLE_EXT.has(ext)) masked = cssCommentMask()(text);
    else if (MARKUP_EXT.has(ext)) masked = maskMarkup(text, file);
    else if (HASH_EXT.has(ext)) masked = maskHash(text);
    else return new Set();
  } catch {
    return new Set();
  }
  const orig = text.split('\n');
  const mask = masked.split('\n');
  const out = new Set();
  for (let i = 0; i < orig.length; i++) {
    if (orig[i].trim() !== '' && (mask[i] || '').trim() === '') out.add(i + 1);
  }
  return out;
}

function git(args, cwd, input) {
  // No `encoding`: execFileSync then returns a Buffer, which cat-file's byte offsets need.
  return execFileSync('git', args, { cwd, input, maxBuffer: 1 << 30 });
}

/**
 * Parse `git diff -M` into one record per file: its old and new path, whether git called it
 * binary, and the line numbers removed (old side) and added (new side).
 */
function parseDiff(out) {
  const files = [];
  let cur = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('diff --git ')) {
      cur = { oldPath: null, newPath: null, binary: false, added: [], removed: [], inHunks: false };
      files.push(cur);
      const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(line);
      if (m) { cur.oldPath = m[1]; cur.newPath = m[2]; }
      continue;
    }
    if (!cur) continue;
    // Inside a hunk every line is content: a removed line whose text starts with `-- ` reads
    // `--- …`, so header forms count only before the file's first `@@`.
    if (cur.inHunks) {
      if (line.startsWith('+')) { cur.added.push(newLine++); continue; }
      if (line.startsWith('-')) { cur.removed.push(oldLine++); continue; }
      if (line.startsWith(' ')) { oldLine++; newLine++; continue; }
    }
    if (line.startsWith('--- ')) { cur.oldPath = line === '--- /dev/null' ? null : line.slice(6).replace(/^"|"$/g, ''); continue; }
    if (line.startsWith('+++ ')) { cur.newPath = line === '+++ /dev/null' ? null : line.slice(6).replace(/^"|"$/g, ''); continue; }
    if (line.startsWith('rename from ')) { cur.oldPath = line.slice(12); continue; }
    if (line.startsWith('rename to ')) { cur.newPath = line.slice(10); continue; }
    if (line.startsWith('new file mode')) { cur.oldPath = null; continue; }
    if (line.startsWith('deleted file mode')) { cur.newPath = null; continue; }
    if (line.startsWith('Binary files ')) { cur.binary = true; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { oldLine = Number(h[1]); newLine = Number(h[2]); cur.inHunks = true; }
  }
  return files;
}

/** Read many `<rev>:<path>` blobs with one `git cat-file --batch`. Missing ones map to ''. */
function readBlobs(specs, cwd) {
  const result = new Map();
  if (!specs.length) return result;
  const buf = git(['cat-file', '--batch'], cwd, `${specs.join('\n')}\n`);
  let at = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(0x0a, at);
    const header = buf.subarray(at, nl).toString('utf8');
    at = nl + 1;
    if (header.endsWith(' missing')) { result.set(spec, ''); continue; }
    const size = Number(header.split(' ')[2]);
    result.set(spec, buf.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return result;
}

/**
 * The growth of HEAD over its merge base with `base`.
 * @returns {{base: string, mergeBase: string, head: string, rows: {kind: string, added: number, removed: number, files: number}[]}}
 */
function growth({ base = 'origin/main', head = 'HEAD', cwd = process.cwd() } = {}) {
  const mergeBase = git(['merge-base', base, head], cwd).toString('utf8').trim();
  const headSha = git(['rev-parse', head], cwd).toString('utf8').trim();
  // Default context, not -U0: git can align a hunk differently with no context, and the
  // default is what `git diff --numstat` and GitHub's PR counts use.
  const diff = git(['diff', '-M', '--no-color', '--no-ext-diff', mergeBase, headSha], cwd).toString('utf8');
  const files = parseDiff(diff);

  const specs = [];
  for (const f of files) {
    if (f.binary || !SPLIT_KINDS.has(classify(f.newPath || f.oldPath))) continue;
    if (f.oldPath && f.removed.length) specs.push(`${mergeBase}:${f.oldPath}`);
    if (f.newPath && f.added.length) specs.push(`${headSha}:${f.newPath}`);
  }
  const blobs = readBlobs(specs, cwd);

  const rows = new Map(KINDS.map((k) => [k, { kind: k, added: 0, removed: 0, files: 0 }]));
  for (const f of files) {
    const kind = classify(f.newPath || f.oldPath);
    const row = rows.get(kind);
    row.files += 1;
    if (f.binary) continue;
    if (!SPLIT_KINDS.has(kind)) {
      row.added += f.added.length;
      row.removed += f.removed.length;
      continue;
    }
    const before = f.oldPath && f.removed.length ? commentLines(f.oldPath, blobs.get(`${mergeBase}:${f.oldPath}`) || '') : new Set();
    const after = f.newPath && f.added.length ? commentLines(f.newPath, blobs.get(`${headSha}:${f.newPath}`) || '') : new Set();
    const comments = rows.get('comments');
    let touched = false;
    for (const n of f.added) { if (after.has(n)) { comments.added += 1; touched = true; } else row.added += 1; }
    for (const n of f.removed) { if (before.has(n)) { comments.removed += 1; touched = true; } else row.removed += 1; }
    if (touched) comments.files += 1;
  }
  return { base, mergeBase, head: headSha, rows: KINDS.map((k) => rows.get(k)) };
}

/** The card's lines for a growth result: rows with any change, then a total. Fits 38 columns. */
function growthLines(g) {
  const fmt = (r) => `  ${r.kind.padEnd(10)}${`+${r.added}`.padStart(7)}${`−${r.removed}`.padStart(8)}${String(r.files).padStart(7)}`;
  const shown = g.rows.filter((r) => r.added || r.removed || r.files);
  const total = shown.filter((r) => r.kind !== 'comments').reduce(
    (t, r) => ({ kind: 'total', added: t.added + r.added, removed: t.removed + r.removed, files: t.files + r.files }),
    { kind: 'total', added: 0, removed: 0, files: 0 },
  );
  if (!shown.length) return ['  no change against the base'];
  const c = shown.find((r) => r.kind === 'comments');
  total.added += c ? c.added : 0;
  total.removed += c ? c.removed : 0;
  return [
    `  ${'kind'.padEnd(10)}${'added'.padStart(7)}${'removed'.padStart(8)}${'files'.padStart(7)}`,
    ...shown.map(fmt),
    fmt(total),
  ];
}

module.exports = { classify, commentLines, parseDiff, growth, growthLines, KINDS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--base');
  const base = at === -1 ? 'origin/main' : args[at + 1];
  const g = growth({ base });
  if (args.includes('--json')) console.log(JSON.stringify(g, null, 2));
  else console.log([`GROWTH vs ${base} (merge base ${g.mergeBase.slice(0, 7)})`, ...growthLines(g)].join('\n'));
}
