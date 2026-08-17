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

// ── THE TABLE. One row per `@import` form; `names` is what the grammar must read.
const FORMS = [
  { label: "quoted, single", css: "@import 'indaco';", names: ['indaco'] },
  { label: 'quoted, double', css: '@import "indaco";', names: ['indaco'] },
  { label: 'minified, no space', css: '@import"indaco";', names: ['indaco'] },
  { label: 'minified, no trailing semicolon', css: '@import"indaco"', names: ['indaco'] },
  { label: 'bare', css: '@import indaco;', names: ['indaco'] },
  { label: 'extra whitespace', css: "@import   'indaco'  ;", names: ['indaco'] },
  { label: 'hyphenated name', css: "@import 'a11y-base';", names: ['a11y-base'] },
  { label: 'two imports', css: "@import 'lattice';\n@import 'indaco';", names: ['lattice', 'indaco'] },
  // ── Must NOT match ──────────────────────────────────────────────────────────
  { label: 'url() font import', css: '@import url("https://x/f.css");', names: [] },
  { label: 'url() unquoted', css: '@import url(fonts.css);', names: [] },
  { label: 'quoted path', css: "@import 'a/b.css';", names: [] },
  { label: 'quoted filename', css: "@import 'indaco.css';", names: [] },
  // Mismatched quotes are not a valid name — `checkThemeRoles` says so in as many
  // words. The flattener's old `['"]?…['"]?` form accepted them by accident.
  { label: 'mismatched quotes', css: '@import \'indaco";', names: [] },
  { label: 'media-qualified url import', css: '@import url(p.css) screen;', names: [] },
  { label: 'no import at all', css: ':root { --bg: #fff; }', names: [] },
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
      // A form with no theme-name import must come back byte-identical.
      if (names.length === 0) assert.equal(out, css, `${label}: untouched text was rewritten`);
    }
  });

  test('the ENGINE STORE resolves exactly the forms the grammar accepts', () => {
    for (const { label, css, names } of FORMS) {
      const store = new ThemeStore();
      store.add('indaco', 'INDACO_TOKENS');
      store.add('a11y-base', 'A11Y_TOKENS');
      store.add('leaf', css);
      const out = store.resolveThemeImports(store.byName.get('leaf'), new Set(['leaf']));
      // Every name the grammar reads AND the store has registered must be spliced in.
      for (const n of names) {
        if (n === 'lattice') continue; // composeCss owns the base; the store leaves it
        if (!store.has(n)) continue; // unknown names are left in place, by design
        assert.ok(out.includes(n === 'indaco' ? 'INDACO_TOKENS' : 'A11Y_TOKENS'), `${label}: ${n} not spliced`);
      }
      // Nothing the grammar rejects may be touched.
      if (names.length === 0) assert.equal(out, css, `${label}: store rewrote a non-import`);
    }
  });

  test('the FLATTENER follows exactly the forms the grammar accepts', () => {
    for (const { label, css, names } of FORMS) {
      const files = { '/t/leaf.css': css, '/t/indaco.css': 'INDACO_TOKENS', '/t/a11y-base.css': 'A11Y_TOKENS' };
      const io = {
        read: (p) => files[p] ?? '',
        resolve: (from, name) => path.join(path.dirname(from), `${name}.css`),
        exists: (p) => Object.hasOwn(files, p),
      };
      const out = flattenCssImports('/t/leaf.css', io);
      const followed = names.filter((n) => n !== 'lattice' && Object.hasOwn(files, `/t/${n}.css`));
      for (const n of followed) {
        assert.ok(out.includes(n === 'indaco' ? 'INDACO_TOKENS' : 'A11Y_TOKENS'), `${label}: ${n} not flattened`);
      }
      if (followed.length === 0) assert.equal(out, css, `${label}: flattener pulled in something`);
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
    const CANDIDATES = ['indaco', 'a11y-base', 'url', 'p', 'fonts', 'b', 'f'];
    const marker = (n) => `/*RESOLVED:${n}*/`;

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

  test('a shared /g regex cannot leak lastIndex between callers', () => {
    // The grammar builds a fresh regex per call. If it ever goes back to a shared
    // literal, the second scan resumes mid-sheet and silently returns less.
    const css = "@import 'indaco';\n@import 'a11y-base';";
    assert.deepEqual(themeNameImports(css), ['indaco', 'a11y-base']);
    assert.deepEqual(themeNameImports(css), ['indaco', 'a11y-base'], 'second call saw fewer imports');
    assert.deepEqual(themeNameImports("@import 'indaco';"), ['indaco']);
  });

  test('null / undefined / non-string input is inert, not a throw', () => {
    for (const bad of [null, undefined, '', 0]) {
      assert.deepEqual(themeNameImports(bad), []);
      assert.equal(typeof replaceThemeNameImports(bad, () => 'X'), 'string');
    }
  });
});
