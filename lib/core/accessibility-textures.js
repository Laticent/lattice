/**
 * Accessibility (CVD) categorical TEXTURE patterns — the M1 mechanism from
 * engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
 *
 * Colour alone distinguishes only ~1-2 categories under dichromacy, so the
 * categorical cycle needs a non-colour channel: a distinct repeating texture
 * per slot. CSS cannot synthesise SVG pattern geometry, so this module emits a
 * shared `<defs>` of 12 `<pattern>`s that inline Mermaid/chart SVGs reference
 * via `fill: url(#latt-a11y-tex-N)`. The fill wiring lives in the a11y themes
 * (themes/a11y-base.css); these defs are emitted on every render (inert unless
 * an a11y-* theme references them), so picking `theme: a11y-*` just works.
 *
 * Each pattern paints the slot's colour (`var(--cat-N-fill)`, resolved at
 * :root — correct for the deck-wide light/dark scheme) THEN overlays a distinct
 * geometry in the paired ink at low opacity, so the texture reads without
 * burying label text and colour stays as a redundant channel. The defs are
 * injected once per page; this is the shared kernel both render paths call
 * (HARD RULE #1) — the owned engine wires it today, the runtime follows.
 *
 * Pure: no fs, no deps — bundles for the browser.
 */

// 12 distinct, low-density geometries (8×8 userSpace tile). Each entry declares
// whether its shapes are stroked (lines/outlines) or filled (solid dots/blocks)
// so the ink attributes are applied cleanly — the shape strings carry NO
// fill/stroke of their own. Order is chosen so ADJACENT slots differ maximally
// in orientation/shape, not just by one step.
const GEOMETRIES = [
  { mode: 'stroke', svg: '<path d="M0 8 L8 0"/>' },                                  // 1 diagonal /
  { mode: 'stroke', svg: '<path d="M0 0 L8 8"/>' },                                  // 2 diagonal \
  { mode: 'stroke', svg: '<path d="M0 4 H8"/>' },                                    // 3 horizontal
  { mode: 'stroke', svg: '<path d="M4 0 V8"/>' },                                    // 4 vertical
  { mode: 'fill',   svg: '<circle cx="4" cy="4" r="1.4"/>' },                        // 5 dots
  { mode: 'stroke', svg: '<path d="M0 8 L8 0 M0 0 L8 8"/>' },                        // 6 cross-hatch
  { mode: 'stroke', svg: '<path d="M0 4 H8 M4 0 V8"/>' },                            // 7 grid
  { mode: 'stroke', svg: '<path d="M0 2 H8 M0 6 H8" stroke-dasharray="2 2"/>' },     // 8 dashed rows
  { mode: 'stroke', svg: '<path d="M0 1 L4 7 L8 1"/>' },                             // 9 chevron
  { mode: 'stroke', svg: '<circle cx="4" cy="4" r="2.2"/>' },                        // 10 rings (outline)
  { mode: 'stroke', svg: '<path d="M2 0 V8 M6 0 V8" stroke-dasharray="2 2"/>' },     // 11 dashed cols
  { mode: 'fill',   svg: '<rect x="0" y="0" width="4" height="4"/><rect x="4" y="4" width="4" height="4"/>' }, // 12 checker
];

// Fixed greyscale ramps, LITERAL hex (no var, no CSS). MUST mirror the a11y
// theme's ramps in themes/a11y-base.css (--cat-N-fill / --chart-catN). They live
// here as literals on purpose — see texturePatternDefs() for why.
const CAT_FILLS = [
  '#e8e8e8', '#dedede', '#d5d5d5', '#cccccc', '#c3c3c3', '#bababa',
  '#b1b1b1', '#a8a8a8', '#a0a0a0', '#979797', '#8e8e8e', '#868686',
];
const CHART_FILLS = ['#2e2e2e', '#3b3b3b', '#484848', '#565656', '#656565', '#737373', '#838383', '#929292'];
const CAT_INK = '#1a1a1a';   // dark overlay ink — reads on the light categorical fills
const CHART_INK = '#f5f5f5'; // light overlay ink — reads on the deeper chart greys

// DARK categorical ramp — the inverse of CAT_FILLS, for a theme whose dark mode
// keeps categorical chips DARK (onyx: pure-black↔pure-white symmetry). MUST
// mirror onyx's dark --cat-N-fill ramp (themes/onyx.css). Overlay ink is light,
// like CHART_INK, so the geometry reads on the deep greys. Same literal-hex
// rationale as above — zero token-resolution dependency on any SVG renderer.
const CAT_FILLS_DARK = [
  '#2e2e2e', '#333333', '#383838', '#3d3d3d', '#424242', '#484848',
  '#4d4d4d', '#525252', '#585858', '#5d5d5d', '#636363', '#696969',
];
const CAT_INK_DARK = '#f5f5f5'; // light overlay ink — reads on the deep categorical greys
// onyx LIGHT-mode overlay ink — deliberately a MID grey, not near-black, so the
// texture whispers on the pale chips and the BLACK label text stays the dominant,
// easily-read mark (the a11y sets use near-black #1a1a1a because they have no such
// dark-text-on-chip constraint). Dark mode keeps the crisp light ink (CAT_INK_DARK).
const CAT_INK_ONYX_LIGHT = '#8a8a8a';

