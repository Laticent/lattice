/**
 * Unit: the SPECTRUM register resolvers (lib/core/resolve-spectrum.js).
 *
 * Two orthogonal accent-gradient controls, siblings of resolve-finish / resolve-mode /
 * resolve-stamp / resolve-tone-style:
 *   STYLE (`spectrum:`)      — on / solid / duo / mono / off → the gradient IDENTITY, which
 *                              redefines the shared `--spectrum` token so every accent follows.
 *   EDGE  (`spectrum-edge:`) — top / left / right / bottom / off → the section-edge bar
 *                              PLACEMENT, which touches ONLY the bar.
 * `on` / `top` are the defaults and carry NO token. See
 * engineering/decisions/2026-07-15-accent-finish-consolidation.md.
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
  isSpectrumStyleToken,
  SPECTRUM_EDGE_NAMES,
  SPECTRUM_EDGE_TOKENS,
  readFrontMatterSpectrumEdge,
  isKnownSpectrumEdge,
  spectrumEdgeClass,
  spectrumEdgeClassFromSource,
  isSpectrumEdgeToken,
} = require('../../../lib/core/resolve-spectrum');

describe('resolve-spectrum — STYLE (`spectrum:`)', () => {
  test('solid / duo / mono / off map to their class token; on maps to no token (rainbow default)', () => {
    assert.equal(spectrumClass('solid'), 'spectrum-solid');
    assert.equal(spectrumClass('duo'), 'spectrum-duo');
    assert.equal(spectrumClass('mono'), 'spectrum-mono');
    assert.equal(spectrumClass('off'), 'spectrum-off');
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
    assert.equal(spectrumClass('Duo'), 'spectrum-duo');
  });

  test('isKnownSpectrum recognizes the five STYLE names only', () => {
    for (const n of ['on', 'solid', 'duo', 'mono', 'off']) assert.ok(isKnownSpectrum(n), n);
    assert.ok(!isKnownSpectrum('rainbow'));
    assert.ok(!isKnownSpectrum('left'), 'edge value is not a style value');
    assert.ok(!isKnownSpectrum(''));
    assert.ok(!isKnownSpectrum(undefined));
  });

  test('SPECTRUM_NAMES / SPECTRUM_TOKENS list the recognized STYLE set', () => {
    assert.deepEqual([...SPECTRUM_NAMES], ['on', 'solid', 'duo', 'mono', 'off']);
    assert.deepEqual([...SPECTRUM_TOKENS], ['spectrum-solid', 'spectrum-duo', 'spectrum-mono', 'spectrum-off']);
  });

  test('isSpectrumStyleToken matches STYLE tokens but NOT edge tokens', () => {
    assert.ok(isSpectrumStyleToken('spectrum-duo'));
    assert.ok(isSpectrumStyleToken('spectrum-off'));
    assert.ok(!isSpectrumStyleToken('spectrum-edge-left'), 'edge token is not a style token');
    assert.ok(!isSpectrumStyleToken('spectrum-edge-off'));
    assert.ok(!isSpectrumStyleToken('lifted'));
  });

  test('readFrontMatterSpectrum extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\nspectrum: duo\n---\n\n# H\n\n`spectrum: not-this` in body\n';
    assert.equal(readFrontMatterSpectrum(md), 'duo');
    assert.equal(spectrumClassFromSource(md), 'spectrum-duo');
  });

  test('readFrontMatterSpectrum accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterSpectrum('---\nspectrum: "off"\n---\n'), 'off');
    assert.equal(readFrontMatterSpectrum("---\nspectrum: 'solid'\n---\n"), 'solid');
    assert.equal(readFrontMatterSpectrum('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterSpectrum(''), null);
  });

  test('`spectrum-edge:` in front matter does NOT match the `spectrum:` reader', () => {
    assert.equal(readFrontMatterSpectrum('---\nspectrum-edge: left\n---\n'), null);
  });
});

describe('resolve-spectrum — EDGE (`spectrum-edge:`)', () => {
  test('left / right / bottom / off map to their class token; top maps to no token (default)', () => {
    assert.equal(spectrumEdgeClass('left'), 'spectrum-edge-left');
    assert.equal(spectrumEdgeClass('right'), 'spectrum-edge-right');
    assert.equal(spectrumEdgeClass('bottom'), 'spectrum-edge-bottom');
    assert.equal(spectrumEdgeClass('off'), 'spectrum-edge-off');
    assert.equal(spectrumEdgeClass('top'), '', 'top is the default — no class');
  });

  test('omitted / unrecognized resolve to no class; case/whitespace-insensitive', () => {
    assert.equal(spectrumEdgeClass(''), '');
    assert.equal(spectrumEdgeClass('sideways'), '');
    assert.equal(spectrumEdgeClass(undefined), '');
    assert.equal(spectrumEdgeClass('  LEFT '), 'spectrum-edge-left');
  });

  test('isKnownSpectrumEdge recognizes the five EDGE names only', () => {
    for (const n of ['top', 'left', 'right', 'bottom', 'off']) assert.ok(isKnownSpectrumEdge(n), n);
    assert.ok(!isKnownSpectrumEdge('solid'), 'style value is not an edge value');
    assert.ok(!isKnownSpectrumEdge(''));
  });

  test('SPECTRUM_EDGE_NAMES / SPECTRUM_EDGE_TOKENS list the recognized EDGE set', () => {
    assert.deepEqual([...SPECTRUM_EDGE_NAMES], ['top', 'left', 'right', 'bottom', 'off']);
    assert.deepEqual([...SPECTRUM_EDGE_TOKENS], ['spectrum-edge-left', 'spectrum-edge-right', 'spectrum-edge-bottom', 'spectrum-edge-off']);
  });

  test('isSpectrumEdgeToken matches EDGE tokens but NOT style tokens', () => {
    assert.ok(isSpectrumEdgeToken('spectrum-edge-left'));
    assert.ok(isSpectrumEdgeToken('spectrum-edge-off'));
    assert.ok(!isSpectrumEdgeToken('spectrum-off'), 'style off is not an edge token');
    assert.ok(!isSpectrumEdgeToken('spectrum-solid'));
  });

  test('readFrontMatterSpectrumEdge extracts the value; quotes + absence', () => {
    assert.equal(readFrontMatterSpectrumEdge('---\nspectrum-edge: bottom\n---\n'), 'bottom');
    assert.equal(readFrontMatterSpectrumEdge('---\nspectrum-edge: "off"\n---\n'), 'off');
    assert.equal(spectrumEdgeClassFromSource('---\nspectrum-edge: right\n---\n'), 'spectrum-edge-right');
    assert.equal(readFrontMatterSpectrumEdge('---\nspectrum: solid\n---\n'), null);
  });
});

describe('resolve-spectrum — CSS contract (base.variants.css)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
  const block = css.slice(css.indexOf('── SPECTRUM registers')).split('/* ── STATE')[0];

  test('every STYLE token has a rule; solid/duo/mono redefine the shared token (the consolidation)', () => {
    for (const cls of SPECTRUM_TOKENS) {
      assert.ok(block.includes(`.${cls}`), `${cls} has no rule in the SPECTRUM block`);
    }
    for (const cls of ['spectrum-solid', 'spectrum-duo', 'spectrum-mono']) {
      const rule = block.match(new RegExp(`section\\.${cls}\\s*\\{[^}]*\\}`))[0];
      assert.match(rule, /--spectrum\s*:/, `${cls} must redefine --spectrum so all accents follow`);
      assert.match(rule, /--spectrum-vertical\s*:/, `${cls} must redefine --spectrum-vertical too`);
    }
  });

  test('off flattens accents to --border AND drops the prominent edge bar', () => {
    const rule = block.match(/section\.spectrum-off\s*\{[^}]*\}/)[0];
    assert.match(rule, /--spectrum\s*:\s*linear-gradient\(var\(--border\)/);
    assert.match(rule, /border-top:\s*none/);
    assert.match(block, /section\.divider:not\(\.light\)\.spectrum-off\s*\{\s*background:\s*var\(--surface-inverse\)/);
  });

  test('EDGE tokens paint a per-side bar and drop the top border', () => {
    assert.match(block, /section\.spectrum-edge-left[^{]*\{[^}]*border-left:/);
    assert.match(block, /section\.spectrum-edge-right[^{]*\{[^}]*border-right:/);
    assert.match(block, /section\.spectrum-edge-bottom[^{]*\{[^}]*border-bottom:/);
    // left/right read the vertical token; bottom reads the horizontal one.
    assert.match(block.match(/section\.spectrum-edge-left[^{]*\{[^}]*\}/)[0], /--spectrum-vertical/);
    assert.match(block.match(/section\.spectrum-edge-bottom[^{]*\{[^}]*\}/)[0], /border-image-source:\s*var\(--spectrum\)/);
  });

  test('a divider is EXEMPT from the per-side edge rail (no doubled bar over its signature rail)', () => {
    assert.match(block, /section\.spectrum-edge-left:not\(\.divider\)/);
    assert.match(block, /section\.spectrum-edge-bottom:not\(\.divider\)/);
  });

  test('palette-blind — no hex literals anywhere in the SPECTRUM block', () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'spectrum CSS must be palette-blind (var(--token) only)');
  });
});
