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
  SPECTRUM_CARD_NAMES,
  SPECTRUM_CARD_TOKENS,
  readFrontMatterSpectrumCard,
  isKnownSpectrumCard,
  spectrumCardClass,
  spectrumCardClassFromSource,
  isSpectrumCardToken,
  SPECTRUM_CARD_EDGE_NAMES,
  SPECTRUM_CARD_EDGE_TOKENS,
  readFrontMatterSpectrumCardEdge,
  isKnownSpectrumCardEdge,
  spectrumCardEdgeClass,
  spectrumCardEdgeClassFromSource,
  isSpectrumCardEdgeToken,
  SPECTRUM_TRIM_NAMES,
  SPECTRUM_TRIM_TOKENS,
  readFrontMatterSpectrumTrim,
  isKnownSpectrumTrim,
  spectrumTrimClass,
  spectrumTrimClassFromSource,
  isSpectrumTrimToken,
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

describe('resolve-spectrum — CARD STYLE (`spectrum-card:`)', () => {
  test('auto → spectrum-card; solid/duo/mono/rainbow → spectrum-card-<v>; off/empty/unknown → no token', () => {
    assert.equal(spectrumCardClass('auto'), 'spectrum-card');
    assert.equal(spectrumCardClass('solid'), 'spectrum-card-solid');
    assert.equal(spectrumCardClass('duo'), 'spectrum-card-duo');
    assert.equal(spectrumCardClass('mono'), 'spectrum-card-mono');
    assert.equal(spectrumCardClass('rainbow'), 'spectrum-card-rainbow');
    assert.equal(spectrumCardClass('off'), '');
    assert.equal(spectrumCardClass(''), '');
    assert.equal(spectrumCardClass('yes'), '');
    assert.equal(spectrumCardClass(undefined), '');
    assert.equal(spectrumCardClass('  AUTO '), 'spectrum-card');
  });

  test('isKnownSpectrumCard recognizes the full style set (off/auto/solid/duo/mono/rainbow)', () => {
    for (const v of ['off', 'auto', 'solid', 'duo', 'mono', 'rainbow']) assert.ok(isKnownSpectrumCard(v), v);
    assert.ok(!isKnownSpectrumCard('on'), 'legacy `on` was never shipped — dropped for `auto`');
    assert.ok(!isKnownSpectrumCard('yes'));
    assert.ok(!isKnownSpectrumCard(''));
  });

  test('SPECTRUM_CARD_NAMES / TOKENS list the recognized set + per-slide override tokens', () => {
    assert.deepEqual([...SPECTRUM_CARD_NAMES], ['off', 'auto', 'solid', 'duo', 'mono', 'rainbow']);
    assert.deepEqual([...SPECTRUM_CARD_TOKENS], [
      'spectrum-card', 'spectrum-card-solid', 'spectrum-card-duo',
      'spectrum-card-mono', 'spectrum-card-rainbow', 'spectrum-card-off',
    ]);
  });

  test('isSpectrumCardToken matches every card STYLE token but NOT style/edge/card-edge tokens', () => {
    for (const t of SPECTRUM_CARD_TOKENS) assert.ok(isSpectrumCardToken(t), t);
    assert.ok(!isSpectrumCardToken('spectrum-off'), 'style off is not a card token');
    assert.ok(!isSpectrumCardToken('spectrum-edge-off'), 'edge off is not a card token');
    assert.ok(!isSpectrumCardToken('spectrum-card-edge-top'), 'card-edge is not a card STYLE token');
  });

  test('readFrontMatterSpectrumCard extracts the value; quotes + absence; not confused by -edge', () => {
    assert.equal(readFrontMatterSpectrumCard('---\nspectrum-card: auto\n---\n'), 'auto');
    assert.equal(readFrontMatterSpectrumCard('---\nspectrum-card: "duo"\n---\n'), 'duo');
    assert.equal(spectrumCardClassFromSource('---\nspectrum-card: mono\n---\n'), 'spectrum-card-mono');
    assert.equal(readFrontMatterSpectrumCard('---\nspectrum: solid\n---\n'), null);
    // `spectrum-card-edge:` alone must NOT read as a `spectrum-card:` value.
    assert.equal(readFrontMatterSpectrumCard('---\nspectrum-card-edge: top\n---\n'), null);
  });
});