/**
 * The shared `<defs>` markup — TWO texture pattern sets:
 *   - `latt-a11y-tex-1..12`      the diagram/mermaid categorical cycle (light greys)
 *   - `latt-a11y-chart-tex-1..8` the native chart family (pie, funnel, …; deep greys)
 * Each pattern paints its slot's fill THEN overlays its geometry in a contrasting
 * ink at low opacity, so the texture reads without burying labels.
 *
 * The fills + ink are LITERAL HEX in presentation attributes — NOT `var(--token)`,
 * NOT a CSS `<style>`. The defs are injected once at PAGE level, outside any
 * `<section>`; resolving a token there proved fragile on real iOS Safari (the
 * `:root`→`:where(section)` relocation put the tokens out of reach, and `var()`
 * in a presentation attribute isn't honoured on older WebKit) — both rendered the
 * pie ALL BLACK (SVG's default fill) on devices we couldn't emulate here. Literal
 * hex has zero resolution dependency: it paints on every SVG renderer ever
 * shipped. The values mirror the a11y ramps in themes/a11y-base.css (the defs are
 * only ever referenced by the a11y-* themes, so fixed values are correct).
 */
function patternSet(prefix, fills, ink) {
  return GEOMETRIES.slice(0, fills.length).map(({ mode, svg }, i) => {
    const n = i + 1;
    const inkAttr = mode === 'fill'
      ? `fill="${ink}" fill-opacity="0.40"`
      : `fill="none" stroke="${ink}" stroke-opacity="0.45" stroke-width="1" stroke-linecap="square"`;
    return (
      `<pattern id="${prefix}-${n}" patternUnits="userSpaceOnUse" width="8" height="8">` +
      `<rect width="8" height="8" fill="${fills[i]}"/>` +
      `<g ${inkAttr}>${svg}</g>` +
      `</pattern>`
    );
  }).join('');
}

// SCHEME-AWARE pattern set — a SINGLE set of 12 patterns whose rect fill and
// overlay ink flip with the deck `color-scheme` via `light-dark()` in a CSS rule
// (NOT a presentation attribute — those don't honor CSS functions). For a theme
// whose dark mode keeps categorical chips DARK (onyx: pure-black↔pure-white).
// One class per slot carries the `light-dark()`; the classes live on elements
// INSIDE the page-level pattern, so their `color-scheme` resolves from :root
// (verified flipping in Chromium; iOS Safari is UNVERIFIED here — the literal
// a11y sets remain the belt-and-suspenders path for CVD themes). Kept SEPARATE
// from the literal sets so the shipped a11y textures are byte-for-byte unchanged.
function schemeAwarePatternSet(prefix, lightFills, darkFills, lightInk, darkInk) {
  const rules = [];
  const patterns = GEOMETRIES.slice(0, lightFills.length).map(({ mode, svg }, i) => {
    const n = i + 1;
    rules.push(`.${prefix}-r${n}{fill:light-dark(${lightFills[i]},${darkFills[i]})}`);
    rules.push(mode === 'fill'
      ? `.${prefix}-i${n}{fill:light-dark(${lightInk},${darkInk});fill-opacity:.40}`
      : `.${prefix}-i${n}{fill:none;stroke:light-dark(${lightInk},${darkInk});stroke-opacity:.45;stroke-width:1;stroke-linecap:square}`);
    return (
      `<pattern id="${prefix}-${n}" patternUnits="userSpaceOnUse" width="8" height="8">` +
      `<rect class="${prefix}-r${n}" width="8" height="8"/>` +
      `<g class="${prefix}-i${n}">${svg}</g>` +
      `</pattern>`
    );
  }).join('');
  return `<style>${rules.join('')}</style>${patterns}`;
}

function texturePatternDefs() {
  const cat = patternSet('latt-a11y-tex', CAT_FILLS, CAT_INK);
  const chart = patternSet('latt-a11y-chart-tex', CHART_FILLS, CHART_INK);
  // onyx: scheme-flipping categorical set — light chips + dark ink (light mode)
  // ⟷ dark chips + light ink (dark mode). lightInk=CAT_INK (dark), darkInk=CAT_INK_DARK (light).
  const onyx = schemeAwarePatternSet('latt-onyx-tex', CAT_FILLS, CAT_FILLS_DARK, CAT_INK_ONYX_LIGHT, CAT_INK_DARK);
  return `<svg width="0" height="0" aria-hidden="true" style="position:absolute" class="latt-a11y-defs"><defs>${cat}${chart}${onyx}</defs></svg>`;
}

module.exports = { texturePatternDefs };
