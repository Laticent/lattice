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

// BESPOKE raw-concrete texture tiles for the `concrete` theme — the categorical
// texture vocabulary drawn from cast concrete + formwork rather than generic
// hatching, so the pattern reads as "themed" to the brand. One WORD across the
// texture layer: "texture" (the channel) → "family" (this generic/concrete array)
// → "tile" (one 8×8 pattern). ("motif" is retired here — see
// engineering/textures.md; the finish subsystem's unrelated "motif" copy stays.)
// Same 8×8 tile, same stroke/fill
// contract (shapes carry NO fill/stroke of their own). Ordered so the common
// first-6 differ maximally: board-planks / diagonal shutter / tie-holes / fluted
// ribs / herringbone / waffle — line-orientation, dot-size, and block forms all
// distinct before any near-duplicate lands in slots 7-12.
const CONCRETE_GEOMETRIES = [
  { mode: 'stroke', svg: '<path d="M0 2.5 H8 M0 5.5 H8"/>' },                          // 1 board-form (plank lines)
  { mode: 'stroke', svg: '<path d="M0 8 L8 0"/>' },                                    // 2 shutter diagonal /
  { mode: 'fill',   svg: '<circle cx="4" cy="4" r="1.5"/>' },                          // 3 form-tie holes (sparse)
  { mode: 'fill',   svg: '<rect x="1.2" y="0" width="1.5" height="8"/><rect x="5.3" y="0" width="1.5" height="8"/>' }, // 4 fluted ribs
  { mode: 'stroke', svg: '<path d="M0 6 L4 2 L8 6"/>' },                               // 5 herringbone chevron
  { mode: 'fill',   svg: '<rect x="0" y="0" width="4" height="4"/><rect x="4" y="4" width="4" height="4"/>' }, // 6 waffle coffer
  { mode: 'stroke', svg: '<path d="M0 0 L8 8"/>' },                                    // 7 shutter diagonal \
  { mode: 'stroke', svg: '<path d="M0 4 H8 M4 0 V8"/>' },                              // 8 rebar grid (mesh)
  { mode: 'stroke', svg: '<path d="M0 8 L8 0 M0 0 L8 8"/>' },                          // 9 cross-hatch scoring
  { mode: 'stroke', svg: '<path d="M0 4 H8" stroke-dasharray="2 2"/>' },               // 10 control joints (dashed)
  { mode: 'fill',   svg: '<circle cx="2" cy="2.4" r="1"/><circle cx="6.1" cy="1.9" r="0.7"/><circle cx="3.3" cy="6" r="1.2"/><circle cx="6.4" cy="5.9" r="0.8"/>' }, // 11 aggregate speckle (irregular)
  { mode: 'fill',   svg: '<circle cx="2" cy="2" r="0.6"/><circle cx="6" cy="2" r="0.6"/><circle cx="4" cy="4" r="0.6"/><circle cx="2" cy="6" r="0.6"/><circle cx="6" cy="6" r="0.6"/>' }, // 12 bush-hammered stipple (fine)
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

// concrete theme — near-monochrome (light chips are near-identical greys; dark
// chips carry muted material tints). MUST mirror concrete's --cat-N-fill ramps
// (themes/concrete.css). Light chips get a subtle mid-grey ink so the dark labels
// stay dominant; dark chips get a light ink to read on the muted tints.
const CONCRETE_FILLS_LIGHT = [
  '#DFDDDD', '#DDDFDE', '#DDDEDF', '#DFDEDD', '#DFDDDE', '#DDDFDF',
  '#DFDFDD', '#DDDFDD', '#DDDDDF', '#DFDDDF', '#DEDFDD', '#DEDDDF',
];
const CONCRETE_FILLS_DARK = [
  '#6A4E4E', '#4F685C', '#4F5C68', '#685C4F', '#684F5C', '#4F6868',
  '#676751', '#516751', '#515167', '#675167', '#5C6751', '#5C5167',
];
const CONCRETE_INK_LIGHT = '#8f8f8c'; // subtle warm-grey — texture whispers under dark labels
const CONCRETE_INK_DARK = '#EDEBE8';  // soft off-white — reads on the muted dark chips

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

// SCHEME-AWARE pattern set — 12 patterns whose rect fill and overlay ink flip with
// the deck `color-scheme` via `light-dark()` in a CSS rule (NOT a presentation
// attribute — those don't honor CSS functions). For a theme whose dark mode keeps
// categorical chips DARK (onyx: pure-black↔pure-white; concrete: near-monochrome).
//
// GRACEFUL DEGRADATION: the CSS class carries ONLY the light-dark() COLOR flip;
// every static attribute AND a LITERAL light-mode fallback live in presentation
// attributes on the rect/g. A modern engine lets the class win and flips the
// polarity; a renderer WITHOUT light-dark() (old iOS/WebKit) drops the class
// declaration and falls back to the presentation attribute — a light chip + light-
// mode ink, NEVER SVG's default black (the all-black-pie regression the literal
// a11y sets were built to avoid). The flip itself is verified in Chromium; iOS
// Safari remains UNVERIFIED, but now degrades safely instead of failing black.
//
// LIMITATION: the pattern resolves `color-scheme` from :root (it's page-level, in
// <defs>, outside any <section>), so the polarity tracks the DECK-WIDE scheme. A
// per-slide `<!-- _class: dark/light -->` override flips that slide's canvas +
// labels but NOT this texture — use a deck-wide scheme (theme onyx / onyx-dark)
// for correct polarity. Kept SEPARATE from the literal sets so the shipped a11y
// textures stay byte-for-byte unchanged.
function schemeAwarePatternSet(prefix, lightFills, darkFills, lightInk, darkInk, geometries = GEOMETRIES) {
  const rules = [];
  const patterns = geometries.slice(0, lightFills.length).map(({ mode, svg }, i) => {
    const n = i + 1;
    rules.push(`.${prefix}-r${n}{fill:light-dark(${lightFills[i]},${darkFills[i]})}`);
    rules.push(mode === 'fill'
      ? `.${prefix}-i${n}{fill:light-dark(${lightInk},${darkInk})}`
      : `.${prefix}-i${n}{stroke:light-dark(${lightInk},${darkInk})}`);
    const inkAttr = mode === 'fill'
      ? `fill="${lightInk}" fill-opacity="0.40"`
      : `fill="none" stroke="${lightInk}" stroke-opacity="0.45" stroke-width="1" stroke-linecap="square"`;
    return (
      `<pattern id="${prefix}-${n}" patternUnits="userSpaceOnUse" width="8" height="8">` +
      `<rect class="${prefix}-r${n}" fill="${lightFills[i]}" width="8" height="8"/>` +
      `<g class="${prefix}-i${n}" ${inkAttr}>${svg}</g>` +
      `</pattern>`
    );
  }).join('');
  return `<style>${rules.join('')}</style>${patterns}`;
}

function texturePatternDefs() {
  const cat = patternSet('latt-a11y-tex', CAT_FILLS, CAT_INK);
  const chart = patternSet('latt-a11y-chart-tex', CHART_FILLS, CHART_INK);
  // onyx: scheme-flipping categorical set — light chips + dark ink (light mode)
  // ⟷ dark chips + light ink (dark mode). NOTE onyx's LIGHT ink is CAT_INK_ONYX_LIGHT
  // (#8a8a8a, a mid-gray — NOT the a11y CAT_INK #1a1a1a), so the texture whispers under
  // the black labels; darkInk=CAT_INK_DARK (light). onyx shares the GENERIC family with
  // the a11y set and diverges only in this ink + the dark ramp.
  const onyx = schemeAwarePatternSet('latt-onyx-tex', CAT_FILLS, CAT_FILLS_DARK, CAT_INK_ONYX_LIGHT, CAT_INK_DARK);
  // concrete: same scheme-flip, but the BESPOKE concrete family and concrete's own
  // ramp — near-white chips + dark ink (light) ⟷ muted-tint chips + light ink (dark).
  const concrete = schemeAwarePatternSet(
    'latt-concrete-tex', CONCRETE_FILLS_LIGHT, CONCRETE_FILLS_DARK,
    CONCRETE_INK_LIGHT, CONCRETE_INK_DARK, CONCRETE_GEOMETRIES,
  );
  return `<svg width="0" height="0" aria-hidden="true" style="position:absolute" class="latt-a11y-defs"><defs>${cat}${chart}${onyx}${concrete}</defs></svg>`;
}

module.exports = { texturePatternDefs };