describe('resolve-spectrum — CARD EDGE (`spectrum-card-edge:`)', () => {
  test('left → no token (default); top/right/bottom → spectrum-card-edge-<v>; unknown → no token', () => {
    assert.equal(spectrumCardEdgeClass('left'), '');
    assert.equal(spectrumCardEdgeClass('top'), 'spectrum-card-edge-top');
    assert.equal(spectrumCardEdgeClass('right'), 'spectrum-card-edge-right');
    assert.equal(spectrumCardEdgeClass('bottom'), 'spectrum-card-edge-bottom');
    assert.equal(spectrumCardEdgeClass(''), '');
    assert.equal(spectrumCardEdgeClass('sideways'), '');
    assert.equal(spectrumCardEdgeClass('  TOP '), 'spectrum-card-edge-top');
  });

  test('isKnownSpectrumCardEdge recognizes left/top/right/bottom', () => {
    for (const v of ['left', 'top', 'right', 'bottom']) assert.ok(isKnownSpectrumCardEdge(v), v);
    assert.ok(!isKnownSpectrumCardEdge('center'));
    assert.ok(!isKnownSpectrumCardEdge(''));
  });

  test('SPECTRUM_CARD_EDGE_NAMES / TOKENS list the recognized set + override tokens', () => {
    assert.deepEqual([...SPECTRUM_CARD_EDGE_NAMES], ['left', 'top', 'right', 'bottom']);
    assert.deepEqual([...SPECTRUM_CARD_EDGE_TOKENS], [
      'spectrum-card-edge-top', 'spectrum-card-edge-right', 'spectrum-card-edge-bottom',
    ]);
  });

  test('readFrontMatterSpectrumCardEdge extracts the value; quotes + absence', () => {
    assert.equal(readFrontMatterSpectrumCardEdge('---\nspectrum-card-edge: top\n---\n'), 'top');
    assert.equal(readFrontMatterSpectrumCardEdge('---\nspectrum-card-edge: "right"\n---\n'), 'right');
    assert.equal(spectrumCardEdgeClassFromSource('---\nspectrum-card-edge: bottom\n---\n'), 'spectrum-card-edge-bottom');
    assert.equal(readFrontMatterSpectrumCardEdge('---\nspectrum-card: auto\n---\n'), null);
  });
});

