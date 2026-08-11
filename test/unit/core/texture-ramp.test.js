/**
 * Unit: deriving a categorical TEXTURE set from a theme's own fills (#1562).
 *
 * WHY THIS EXISTS. `--cat-N-texture` cannot join `REQUIRED_TOKENS` because only
 * four texture sets exist and each bakes a literal ramp for one palette — a
 * generated theme could only point at colors baked for a DIFFERENT palette, so a
 * `brand-mono` theme in a blue-green cycle would get gray chips contradicting its
 * own `--cat-N-fill`. That is a supply-side gap, not a token gap
 * (`engineering/decisions/2026-08-10-fallback-exit-ledger.md` §4).
 *
 * This module closes the part that had no answer: the ramp and the two overlay
 * inks. It does NOT emit patterns — `texturePatternDefs()` is byte-locked against
 * `texture-defs.golden.svg` and changing it is a separate, sign-off-bearing step.
 *
 * Two claims carry the design, and both are pinned below against the REAL corpus
 * rather than a fixture:
 *
 *   1. every shipped theme derives a usable set — the feasibility claim #1562 is
 *      actually asking about;
 *   2. the derivation REPRODUCES the hand tuning it is generalizing. If it did not
 *      land near onyx's and concrete's hand-picked inks, the numbers would be
 *      invented rather than derived, and nothing else here would mean anything.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { hexToOklch } = require('../../../lib/theme/color.js');
const {
  LIGHT_ARM_DELTA, DARK_ARM_DELTA, INK_L_MIN, INK_L_MAX,
  meanLightness, dominantHue, deriveTextureInk, textureSetFrom, inkContrastRange,
} = require('../../../lib/core/texture-ramp.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(ROOT, 'themes');

// The ramps the four shipped sets bake (lib/core/accessibility-textures.js).
const SHIPPED = {
  a11yCat: { fills: ['#e8e8e8','#dedede','#d5d5d5','#cccccc','#c3c3c3','#bababa','#b1b1b1','#a8a8a8','#a0a0a0','#979797','#8e8e8e','#868686'], ink: '#1a1a1a' },
  onyxLight: { fills: ['#e8e8e8','#dedede','#d5d5d5','#cccccc','#c3c3c3','#bababa','#b1b1b1','#a8a8a8','#a0a0a0','#979797','#8e8e8e','#868686'], ink: '#8a8a8a' },
  onyxDark: { fills: ['#2e2e2e','#333333','#383838','#3d3d3d','#424242','#484848','#4d4d4d','#525252','#585858','#5d5d5d','#636363','#696969'], ink: '#f5f5f5' },
  concreteLight: { fills: ['#DFDDDD','#DDDFDE','#DDDEDF','#DFDEDD','#DFDDDE','#DDDFDF','#DFDFDD','#DDDFDD','#DDDDDF','#DFDDDF','#DEDFDD','#DEDDDF'], ink: '#8f8f8c' },
  concreteDark: { fills: ['#6A4E4E','#4F685C','#4F5C68','#685C4F','#684F5C','#4F6868','#676751','#516751','#515167','#675167','#5C6751','#5C5167'], ink: '#EDEBE8' },
};

/**
 * Every theme's own 12-slot light/dark `--cat-N-fill` ramp, read the way the
 * palette LOADS (a `-dark` wrapper / `a11y-base` inherits its parent's ramp
 * through `@import`), not the way the file sits. That distinction is what made
 * two published counts wrong in #1527.
 */
function fillRamp(themeFile, seen = new Set()) {
  const read = (f) => {
    if (seen.has(f)) return '';
    seen.add(f);
    const c = fs.readFileSync(f, 'utf8');
    let imported = '';
    for (const m of c.matchAll(/@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g)) {
      if (m[1] === 'lattice') continue;
      const p = path.join(THEMES, `${m[1]}.css`);
      if (fs.existsSync(p)) imported += `${read(p)}\n`;
    }
    return imported + c;
  };
  const css = read(themeFile).replace(/\/\*[\s\S]*?\*\//g, '');
  const light = [];
  const dark = [];
  for (let n = 1; n <= 12; n += 1) {
    const re = new RegExp(`--cat-${n}-fill\\s*:\\s*([^;]+);`, 'g');
    let last = null;
    for (let m = re.exec(css); m; m = re.exec(css)) last = m[1].trim();  // last wins, like the cascade
    if (!last) return null;
    const ld = /light-dark\(\s*([^,]+),\s*([^)]+)\)/.exec(last);
    if (ld) { light.push(ld[1].trim()); dark.push(ld[2].trim()); }
    else { light.push(last); dark.push(null); }
  }
  return { light, dark: dark.every(Boolean) ? dark : null };
}

