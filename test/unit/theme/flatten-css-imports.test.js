/**
 * Unit: `flattenCssImports` (lib/theme/chain.mjs) — the ONE content-addressed import
 * scan Lattice still runs, for the one input that has no manifest and never will: a
 * caller-supplied layout stylesheet (`lattice-emulator.js --css`).
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT. The comment strip moved from a naive
 * `replace(/\/\*[\s\S]*?\*\//g, '')` to the shared walk in lib/core/css-comments.mjs.
 * The IMPORT GRAMMAR is untouched — bare and mismatched-quote forms still resolve here
 * and still do not in the engine store, because the two resolve into different domains
 * (a filesystem vs a registry) and five review rounds killed every attempt to unify
 * them (2026-08-17-composition-stays-content-addressed.md §6). So this file asserts
 * BOTH: the defect is closed, and the grammar did not move a byte.
 *
 * The defect: a `/*` inside a STRING is not a comment opener. The old regex could not
 * tell, so it paired that opener with the next real closer and swallowed every import
 * in between — the parent silently did not inline, with nothing to report it.
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

let flattenCssImports;
before(async () => {
  ({ flattenCssImports } = await import('../../../lib/theme/chain.mjs'));
});

/** An in-memory filesystem, matching what lattice-emulator.js injects. */
function fsOf(files) {
  return {
    read: (p) => files[p],
    resolve: (from, name) => `${path.dirname(from)}/${name}.css`,
    exists: (p) => Object.hasOwn(files, p),
  };
}
const flat = (files, entry = '/d/entry.css') => flattenCssImports(entry, fsOf(files));

describe('the defect: a comment opener inside a string', () => {
  // EVERY fixture here ends with a `/* tail */`, and that is load-bearing, not decoration.
  // The regex being replaced is LAZY and needs a CLOSING `*/` to match at all — so without
  // a later comment it strips nothing, finds the import, and every arm below passes under
  // the broken implementation it exists to catch. The first cut of this file omitted the
  // tail and six arms were vacuous; the real `--css` probe had it and caught the bug,
  // which is how the gap showed up. Verified: reverting chain.mjs to the naive regex now
  // fails these arms.
  test('an import after `content: "/*"` still inlines its parent', () => {
    const out = flat({
      '/d/entry.css': 'section::after{content:"/*"}\n@import \'shared\';\nmain{color:red}\n/* tail */',
      '/d/shared.css': '.PARENT{}',
    });
    assert.match(out, /\.PARENT\{\}/, 'the parent was swallowed by a string-borne opener');
  });

  test('the same for a single-quoted string, and for an opener inside a comment', () => {
    for (const decoy of ["content:'/*'", '/* a banner mentioning /* twice */']) {
      const out = flat({
        '/d/entry.css': `x{${decoy}}\n@import 'shared';\n/* tail */`,
        '/d/shared.css': '.PARENT{}',
      });
      assert.match(out, /\.PARENT\{\}/, `swallowed after: ${decoy}`);
    }
  });

  test('an escaped quote does not end the string early', () => {
    const out = flat({
      '/d/entry.css': 'x{content:"a\\"/*"}\n@import \'shared\';\n/* tail */',
      '/d/shared.css': '.PARENT{}',
    });
    assert.match(out, /\.PARENT\{\}/);
  });

  // Found by a Munger-inversion pass AFTER the first cut shipped: sharing the walk fixed
  // the string case and BROKE this one, on valid CSS, in the one path whose input is
  // caller-supplied. `url(` opens a third context where `/*` is not a comment.
  test('an unquoted url-token containing `/*` does not swallow the import after it', () => {
    const out = flat({
      '/d/entry.css': '.a{background:url(icons/*)}\n@import \'shared\';\n/* tail */',
      '/d/shared.css': '.PARENT{}',
    });
    assert.match(out, /\.PARENT\{\}/, 'a url-token was read as a comment opener');
  });

  test('…but `url("…/*")` is a plain STRING, which the string branch already handled', () => {
    for (const decoy of ['.a{background:url("x/*")}', ".a{background:url( 'x/*' )}", '.a{filter:blur(2px)}.b{content:"y"}']) {
      const out = flat({ '/d/entry.css': `${decoy}\n@import 'shared';\n/* tail */`, '/d/shared.css': '.PARENT{}' });
      assert.match(out, /\.PARENT\{\}/, `mis-scanned: ${decoy}`);
    }
  });

  test('an IDENT merely ENDING in "url" does not open a url-token', () => {
    // `--myurl(` is not `url(`, so the `/*` after it is a REAL comment — and therefore
    // really does hide what follows. Asserting the swallow is the only way to prove the
    // ident guard fired; asserting the import survives would pass with no guard at all.
    const out = flat({
      '/d/entry.css': '.a{--myurl(x/*)}\n@import \'shared\';\n/* tail */',
      '/d/shared.css': '.PARENT{}',
    });
    assert.ok(!out.includes('.PARENT{}'), 'a mid-word `url(` was wrongly read as a url-token');
  });

  test('a string ends at a raw newline (bad-string-token), not at the next quote in the file', () => {
    // The mistyped quote must not swallow the import on the following lines.
    const out = flat({
      '/d/entry.css': 'x{content:"oops\n@import \'shared\';\ny{content:"}\n/* tail */',
      '/d/shared.css': '.PARENT{}',
    });
    assert.match(out, /\.PARENT\{\}/, 'an unterminated string ran past its line');
  });

  test('a REAL comment still hides its import — the reason the strip exists at all', () => {
    const out = flat({
      '/d/entry.css': "/* example: @import 'shared'; */\nmain{color:red}",
      '/d/shared.css': '.PARENT{}',
    });
    assert.ok(!out.includes('.PARENT{}'), 'prose in a comment must not resolve');
  });

  test('an unterminated comment runs to EOF, hiding what follows (as CSS does)', () => {
    const out = flat({
      '/d/entry.css': "/* trailing\n@import 'shared';",
      '/d/shared.css': '.PARENT{}',
    });
    assert.ok(!out.includes('.PARENT{}'));
  });
});

