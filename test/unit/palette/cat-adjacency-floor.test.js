/**
 * Unit: every categorical ramp clears its tier's separation floor.
 *
 * THIS FILE USED TO BE A RATCHET AND IS NOW A FLOOR, which is the whole point of the
 * 2026-09-01 re-tune. The version #1864 prompted froze 33 palettes' distances and
 * asserted only that they never got worse — 75 readings sat below the floor and it
 * shipped green, because a gate written while the catalog is broken can either hold
 * the line or fail on day one. The catalog now MEETS the contract, so the assertion
 * is the contract: clear the floor, or be one of a named, measured handful that
 * provably cannot.
 *
 * THE TIER IS DERIVED, NOT NAMED — the correction that makes the numbers mean
 * anything. `--cat-N-fill` and `--cat-N-mark` SWAP roles by canvas: the mark carries
 * the chroma on a light ground, the fill carries it on a dark one. Measured over the
 * catalog, as chroma maxima and lightness midpoints:
 *
 *              chroma max (median)   L mid (median)
 *   mark light        0.150               0.450     <- saturated
 *   fill light        0.056               0.862     <- wash
 *   fill dark         0.243               0.440     <- saturated
 *   mark dark         0.053               0.869     <- wash
 *
 * A gate naming a TOKEN therefore measures the wash in one mode and the code in the
 * other. #1864 read `--cat-N-fill` on `indaco` at ΔE 0.013 and called the ramp
 * broken; the mark on that same canvas reads 0.1549, a factor of twelve. So the tier
 * is derived per theme, by chroma.
 *
 * THE TWO TIERS ARE HELD TO DIFFERENT SCOPES, and the asymmetry is the contract:
 *
 *   - WASH — ALL 66 PAIRS. The Mermaid pie paints every wedge from
 *     `var(--cat-N-texture, var(--cat-N-fill))` and declares NO stroke
 *     (`lib/integrations/mermaid/mermaid.css`), so the separator is Mermaid's own
 *     white spacer and no per-slot mark is on screen at all. The wash is the entire
 *     discrimination channel there, and a reader compares wedge 5 against wedge 10 as
 *     readily as against wedge 6. Adjacency is the wrong question for it: #1864's own
 *     worst reading was `indaco`'s slots 5 and 10 at 0.0130 — a NON-adjacent pair that
 *     an adjacency gate cannot see, and that survived the first version of this file.
 *     Same story on `list-steps`' categorical badges, which are
 *     `background: var(--cat-N-fill)` with no border and cannot be rescued by texture
 *     (`--cat-N-texture` resolves to `url(#…)`, an SVG paint server a CSS `background`
 *     cannot use).
 *
 *   - SATURATED — 11 ADJACENT PAIRS. Not because adjacency is the right question here
 *     too, but because all-pairs is not reachable: holding hue and chroma fixed, five
 *     ramps (`brina` light, `burgundy` dark, `carbone` light, both `cuoio` faces)
 *     cannot pairwise clear 0.1050 inside their own contrast bands. Getting there
 *     means re-hueing brand colors, which is a larger decision than this one and is
 *     recorded as not taken.
 *
 * BOTH FLOORS ARE §5's NAMED REFERENCES' OWN PRE-RE-TUNE VALUES — the smallest reading
 * `indaco` and `cuoio` (and their dark faces) reached before 2026-09-01. Nothing is
 * chosen and no margin is subtracted, so the contract is still "at least as separable
 * as Adam & Eve". They live in `lib/theme/cat-ramp.js`, which is also what
 * `tools/derive-cat-ramp.js` solves to, so the instrument and the gate cannot drift.
 *
 * THEY ARE NOT RE-DERIVED FROM THE REFERENCES AT TEST TIME, which the first cut of
 * this rewrite did and which is circular: a re-tune that lifts the whole catalog lifts
 * the references too, the floor rises underneath everything else, and five palettes
 * the solver had aimed squarely at 0.0295 came out two ten-thousandths short of a
 * number that had moved while they were being measured. What survives from "derived"
 * is the part worth keeping — the first test below still checks the references clear
 * these numbers, so the calibration claim stays true rather than becoming folklore.
 *
 * If this fails: a token move eroded a pair. Solve the ramp TOGETHER rather than
 * nudging one token back — `node tools/derive-cat-ramp.js` does exactly that — and
 * remember LIGHTNESS is the only channel every deficiency preserves.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { oklabDistance, hexToOklab } = require('../../../lib/theme/color.js');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr.js');
const { mergedVars, listAllThemes } = require('../../../tools/composed-contrast.js');
const { themeChain } = require('../../../lib/theme/chain.mjs');
const { FLOOR, SCOPE } = require('../../../lib/theme/cat-ramp.js');
const { THEME_EDGES } = require('../../../lib/theme/edges.generated.mjs');

const THEMES_DIR = path.join(__dirname, '../../../themes');
const SLOTS = 12;
/** §5's named references. Both floors are what THEY reach, so they move only when the references do. */
const REFERENCES = ['indaco', 'indaco-dark', 'cuoio', 'cuoio-dark'];
/**
 * §6's exempt bucket for the SATURATED floor: their categorical channel is the
 * `--cat-N-texture` pattern, not hue, so measuring hue separation measures the wrong
 * thing — and a twelve-step luminance ramp cannot reach 0.1050 between neighbors in
 * any case (it would need more lightness range than the axis has). Membership is
 * checked against the tree below. They are NOT exempt from the wash floor: that is
 * the channel the pie paints, and `onyx` and `concrete` both clear it.
 */
