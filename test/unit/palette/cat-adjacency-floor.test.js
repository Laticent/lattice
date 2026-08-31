/**
 * Unit: adjacent categorical slots may improve, never erode — the gate #1864 asks for.
 *
 * The sibling arm, `cvd-trio-floor.test.js`, does this for the three status signals and says
 * why: `tools/cvd-audit.js` is a report that exits 0, so a re-tune driven by some other
 * constraint can collapse a pair with every gate green — and in #1704 it did. Nothing did the
 * same for the twelve-slot categorical cycle, which is the larger population, and a red team
 * found the reason it was easy to miss: the two tools that could have covered it each say the
 * OTHER one does. `tools/cvd-audit.js` excludes pale-fill pairs because "contrast-audit already
 * covers normal distinctness"; `tools/contrast-audit.js` says the curated `--cat-N-fill` slots
 * are "NOT re-audited here" and points at `checkCatContrast`, whose only distance floors are
 * fill-vs-mark within ONE slot. The loop closes with nobody holding the token.
 *
 * THE DESIGN IS NOT NEW HERE. `engineering/decisions/2026-07-15-categorical-token-contract.md`
 * §5 already specified this gate six weeks before #1864 was filed, and this file implements that
 * spec: measure the SATURATED tier, calibrate the threshold to what `indaco` + `cuoio` already
 * pass rather than to a guessed constant, check ADJACENT slots among the FIRST 6 (chart-family's
 * own N — past ~6 categories perceptual distinction collapses anyway, Wong 2011), both canvas
 * modes, every theme.
 *
 * WHY THE TIER IS DERIVED AND NOT NAMED — the correction that makes the numbers mean anything.
 * #1864 measures `--cat-N-fill` on `indaco` at ΔE 0.013 and reads the ramp as broken. §5 says to
 * measure the mark instead. **Both assume the saturated tier is the same token in both modes,
 * and it is not — the two tiers SWAP by canvas.** Measured over the catalog, as chroma maxima
 * and lightness midpoints:
 *
 *              chroma max (median)   L mid (median)
 *   mark light        0.150               0.450     <- saturated
 *   fill light        0.056               0.862     <- wash
 *   fill dark         0.243               0.440     <- saturated
 *   mark dark         0.053               0.869     <- wash
 *
 * The flip is correct and deliberate: on a dark canvas the roles must swap or one tier is
 * invisible against its ground (`design/theming.md` says the `--cat-on-*` inks flip for the same
 * reason). But it means a gate naming a TOKEN measures the wash in one mode and the code in the
 * other. Reading the wrong tier is not a rounding error — on `indaco` the fill gives 0.013 and
 * the mark gives 0.1549, a factor of twelve, and the difference between "the ramp is broken" and
 * "the ramp is the healthiest in the catalog". So the tier is derived per theme, by chroma.
 *
 * BOTH TIERS ARE GATED, and the wash arm is not politeness. The natural reading is that the wash
 * is a quiet surface a label sits on while the saturated tier carries identity beside it — and on
 * most surfaces that is true. **It is false on the Mermaid pie**, which is a documented supported
 * type: `lib/integrations/mermaid/mermaid.css` paints all twelve wedges from
 * `var(--cat-N-texture, var(--cat-N-fill))` and declares NO stroke, so the separator is Mermaid's
 * own white spacer and the per-slot mark is not on screen at all. There the wash IS the whole
 * discrimination channel, for twelve categories. Same on `list-steps`' categorical badges, which
 * are `background: var(--cat-N-fill)` on a `border-radius:999px` pseudo-element with no border —
 * and which cannot be rescued by texture, because `--cat-N-texture` resolves to `url(#…)`, an SVG
 * paint server that a CSS `background` cannot use.
 *
 * THE FLOORS ARE BOTH DERIVED, per tier, from §5's named references (`indaco`, `cuoio`, and their
 * dark faces): the smallest adjacent distance those four already reach on that tier. Nothing is
 * chosen. No margin is subtracted, because the references are themselves the best rows in the
 * table and a margin would only excuse the fifth.
 *
 * WHAT THIS GATE DOES NOT CLAIM. Most of the catalog sits below both floors today and this file
 * ships GREEN, on the shape `cvd-trio-floor.test.js` established: a value frozen BELOW the floor
 * may not erode further; one frozen at or above it must stay above. Reading a green run as "the
 * catalog is fine" is the exact inversion #1864 warns about, so every failure message prints the
 * floor and the DEFICIT — the number a fix has to close.
 *
 * AND THE DEFICIT IS NOT A LAW OF COLOR. An earlier draft of this file was going to record "12
 * slots at 0.15 is unreachable"; a red team measured that false and it is worth stating here so
 * nobody re-derives it. Greedy packing of sRGB in OKLab reaches 25 mutually-distinct colors at
 * ΔE 0.15; holding the fill's own gated contract (≥4.5:1 against `--cat-on-fill`) still reaches
 * 15. What actually binds is an UNSTATED CHROMA CEILING — indaco's fills sit at C ≤ 0.056 — and
 * inside indaco's own wash band at that ceiling there is room for 15 slots at ΔE 0.05 and 7 at
 * 0.075, against a shipped minimum of 0.0130. The ramp is roughly 4x below what its own restraint
 * permits. This gate holds the line; it does not say the line is where it belongs.
 *
 * EXEMPT FROM THE HUE FLOOR, per §6: the a11y palettes and the texture-first identities (`onyx`,
 * `concrete`), "already texture+luminance; exempt from the hue-distinctness gate, held to the
 * a11y distinctness rule instead". They are still frozen against erosion. **`concrete` is on that
 * list on a technicality and the technicality is worth naming**: `onyx` and `a11y-base` ship a
 * genuine twelve-step luminance-spread ramp (0.0276 adjacent — better than every brand palette),
 * which is what §6 asks for. `concrete` ships twelve grays differing by ±2 in one channel
 * (0.0013) and got the textures without the ramp. It is exempt here because it does carry a
 * texture channel, not because 0.0013 is a design.
 *
 * If this fails: a token move eroded an adjacent pair. Solve the ramp TOGETHER rather than
 * nudging one token back, and remember LIGHTNESS is the only channel every deficiency preserves.
 * Do not re-bless a number downward without saying why.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { oklabDistance, hexToOklch } = require('../../../lib/theme/color.js');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr.js');
const { mergedVars, listAllThemes } = require('../../../tools/composed-contrast.js');
const { themeChain } = require('../../../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../../../lib/theme/edges.generated.mjs');

const THEMES_DIR = path.join(__dirname, '../../../themes');
/** chart-family's own categorical N. §5: past ~6, perceptual distinction collapses anyway. */
const N = 6;
/** §5's named references. Both floors are what THEY reach, so they move only when the references do. */
const REFERENCES = ['indaco', 'indaco-dark', 'cuoio', 'cuoio-dark'];
/**
 * §6's exempt bucket for the HUE floor: their categorical channel is the `--cat-N-texture`
 * pattern, not hue, so measuring their hue separation measures the wrong thing. Membership is
 * checked against the tree below — a palette that drops its textures while staying on this list
 * would be exempted from the hue floor with no channel left at all.
 */
