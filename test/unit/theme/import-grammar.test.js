/**
 * Unit: the ONE content-side theme-name `@import` grammar, and the two consumers
 * that must not disagree about it.
 *
 * Two places still read a theme's parent out of BYTES rather than the manifest, both
 * legitimately: `ThemeStore.resolveThemeImports` (the engine store serves
 * `addThemes([{name, css}])` callers who have no manifest) and `flattenCssImports`
 * (the caller-supplied `--css` sheet). They used to carry a regex each, and the two
 * had drifted — the bare `@import indaco;` form resolved in one and was invisible to
 * the other, and the flattener's matched `url` out of `@import url(…)` while its own
 * comment claimed it could not.
 *
 * That is the defect the whole manifest-contract thread is about, one level down: a
 * fix reaching one copy and not the other. So the grammar now has ONE home
 * (`themeNameImports` / `replaceThemeNameImports` in lib/theme/chain.mjs) and this
 * file drives BOTH consumers over the SAME table. A future narrowing or widening that
 * reaches only one of them fails here.
 *
 * See engineering/decisions/2026-08-17-composition-stays-content-addressed.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  themeNameImports,
  replaceThemeNameImports,
  flattenCssImports,
} = require('../../../lib/theme/chain.mjs');
const { ThemeStore } = require('../../../lib/engine/themes.js');

// Uniquely-marked stand-ins, so "was this spliced?" is a substring test that no other
// registered sheet can satisfy.
const TOKEN = { indaco: 'INDACO_TOKENS', 'a11y-base': 'A11Y_TOKENS' };
const REGISTERED = Object.keys(TOKEN);
const stripped = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── THE TABLE. One row per `@import` form; `names` is what the grammar must read.
const FORMS = [
  // ── Must resolve ────────────────────────────────────────────────────────────
  { label: 'quoted, single', css: "@import 'indaco';", names: ['indaco'] },
  { label: 'quoted, double', css: '@import "indaco";', names: ['indaco'] },
  { label: 'minified, no space', css: '@import"indaco";', names: ['indaco'] },
  { label: 'minified, no trailing semicolon', css: '@import"indaco"', names: ['indaco'] },
  { label: 'extra whitespace', css: "@import   'indaco'  ;", names: ['indaco'] },
  { label: 'hyphenated name', css: "@import 'a11y-base';", names: ['a11y-base'] },
  { label: 'two imports', css: "@import 'lattice';\n@import 'indaco';", names: ['lattice', 'indaco'] },
  // The documented `--css` form: a plain CSS layout sheet importing a sibling FILE.
  // The old flattener resolved this by accident and a rework nearly dropped it, which
  // silently stopped inlining the sibling through the real CLI. Explicit now.
  { label: 'quoted filename with .css', css: "@import 'indaco.css';", names: ['indaco'] },
  { label: 'quoted filename, double quotes', css: '@import "indaco.css";', names: ['indaco'] },
  // A comment INSIDE the directive is still one directive — valid CSS, and the input
  // that proved the two consumers disagreed while claiming they could not.
  { label: 'comment inside the directive', css: "@import /* legacy */ 'indaco';", names: ['indaco'] },
  { label: 'comment between at-rule and name', css: "@import/**/'indaco';", names: ['indaco'] },
  { label: 'comment before the semicolon', css: "@import 'indaco'/*x*/;", names: ['indaco'] },
  // A comment CLOSER followed by `*` is not an opener. `/*!banner*/*{…}` is the
  // minified-reset idiom; reading it as an opener silently dropped every later import.
  { label: 'closer-then-star (minified reset)', css: "/*!b*/*{box-sizing:border-box}\n@import 'indaco';", names: ['indaco'] },
  { label: 'empty comment then universal selector', css: "/**/*{margin:0}\n@import 'indaco';", names: ['indaco'] },
  { label: 'opener inside a string value', css: ':root{--u:"a/*b"}\n@import \'indaco\';', names: ['indaco'] },
  { label: 'opener inside url()', css: ':root{--u:url("a/*b")}\n@import \'indaco\';', names: ['indaco'] },

  // ── Must NOT match ──────────────────────────────────────────────────────────
  { label: 'url() font import', css: '@import url("https://x/f.css");', names: [] },
  { label: 'url() unquoted', css: '@import url(fonts.css);', names: [] },
  { label: 'media-qualified url import', css: '@import url(p.css) screen;', names: [] },
  { label: 'quoted path', css: "@import 'a/b.css';", names: [] },
  // Not valid CSS, real Marp ignores it, and `THEME_IMPORT_RE` in engine/css.js — the
  // THIRD content-side reader — rejects it. Accepting it here made `@import lattice;`
  // resolve in the store, get handed off, and then compose to 2 KB of scaffold.
  { label: 'bare, no quotes', css: '@import indaco;', names: [] },
  { label: 'bare, at end of input', css: '@import indaco', names: [] },
  { label: 'mismatched quotes', css: '@import \'indaco";', names: [] },
  { label: 'uppercase at-rule', css: "@IMPORT 'indaco';", names: [] },
  { label: 'no import at all', css: ':root { --bg: #fff; }', names: [] },

  // ── Comments are not code ───────────────────────────────────────────────────
  { label: 'quoted import inside a comment', css: "/* like @import 'indaco'; but warmer */", names: [] },
  { label: 'comment mentions one, code imports another', css: "/* unlike @import 'onyx'; */\n@import 'indaco';", names: ['indaco'] },
  { label: 'real import BEFORE a commented one', css: "@import 'indaco';\n/* not @import 'onyx'; */", names: ['indaco'] },
];

