/**
 * CSS token resolution — every `var(--token)` reference must resolve.
 *
 * Catches the class of regression that landed in commits e03a71f (radar
 * feature) + 552e84a (themes refactor): a CSS variable referenced from
 * source code that no theme or stylesheet ever defines. The browser
 * silently falls back to nothing (SVG `fill` defaults to black), which
 * the visual-output tests don't pin and pure-structure tests don't notice.
 *
 * Algorithm:
 *   1. Walk every .css and .js source file under lib/, src/, themes/,
 *      plus the top-level lattice.css and lattice-emulator.js
 *      so author-set inline tokens count as defined.
 *   2. Collect every `var(--token)` reference (with file:line provenance).
 *   3. Collect every `--token:` setter — CSS rules AND JS template literals
 *      that include inline style strings like style="--series-color:${...}".
 *      Either counts as a definition.
 *   4. Fail if any referenced token has no setter anywhere.
 *
 * Allowlist exists for tokens set by Marp/Marpit at render time
 * (--marp-slide is set by Marp's runtime, not in any source we control).
 *
 * Anti-regression notes:
 *   - radar.transform.js used to reference --cat-blue etc.; this test
 *     would have failed at the commit that removed those tokens from
 *     the themes (552e84a, 2026-05-15).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Tokens that are legitimate but defined outside our source tree —
// set by Marp at render time, by the browser, by Mermaid SVGs, etc.
const EXTERNAL_TOKEN_ALLOWLIST = new Set([
  // Set by Marp Core / Marpit at render time on each <section>.
  '--marp-slide',
  // Set by Marp's emitted markup on `<marp-pre>` elements.
  '--marp-pre',
]);

// Pre-existing unresolved tokens, baselined when a token slips through
// without an obvious fix. The test enforces exact-match — adding a NEW
// unresolved token fails (catches new regressions); fixing one without
// removing it from the set also fails (forces the allowlist to shrink).
//
// Currently empty. The five entries from the initial baseline
// (--fg, --font-sans, --font-serif, --sp-2xs, --sp-3xs) were all
// resolved in the same commit that emptied this set:
//   --fg          → --text-body, --fg-muted → --text-muted (journey)
//   --font-sans   → --font-body  (radar, quadrant, principles)
//   --font-serif  → --font-display  (roadmap)
//   --sp-2xs      → added to lib/base/base.tokens.css :root spacing scale
//                   + matching shrunken values in shared.styles.css's
//                   .compact / .loose density variants
//   --sp-3xs      → same as --sp-2xs
//
// When you add a token here: include a one-line disposition comment so
// the next person knows what's intended (mechanical replacement vs.
// design review vs. requires a new theme token).
const KNOWN_UNRESOLVED_BASELINE = new Set([
  // Empty.
]);

// Directories to scan. Generated bundle (lattice-runtime.js) intentionally
// excluded — it's a build artifact; we want to catch issues at the source.
const SOURCE_DIRS = [
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'themes'),
];

const SOURCE_FILES = [
  path.join(ROOT, 'dist', 'lattice.css'),
  path.join(ROOT, 'lattice-emulator.js'),
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.scratch', 'dist']);
const SKIP_SUFFIXES = ['.gallery.html', '.gallery.pdf', '.min.css', '.min.js'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) {
      const isCssOrJs = p.endsWith('.css') || p.endsWith('.js');
      const isSkipped = SKIP_SUFFIXES.some(s => p.endsWith(s));
      if (isCssOrJs && !isSkipped) out.push(p);
    }
  }
  return out;
}

function collectFiles() {
  const all = [...SOURCE_FILES];
  for (const d of SOURCE_DIRS) walk(d, all);
  return all.filter(p => fs.existsSync(p));
}

// Match `var(--token)` (no fallback). A `var(--token, fallback)` form
// is intentionally tolerant of an undefined token and is NOT checked.
// The `\)` lookahead requires the matching close paren; the negative
// class disallows a comma (which would mean there's a fallback).
const VAR_REF_RE = /var\(\s*(--[A-Za-z_][A-Za-z0-9_-]*)\s*\)/g;

// Match `--token:` setters — covers both CSS rules and inline style
// strings inside JS template literals.
const TOKEN_DEF_RE = /(--[A-Za-z_][A-Za-z0-9_-]*)\s*:/g;

// Strip CSS/JS comments before scanning so we don't false-positive on
// `var(--xxx)` references that appear in docstrings or commented-out
// code. Handles both /* … */ block comments (multi-line) and JS // line
// comments. Imperfect against comment-like substrings inside strings,
// but the small false-negative rate is acceptable — the test still
// catches real misses (string contexts don't typically embed CSS).
function stripComments(text, ext) {
  // /* … */ — global, multi-line; greedy stop at the first */.
  let out = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (ext === '.js') {
    // // … — to end of line. Skip when preceded by `:` (URL like https://)
    // or a backslash (regex). Cheap heuristic; the only goal is to drop
    // sidebar docstrings, not perfectly parse JS.
    out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  }
  return out;
}