describe('the grammar did not move', () => {
  // Exactly the forms the flattener has always accepted, kept here so a future
  // "unify the two scanners" attempt has to break a test to narrow this side.
  const forms = {
    "@import 'shared';": true,
    '@import "shared";': true,
    '@import shared;': true, // bare — accepted HERE, deliberately not in the store
    '@import \'shared";': true, // mismatched — likewise
    '@import"shared";': true, // minified, no space
    '@import  shared ;': true,
    // `url(` matches the NAME `url`, then resolves to a `url.css` that does not exist —
    // so it is inert, but by resolution, not by the match failing.
    "@import url('shared.css');": false,
    // A quoted PATH resolves, and must: the name class stops at the `.`, and `resolve`
    // appends `.css` again. This is the documented `--css` form that a narrowed grammar
    // silently broke once already (§6 defect #5), so it is pinned here as a behavior.
    "@import 'shared.css';": true,
    '@import lattice;': false, // the ENGINE base, loaded separately by every caller
    "@import 'lattice';": false,
  };
  for (const [line, resolves] of Object.entries(forms)) {
    test(`${resolves ? 'resolves' : 'does not resolve'}: ${line}`, () => {
      const out = flat({ '/d/entry.css': `${line}\nmain{}`, '/d/shared.css': '.PARENT{}', '/d/lattice.css': '.ENGINE{}' });
      assert.equal(out.includes('.PARENT{}') || out.includes('.ENGINE{}'), resolves);
    });
  }

  test('parent-first, and a cycle terminates instead of hanging', () => {
    const out = flat({
      '/d/entry.css': "@import 'a';\nENTRY",
      '/d/a.css': "@import 'b';\nA",
      '/d/b.css': "@import 'a';\nB",
    });
    assert.ok(out.indexOf('B') < out.indexOf('A'), 'grandparent must precede parent');
    assert.ok(out.indexOf('A') < out.indexOf('ENTRY'), 'parent must precede the entry');
  });

  test('the entry sheet comes back with its comments INTACT — only the SCAN is blind', () => {
    const src = "/* banner */\n@import 'shared';\nmain{}/* tail */";
    const out = flat({ '/d/entry.css': src, '/d/shared.css': '.PARENT{}' });
    assert.ok(out.endsWith(src), 'the emitted bytes must be the file, not the stripped copy');
  });
});