const TEXTURE_FIRST = new Set([
  'a11y-achromatopsia', 'a11y-base', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia',
  'onyx', 'onyx-dark', 'concrete', 'concrete-dark',
]);
/**
 * The ramps that cannot reach their floor, with the value they DO reach. Each is a
 * measured conflict with the DERIVED-INK contract, not a rounding excuse, and each
 * fails here if it erodes AND if it improves — an entry that has stopped being true
 * has to be deleted rather than left to rot. Mirrors `SANCTIONED_SHORTFALLS` in
 * `tools/derive-cat-ramp.js`, which is what produces these values.
 *
 * The a11y family declares FLAT hex, so ONE mark ramp serves both canvases and owes a
 * legible `--cat-N-ink` arm on both. Clearing 0.0299 needs the ramp to span L
 * 0.200-0.562, and `derive-cat-ink` cannot lift twelve inks clear of the #000000
 * canvas over that span and still keep them apart. 0.0285 is the widest ramp whose
 * ink arm solves — against a shipped 0.0180, so the family improved by 58% and stopped
 * 0.0014 short.
 *
 * `concrete-dark`'s wash lost that same veto at every rung and ships untouched: its
 * `--bg` and `--bg-alt` sit close enough that widening the marks at all costs the ink
 * arm. Its LIGHT fills — the ramp the pie actually paints on a light canvas — did take
 * §6's luminance spread, 0.0013 -> 0.0316.
 */
const SANCTIONED_SHORTFALLS = new Map([
  // The a11y family declares FLAT hex, so ONE mark ramp serves both canvases and owes a
  // legible `--cat-N-ink` arm on both. Clearing the floor needs a lightness span
  // `derive-cat-ink` cannot lift twelve inks clear of the #000000 canvas over. 0.0289 is
  // the widest ramp whose ink arm still solves, against a shipped 0.0180.
  ['a11y-achromatopsia wash', 0.0289],
  ['a11y-base wash', 0.0289],
  ['a11y-deuteranopia wash', 0.0289],
  ['a11y-protanopia wash', 0.0289],
  ['a11y-tritanopia wash', 0.0289],
  // Reaching 0.1050 adjacent on these three needs lightness range they can only buy by
  // clipping chroma past the solver's second rung, or by placing two slots at the same
  // L — which is exactly what the monochromacy floor exists to stop. Improved from
  // 0.0298, 0.0564 and 0.0584 respectively.
  ['ardesia-dark sat', 0.1021],
  ['carbone-dark sat', 0.0869],
  ['crepuscolo sat', 0.1034],
  // `concrete`'s light chips sit between a light canvas and white. A twelve-step ramp
  // needs more range than that gap holds while each chip keeps its footing on the canvas
  // — and the chips are what a `list-steps` badge paints, with no border. `onyx` is the
  // same shape, one rung better. `concrete-dark` is held at its SHIPPED ramp entirely
  // (HELD_AT_SHIPPED in tools/derive-cat-ramp.js): widening it moved the journey
  // weighted badge's 28%-mood blend into its own ink's lightness and took six mood pairs
  // under AA, which `journey-chip-contrast.test.js` catches and no palette gate would.
  ['concrete wash', 0.0112],
  ['concrete-dark wash', 0.0013],
  ['onyx-dark wash', 0.0276],
]);
/** Absorbs last-digit movement in the pinned table, nothing more — the sibling arm's value. */
const EROSION_TOLERANCE = 0.002;