function scanFile(p) {
  const rawText = fs.readFileSync(p, 'utf8');
  const ext = path.extname(p);
  const text = stripComments(rawText, ext);
  // Recompute line numbers from the original text by tracking match positions
  // back to source-line indices. Comments are replaced with spaces so character
  // offsets are preserved.
  const lineOffsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineOffsets.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (lineOffsets[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  const refs = []; // { token, line }
  const defs = new Set();
  for (const m of text.matchAll(VAR_REF_RE)) {
    refs.push({ token: m[1], line: lineOf(m.index) });
  }
  for (const m of text.matchAll(TOKEN_DEF_RE)) {
    defs.add(m[1]);
  }
  return { refs, defs };
}

describe('CSS token resolution', () => {
  const files = collectFiles();
  const allRefs = new Map(); // token → [file:line, …]
  const allDefs = new Set();

  for (const f of files) {
    const { refs, defs } = scanFile(f);
    const rel = path.relative(ROOT, f);
    for (const { token, line } of refs) {
      if (!allRefs.has(token)) allRefs.set(token, []);
      allRefs.get(token).push(`${rel}:${line}`);
    }
    for (const d of defs) allDefs.add(d);
  }

  // The chart-palette recipe tokens are DEFINED by the compiler in each
  // dist/themes/*.min.css plane — including the ones authored as `@expand N in 1..8`
  // template blocks (comments the source scan can't see). Register the compiler's
  // authoritative token list as defined; a var() to a chart token NOT in the recipe
  // (a typo) still fails, because it won't be in this set either.
  for (const n of require('../../../tools/build-chart-palette-css').recipeTokenNames()) {
    allDefs.add(`--${n}`);
  }

  test('var(--token) references match the unresolved-baseline exactly', () => {
    const unresolved = new Map(); // token → sites[]
    for (const [token, sites] of allRefs) {
      if (allDefs.has(token)) continue;
      if (EXTERNAL_TOKEN_ALLOWLIST.has(token)) continue;
      unresolved.set(token, sites);
    }

    const newlyBroken = [];
    for (const [token, sites] of unresolved) {
      if (!KNOWN_UNRESOLVED_BASELINE.has(token)) newlyBroken.push({ token, sites });
    }

    const newlyFixed = [];
    for (const token of KNOWN_UNRESOLVED_BASELINE) {
      if (!unresolved.has(token)) newlyFixed.push(token);
    }

    const errors = [];
    if (newlyBroken.length > 0) {
      const lines = newlyBroken.map(({ token, sites }) => {
        const head = sites.slice(0, 3).join(', ');
        const tail = sites.length > 3 ? ` (+${sites.length - 3} more)` : '';
        return `  ${token}\n      ${head}${tail}`;
      });
      errors.push(
        `${newlyBroken.length} NEW CSS token reference(s) have no setter — ` +
        `either define the token or, if Marp/external sets it, add to ` +
        `EXTERNAL_TOKEN_ALLOWLIST in this test file:\n${lines.join('\n')}`
      );
    }
    if (newlyFixed.length > 0) {
      errors.push(
        `${newlyFixed.length} known-broken token(s) appear to be fixed — ` +
        `remove from KNOWN_UNRESOLVED_BASELINE in this test file:\n  ` +
        newlyFixed.join(', ')
      );
    }
    if (errors.length > 0) assert.fail(errors.join('\n\n'));
  });

  test('scan covered a reasonable number of files', () => {
    assert.ok(files.length > 50, `only scanned ${files.length} files; layout changed?`);
  });

  test('scan found a reasonable number of token references', () => {
    assert.ok(allRefs.size > 30, `only ${allRefs.size} distinct token references; regex broken?`);
  });
});