const TEXTURE_FIRST = new Set([
  'a11y-achromatopsia', 'a11y-base', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia',
  'onyx', 'onyx-dark', 'concrete', 'concrete-dark',
]);
/** Absorbs last-digit movement in the frozen table, nothing more — the sibling arm's value. */
const EROSION_TOLERANCE = 0.002;

/**
 * theme -> { saturated, sat: [d(1,2) … d(5,6)], wash: [ … ] } on the theme's SHIPPED canvas mode.
 *
 * `saturated` names which TOKEN carries the chroma, recorded as well as checked: it is derived,
 * so a derivation change that silently swapped it would otherwise be invisible, and reading the
 * wrong tier is a factor-of-twelve error.
 */
const FROZEN = new Map([
  ['a11y-achromatopsia', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['a11y-base', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['a11y-deuteranopia', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['a11y-protanopia', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['a11y-tritanopia', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['ardesia', { saturated: 'mark', sat: [0.2730, 0.2739, 0.3694, 0.0379, 0.1996], wash: [0.1325, 0.1326, 0.1687, 0.0301, 0.0881] }],
  ['ardesia-dark', { saturated: 'fill', sat: [0.2673, 0.2669, 0.3609, 0.0298, 0.1767], wash: [0.0877, 0.0878, 0.1115, 0.0213, 0.0576] }],
  ['atelier', { saturated: 'mark', sat: [0.2689, 0.2252, 0.3687, 0.3129, 0.3387], wash: [0.1266, 0.0786, 0.1685, 0.1478, 0.1558] }],
  ['atelier-dark', { saturated: 'fill', sat: [0.2423, 0.2932, 0.3526, 0.2689, 0.2932], wash: [0.0818, 0.0517, 0.1115, 0.0980, 0.1026] }],
  ['brina', { saturated: 'mark', sat: [0.3646, 0.2650, 0.2750, 0.2151, 0.2294], wash: [0.1720, 0.1361, 0.1317, 0.0997, 0.1002] }],
  ['brina-dark', { saturated: 'fill', sat: [0.3392, 0.2275, 0.2462, 0.1869, 0.1962], wash: [0.1137, 0.0905, 0.0872, 0.0654, 0.0654] }],
  ['burgundy', { saturated: 'mark', sat: [0.3277, 0.3201, 0.3380, 0.0841, 0.3442], wash: [0.1398, 0.1326, 0.1537, 0.0256, 0.1670] }],
  ['burgundy-dark', { saturated: 'fill', sat: [0.3090, 0.2997, 0.2842, 0.1000, 0.3040], wash: [0.0907, 0.0861, 0.1016, 0.0169, 0.1108] }],
  ['carbone', { saturated: 'mark', sat: [0.0579, 0.0763, 0.1411, 0.0569, 0.0587], wash: [0.0148, 0.0298, 0.0216, 0.0044, 0.0069] }],
  ['carbone-dark', { saturated: 'mark', sat: [0.0564, 0.0989, 0.1799, 0.0697, 0.0667], wash: [0.0169, 0.0289, 0.0566, 0.0198, 0.0205] }],
  ['carta', { saturated: 'mark', sat: [0.1902, 0.1873, 0.2880, 0.2306, 0.1549], wash: [0.1055, 0.0977, 0.1006, 0.0871, 0.0774] }],
  ['carta-dark', { saturated: 'fill', sat: [0.2488, 0.2042, 0.2877, 0.1050, 0.2097], wash: [0.0353, 0.0450, 0.0613, 0.0454, 0.0335] }],
  ['concrete', { saturated: 'mark', sat: [0.0706, 0.0390, 0.0528, 0.0501, 0.0669], wash: [0.0053, 0.0034, 0.0036, 0.0034, 0.0053] }],
  ['concrete-dark', { saturated: 'fill', sat: [0.0805, 0.0478, 0.0528, 0.0501, 0.0768], wash: [0.0053, 0.0034, 0.0036, 0.0034, 0.0053] }],
  ['crepuscolo', { saturated: 'mark', sat: [0.3752, 0.2579, 0.3074, 0.0584, 0.2622], wash: [0.1843, 0.0788, 0.1414, 0.0334, 0.1117] }],
  ['crepuscolo-dark', { saturated: 'fill', sat: [0.3534, 0.3448, 0.2979, 0.0432, 0.2367], wash: [0.1218, 0.0503, 0.0935, 0.0231, 0.0726] }],
  ['cuoio', { saturated: 'mark', sat: [0.1457, 0.2147, 0.2969, 0.1787, 0.1803], wash: [0.0692, 0.0614, 0.0622, 0.0587, 0.0678] }],
  ['cuoio-dark', { saturated: 'fill', sat: [0.2449, 0.1655, 0.2347, 0.2265, 0.2421], wash: [0.0295, 0.0394, 0.0604, 0.0391, 0.0295] }],
  ['indaco', { saturated: 'mark', sat: [0.1902, 0.1873, 0.2880, 0.2306, 0.1549], wash: [0.1055, 0.0977, 0.1006, 0.0871, 0.0774] }],
  ['indaco-dark', { saturated: 'fill', sat: [0.2488, 0.2042, 0.2877, 0.1050, 0.2097], wash: [0.0353, 0.0450, 0.0613, 0.0454, 0.0335] }],
  ['laguna', { saturated: 'mark', sat: [0.2939, 0.0965, 0.3710, 0.1028, 0.2862], wash: [0.1365, 0.0642, 0.1788, 0.0528, 0.1250] }],
  ['laguna-dark', { saturated: 'fill', sat: [0.2506, 0.0655, 0.3326, 0.0995, 0.2468], wash: [0.0904, 0.0427, 0.1179, 0.0343, 0.0830] }],
  ['magnolia', { saturated: 'mark', sat: [0.2744, 0.2962, 0.3670, 0.3398, 0.2232], wash: [0.1315, 0.1367, 0.1712, 0.1554, 0.0723] }],
  ['magnolia-dark', { saturated: 'fill', sat: [0.2677, 0.2765, 0.3499, 0.3273, 0.2941], wash: [0.0871, 0.0907, 0.1132, 0.1000, 0.0470] }],
  ['mustard', { saturated: 'mark', sat: [0.3141, 0.3133, 0.3460, 0.3126, 0.3443], wash: [0.1316, 0.1304, 0.1582, 0.1560, 0.1671] }],
  ['mustard-dark', { saturated: 'fill', sat: [0.2945, 0.2909, 0.2959, 0.2649, 0.3071], wash: [0.0866, 0.0854, 0.1046, 0.1036, 0.1109] }],
  ['onyx', { saturated: 'fill', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
  ['onyx-dark', { saturated: 'mark', sat: [0.0304, 0.0276, 0.0278, 0.0280, 0.0283], wash: [0.0199, 0.0196, 0.0193, 0.0191, 0.0226] }],
]);

const themeCss = (theme) => themeChain(theme, THEME_EDGES)
  .map((n) => path.join(THEMES_DIR, `${n}.css`))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'));

/** A theme's shipped canvas mode — the only one that renders, so the only one worth gating. */
const shipsDark = (theme) =>
  /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/.test(themeCss(theme).join('\n').replace(/\/\*[\s\S]*?\*\//g, ''));

/**
 * A theme's two categorical tiers on its shipped mode, split by chroma rather than by token name.
 * Ties go to `mark` as the saturated one, which only happens on a fully achromatic identity where
 * the two tiers read the same distances anyway. Returns null when a slot does not resolve.
 */
function measure(theme) {
  const vars = mergedVars(theme);
  const isDark = shipsDark(theme);
  const read = (kind) => {
    const out = [];
    for (let i = 1; i <= N; i++) {
      const hex = String(resolveTokenExpr(vars[`cat-${i}-${kind}`], vars, isDark)).trim();
      out.push(/^#[0-9a-f]{6}$/i.test(hex) ? hex : null);
    }
    return out;
  };
  const fill = read('fill');
  const mark = read('mark');
  if (fill.some((h) => !h) || mark.some((h) => !h)) return null;
  const chromaMax = (hexes) => Math.max(...hexes.map((h) => hexToOklch(h).C));
  const satIsFill = chromaMax(fill) > chromaMax(mark);
  const adjacent = (hexes) => {
    const out = [];
    for (let i = 0; i < N - 1; i++) out.push(+oklabDistance(hexes[i], hexes[i + 1]).toFixed(4));
    return out;
  };
  return {
    saturated: satIsFill ? 'fill' : 'mark',
    sat: adjacent(satIsFill ? fill : mark),
    wash: adjacent(satIsFill ? mark : fill),
  };
}

const now = new Map();
for (const theme of listAllThemes()) {
  const m = measure(theme);
  if (m) now.set(theme, m);
}

/** Each tier's floor: the smallest adjacent distance §5's references already reach ON THAT TIER. */
const floorFor = (tier) =>
  Math.min(...REFERENCES.filter((t) => now.has(t)).map((t) => Math.min(...now.get(t)[tier])));
const FLOOR = { sat: floorFor('sat'), wash: floorFor('wash') };

/** Every (theme, tier, slot) reading that is short of its tier's floor, worst deficit first. */
function deficits() {
  const out = [];
  for (const [theme, m] of now) {
    for (const tier of ['sat', 'wash']) {
      if (tier === 'sat' && TEXTURE_FIRST.has(theme)) continue;
      m[tier].forEach((d, i) => {
        if (d < FLOOR[tier]) out.push({ theme, tier, pair: `${i + 1}^${i + 2}`, d, short: +(FLOOR[tier] - d).toFixed(4) });
      });
    }
  }
  return out.sort((a, b) => b.short - a.short);
}

describe('categorical adjacency (frozen distances, reference-calibrated floors)', () => {
  test('the references still resolve, so both floors are derived and not guessed', () => {
    const missing = REFERENCES.filter((t) => !now.has(t));
    assert.deepEqual(missing, [], `reference palettes did not resolve: ${missing.join(', ')} — the floors cannot be derived without them.`);
    // Pinned so a reference palette silently losing its saturation is a loud failure rather than a
    // floor that quietly lowers itself to whatever the references now happen to be. These are the
    // numbers to re-derive — and argue for — when indaco or cuoio is re-tuned.
    assert.equal(+FLOOR.sat.toFixed(4), 0.1050, 'the saturated-tier floor moved — re-derive it and say why in the decision note.');
    assert.equal(+FLOOR.wash.toFixed(4), 0.0295, 'the wash-tier floor moved — re-derive it and say why in the decision note.');
  });

  test('every frozen palette still resolves its first six categorical slots', () => {
    const missing = [...FROZEN.keys()].filter((t) => !now.has(t));
    assert.deepEqual(missing, [], `frozen palettes no longer produce a categorical ramp — a theme or token was renamed:\n  ${missing.join('\n  ')}`);
  });

  test('the frozen table is not stale', () => {
    const extra = [...now.keys()].filter((t) => !FROZEN.has(t));
    assert.deepEqual(extra, [], `palettes measured but not frozen — add them:\n  ${extra.join('\n  ')}`);
  });

  // THE TIER, pinned per theme. A swap here is not necessarily a bug; it is a thing that must be
  // looked at, because every number below means something different after one.
  test('the saturated tier is still the one the frozen table names', () => {
    const swapped = [];
    for (const [theme, frozen] of FROZEN) {
      const m = now.get(theme);
      if (m && m.saturated !== frozen.saturated) {
        swapped.push(`${theme}: frozen with the ${frozen.saturated} saturated, now the ${m.saturated} carries the chroma`);
      }
    }
    assert.deepEqual(swapped, [], `the saturated tier moved:\n  ${swapped.join('\n  ')}`);
  });

  for (const tier of ['sat', 'wash']) {
    const label = tier === 'sat' ? 'saturated' : 'wash';

    test(`an adjacent ${label}-tier pair at or above its floor still clears it`, () => {
      const collapsed = [];
      for (const [theme, frozen] of FROZEN) {
        const m = now.get(theme);
        if (!m) continue;
        frozen[tier].forEach((was, i) => {
          if (was < FLOOR[tier]) return;
          const is = m[tier][i];
          if (is != null && is < FLOOR[tier]) {
            collapsed.push(`${theme} slot ${i + 1}^${i + 2} (${label})  ${was.toFixed(4)} -> ${is.toFixed(4)}  (floor ${FLOOR[tier].toFixed(4)})`);
          }
        });
      }
      assert.deepEqual(collapsed, [], `${collapsed.length} adjacent ${label}-tier pair(s) fell through the reference floor:\n  ${collapsed.join('\n  ')}`);
    });

    // THE DEFICIT IS PRINTED, not just the frozen value, and that is the difference between a
    // ratchet and a certificate. A green run here means "no worse than before", never "good
    // enough" — so the failure message carries the target rather than making the reader find it.
    test(`an adjacent ${label}-tier pair already below its floor does not erode further`, () => {
      const eroded = [];
      for (const [theme, frozen] of FROZEN) {
        const m = now.get(theme);
        if (!m) continue;
        frozen[tier].forEach((was, i) => {
          if (was >= FLOOR[tier]) return;
          const is = m[tier][i];
          if (is != null && is < was - EROSION_TOLERANCE) {
            eroded.push(`${theme} slot ${i + 1}^${i + 2} (${label})  ${was.toFixed(4)} -> ${is.toFixed(4)}  ·  still ${(FLOOR[tier] - is).toFixed(4)} short of the ${FLOOR[tier].toFixed(4)} floor`);
          }
        });
      }
      assert.deepEqual(eroded, [], `${eroded.length} already-collapsed ${label}-tier pair(s) eroded further:\n  ${eroded.join('\n  ')}`);
    });
  }

  test('the exempt set is only the palettes that really carry a texture channel', () => {
    assert.ok(listAllThemes().length >= 30);
    assert.equal(FROZEN.size, now.size);
    const declaresTexture = (t) => themeCss(t).some((css) => /--cat-1-texture\s*:/.test(css));
    const unbacked = [...TEXTURE_FIRST].filter((t) => now.has(t) && !declaresTexture(t));
    assert.deepEqual(unbacked, [], `exempt from the hue floor but declaring no --cat-N-texture, so nothing carries the category:\n  ${unbacked.join('\n  ')}`);
  });

  // THE DEFICIT COUNT IS PINNED, and it is the one assertion here that can only be satisfied by
  // making the catalog better. The clauses above hold the line; this one makes crossing it
  // visible, in the direction that matters: it fails when the count RISES, and it fails when the
  // count FALLS, because a fix worth having is worth writing down. It is the closest thing this
  // file has to pressure, and without it a frozen table is just a nicer word for the status quo.
  test('the catalog is no further from the reference floors than it was', () => {
    const d = deficits();
    const worst = d.slice(0, 5).map((x) => `${x.theme} ${x.pair} (${x.tier}) ${x.d.toFixed(4)}, short by ${x.short.toFixed(4)}`);
    assert.equal(d.length, 75,
      `${d.length} adjacent readings sit below their tier's reference floor (was 75).\nWorst:\n  ${worst.join('\n  ')}\n`
      + 'If this FELL, a palette improved — re-bless the count and say which. If it ROSE, something got worse.');
  });
});