const THEME_FILES = fs.readdirSync(THEMES).filter((f) => f.endsWith('.css')).sort();

describe('texture-ramp — the pieces', () => {
  test('meanLightness averages in OKLCH, not sRGB', () => {
    const got = meanLightness(['#000000', '#ffffff']);
    assert.ok(got > 0.4 && got < 0.6, `expected a mid lightness, got ${got}`);
  });

  test('meanLightness refuses an empty ramp rather than returning NaN', () => {
    assert.throws(() => meanLightness([]), /empty fill ramp/);
  });

  test('dominantHue picks the most CHROMATIC entry, not a circular mean', () => {
    // A mean over hues spanning the wheel lands on an arbitrary angle. The most
    // saturated chip is the one a viewer reads as "this theme's color".
    const h = dominantHue(['#808080', '#7f7f80', '#c81e5a']);
    assert.equal(Math.round(h), Math.round(hexToOklch('#c81e5a').h));
  });

  test('a fully neutral ramp yields a neutral-ish hue, which at INK_CHROMA reads as gray', () => {
    const ink = deriveTextureInk(['#e8e8e8', '#cccccc', '#868686'], 'light');
    const { C } = hexToOklch(ink);
    assert.ok(C < 0.03, `expected a near-neutral ink, got chroma ${C}`);
  });

  test('the light arm whispers BELOW the chips; the dark arm reads ABOVE them', () => {
    const pale = ['#e8e8e8', '#dedede', '#d5d5d5'];
    const deep = ['#2e2e2e', '#333333', '#383838'];
    assert.ok(hexToOklch(deriveTextureInk(pale, 'light')).L < meanLightness(pale));
    assert.ok(hexToOklch(deriveTextureInk(deep, 'dark')).L > meanLightness(deep));
  });

  test('the ink never reaches a pole', () => {
    // The clamp is applied in OKLCH and the result is quantized to 8-bit hex, so a
    // value pinned exactly at INK_L_MIN reads back a hair under it. EPS is that
    // round-trip, not slack in the clamp.
    const EPS = 0.01;
    for (const fills of [['#ffffff'], ['#000000'], ['#ffffff', '#fefefe']]) {
      for (const arm of ['light', 'dark']) {
        const { L } = hexToOklch(deriveTextureInk(fills, arm));
        assert.ok(L >= INK_L_MIN - EPS && L <= INK_L_MAX + EPS, `${arm} arm went to ${L}`);
      }
    }
  });

  test('an unknown arm is an error, not a silent default', () => {
    assert.throws(() => deriveTextureInk(['#cccccc'], 'sideways'), /unknown arm/);
  });

  test('the deltas are the measured ones, not round numbers picked by hand', () => {
    // Guard against a "tidy up the constants" edit: these came from measuring the
    // four shipped sets, and the reproduction test below depends on them.
    assert.equal(LIGHT_ARM_DELTA, -0.20);
    assert.equal(DARK_ARM_DELTA, 0.50);
  });
});

describe('texture-ramp — the set', () => {
  const light = SHIPPED.onyxLight.fills;
  const dark = SHIPPED.onyxDark.fills;

  test('a two-arm palette is schemeAware; a one-arm palette is static', () => {
    assert.equal(textureSetFrom({ lightFills: light, darkFills: dark }).mode, 'schemeAware');
    assert.equal(textureSetFrom({ lightFills: light }).mode, 'static');
  });

  test('a static set has no dark ink — there is no arm to derive it from', () => {
    const set = textureSetFrom({ lightFills: light });
    assert.equal(set.darkInk, null);
    assert.equal(inkContrastRange(set).dark, null);
  });

  test('slots follow the ramp length, as texturePatternDefs already requires', () => {
    assert.equal(textureSetFrom({ lightFills: light.slice(0, 8) }).slots, 8);
  });

  test('a ramp-length mismatch is an error, not a silently truncated set', () => {
    assert.throws(() => textureSetFrom({ lightFills: light, darkFills: dark.slice(0, 8) }), /length mismatch/);
  });

  test('an empty or missing ramp is an error', () => {
    assert.throws(() => textureSetFrom({ lightFills: [] }), /required/);
    assert.throws(() => textureSetFrom({}), /required/);
  });
});