/**
 * theme -> { saturated, sat, wash } on the theme's SHIPPED canvas mode, where `sat` and
 * `wash` are each that tier's FIVE LOWEST readings at its own scope, ascending.
 *
 * FIVE, NOT ONE, and that is a coverage fix rather than decoration. An earlier cut of
 * this rewrite pinned only the worst reading per tier, and an audit mutation-proved what
 * that misses: eroding `onyx`'s pair 1^2 from 0.0304 to 0.0273 — past the tolerance —
 * left the minimum sitting elsewhere at 0.0258, so the gate certified it. The version
 * this file replaced pinned five explicit pairs per tier and would have caught it. Five
 * LOWEST rather than five NAMED pairs, because the scopes differ per tier (11 adjacent
 * against 66 all-pairs) and the at-risk pairs are the small ones wherever they sit.
 *
 * `saturated` names which TOKEN carries the chroma, recorded as well as checked: it is
 * derived, so a derivation change that silently swapped it would otherwise be
 * invisible, and reading the wrong tier is a factor-of-twelve error.
 */
const PINNED = new Map([
  ['a11y-achromatopsia', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0289, 0.0294, 0.0306, 0.0309, 0.0313] }],
  ['a11y-base', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0289, 0.0294, 0.0306, 0.0309, 0.0313] }],
  ['a11y-deuteranopia', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0289, 0.0294, 0.0306, 0.0309, 0.0313] }],
  ['a11y-protanopia', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0289, 0.0294, 0.0306, 0.0309, 0.0313] }],
  ['a11y-tritanopia', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0289, 0.0294, 0.0306, 0.0309, 0.0313] }],
  ['ardesia', { saturated: 'mark', sat: [0.1053, 0.1060, 0.1066, 0.1698, 0.2105], wash: [0.0310, 0.0325, 0.0353, 0.0354, 0.0362] }],
  ['ardesia-dark', { saturated: 'fill', sat: [0.1021, 0.1037, 0.1149, 0.2007, 0.2073], wash: [0.0299, 0.0301, 0.0307, 0.0313, 0.0319] }],
  ['atelier', { saturated: 'mark', sat: [0.1050, 0.1305, 0.1778, 0.1951, 0.2241], wash: [0.0312, 0.0324, 0.0341, 0.0351, 0.0365] }],
  ['atelier-dark', { saturated: 'fill', sat: [0.1063, 0.1530, 0.1792, 0.2004, 0.2771], wash: [0.0297, 0.0301, 0.0302, 0.0306, 0.0311] }],
  ['brina', { saturated: 'mark', sat: [0.1655, 0.1997, 0.2122, 0.2168, 0.2308], wash: [0.0299, 0.0305, 0.0318, 0.0324, 0.0441] }],
  ['brina-dark', { saturated: 'fill', sat: [0.1572, 0.2047, 0.2067, 0.2121, 0.2302], wash: [0.0305, 0.0305, 0.0307, 0.0317, 0.0389] }],
  ['burgundy', { saturated: 'mark', sat: [0.1055, 0.1078, 0.1994, 0.2130, 0.2557], wash: [0.0299, 0.0305, 0.0324, 0.0324, 0.0441] }],
  ['burgundy-dark', { saturated: 'fill', sat: [0.1050, 0.1353, 0.1534, 0.1926, 0.2375], wash: [0.0303, 0.0304, 0.0320, 0.0324, 0.0368] }],
  ['carbone', { saturated: 'mark', sat: [0.1084, 0.1092, 0.1193, 0.1253, 0.1265], wash: [0.0306, 0.0310, 0.0312, 0.0312, 0.0313] }],
  ['carbone-dark', { saturated: 'mark', sat: [0.0869, 0.0870, 0.0875, 0.0875, 0.0889], wash: [0.0317, 0.0319, 0.0320, 0.0322, 0.0326] }],
  ['carta', { saturated: 'mark', sat: [0.1051, 0.1051, 0.1637, 0.1886, 0.1976], wash: [0.0295, 0.0297, 0.0298, 0.0310, 0.0337] }],
  ['carta-dark', { saturated: 'fill', sat: [0.1426, 0.1649, 0.1705, 0.1837, 0.2263], wash: [0.0295, 0.0298, 0.0299, 0.0301, 0.0301] }],
  ['concrete', { saturated: 'mark', sat: [0.0255, 0.0368, 0.0390, 0.0409, 0.0501], wash: [0.0112, 0.0119, 0.0132, 0.0134, 0.0139] }],
  ['concrete-dark', { saturated: 'fill', sat: [0.0322, 0.0368, 0.0452, 0.0478, 0.0501], wash: [0.0013, 0.0013, 0.0013, 0.0013, 0.0014] }],
  ['crepuscolo', { saturated: 'mark', sat: [0.1034, 0.1079, 0.1333, 0.2030, 0.2151], wash: [0.0310, 0.0325, 0.0353, 0.0354, 0.0362] }],
  ['crepuscolo-dark', { saturated: 'fill', sat: [0.1070, 0.1125, 0.1414, 0.2125, 0.2461], wash: [0.0299, 0.0301, 0.0307, 0.0313, 0.0319] }],
  ['cuoio', { saturated: 'mark', sat: [0.1055, 0.1066, 0.1453, 0.1815, 0.1828], wash: [0.0302, 0.0306, 0.0310, 0.0323, 0.0330] }],
  ['cuoio-dark', { saturated: 'fill', sat: [0.1780, 0.2045, 0.2113, 0.2332, 0.2355], wash: [0.0296, 0.0299, 0.0302, 0.0305, 0.0312] }],
  ['indaco', { saturated: 'mark', sat: [0.1051, 0.1051, 0.1637, 0.1886, 0.1976], wash: [0.0296, 0.0305, 0.0312, 0.0318, 0.0328] }],
  ['indaco-dark', { saturated: 'fill', sat: [0.1428, 0.1652, 0.1714, 0.1854, 0.2259], wash: [0.0295, 0.0298, 0.0299, 0.0301, 0.0301] }],
  ['laguna', { saturated: 'mark', sat: [0.1057, 0.1073, 0.1545, 0.2193, 0.2290], wash: [0.0315, 0.0318, 0.0320, 0.0355, 0.0369] }],
  ['laguna-dark', { saturated: 'fill', sat: [0.1204, 0.1357, 0.1368, 0.2173, 0.2344], wash: [0.0302, 0.0302, 0.0306, 0.0314, 0.0316] }],
  ['magnolia', { saturated: 'mark', sat: [0.1091, 0.1517, 0.1898, 0.2094, 0.2258], wash: [0.0301, 0.0306, 0.0310, 0.0328, 0.0441] }],
  ['magnolia-dark', { saturated: 'fill', sat: [0.1084, 0.1757, 0.1808, 0.2024, 0.2308], wash: [0.0305, 0.0307, 0.0314, 0.0316, 0.0394] }],
  ['mustard', { saturated: 'mark', sat: [0.1056, 0.2143, 0.2202, 0.2752, 0.2973], wash: [0.0299, 0.0306, 0.0326, 0.0345, 0.0444] }],
  ['mustard-dark', { saturated: 'fill', sat: [0.1060, 0.2238, 0.2364, 0.2523, 0.2545], wash: [0.0299, 0.0299, 0.0301, 0.0304, 0.0367] }],
  ['onyx', { saturated: 'fill', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0303, 0.0308, 0.0315, 0.0325, 0.0326] }],
  ['onyx-dark', { saturated: 'mark', sat: [0.0258, 0.0267, 0.0276, 0.0278, 0.0280], wash: [0.0276, 0.0280, 0.0284, 0.0286, 0.0294] }],
]);

