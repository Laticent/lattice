/**
 * Unit: the three SPECTRUM keys (lib/core/resolve-spectrum.js; engineering/decisions/2026-11-21-spectrum-keys.md).
 *
 *   spectrum: <style> <edge> <weight>        the stripe on the slide edge
 *   card-spectrum: <style> <edge> <weight>   the stripe on each card
 *   trim-spectrum: <tier>                    the accent on tables, timelines and rules
 *
 * One word per axis, in any order; a default word stamps nothing deck-wide and is the restore token on a
 * slide; an off is `no-X` and the way back on is `with-X`. The old keys, values and classes are gone.
 */

const { test, describe } = require('node:test');
const { themeEntries, themePath } = require('../../../lib/theme/files.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SPECTRUM_REGISTER,
  CARD_SPECTRUM_REGISTER,
  TRIM_SPECTRUM_REGISTER,
  SPECTRUM_AXES,
  CARD_SPECTRUM_AXES,
  TRIM_SPECTRUM_AXES,
  SPECTRUM_KEY_TOKENS,
  mergedSpectrumValue,
  spectrumDeckTokens,
  spectrumTokenAxis,
  isSpectrumStyleToken,
  spectrumStyleClass,
} = require('../../../lib/core/resolve-spectrum');
const { withPresetTable, PRESETS } = require('../../../lib/core/front-matter-key');

const SPECTRUM_TOKENS = SPECTRUM_REGISTER.AXES[0].tokens;

describe('resolve-spectrum — the vocabulary', () => {
  test('each key lists its axes, default first', () => {
    assert.deepEqual(SPECTRUM_AXES, { style: ['rainbow', 'solid', 'duo', 'mono', 'off'], edge: ['top', 'left', 'right', 'bottom'], weight: ['regular', 'hairline', 'band'] });
    assert.deepEqual(CARD_SPECTRUM_AXES, { style: ['off', 'match', 'rainbow', 'solid', 'duo', 'mono'], edge: ['left', 'top', 'right', 'bottom'], weight: ['regular', 'hairline', 'band'] });
    assert.deepEqual(TRIM_SPECTRUM_AXES, { tier: ['quiet', 'restrained', 'full'] });
  });

  test('the classes follow the keys and the switch rule (no-X off, with-X back on)', () => {
    assert.deepEqual([...SPECTRUM_REGISTER.TOKENS], [
      'with-spectrum', 'spectrum-solid', 'spectrum-duo', 'spectrum-mono', 'no-spectrum',
      'spectrum-top', 'spectrum-left', 'spectrum-right', 'spectrum-bottom',
      'spectrum-regular', 'spectrum-hairline', 'spectrum-band',
    ]);
    assert.deepEqual([...CARD_SPECTRUM_REGISTER.TOKENS], [
      'no-card-spectrum', 'with-card-spectrum', 'card-spectrum-rainbow', 'card-spectrum-solid', 'card-spectrum-duo', 'card-spectrum-mono',
      'card-spectrum-left', 'card-spectrum-top', 'card-spectrum-right', 'card-spectrum-bottom',
      'card-spectrum-regular', 'card-spectrum-hairline', 'card-spectrum-band',
    ]);
    assert.deepEqual([...TRIM_SPECTRUM_REGISTER.TOKENS], ['trim-spectrum-quiet', 'trim-spectrum-restrained', 'trim-spectrum-full']);
    assert.ok(!SPECTRUM_KEY_TOKENS.some((t) => /-(off|on)$/.test(t)), 'no X-off / X-on class');
  });

  test('no class is claimed by two keys or two axes', () => {
    const seen = new Map();
    for (const t of SPECTRUM_KEY_TOKENS) {
      assert.ok(!seen.has(t), `${t} twice`);
      seen.set(t, spectrumTokenAxis(t));
    }
    assert.equal(spectrumTokenAxis('spectrum-left'), 'spectrum:edge');
    assert.equal(spectrumTokenAxis('card-spectrum-band'), 'card-spectrum:weight');
    assert.equal(spectrumTokenAxis('trim-spectrum-full'), 'trim-spectrum:tier');
    assert.equal(spectrumTokenAxis('with-card-spectrum'), 'card-spectrum:style');
    for (const t of ['spectrum-edge-left', 'spectrum-card-solid', 'with-spectrum-trim', 'cards-grid', '']) assert.equal(spectrumTokenAxis(t), '', `${t} is no spectrum class`);
  });

  test('isSpectrumStyleToken and spectrumStyleClass read the style axis of spectrum: only', () => {
    for (const t of SPECTRUM_TOKENS) assert.ok(isSpectrumStyleToken(t), t);
    for (const t of ['spectrum-left', 'spectrum-band', 'card-spectrum-solid', 'trim-spectrum-full']) assert.ok(!isSpectrumStyleToken(t), t);
    assert.equal(spectrumStyleClass('solid'), 'spectrum-solid');
    assert.equal(spectrumStyleClass(' Mono '), 'spectrum-mono');
    assert.equal(spectrumStyleClass('off'), 'no-spectrum');
    assert.equal(spectrumStyleClass('rainbow'), '', 'the default pins nothing');
    assert.equal(spectrumStyleClass('on'), '', 'the old word is gone');
  });
});