describe('texture-ramp — it reproduces the hand tuning it generalizes', () => {
  // The load-bearing claim. If the derived ink did not land near the values a human
  // chose for onyx and concrete, these constants would be invented rather than
  // derived and the feasibility result below would mean nothing.
  const near = (a, b, tol, what) => {
    const d = Math.abs(hexToOklch(a).L - hexToOklch(b).L);
    assert.ok(d <= tol, `${what}: derived ${a} vs hand-tuned ${b} — lightness gap ${d.toFixed(3)} > ${tol}`);
  };

  test('onyx light — derived ink lands near the hand-picked #8a8a8a', () => {
    near(deriveTextureInk(SHIPPED.onyxLight.fills, 'light'), SHIPPED.onyxLight.ink, 0.10, 'onyx light');
  });
  test('onyx dark — derived ink lands near the hand-picked #f5f5f5', () => {
    near(deriveTextureInk(SHIPPED.onyxDark.fills, 'dark'), SHIPPED.onyxDark.ink, 0.10, 'onyx dark');
  });
  test('concrete light — derived ink lands near the hand-picked #8f8f8c', () => {
    near(deriveTextureInk(SHIPPED.concreteLight.fills, 'light'), SHIPPED.concreteLight.ink, 0.12, 'concrete light');
  });
  test('concrete dark — derived ink lands near the hand-picked #EDEBE8', () => {
    near(deriveTextureInk(SHIPPED.concreteDark.fills, 'dark'), SHIPPED.concreteDark.ink, 0.10, 'concrete dark');
  });

  test('it does NOT reproduce the a11y light ink, and that is correct', () => {
    // engineering/textures.md: the a11y sets drive to near-black (#1a1a1a) because a
    // CVD palette has no color channel and wants the texture LOUD; the two themed
    // sets whisper so the dark label stays dominant. A derived theme is in the themed
    // case. If this ever started matching, the whisper band would have been lost.
    const derived = deriveTextureInk(SHIPPED.a11yCat.fills, 'light');
    assert.ok(hexToOklch(derived).L - hexToOklch(SHIPPED.a11yCat.ink).L > 0.25,
      'the derived light ink must stay well above the a11y near-black');
  });
});

describe('texture-ramp — every shipped theme derives a usable set', () => {
  // #1562's actual question. The reference band is what the four hand-tuned sets
  // already occupy: light 1.05–2.82, dark 2.85–12.46. Texture is redundant encoding
  // painted at 0.40/0.45 opacity over a fill that already carries the category, so
  // there is no WCAG floor here — the band IS the specification.
  const LIGHT_BAND = [1.0, 4.0];
  const DARK_BAND = [2.5, 13.0];

  const derived = THEME_FILES.map((f) => {
    const ramp = fillRamp(path.join(THEMES, f));
    return { name: f.replace(/\.css$/, ''), ramp };
  });

  test('every theme exposes a full 12-slot fill ramp to derive from', () => {
    const missing = derived.filter((d) => !d.ramp).map((d) => d.name);
    assert.deepEqual(missing, [], 'a theme with no 12-slot --cat-N-fill ramp cannot get a texture set');
  });

  test(`all ${THEME_FILES.length} themes derive, and both arms land in the shipped band`, () => {
    const out = [];
    for (const { name, ramp } of derived) {
      const set = textureSetFrom({ lightFills: ramp.light, darkFills: ramp.dark });
      const r = inkContrastRange(set);
      if (r.light.min < LIGHT_BAND[0] || r.light.max > LIGHT_BAND[1]) {
        out.push(`${name} light ${r.light.min.toFixed(2)}–${r.light.max.toFixed(2)} outside ${LIGHT_BAND.join('–')}`);
      }
      if (r.dark && (r.dark.min < DARK_BAND[0] || r.dark.max > DARK_BAND[1])) {
        out.push(`${name} dark ${r.dark.min.toFixed(2)}–${r.dark.max.toFixed(2)} outside ${DARK_BAND.join('–')}`);
      }
    }
    assert.deepEqual(out, []);
  });

  test('the corpus is really being walked — a vacuous pass is a claim', () => {
    assert.ok(THEME_FILES.length >= 30, `expected the full theme set, found ${THEME_FILES.length}`);
    assert.ok(derived.every((d) => d.ramp && d.ramp.light.length === 12));
  });

  test('a scheme-flipping theme gets two arms; a mode-invariant one gets a static set', () => {
    const byName = Object.fromEntries(derived.map((d) => [d.name, d.ramp]));
    assert.ok(byName.onyx.dark, 'onyx flips with the scheme');
    assert.equal(byName['a11y-base'].dark, null, 'the a11y family is mode-invariant by design');
  });
});