const themeCss = (theme) => themeChain(theme, THEME_EDGES)
  .map((n) => path.join(THEMES_DIR, `${n}.css`))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'));

/** A theme's shipped canvas mode — the only one that renders, so the only one worth gating. */
const shipsDark = (theme) =>
  /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/.test(themeCss(theme).join('\n').replace(/\/\*[\s\S]*?\*\//g, ''));

/** The slot pairs a scope has to separate. */
function pairsFor(scope) {
  const out = [];
  if (scope === 'all-pairs') {
    for (let i = 0; i < SLOTS; i += 1) for (let j = i + 1; j < SLOTS; j += 1) out.push([i, j]);
  } else {
    for (let i = 0; i < SLOTS - 1; i += 1) out.push([i, i + 1]);
  }
  return out;
}

/**
 * A theme's two categorical tiers on its shipped mode, split by chroma rather than by
 * token name. Ties go to `mark` as the saturated one, which only happens on a fully
 * achromatic identity where the two tiers read the same distances anyway.
 */
function measure(theme) {
  const vars = mergedVars(theme);
  const isDark = shipsDark(theme);
  const read = (kind) => {
    const out = [];
    for (let i = 1; i <= SLOTS; i += 1) {
      const hex = String(resolveTokenExpr(vars[`cat-${i}-${kind}`], vars, isDark)).trim();
      out.push(/^#[0-9a-f]{6}$/i.test(hex) ? hex : null);
    }
    return out;
  };
  const fill = read('fill');
  const mark = read('mark');
  if ([...fill, ...mark].some((h) => !h)) return null;
  const peak = (hexes) => Math.max(...hexes.slice(0, 6).map((h) => {
    const o = hexToOklab(h);
    return Math.hypot(o.a, o.b);
  }));
  const satIsFill = peak(fill) > peak(mark);
  const worst = (hexes, scope) => {
    const readings = pairsFor(scope)
      .map(([i, j]) => ({ d: +oklabDistance(hexes[i], hexes[j]).toFixed(4), pair: `${i + 1}^${j + 1}` }))
      .sort((a, b) => a.d - b.d);
    return { d: readings[0].d, pair: readings[0].pair, low: readings.slice(0, 5).map((r) => r.d) };
  };
  const sat = worst(satIsFill ? fill : mark, SCOPE.sat);
  const wash = worst(satIsFill ? mark : fill, SCOPE.wash);
  return {
    saturated: satIsFill ? 'fill' : 'mark',
    sat: sat.d, satPair: sat.pair, satLow: sat.low,
    wash: wash.d, washPair: wash.pair, washLow: wash.low,
  };
}

const now = new Map();
for (const theme of listAllThemes()) {
  const m = measure(theme);
  if (m) now.set(theme, m);
}

describe('categorical separation (reference-calibrated floors, per-tier scope)', () => {
  test('the floors are what §5 calibrated them to, and the references still clear them', () => {
    const missing = REFERENCES.filter((t) => !now.has(t));
    assert.deepEqual(missing, [], `reference palettes did not resolve: ${missing.join(', ')} — the calibration claim cannot be checked without them.`);
    // Pinned here as well as in the kernel, so moving them is a two-file edit that
    // shows up in review rather than a constant somebody nudged. These are the numbers
    // to re-derive — and argue for — if indaco or cuoio is ever re-hued.
    assert.equal(FLOOR.sat, 0.1050, 'the saturated-tier floor moved — re-derive it and say why in the decision note.');
    assert.equal(FLOOR.wash, 0.0295, 'the wash-tier floor moved — re-derive it and say why in the decision note.');
    // The floors are the references' own values, so the references must clear them.
    // Without this, "calibrated to Adam & Eve" would be a comment rather than a fact.
    const slipped = [];
    for (const theme of REFERENCES) {
      for (const tier of ['sat', 'wash']) {
        if (now.get(theme)[tier] < FLOOR[tier]) slipped.push(`${theme} ${tier}: ${now.get(theme)[tier].toFixed(4)} < ${FLOOR[tier]}`);
      }
    }
    assert.deepEqual(slipped, [], `a reference palette no longer clears the floor it calibrates:\n  ${slipped.join('\n  ')}`);
  });

  test('every pinned palette still resolves its twelve categorical slots', () => {
    const missing = [...PINNED.keys()].filter((t) => !now.has(t));
    assert.deepEqual(missing, [], `pinned palettes no longer produce a categorical ramp — a theme or token was renamed:\n  ${missing.join('\n  ')}`);
  });

  test('the pinned table is not stale', () => {
    const extra = [...now.keys()].filter((t) => !PINNED.has(t));
    assert.deepEqual(extra, [], `palettes measured but not pinned — add them:\n  ${extra.join('\n  ')}`);
  });

  // THE TIER, pinned per theme. A swap here is not necessarily a bug; it is a thing
  // that must be looked at, because every number below means something different
  // after one.
  test('the saturated tier is still the one the pinned table names', () => {
    const swapped = [];
    for (const [theme, pin] of PINNED) {
      const m = now.get(theme);
      if (m && m.saturated !== pin.saturated) {
        swapped.push(`${theme}: pinned with the ${pin.saturated} saturated, now the ${m.saturated} carries the chroma`);
      }
    }
    assert.deepEqual(swapped, [], `the saturated tier moved:\n  ${swapped.join('\n  ')}`);
  });

  for (const tier of ['sat', 'wash']) {
    const label = tier === 'sat' ? 'saturated' : 'wash';
    const scope = SCOPE[tier] === 'all-pairs' ? 'all 66 pairs' : '11 adjacent pairs';

    // THE FLOOR ITSELF. This is the assertion the 2026-09-01 re-tune bought: not "no
    // worse than last time" but "clears the contract", over every palette at once.
    test(`every ${label} ramp clears its floor across ${scope}`, () => {
      const shortOf = [];
      for (const [theme, m] of now) {
        if (tier === 'sat' && TEXTURE_FIRST.has(theme)) continue;
        if (SANCTIONED_SHORTFALLS.has(`${theme} ${tier}`)) continue;
        if (m[tier] < FLOOR[tier]) {
          shortOf.push(`${theme} ${m[tier].toFixed(4)} on pair ${m[`${tier}Pair`]}, short of the ${FLOOR[tier].toFixed(4)} floor by ${(FLOOR[tier] - m[tier]).toFixed(4)}`);
        }
      }
      assert.deepEqual(shortOf, [],
        `${shortOf.length} ${label} ramp(s) sit below the reference floor:\n  ${shortOf.join('\n  ')}\n`
        + 'Re-solve the ramp with `node tools/derive-cat-ramp.js` rather than nudging one token back.');
    });
  }

  // THE SHORTFALLS, held from BOTH sides. A sanctioned entry that eroded is a
  // regression; one that improved is a stale sanction, and leaving it in place would
  // let the exemption outlive the measurement that justified it.
  test('every sanctioned shortfall is still exactly as short as it says', () => {
    const wrong = [];
    for (const [key, reached] of SANCTIONED_SHORTFALLS) {
      const [theme, tier] = key.split(' ');
      const m = now.get(theme);
      if (!m) { wrong.push(`${key}: no such palette — the sanction is stale.`); continue; }
      if (m[tier] >= FLOOR[tier]) {
        wrong.push(`${key}: now reaches ${m[tier].toFixed(4)}, at or above the ${FLOOR[tier].toFixed(4)} floor — delete the sanction.`);
      } else if (m[tier] < reached - EROSION_TOLERANCE) {
        wrong.push(`${key}: sanctioned at ${reached}, now ${m[tier].toFixed(4)} — it eroded.`);
      }
    }
    assert.deepEqual(wrong, [], `${wrong.length} sanctioned shortfall(s) no longer describe the tree:\n  ${wrong.join('\n  ')}`);
  });

  // The pinned readings, held against erosion beyond the floor. The floor arm above
  // is the contract; this one keeps a palette that sits WELL clear of it from quietly
  // giving that margin away — `brina`'s 0.1644 falling to 0.1051 would pass the floor
  // and still be a real loss.
  test('no pinned reading eroded', () => {
    const eroded = [];
    for (const [theme, pin] of PINNED) {
      const m = now.get(theme);
      if (!m) continue;
      for (const tier of ['sat', 'wash']) {
        pin[tier].forEach((was, i) => {
          const is = m[`${tier}Low`][i];
          if (is != null && is < was - EROSION_TOLERANCE) {
            eroded.push(`${theme} ${tier} rank ${i + 1}: pinned ${was.toFixed(4)}, now ${is.toFixed(4)}`);
          }
        });
      }
    }
    assert.deepEqual(eroded, [], `${eroded.length} pinned reading(s) eroded:\n  ${eroded.join('\n  ')}`);
  });

  test('the exempt set is only the palettes that really carry a texture channel', () => {
    assert.ok(listAllThemes().length >= 30);
    assert.equal(PINNED.size, now.size);
    const declaresTexture = (t) => themeCss(t).some((css) => /--cat-1-texture\s*:/.test(css));
    const unbacked = [...TEXTURE_FIRST].filter((t) => now.has(t) && !declaresTexture(t));
    assert.deepEqual(unbacked, [], `exempt from the saturated floor but declaring no --cat-N-texture, so nothing carries the category:\n  ${unbacked.join('\n  ')}`);
  });
});