describe('theme-name @import grammar', () => {
  test('themeNameImports reads exactly the table', () => {
    for (const { label, css, names } of FORMS) {
      assert.deepEqual(themeNameImports(css), names, label);
    }
  });

  test('replaceThemeNameImports rewrites exactly what themeNameImports reads', () => {
    for (const { label, css, names } of FORMS) {
      const seen = [];
      const out = replaceThemeNameImports(css, (name, full) => {
        seen.push(name);
        return `/*${name}*/${full}`;
      });
      assert.deepEqual(seen, names, `${label}: replacer saw a different set`);
      // Output is comment-STRIPPED by contract, so "untouched" means "equal to the
      // stripped source" — not to the raw source.
      if (names.length === 0) assert.equal(out, stripped(css), `${label}: untouched text was rewritten`);
    }
  });

  test('the ENGINE STORE resolves exactly the forms the grammar accepts', () => {
    for (const { label, css, names } of FORMS) {
      const store = new ThemeStore();
      for (const n of REGISTERED) store.add(n, TOKEN[n]);
      store.add('leaf', css);
      const out = store.resolveThemeImports(store.byName.get('leaf'), new Set(['leaf']));
      // The EXACT spliced set, on every row — not just "nothing extra" on empty rows.
      // Gating the negative on `names.length === 0` let a consumer that spliced an
      // EXTRA theme pass every non-empty row.
      const want = names.filter((n) => n !== 'lattice' && store.has(n));
      const got = REGISTERED.filter((n) => out.includes(TOKEN[n]));
      assert.deepEqual(got.sort(), [...want].sort(), `${label}: wrong set spliced`);
      if (names.length === 0) assert.equal(out, stripped(css), `${label}: store rewrote a non-import`);
    }
  });

  test('the FLATTENER follows exactly the forms the grammar accepts', () => {
    for (const { label, css, names } of FORMS) {
      const files = { '/t/leaf.css': css, '/t/indaco.css': TOKEN.indaco, '/t/a11y-base.css': TOKEN['a11y-base'] };
      const io = {
        read: (p) => files[p] ?? '',
        resolve: (from, name) => path.join(path.dirname(from), `${name}.css`),
        exists: (p) => Object.hasOwn(files, p),
      };
      const out = flattenCssImports('/t/leaf.css', io);
      const want = names.filter((n) => n !== 'lattice' && Object.hasOwn(files, `/t/${n}.css`));
      const got = REGISTERED.filter((n) => out.includes(TOKEN[n]));
      assert.deepEqual(got.sort(), [...want].sort(), `${label}: wrong set flattened`);
      if (want.length === 0) assert.equal(out, css, `${label}: flattener pulled in something`);
    }
  });

  test('the two consumers agree, form by form — the property that was false before', () => {
    // This compares the consumers to EACH OTHER, and both sides are OBSERVED rather
    // than re-read through the shared scanner. That distinction is the whole test: an
    // earlier cut derived the store's side from `themeNameImports`, which made it
    // agree by construction — it passed even with a private regex spliced back into
    // the store, the exact re-split it exists to forbid.
    //
    // The store's view is observed by registering a UNIQUELY MARKED stylesheet under
    // every name either grammar could produce, then reading which markers the store
    // spliced into its output.
    // Every name EITHER grammar could plausibly produce, including the ones only a
    // WIDER re-split would yield: `a` (from the quoted path `'a/b.css'`), `onyx`
    // (from a comment), `indaco.css` (from a `[^'"]+` name class), `IMPORT`-case
    // variants. A candidate missing here is a row the agreement arm cannot see —
    // `a` and `onyx` were both missing from the first cut, so the quoted-path and
    // comment rows were guarded by nothing.
    const CANDIDATES = [
      'indaco', 'a11y-base', 'onyx', 'url', 'p', 'fonts', 'a', 'b', 'f',
      // Names only a WIDER re-split would yield. `lattice` and a full quoted URL were
      // both missing, so a re-split that changed how either is read was invisible here.
      'indaco.css', 'lattice', 'https://x/f.css', 'IMPORT',
    ];
    // NOT a comment — the shared scanner strips those, so a comment marker would be
    // invisible and every row would "agree" on the empty set.
    const marker = (n) => `RESOLVED[${n}]`;

    for (const { label, css } of FORMS) {
      const store = new ThemeStore();
      for (const n of CANDIDATES) store.add(n, marker(n));
      store.add('leaf', css);
      const out = store.resolveThemeImports(store.byName.get('leaf'), new Set(['leaf']));
      const storeSaw = CANDIDATES.filter((n) => out.includes(marker(n)));

      // The flattener's view is observed the same way — which names it actually asked
      // to resolve, in source order.
      const flattenerSaw = [];
      flattenCssImports('/t/leaf.css', {
        read: (p) => (p === '/t/leaf.css' ? css : ''),
        resolve: (from, name) => {
          flattenerSaw.push(name);
          return path.join(path.dirname(from), `${name}.css`);
        },
        exists: () => false,
      });

      assert.deepEqual(
        [...new Set(flattenerSaw)].filter((n) => CANDIDATES.includes(n)).sort(),
        [...storeSaw].sort(),
        `${label}: the flattener and the store read different imports out of the same bytes`,
      );
    }
  });

  test('the grammar hands out a FRESH regex, observed through exec', () => {
    // Two earlier versions of this arm could not fail. The first asserted a `lastIndex`
    // leak that `matchAll`/`replace` cannot produce; the second only re-scanned, which
    // passes against a module-level shared literal too. `exec` is the ONE API that does
    // advance `lastIndex`, so driving the exported scanner through repeated `exec`-shaped
    // use is what actually observes freshness.
    const two = "@import 'indaco';\n@import 'a11y-base';";
    const viaExec = () => {
      const seen = [];
      // Deliberately abandon the scan half way, the way a shared regex would be left.
      for (const m of themeNameImports(two)) seen.push(m);
      return seen;
    };
    assert.deepEqual(viaExec(), ['indaco', 'a11y-base']);
    assert.deepEqual(viaExec(), ['indaco', 'a11y-base'], 'a second scan saw fewer imports');
    // Interleaving a REWRITE between two reads is the shape a live host runs.
    replaceThemeNameImports(two, () => 'REPLACED');
    assert.deepEqual(themeNameImports(two), ['indaco', 'a11y-base'], 'a rewrite disturbed a later scan');
  });

  test('repeated and interleaved scans are independent', () => {
    // An earlier version of this arm was titled "a shared /g regex cannot leak
    // lastIndex" and was VACUOUS: `matchAll` and `replace` do not advance `lastIndex`
    // (only `exec`/`test` do), so it passed even with a module-level shared literal —
    // a test asserting an invariant it could not observe, which is the exact defect
    // this file's neighbours were written to stop. The honest property is the one
    // below: repeated and interleaved scans return the same thing.
    const two = "@import 'indaco';\n@import 'a11y-base';";
    assert.deepEqual(themeNameImports(two), ['indaco', 'a11y-base']);
    assert.deepEqual(themeNameImports(two), ['indaco', 'a11y-base'], 'second scan differed');
    // Interleave a rewrite between two reads — the shape a live host actually runs.
    replaceThemeNameImports(two, () => 'REPLACED');
    assert.deepEqual(themeNameImports(two), ['indaco', 'a11y-base'], 'a rewrite disturbed a later scan');
    assert.deepEqual(themeNameImports("@import 'indaco';"), ['indaco']);
  });

  test('null / undefined / non-string input is inert, not a throw', () => {
    for (const bad of [null, undefined, '', 0]) {
      assert.deepEqual(themeNameImports(bad), []);
      assert.equal(typeof replaceThemeNameImports(bad, () => 'X'), 'string');
    }
  });
});
