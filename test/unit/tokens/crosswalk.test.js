/**
 * Unit: the universal-token crosswalk transforms (flipTheme / flip).
 *
 * The canonical flip is COMPLETE (groups 1–5, ADR §11): the engine + themes now
 * declare only the new names, so the legacy names exist nowhere in the live
 * source. The crosswalk map is kept as the historical SoT + a forward shim to
 * migrate a *legacy-authored* deck to the universal vocabulary; these tests
 * pin the rename mechanics.
 *
 * The former "flip safety — universal resolves identically to current" suite was
 * the ALIAS-ERA byte-identical proof (it read both old and new names from the
 * live source). It is retired with the alias era: post-flip the source has no
 * old names to resolve, and the byte-identical guarantee is now proven at flip
 * time by the zero-diff pixel-check (ADR §11.4) against the pre-flip baseline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PAIRS, flipTheme, flip } = require('../../../lib/tokens/crosswalk');

describe('crosswalk transforms', () => {
  test('flipTheme renames a definition and a reference', () => {
    const css = ':root{--c1-light:#abc; --x:var(--c1-light)}';
    const out = flipTheme(css);
    assert.match(out, /--cat-1-fill:#abc/);
    assert.match(out, /var\(--cat-1-fill\)/);
    assert.doesNotMatch(out, /c1-light/);
  });

  test('flipTheme respects token boundaries (c1 ≠ c10, dark-bg ≠ dark-bg-alt)', () => {
    assert.match(flipTheme('--c1-light:#a'), /^--cat-1-fill:#a$/);
    assert.match(flipTheme('--c10-light:#a'), /^--cat-10-fill:#a$/);
    const o = flipTheme('--dark-bg:#a; --dark-bg-alt:#b');
    assert.match(o, /--scheme-dark-bg:#a/);
    assert.match(o, /--scheme-dark-bg-alt:#b/);
  });

  test('flip renames consumers and drops the now self-referential aliases', () => {
    // a forward alias + a real consumer + a derivation
    const css = ':root{--cat-1-fill: var(--c1-light); --x: var(--c1-light); --c1-light: light-dark(#a,#b)}';
    const out = flip(css);
    assert.doesNotMatch(out, /--cat-1-fill:\s*var\(--cat-1-fill\)/); // self-ref alias removed
    assert.match(out, /--x:\s*var\(--cat-1-fill\)/);                 // consumer renamed
    assert.match(out, /--cat-1-fill:\s*light-dark\(#a,#b\)/);        // canonical def renamed
  });

  test('PAIRS is the complete historical map (every group present, no dupes)', () => {
    const olds = PAIRS.map((p) => p.old);
    const news = PAIRS.map((p) => p.new);
    // 26 categorical + 3 diagram-structural + 8 lifecycle + 10 surfaces + 10 seq + 12 syntax roles
    assert.equal(PAIRS.length, 69);
    assert.equal(new Set(olds).size, 69, 'no duplicate old name');
    assert.equal(new Set(news).size, 69, 'no duplicate new name');
    // spot-check one from each group
    assert.ok(olds.includes('c1-light') && olds.includes('c-stroke'));
    assert.ok(olds.includes('c-warm-light') && olds.includes('bg-dark') && olds.includes('scale-500'));
    assert.ok(olds.includes('hljs-built_in') && news.includes('syntax-builtin'));
  });
});