describe('differential: identical to the old strip wherever the old strip was right', () => {
  /** The flattener as it stood, with the naive regex. */
  function oldFlatten(entryPath, { read, resolve, exists }, seen = new Set()) {
    if (seen.has(entryPath)) return '';
    seen.add(entryPath);
    const content = read(entryPath);
    const body = content.replace(/\/\*[\s\S]*?\*\//g, '');
    let imported = '';
    for (const m of body.matchAll(/@import\s*['"]?([A-Za-z0-9_-]+)['"]?\s*;?/g)) {
      if (m[1] === 'lattice') continue;
      const p = resolve(entryPath, m[1]);
      if (exists(p)) imported += `${oldFlatten(p, { read, resolve, exists }, seen)}\n`;
    }
    return imported + content;
  }

  /**
   * An INDEPENDENT reference stripper — written from the CSS Syntax rules rather than
   * derived from `eachCssRun`, and in a different shape (one explicit state variable,
   * no run callbacks), so agreeing with it is evidence rather than tautology.
   */
  function oracleStrip(src) {
    let out = '';
    let state = 'code'; // 'code' | 'comment' | 'sq' | 'dq' | 'url'
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (state === 'code') {
        if (c === '/' && src[i + 1] === '*') { state = 'comment'; i++; continue; }
        if (c === "'") state = 'sq';
        else if (c === '"') state = 'dq';
        // §4.3.6 — `url(` NOT preceded by an ident char and NOT followed by a quote
        // opens an unquoted url-token, consumed verbatim to `)`. No comments inside.
        const m = /^url\(\s*/i.exec(src.slice(i, i + 12));
        const prevIdent = i > 0 && /[A-Za-z0-9_-]/.test(src[i - 1]);
        if (m && !prevIdent && !/["']/.test(src[i + m[0].length] || '')) {
          state = 'url';
          out += src.slice(i, i + m[0].length);
          i += m[0].length - 1;
          continue;
        }
        out += c;
        continue;
      }
      if (state === 'comment') {
        if (c === '*' && src[i + 1] === '/') { state = 'code'; i++; }
        continue;
      }
      if (state === 'url') {
        out += c;
        if (c === ')') state = 'code';
        continue;
      }
      // inside a string: a backslash escapes the next character, and a RAW NEWLINE ends
      // it (§4.3.5 bad-string-token) rather than running on to the next quote.
      if (c === '\n' || c === '\r') { state = 'code'; out += c; continue; }
      out += c;
      if (c === '\\') { if (i + 1 < src.length) out += src[++i]; continue; }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"')) state = 'code';
    }
    return out;
  }

  /** The flattener, rebuilt on the oracle's notion of "comment". */
  function oracle(entryPath, { read, resolve, exists }, seen = new Set()) {
    if (seen.has(entryPath)) return '';
    seen.add(entryPath);
    const content = read(entryPath);
    let imported = '';
    for (const m of oracleStrip(content).matchAll(/@import\s*['"]?([A-Za-z0-9_-]+)['"]?\s*;?/g)) {
      if (m[1] === 'lattice') continue;
      const p = resolve(entryPath, m[1]);
      if (exists(p)) imported += `${oracle(p, { read, resolve, exists }, seen)}\n`;
    }
    return imported + content;
  }

  test('byte-identical over every COMMITTED .css in the repo', () => {
    // The corpus is what git TRACKS, not what happens to be on disk, and that is the fix
    // for a real CI failure this test caused: a directory walk also picked up `docs/dist`
    // and `docs/public` build outputs (88 extra files), so the corpus was 267 on a machine
    // that had built the docs site and 179 on a clean checkout — and a `length > 200`
    // floor tuned to the former failed the unit job on the latter. Tracked files are
    // identical everywhere, and they are also the honest definition: committed stylesheets
    // are what ship. `dist/` IS included — `dist/lattice.css` is committed, and it is the
    // DEFAULT layout sheet every render flattens, so leaving it out would omit the one
    // input that always matters.
    const sheets = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((p) => path.join(ROOT, p));
    assert.ok(sheets.length > 100, `expected a real corpus, found ${sheets.length}`);
    assert.ok(sheets.some((p) => p.endsWith(`dist${path.sep}lattice.css`)), 'the default layout sheet must be in the corpus');

    let diffs = 0;
    for (const p of sheets) {
      const files = { [p]: fs.readFileSync(p, 'utf8') };
      const io = {
        read: (f) => files[f] ?? '',
        resolve: (from, name) => path.join(path.dirname(from), `${name}.css`),
        exists: (f) => fs.existsSync(f),
      };
      // `exists` hits the real tree, so a palette's `@import 'onyx'` really resolves.
      if (flattenCssImports(p, io, new Set()) !== oldFlatten(p, io, new Set())) diffs++;
    }
    assert.equal(diffs, 0, `${diffs} of ${sheets.length} repo stylesheets changed output`);
  });

  test('over 300k fuzzed sheets, every divergence is the old strip being WRONG', () => {
    // Alphabet biased to the boundary characters, per the verification bar in the
    // handoff. A divergence is only acceptable in one direction: the new walk finding
    // an import the old regex swallowed. The reverse would be a regression.
    let seed = 0x1709 >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x1_0000_0000);
    // Raw boundary characters cover the edges; the three COMPOSITE atoms are what make
    // the defect reachable at all. Drawing `"`, `/*`, `"`, an import and `*/` in that
    // order by chance is vanishingly rare — a first cut of this fuzz ran 300k cases and
    // never once hit the bug it was written to find, and would have "passed" clean.
    const atoms = ['/*', '*/', '"', "'", '\\', '\n', '\r', ' ', '{', '}', ';', '*', '/',
      "@import 'p';", '@import q;', 'content:', 'a', 'p', 'q',
      'x{content:"/*"}', "x{content:'/*'}", '/* c */',
      'url(i/*)', 'url("i/*")', 'x{content:"oops\n', 'blur(', 'url('];
    const files = { '/d/p.css': 'P{}', '/d/q.css': 'Q{}' };
    let newFound = 0;
    let oldOnly = 0;
    for (let i = 0; i < 300_000; i++) {
      let src = '';
      for (let n = (rnd() * 12) | 0; n >= 0; n--) src += atoms[(rnd() * atoms.length) | 0];
      const all = { ...files, '/d/entry.css': src };
      const io = fsOf(all);
      const a = flattenCssImports('/d/entry.css', io, new Set());
      const b = oldFlatten('/d/entry.css', io, new Set());
      if (a === b) continue;
      // Both must still END with the untouched entry bytes — the scan may differ, the
      // emitted file may not.
      assert.ok(a.endsWith(src), `new flattener corrupted the entry bytes: ${JSON.stringify(src)}`);
      const imports = (s) => ['P{}', 'Q{}'].filter((k) => s.includes(k)).join(',');
      const na = imports(a);
      const nb = imports(b);
      // Every divergence is adjudicated by an INDEPENDENT oracle, not by a heuristic
      // about which direction the import count moved. Both directions occur and both
      // are legitimate: the old regex sometimes MISSED an import (it swallowed the range
      // containing it) and sometimes INVENTED one (mis-pairing a string-borne opener
      // with a later closer exposed code that is really inside a comment). A first cut
      // of this test tried to classify by direction and called the second class a
      // regression. The only sound question is which answer a CSS parser would give.
      assert.equal(a, oracle('/d/entry.css', io, new Set()),
        `the walk disagreed with the oracle on ${JSON.stringify(src)}`);
      if (na.length > nb.length) newFound++;
      else if (nb.length > na.length) oldOnly++;
    }
    assert.ok(newFound > 0, 'the fuzz never reached the imports-the-old-regex-swallowed class');
    assert.ok(oldOnly > 0, 'the fuzz never reached the imports-the-old-regex-invented class');
  });
});