describe('resolve-spectrum — deck tokens', () => {
  const tokens = (fm) => spectrumDeckTokens(fm);

  test('one word per axis, in any order; a default stamps nothing', () => {
    assert.deepEqual(tokens('spectrum: solid left band'), ['spectrum-solid', 'spectrum-left', 'spectrum-band']);
    assert.deepEqual(tokens('spectrum: band left solid'), ['spectrum-solid', 'spectrum-left', 'spectrum-band']);
    assert.deepEqual(tokens('spectrum: rainbow top regular'), []);
    assert.deepEqual(tokens('spectrum: off'), ['no-spectrum']);
    assert.deepEqual(tokens('card-spectrum: match top hairline'), ['with-card-spectrum', 'card-spectrum-top', 'card-spectrum-hairline']);
    assert.deepEqual(tokens('card-spectrum: off left regular'), []);
    assert.deepEqual(tokens('trim-spectrum: full'), ['trim-spectrum-full']);
    assert.deepEqual(tokens('trim-spectrum: quiet'), []);
    assert.deepEqual(tokens('spectrum: duo\ncard-spectrum: solid\ntrim-spectrum: restrained'), ['spectrum-duo', 'card-spectrum-solid', 'trim-spectrum-restrained']);
  });

  test('case, quotes, a trailing comment and an unknown word', () => {
    assert.deepEqual(tokens('spectrum: "Solid LEFT"'), ['spectrum-solid', 'spectrum-left']);
    assert.deepEqual(tokens('spectrum: duo  # brand'), ['spectrum-duo']);
    assert.deepEqual(tokens('spectrum: sparkle left'), ['spectrum-left'], 'an unknown word drops alone');
    assert.deepEqual(tokens('spectrum: left right'), ['spectrum-left'], 'the first word on an axis wins');
  });

  test('the old keys and the old values are not read', () => {
    assert.deepEqual(tokens('spectrum-edge: left\nspectrum-card: auto\nspectrum-card-edge: top\nspectrum-trim: on'), []);
    assert.deepEqual(tokens('spectrum: on'), []);
    assert.deepEqual(tokens('card-spectrum: auto'), []);
  });

  test('a preset fills only the axes the deck leaves empty', () => {
    // brand: spectrum solid, card-spectrum match, trim-spectrum full.
    assert.equal(mergedSpectrumValue('preset: brand', 'spectrum'), 'solid');
    assert.equal(mergedSpectrumValue('preset: brand\nspectrum: left', 'spectrum'), 'solid left', 'the deck moved the stripe and kept the preset style');
    assert.equal(mergedSpectrumValue('preset: brand\nspectrum: duo band', 'spectrum'), 'duo band', 'the deck style wins');
    assert.deepEqual(tokens('preset: brand\nspectrum: left'), ['spectrum-solid', 'spectrum-left', 'with-card-spectrum', 'trim-spectrum-full']);
    assert.deepEqual(tokens('preset: minimal'), ['no-spectrum']);
    assert.deepEqual(tokens('preset: minimal\nspectrum: solid'), ['spectrum-solid']);
    // Control: no preset, the deck alone.
    assert.equal(mergedSpectrumValue('spectrum: left', 'spectrum'), 'left');
    assert.equal(mergedSpectrumValue('', 'spectrum'), '');
    withPresetTable({ ...PRESETS, probe: { label: 'P', desc: '', values: { spectrum: 'mono right band' } } }, () => {
      assert.equal(mergedSpectrumValue('preset: probe\nspectrum: hairline', 'spectrum'), 'mono right hairline');
    });
  });
});

