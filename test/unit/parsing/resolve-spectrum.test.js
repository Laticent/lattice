/**
 * Unit: the `spectrum:` register resolver (lib/core/resolve-spectrum.js).
 *
 * The white-label brand-bar control: maps the deck front-matter `spectrum:` value to the
 * `spectrum-<value>` class token the three render paths append to every section. `on` is
 * the rainbow default and carries NO token; only `off` / `solid` do. Sibling of
 * resolve-finish / resolve-mode / resolve-stamp / resolve-tone-style.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SPECTRUM_NAMES,
  SPECTRUM_TOKENS,
  readFrontMatterSpectrum,
  isKnownSpectrum,
  spectrumClass,
  spectrumClassFromSource,
} = require('../../../lib/core/resolve-spectrum');

describe('resolve-spectrum', () => {
  test('off / solid map to their class token; on maps to no token (the rainbow default)', () => {
    assert.equal(spectrumClass('off'), 'spectrum-off');
    assert.equal(spectrumClass('solid'), 'spectrum-solid');
    assert.equal(spectrumClass('on'), '', 'on is the rainbow baseline — no class');
  });

  test('omitted / unrecognized resolve to no class', () => {
    assert.equal(spectrumClass(''), '');
    assert.equal(spectrumClass('   '), '');
    assert.equal(spectrumClass('rainbowww'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(spectrumClass(undefined), '');
    assert.equal(spectrumClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(spectrumClass('  OFF  '), 'spectrum-off');
    assert.equal(spectrumClass('Solid'), 'spectrum-solid');
  });

  test('isKnownSpectrum recognizes on / off / solid only', () => {
    assert.ok(isKnownSpectrum('on'));
    assert.ok(isKnownSpectrum('off'));
    assert.ok(isKnownSpectrum('solid'));
    assert.ok(!isKnownSpectrum('rainbow'));
    assert.ok(!isKnownSpectrum(''));
    assert.ok(!isKnownSpectrum(undefined));
  });

  test('SPECTRUM_NAMES / SPECTRUM_TOKENS list the recognized set', () => {
    assert.deepEqual([...SPECTRUM_NAMES], ['on', 'off', 'solid']);
    assert.deepEqual([...SPECTRUM_TOKENS], ['spectrum-off', 'spectrum-solid']);
  });

  test('readFrontMatterSpectrum extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\nspectrum: solid\n---\n\n# H\n\n`spectrum: not-this` in body\n';
    assert.equal(readFrontMatterSpectrum(md), 'solid');
    assert.equal(spectrumClassFromSource(md), 'spectrum-solid');
  });

  test('readFrontMatterSpectrum accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterSpectrum('---\nspectrum: "off"\n---\n'), 'off');
    assert.equal(readFrontMatterSpectrum("---\nspectrum: 'solid'\n---\n"), 'solid');
    assert.equal(readFrontMatterSpectrum('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterSpectrum(''), null);
  });

  // Rot-guard: the register targets the three brand-bar SITES (top border, .dark line,
  // divider rail) — NOT the --spectrum token, which non-brand decorations (hr, list-steps
  // spine, table rails) also read and must not vanish on `spectrum: off`. Guard both that
  // each token paints all three sites AND that it never redefines the shared token.
  test('each spectrum token targets the three brand-bar sites, never the --spectrum token', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    // Isolate the SPECTRUM register block (between its banner and the next `── ` banner).
    const block = css.slice(css.indexOf('── SPECTRUM register')).split('/* ── STATE')[0];
    assert.ok(!/--spectrum(-vertical)?\s*:/.test(block), 'the register must NOT redefine --spectrum / --spectrum-vertical (shared by hr, list-steps, table rails)');
    for (const cls of SPECTRUM_TOKENS) {
      assert.ok(block.includes(`.${cls}`), `${cls} has no rule in the SPECTRUM register block`);
      assert.ok(block.includes(`section.dark.${cls}`), `${cls} must handle the .dark top line site`);
      assert.ok(block.includes(`section.divider:not(.light).${cls}`), `${cls} must handle the divider rail site`);
    }
    // `off` drops the plain top border; `solid` repaints it in the palette accent (no hex).
    assert.match(block, /section\.spectrum-off\s*\{\s*border-top:\s*none/);
    assert.match(block.match(/section\.spectrum-solid\s*\{[^}]*\}/)[0], /var\(--accent\)/);
    // The divider-off site restores the plain inverse fill (no rail).
    assert.match(block, /section\.divider:not\(\.light\)\.spectrum-off\s*\{\s*background:\s*var\(--surface-inverse\)/);
  });
});
