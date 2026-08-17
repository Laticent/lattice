/**
 * Unit: the engine store does not read a theme's own COMMENTS as imports.
 *
 * `ThemeStore.resolveThemeImports` splices a theme's parent by finding
 * `@import 'name'` in the registered stylesheet. It used to find them inside comments
 * too, and that is reachable from a real surface: `lib/theme/serialize.js` interpolates
 * a Theme Studio user's free-text description straight into the header comment. A
 * description reading *"a calm blue palette, like @import 'onyx'; but warmer"* spliced
 * onyx — and, through onyx's own `@import 'lattice';`, the base scaffold behind it, 768
 * KB of composed output — into a theme that declared no parent. And because `composeCss`
 * strips comments AFTERWARDS, stripping ran from the leaf's opener to the first closer
 * inside the spliced palette, leaving the rest of that sentence as live CSS. A CSS
 * parser then read the prose as a selector prelude and swallowed the rule behind it;
 * the theme's own `@font-face` disappeared.
 *
 * The scan runs over `maskCssComments` — quote- and escape-aware, so an opener inside
 * a string is not an opener — while the splice applies to the ORIGINAL text, so bytes
 * that are not a directive come back untouched. Both halves are load-bearing and both
 * are pinned below; an earlier cut used a naive comment regex and reintroduced the bug
 * for `content: "/*"`, with a test row that passed only because its fixture had no
 * trailing comment.
 *
 * See engineering/decisions/2026-08-17-composition-stays-content-addressed.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ThemeStore } = require('../../../lib/engine/themes.js');

const ONYX = 'ONYX_TOKENS';
const BASE = 'LATTICE_BASE_SCAFFOLD';
const store = (leaf) => {
  const s = new ThemeStore();
  s.add('onyx', ONYX);
  // REGISTERED on purpose. `cssFor` always registers the base, and without it here the
  // base hand-off arm below is satisfied by the unregistered-name branch instead — it
  // passed with the hand-off deleted outright.
  s.add('lattice', BASE);
  s.add('leaf', leaf);
  return s;
};
const resolved = (leaf) => {
  const s = store(leaf);
  return s.resolveThemeImports(s.byName.get('leaf'), new Set(['leaf']));
};
const splices = (leaf) => resolved(leaf).includes(ONYX);

describe('the store does not read comments as imports', () => {
  test('a REAL import still splices — all the forms that shipped', () => {
    for (const form of ["@import 'onyx';", '@import "onyx";', '@import"onyx";', "@import   'onyx'  ;"]) {
      assert.equal(splices(`:root{--a:1}\n${form}`), true, form);
    }
  });

  test('an import inside a comment does NOT splice', () => {
    const rows = [
      "/* like @import 'onyx'; but warmer */",
      "/* @theme leaf\n * A calm blue palette. Like @import 'onyx'; but warmer.\n */\n:root{--a:1}",
      "/* a */\n:root{--a:1}\n/* see @import 'onyx'; */",
      "/* trailing prose @import 'onyx';", // unterminated: CSS runs it to EOF
    ];
    for (const leaf of rows) assert.equal(splices(leaf), false, leaf.slice(0, 40));
  });

  test('a comment MENTIONS one thing while the code imports it for real', () => {
    const leaf = "/* unlike @import 'onyx'; */\n@import 'onyx';\n:root{--a:1}";
    assert.equal(splices(leaf), true, 'the real directive must still resolve');
  });

  // The regression an earlier cut shipped: a naive comment regex cannot tell an opener
  // from the same two characters inside a string, so it pairs with the NEXT real closer
  // and swallows the import between them. The TRAILING comment is the whole point —
  // without one the mispairing has nothing to eat and the bug hides. Every real palette
  // has a trailing comment.
  test('an opener inside a string does not swallow a later import', () => {
    const rows = [
      'section::after{content:"/*"}\n@import \'onyx\';\n/* tail */',
      ':root{--u:"a/*b"}\n@import \'onyx\';\n/* tail */',
      ':root{--u:url("a/*b")}\n@import \'onyx\';\n/* tail */',
      ':root{--u:"a\\"/*b"}\n@import \'onyx\';\n/* tail */', // escaped quote keeps the string open
    ];
    for (const leaf of rows) assert.equal(splices(leaf), true, leaf.slice(0, 44));
  });

  test('a comment CLOSER followed by a star is not an opener', () => {
    // `/*!banner*/*{…}` is the minified-reset idiom. Reading the `*/` + `*` as an opener
    // silently dropped every later import.
    for (const leaf of ["/*!b*/*{box-sizing:border-box}\n@import 'onyx';", "/**/*{margin:0}\n@import 'onyx';"]) {
      assert.equal(splices(leaf), true, leaf.slice(0, 40));
    }
  });

  test('text with no theme import comes back BYTE-IDENTICAL, comments included', () => {
    // The splice applies to the original, not to the masked copy. An earlier cut
    // returned the masked text, so every composed sheet came back with its comments
    // replaced by their own length in spaces. (The byte figure once quoted here did
    // not reproduce against that defect as described, so it is gone rather than
    // restated — the arm below is the durable claim.)
    for (const leaf of [
      '/* just prose */\n:root{--a:1}',
      "/* mentions @import 'onyx'; */\n:root{--a:1}",
      '@import url("https://x/f.css");\n:root{--a:1}',
      ':root{--a:1}',
    ]) {
      assert.equal(resolved(leaf), leaf, leaf.slice(0, 40));
    }
  });

  test('the surrounding bytes survive a REAL splice', () => {
    const out = resolved("/* head */\n@import 'onyx';\n:root{--a:1}\n/* tail */");
    assert.ok(out.includes('/* head */'), 'leading comment lost');
    assert.ok(out.includes('/* tail */'), 'trailing comment lost');
    assert.ok(out.includes('--a:1'), 'the theme\'s own rule lost');
    assert.ok(out.includes(ONYX), 'the parent was not spliced');
  });

  test('url() font imports and unknown names are left alone', () => {
    const url = '@import url("https://x/f.css");\n:root{--a:1}';
    assert.equal(resolved(url), url);
    const unknown = "@import 'not-registered';\n:root{--a:1}";
    assert.equal(resolved(unknown), unknown, 'an unregistered name must stay for composeCss to hoist');
  });

  test('the base import is handed off to composeCss untouched — even though it IS registered', () => {
    const leaf = "@import 'lattice';\n:root{--a:1}";
    assert.equal(resolved(leaf), leaf);
    // The load-bearing half: composeCss inlines the base itself, so a store that also
    // splices it produces a sheet carrying 1.5 MB of scaffold twice.
    assert.ok(!resolved(leaf).includes(BASE), 'the base must NOT be spliced by the store');
  });
});