describe('resolve-spectrum — TRIM (`spectrum-trim:`)', () => {
  test('on → spectrum-trim token; off/empty/unknown → no token (the quiet default)', () => {
    assert.equal(spectrumTrimClass('on'), 'spectrum-trim');
    assert.equal(spectrumTrimClass('off'), '');
    assert.equal(spectrumTrimClass(''), '');
    assert.equal(spectrumTrimClass('yes'), '');
    assert.equal(spectrumTrimClass(undefined), '');
    assert.equal(spectrumTrimClass('  ON '), 'spectrum-trim');
  });

  test('isKnownSpectrumTrim recognizes on / off only', () => {
    assert.ok(isKnownSpectrumTrim('on'));
    assert.ok(isKnownSpectrumTrim('off'));
    assert.ok(!isKnownSpectrumTrim('yes'));
    assert.ok(!isKnownSpectrumTrim(''));
  });

  test('SPECTRUM_TRIM_NAMES / TOKENS list the recognized set + per-slide override tokens', () => {
    assert.deepEqual([...SPECTRUM_TRIM_NAMES], ['off', 'on']);
    assert.deepEqual([...SPECTRUM_TRIM_TOKENS], ['spectrum-trim', 'spectrum-trim-off']);
  });

  test('isSpectrumTrimToken matches trim tokens but NOT the other spectrum axes', () => {
    assert.ok(isSpectrumTrimToken('spectrum-trim'));
    assert.ok(isSpectrumTrimToken('spectrum-trim-off'));
    assert.ok(!isSpectrumTrimToken('spectrum-off'));
    assert.ok(!isSpectrumTrimToken('spectrum-card'));
    assert.ok(!isSpectrumTrimToken('spectrum-edge-off'));
  });

  test('readFrontMatterSpectrumTrim extracts the value; quotes + absence', () => {
    assert.equal(readFrontMatterSpectrumTrim('---\nspectrum-trim: on\n---\n'), 'on');
    assert.equal(readFrontMatterSpectrumTrim('---\nspectrum-trim: "off"\n---\n'), 'off');
    assert.equal(spectrumTrimClassFromSource('---\nspectrum-trim: on\n---\n'), 'spectrum-trim');
    assert.equal(readFrontMatterSpectrumTrim('---\nspectrum: solid\n---\n'), null);
  });

  test('CSS contract — structural accents read --spectrum-structure; the opt-in flows --spectrum', () => {
    const variants = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    // The token defaults to a quiet neutral hairline, and the opt-in points it at --spectrum.
    assert.match(variants, /--spectrum-structure:\s*linear-gradient\(var\(--border\), var\(--border\)\)/);
    assert.match(variants, /section\.spectrum-trim\s*\{\s*--spectrum-structure:\s*var\(--spectrum\)/);
    // A representative structural site now reads the STRUCTURE token, not --spectrum directly.
    const elements = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.elements.css'), 'utf8');
    assert.match(elements, /section hr \{[^}]*background:var\(--spectrum-structure\)/);
    // …while the section-edge BAR still reads --spectrum directly (unchanged).
    assert.match(elements, /border-image-source:\s*var\(--spectrum\)/);
  });

  // Theme-layer guard (maker-checker finding): a theme may OVERRIDE a structural accent (e.g.
  // `section pre.hljs` — its code-panel strip) and, being source-ordered AFTER the inlined base,
  // its `var(--spectrum)` read would WIN, silently re-painting the spectrum on structure
  // regardless of `spectrum-trim`. Themes DEFINE `--spectrum:` (a definition, `-` colon) but must
  // never READ the raw `var(--spectrum)` for a structural accent — they read `--spectrum-structure`
  // (or `--spectrum-vertical`/`-end`/`-solid`, which are longer tokens the exact match below skips).
  test('no theme reads the raw `var(--spectrum)` for a structural accent (would defeat spectrum-trim)', () => {
    const themesDir = path.join(__dirname, '../../../themes');
    const offenders = [];
    for (const f of fs.readdirSync(themesDir)) {
      if (!f.endsWith('.css')) continue;
      const css = fs.readFileSync(path.join(themesDir, f), 'utf8');
      // Exact `var(--spectrum)` — the trailing `)` excludes `--spectrum-vertical/-end/-solid/-structure`.
      if (/var\(--spectrum\)/.test(css)) offenders.push(f);
    }
    assert.deepEqual(offenders, [],
      `these themes read raw var(--spectrum) for a structural accent — redirect to var(--spectrum-structure): ${offenders.join(', ')}`);
  });
});

describe('resolve-spectrum — the sub-registers partition cleanly', () => {
  test('no token is claimed by two guards', () => {
    for (const t of ['spectrum-solid', 'spectrum-duo', 'spectrum-mono', 'spectrum-off']) {
      assert.ok(isSpectrumStyleToken(t) && !isSpectrumEdgeToken(t) && !isSpectrumCardToken(t) && !isSpectrumCardEdgeToken(t) && !isSpectrumTrimToken(t), t);
    }
    for (const t of ['spectrum-edge-left', 'spectrum-edge-off']) {
      assert.ok(!isSpectrumStyleToken(t) && isSpectrumEdgeToken(t) && !isSpectrumCardToken(t) && !isSpectrumCardEdgeToken(t) && !isSpectrumTrimToken(t), t);
    }
    for (const t of SPECTRUM_CARD_TOKENS) {
      assert.ok(!isSpectrumStyleToken(t) && !isSpectrumEdgeToken(t) && isSpectrumCardToken(t) && !isSpectrumCardEdgeToken(t) && !isSpectrumTrimToken(t), t);
    }
    for (const t of SPECTRUM_CARD_EDGE_TOKENS) {
      assert.ok(!isSpectrumStyleToken(t) && !isSpectrumEdgeToken(t) && !isSpectrumCardToken(t) && isSpectrumCardEdgeToken(t) && !isSpectrumTrimToken(t), t);
    }
    for (const t of SPECTRUM_TRIM_TOKENS) {
      assert.ok(!isSpectrumStyleToken(t) && !isSpectrumEdgeToken(t) && !isSpectrumCardToken(t) && !isSpectrumCardEdgeToken(t) && isSpectrumTrimToken(t), t);
    }
  });
});

describe('resolve-spectrum — CARD CSS contract (base.accent-finish.css)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
  const block = css.slice(css.indexOf('SPECTRUM CARD'));

  test('the card rail targets card surfaces (both .card and li forms), reading the geometry tokens', () => {
    // `.card` is scoped to cards-grid/cards-stack (NOT bare) so it never reaches compare-prose.
    assert.match(block, /:is\(\.cards-grid, \.cards-stack\) \.card/);
    assert.doesNotMatch(css, /section\.spectrum-card \.card\b/, 'the bare `.card` selector would over-reach compare-prose');
    assert.match(block, /:is\(\.cards-grid, \.cards-stack\) > \.cell-stage > :is\(ul, ol\) > li/);
    assert.match(block, /\.pricing > \.cell-stage > ul > li/);
    // Painted as a background-IMAGE layer (no layout shift), reading the inherited fill token.
    assert.match(block, /background-image:\s*var\(--sp-card-img\)/);
    assert.ok(!/spectrum-card[^{]*\{[^}]*[^-]margin/.test(block), 'card rail must not use margin');
  });

  test('every CARD STYLE value has a fill mapping (auto follows the bar; the rest pin a fill)', () => {
    assert.match(block, /section\.spectrum-card\s*\{[^}]*--sp-card-v:\s*var\(--spectrum-vertical/);
    assert.match(block, /section\.spectrum-card-solid\s*\{[^}]*--sp-fill-solid-v/);
    assert.match(block, /section\.spectrum-card-duo\s*\{[^}]*--sp-fill-duo-v/);
    assert.match(block, /section\.spectrum-card-mono\s*\{[^}]*--sp-fill-mono-v/);
    assert.match(block, /section\.spectrum-card-rainbow\s*\{[^}]*--sp-fill-rainbow-v/);
  });

  test('every CARD EDGE placement sets the geometry tokens', () => {
    assert.match(block, /section\.spectrum-card-edge-right\s*\{[^}]*right center/);
    assert.match(block, /section\.spectrum-card-edge-top\s*\{[^}]*center top/);
    assert.match(block, /section\.spectrum-card-edge-bottom\s*\{[^}]*center bottom/);
  });

  // Rot-guard (adversarial-review): the card-rail covered-component set is HARDCODED in the CSS.
  // Lock it so adding/removing a component is a deliberate, reviewed edit — a silent drift (a new
  // card component that gets no rail, or a removed one) fails here. If you intentionally change
  // the set, update this list in the same commit and say why in the PR.
  test('spectrum-card covered-component set is locked (extend deliberately, not by accident)', () => {
    // The paint rule (the one carrying `.cell-stage`) names each covered component.
    const paint = block.slice(block.indexOf('.cell-stage'));
    const covered = new Set([...paint.matchAll(/\)\.([a-z-]+) >/g)].map((m) => m[1]));
    // cards-grid/cards-stack are matched via `:is(.cards-grid, .cards-stack)`, add them explicitly.
    for (const c of ['cards-grid', 'cards-stack']) covered.add(c);
    assert.deepEqual([...covered].sort(), ['cards-grid', 'cards-stack', 'pricing', 'stats', 'verdict-grid'],
      'the spectrum-card rail covers exactly these card components — update this list AND the docs if you change the CSS');
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

  test('off is BAR-ONLY — drops the edge bar but does NOT redefine the shared token', () => {
    const rule = block.match(/section\.spectrum-off\s*\{[^}]*\}/)[0];
    assert.doesNotMatch(rule, /--spectrum\s*:/, 'off must NOT redefine --spectrum (structural accents keep their style — the white-label baseline)');
    assert.match(rule, /border-top:\s*none/);
    assert.match(block, /section\.divider:not\(\.light\)\.spectrum-off\s*\{\s*background:\s*var\(--surface-inverse\)/);
    // explicit styles restore a full-thickness bar on bookends/dark, gated off when an edge is set.
    assert.match(block, /section:is\(\.spectrum-solid, \.spectrum-duo, \.spectrum-mono\):not\(\.divider\):not\(\[class\*="spectrum-edge-"\]\)/);
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