describe('resolve-spectrum — trim CSS contract', () => {

  test('CSS contract — the restrained tier holds a single-hue accent ramp (--sp-fill-mono-h)', () => {
    const variants = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    assert.match(variants, /section\.trim-spectrum-full\s*\{\s*--spectrum-structure:\s*var\(--spectrum-bar\)/);
    assert.match(variants, /section\.trim-spectrum-restrained\s*\{\s*--spectrum-structure:\s*var\(--sp-fill-mono-h\)/);
  });

  test('CSS contract — structural accents read --spectrum-structure; the opt-in flows the bar', () => {
    const variants = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    // The token defaults to a quiet ACCENT-TINT hairline (--spectrum-quiet, a low-intensity blend
    // of --accent + --border), NOT flat neutral; the opt-in points it at the full --spectrum.
    assert.match(variants, /--spectrum-quiet:\s*color-mix\(in oklab, var\(--accent\) \d+%, var\(--border\)\)/);
    assert.match(variants, /--spectrum-structure:\s*linear-gradient\(var\(--spectrum-quiet\), var\(--spectrum-quiet\)\)/);
    assert.match(variants, /section\.trim-spectrum-full\s*\{\s*--spectrum-structure:\s*var\(--spectrum-bar\)/);
    // A representative structural site now reads the STRUCTURE token, not --spectrum directly.
    const elements = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.elements.css'), 'utf8');
    assert.match(elements, /section hr \{[^}]*background:var\(--spectrum-structure\)/);
    // …while the section-edge BAR reads the resolved bar (the STYLE, else the theme's ribbon).
    assert.match(elements, /border-image-source:\s*var\(--spectrum-bar\)/);
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
    for (const f of themeEntries(themesDir)) {
      if (!f.endsWith('.css')) continue;
      const css = fs.readFileSync(themePath(themesDir, f), 'utf8');
      // Exact `var(--spectrum)` — the trailing `)` excludes `--spectrum-vertical/-end/-solid/-structure`.
      if (/var\(--spectrum\)/.test(css)) offenders.push(f);
    }
    assert.deepEqual(offenders, [],
      `these themes read raw var(--spectrum) for a structural accent — redirect to var(--spectrum-structure): ${offenders.join(', ')}`);
  });
});

describe('resolve-spectrum — CARD CSS contract (base.accent-finish.css)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');
  const block = css.slice(css.indexOf('CARD SPECTRUM'));

  test('the card rail targets card surfaces (both .card and li forms), reading the geometry tokens', () => {
    // `.card` is scoped to cards-grid/cards-stack (NOT bare) so it never reaches compare-prose.
    assert.match(block, /:is\(\.cards-grid, \.cards-stack\) \.card/);
    assert.doesNotMatch(css, /section\.with-card-spectrum \.card\b/, 'the bare `.card` selector would over-reach compare-prose');
    assert.match(block, /:is\(\.cards-grid, \.cards-stack\) > \.cell-stage > :is\(ul, ol\) > li/);
    assert.match(block, /\.pricing > \.cell-stage > ul > li/);
    // Painted as a background-IMAGE layer (no layout shift), reading the inherited fill token.
    assert.match(block, /background-image:\s*var\(--sp-card-img\)/);
    assert.ok(!/spectrum-card[^{]*\{[^}]*[^-]margin/.test(block), 'card rail must not use margin');
  });

  test('every CARD STYLE value has a fill mapping (auto follows the bar; the rest pin a fill)', () => {
    assert.match(block, /section\.with-card-spectrum\s*\{[^}]*--sp-card-v:\s*var\(--spectrum-bar-vertical/);
    assert.match(block, /section\.card-spectrum-solid\s*\{[^}]*--sp-fill-solid-v/);
    assert.match(block, /section\.card-spectrum-duo\s*\{[^}]*--sp-fill-duo-v/);
    assert.match(block, /section\.card-spectrum-mono\s*\{[^}]*--sp-fill-mono-v/);
    assert.match(block, /section\.card-spectrum-rainbow\s*\{[^}]*--sp-fill-rainbow-v/);
  });

  test('every CARD EDGE placement sets the geometry tokens', () => {
    assert.match(block, /section\.card-spectrum-right\s*\{[^}]*right center/);
    assert.match(block, /section\.card-spectrum-top\s*\{[^}]*center top/);
    assert.match(block, /section\.card-spectrum-bottom\s*\{[^}]*center bottom/);
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

  // A STYLE sets `--spectrum-style`, which `--spectrum-bar` resolves and every accent reads. It
  // must NOT redefine `--spectrum` itself: that token is the theme's ribbon, and the `:root`
  // capture behind `card-spectrum: rainbow` reads it. Redefining it on the slide broke that pin in
  // every packed host (2026-09-24-one-style-delivery-spine.md §8.2).
  test('every STYLE token has a rule; solid/duo/mono set the shared STYLE token, never --spectrum', () => {
    // `with-spectrum` is the restore token: the rainbow is what an unstyled slide draws, so it has
    // no rule of its own, and must not grow one.
    for (const cls of SPECTRUM_TOKENS.filter((t) => t !== 'with-spectrum')) {
      assert.ok(block.includes(`.${cls}`), `${cls} has no rule in the SPECTRUM block`);
    }
    assert.ok(!/\.with-spectrum(?![\w-])/.test(css), 'with-spectrum is a restore token and draws nothing');
    for (const cls of ['spectrum-solid', 'spectrum-duo', 'spectrum-mono']) {
      const rule = block.match(new RegExp(`section\\.${cls}\\s*\\{[^}]*\\}`))[0];
      assert.match(rule, /--spectrum-style\s*:/, `${cls} must set --spectrum-style so all accents follow`);
      assert.match(rule, /--spectrum-style-vertical\s*:/, `${cls} must set --spectrum-style-vertical too`);
      assert.doesNotMatch(rule, /--spectrum(-vertical)?\s*:/, `${cls} must not redefine --spectrum (the theme's ribbon)`);
    }
    assert.match(block, /--spectrum-bar:\s*var\(--spectrum-style,\s*var\(--spectrum\)\)/);
  });

  test('off is BAR-ONLY — drops the edge bar but does NOT redefine the shared token', () => {
    const rule = block.match(/section\.no-spectrum\s*\{[^}]*\}/)[0];
    assert.doesNotMatch(rule, /--spectrum\s*:/, 'off must NOT redefine --spectrum (structural accents keep their style — the white-label baseline)');
    assert.match(rule, /border-top:\s*none/);
    // AND IT DROPS THE BAR WITHOUT REPAINTING THE CANVAS (#2291). This used to assert
    // `background: var(--surface-inverse)` — the shorthand, which resets every longhand at
    // once and so clears the divider's rail, but also RESTATES the color at (0,3,1) and
    // takes the canvas of any frame that paints its own. `background-image: none` says only
    // the part that was meant. The assertion is now the negative one as well, because the
    // shorthand is what the fix removed.
    assert.match(block, /section\.divider:not\(\.light\)\.no-spectrum\s*\{\s*background-image:\s*none/);
    assert.doesNotMatch(
      block, /section\.(dark|divider[^{]*)\.no-spectrum\s*\{\s*background:\s/,
      'a no-spectrum rule must not use the `background:` shorthand — it restates the color '
        + "and takes a frame's own canvas with the bar (#2291)",
    );
    // explicit styles restore a full-thickness bar on bookends/dark, gated off when an edge MOVES or
    // DROPS the bar — and only then: `spectrum-top` (the restore token) is the top bar, so it
    // must keep the style. A `[class*="spectrum-edge-"]` gate would strip it from that slide.
    assert.match(block, /section:is\(\.spectrum-solid, \.spectrum-duo, \.spectrum-mono\):not\(\.divider\):not\(\.spectrum-left, \.spectrum-right, \.spectrum-bottom, \.no-spectrum\)/);
    assert.doesNotMatch(block, /\[class\*="spectrum-edge-"\]/, 'no wildcard edge gate: it would catch the restore token spectrum-top');
  });

  test('EDGE tokens paint a per-side bar and drop the top border', () => {
    assert.match(block, /section\.spectrum-left[^{]*\{[^}]*border-left:/);
    assert.match(block, /section\.spectrum-right[^{]*\{[^}]*border-right:/);
    assert.match(block, /section\.spectrum-bottom[^{]*\{[^}]*border-bottom:/);
    // left/right read the vertical token; bottom reads the horizontal one.
    assert.match(block.match(/section\.spectrum-left[^{]*\{[^}]*\}/)[0], /--spectrum-bar-vertical/);
    assert.match(block.match(/section\.spectrum-bottom[^{]*\{[^}]*\}/)[0], /border-image-source:\s*var\(--spectrum-bar\)/);
  });

  test('a divider is EXEMPT from the per-side edge rail (no doubled bar over its signature rail)', () => {
    assert.match(block, /section\.spectrum-left:not\(\.divider[,)]/);
    assert.match(block, /section\.spectrum-bottom:not\(\.divider[,)]/);
  });

  test('the full-bleed frames are exempt too: a side border would shrink their panels (check:edge-shift)', () => {
    for (const side of ['left', 'right', 'bottom']) {
      const rule = block.match(new RegExp(`section\\.spectrum-${side}:not\\(([^)]*)\\)`))[1];
      for (const frame of ['.divider', '.image', '.scene', '.split-panel', '.split-compare']) {
        assert.ok(rule.includes(frame), `spectrum-${side} must exclude ${frame}`);
      }
    }
  });

  // Comments are stripped first, matching the canonical HARD RULE #3 gate
  // (`checkHexLiterals` in tools/check-ownership.js, which runs
  // `stripCommentsKeepOffsets` before looking). Without that this assertion is
  // STRICTER than the rule it mirrors: an issue reference in a comment is all hex
  // digits, so `#1546` reads as a color literal and fails a block whose CSS is
  // perfectly palette-blind. A hex in prose is not a palette dependency.
  test('palette-blind — no hex literals anywhere in the SPECTRUM block', () => {
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(code), 'spectrum CSS must be palette-blind (var(--token) only)');
  });
});

describe('resolve-spectrum — the weight axis in CSS', () => {
  const elements = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.elements.css'), 'utf8');
  const accent = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.accent-finish.css'), 'utf8');

  test('the slide-edge weight moves only --_bar-w, which the border and the room both read', () => {
    assert.match(elements, /section\.spectrum-hairline\s*\{\s*--_bar-w:\s*1px;\s*\}/);
    assert.match(elements, /section\.spectrum-band\s*\{\s*--_bar-w:[^}]*1\.5 \* var\(--_sec-1cqi/);
    assert.ok(!/section\.spectrum-regular\b/.test(elements), '`regular` is the default and the restore token: it draws nothing of its own');
    for (const t of ['spectrum-hairline', 'spectrum-band']) {
      const rules = [...elements.matchAll(new RegExp(`section\\.${t}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
      for (const r of rules) assert.deepEqual(r.split(';').map((d) => d.trim().split(':')[0]).filter(Boolean), ['--_bar-w'], `${t} sets the width and nothing else`);
    }
  });

  test('the card weight feeds the rail width, and a preset --rail-w still wins', () => {
    assert.match(accent, /--sp-card-w:\s*var\(--rail-w, var\(--_card-rail-w, calc\(var\(--_sec-1cqi, 1cqi\) \* 0\.35\)\)\)/);
    assert.match(accent, /section\.card-spectrum-hairline\s*\{\s*--_card-rail-w:/);
    assert.match(accent, /section\.card-spectrum-band\s*\{\s*--_card-rail-w:/);
  });
});
