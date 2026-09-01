/**
 * Accessibility (CVD) categorical TEXTURE patterns — the M1 mechanism from
 * engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
 *
 * Color alone distinguishes only ~1-2 categories under dichromacy, so the
 * categorical cycle needs a non-color channel: a distinct repeating texture
 * per slot. CSS cannot synthesise SVG pattern geometry, so this module emits a
 * shared `<defs>` of 12 `<pattern>`s that inline Mermaid/chart SVGs reference
 * via `fill: url(#latt-a11y-tex-N)`. The fill wiring lives in the a11y themes
 * (themes/a11y-base.css); these defs are emitted on every render (inert unless
 * an a11y-* theme references them), so picking `theme: a11y-*` just works.
 *
 * Each pattern paints the slot's color (`var(--cat-N-fill)`, resolved at
 * :root — correct for the deck-wide light/dark scheme) THEN overlays a distinct
 * geometry in the paired ink at low opacity, so the texture reads without
 * burying label text and color stays as a redundant channel. The defs are
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

// Fixed grayscale ramps, LITERAL hex (no var, no CSS). MUST mirror the a11y
// theme's ramps in themes/a11y-base.css (--cat-N-fill / --chart-catN). They live
// here as literals on purpose — see texturePatternDefs() for why. The mirror is
// held by `test/unit/core/texture-mirror.test.js`: three of these four ramps are a
// theme's own values copied by hand, and nothing compared them until a categorical
// re-tune moved two of them (#1864).
const CAT_FILLS = [
  '#e8e8e8', '#dedede', '#d5d5d5', '#cccccc', '#c3c3c3', '#bababa',
  '#b1b1b1', '#a8a8a8', '#a0a0a0', '#979797', '#8e8e8e', '#868686',
];
const CHART_FILLS = ['#2e2e2e', '#3b3b3b', '#484848', '#565656', '#656565', '#737373', '#838383', '#929292'];
const CAT_INK = '#1a1a1a';   // dark overlay ink — reads on the light categorical fills
const CHART_INK = '#f5f5f5'; // light overlay ink — reads on the deeper chart grays

// DARK categorical ramp — the inverse of CAT_FILLS, for a theme whose dark mode
// keeps categorical chips DARK (onyx: pure-black↔pure-white symmetry). MUST
// mirror onyx's dark --cat-N-fill ramp (themes/onyx.css). Overlay ink is light,
// like CHART_INK, so the geometry reads on the deep grays. Same literal-hex
// rationale as above — zero token-resolution dependency on any SVG renderer.
const CAT_FILLS_DARK = [
  '#161616', '#1e1e1e', '#262626', '#2e2e2e', '#363636', '#3f3f3f',
  '#474747', '#505050', '#595959', '#636363', '#6c6c6c', '#757575',
];
const CAT_INK_DARK = '#f5f5f5'; // light overlay ink — reads on the deep categorical grays
// onyx LIGHT-mode overlay ink — deliberately a MID gray, not near-black, so the
// texture whispers on the pale chips and the BLACK label text stays the dominant,
// easily-read mark (the a11y sets use near-black #1a1a1a because they have no such
// dark-text-on-chip constraint). Dark mode keeps the crisp light ink (CAT_INK_DARK).
const CAT_INK_ONYX_LIGHT = '#8a8a8a';

// concrete theme — near-monochrome. Light chips are a LUMINANCE RAMP (they were
// twelve near-identical grays until the 2026-09-01 re-tune gave them §6's spread);
// dark chips carry muted material tints. MUST mirror concrete's --cat-N-fill ramps
// (themes/concrete.css) — `texture-mirror.test.js` fails if they drift.
const CONCRETE_FILLS_LIGHT = [
  '#FDFBFB', '#F0F2F1', '#E6E7E8', '#DDDCDB', '#D4D2D3', '#C7C9C9',
  '#BEBEBD', '#B3B5B3', '#AAAAAC', '#A2A0A2', '#979896', '#8F8E8F',
];
const CONCRETE_FILLS_DARK = [
  '#6A4E4E', '#4F685C', '#4F5C68', '#685C4F', '#684F5C', '#4F6868',
  '#676751', '#516751', '#515167', '#675167', '#5C6751', '#5C5167',
];
const CONCRETE_INK_LIGHT = '#8f8f8c'; // subtle warm-gray — texture whispers under dark labels
const CONCRETE_INK_DARK = '#EDEBE8';  // soft off-white — reads on the muted dark chips

/**
 * The shared `<defs>` markup — TWO texture pattern sets:
 *   - `latt-a11y-tex-1..12`      the diagram/mermaid categorical cycle (light grays)
 *   - `latt-a11y-chart-tex-1..8` the native chart family (pie, funnel, …; deep grays)
 * Each pattern paints its slot's fill THEN overlays its geometry in a contrasting
 * ink at low opacity, so the texture reads without burying labels.
 *
 * The fills + ink are LITERAL HEX in presentation attributes — NOT `var(--token)`,
 * NOT a CSS `<style>`. The defs are injected once at PAGE level, outside any
 * `<section>`; resolving a token there proved fragile on real iOS Safari (the
 * `:root`→`:where(section)` relocation put the tokens out of reach, and `var()`
 * in a presentation attribute isn't honored on older WebKit) — both rendered the
 * pie ALL BLACK (SVG's default fill) on devices we couldn't emulate here. Literal
 * hex has zero resolution dependency: it paints on every SVG renderer ever
 * shipped. The values mirror the a11y ramps in themes/a11y-base.css (the defs are
 * only ever referenced by the a11y-* themes, so fixed values are correct).
 */
function patternSet(prefix, fills, ink, geometries = GEOMETRIES) {
  return geometries.slice(0, fills.length).map(({ mode, svg }, i) => {
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
// DECK-WIDE BY CONSTRUCTION: the pattern resolves `color-scheme` from :root (it's
// page-level, in <defs>, outside any <section>), so THIS set's polarity tracks the
// deck-wide scheme. That is not a defect fixable in place — one <pattern> element
// paints identically at every reference, so it cannot render two polarities. A
// per-slide scheme override is served by the PINNED sets below, which the theme
// selects per section. This set stays the right default for the cases a static pin
// cannot express (`color-mode: system` / `inherited` — polarity known only at view
// time). Kept SEPARATE from the literal sets so the shipped a11y textures stay
// byte-for-byte unchanged. See #1323.
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

// The pattern sets this module can emit, in EMISSION ORDER, each keyed by the
// `url(#<prefix>-N)` id prefix a stylesheet references it by. The order is
// load-bearing: it is what the committed golden byte-lock pins
// (test/unit/core/accessibility-textures.test.js), so a set is appended, never
// inserted. Each value is a thunk because the whole point of the table is that a
// page builds only the sets it actually needs.
const TEXTURE_SETS = [
  ['latt-a11y-tex', () => patternSet('latt-a11y-tex', CAT_FILLS, CAT_INK)],
  ['latt-a11y-chart-tex', () => patternSet('latt-a11y-chart-tex', CHART_FILLS, CHART_INK)],
  // onyx: scheme-flipping categorical set — light chips + dark ink (light mode)
  // ⟷ dark chips + light ink (dark mode). NOTE onyx's LIGHT ink is CAT_INK_ONYX_LIGHT
  // (#8a8a8a, a mid-gray — NOT the a11y CAT_INK #1a1a1a), so the texture whispers under
  // the black labels; darkInk=CAT_INK_DARK (light). onyx shares the GENERIC family with
  // the a11y set and diverges only in this ink + the dark ramp.
  ['latt-onyx-tex', () => schemeAwarePatternSet(
    'latt-onyx-tex', CAT_FILLS, CAT_FILLS_DARK, CAT_INK_ONYX_LIGHT, CAT_INK_DARK,
  )],
  // concrete: same scheme-flip, but the BESPOKE concrete family and concrete's own
  // ramp — near-white chips + dark ink (light) ⟷ muted-tint chips + light ink (dark).
  ['latt-concrete-tex', () => schemeAwarePatternSet(
    'latt-concrete-tex', CONCRETE_FILLS_LIGHT, CONCRETE_FILLS_DARK,
    CONCRETE_INK_LIGHT, CONCRETE_INK_DARK, CONCRETE_GEOMETRIES,
  )],
  // PINNED sets — one polarity baked per pattern, literal hex, no light-dark().
  // A <pattern> paints the same wherever it is referenced, so a slide that PINS a
  // scheme (`_class: dark` / `light` / `color-mode: light`) cannot be served by the
  // scheme-aware sets above: those read :root's color-scheme, which the slide's own
  // class does not change. The theme points --cat-N-texture at these under the
  // pinning selector instead (themes/onyx.css, themes/concrete.css) — the same
  // universal-texture-channel move `section.print` already makes. Without them a
  // per-slide dark left light chips carrying light ink: unreadable node labels on
  // every textured palette (#1323).
  ['latt-onyx-tex-light', () => patternSet('latt-onyx-tex-light', CAT_FILLS, CAT_INK_ONYX_LIGHT)],
  ['latt-onyx-tex-dark', () => patternSet('latt-onyx-tex-dark', CAT_FILLS_DARK, CAT_INK_DARK)],
  ['latt-concrete-tex-light', () => patternSet(
    'latt-concrete-tex-light', CONCRETE_FILLS_LIGHT, CONCRETE_INK_LIGHT, CONCRETE_GEOMETRIES,
  )],
  ['latt-concrete-tex-dark', () => patternSet(
    'latt-concrete-tex-dark', CONCRETE_FILLS_DARK, CONCRETE_INK_DARK, CONCRETE_GEOMETRIES,
  )],
  // NOTE no a11y pinned set: that palette is MODE-INVARIANT by design (fixed hex
  // throughout, `:root:root{color-scheme:light}`), so its one literal set is already
  // correct under every pin. Its #1323 symptom had a different cause — the ink token
  // it inherited from onyx was a light-dark() pair — fixed in themes/a11y-base.css.
];

const TEXTURE_SET_PREFIXES = TEXTURE_SETS.map(([prefix]) => prefix);

/**
 * The set every Lattice document references no matter its theme.
 *
 * `lib/base/base.print-textures.css` re-points all 12 `section.print` slots at
 * `latt-a11y-tex-*` and ships inside the engine sheet, so this prefix is present
 * in ANY document carrying Lattice's CSS. That makes it a SENTINEL: a caller that
 * scanned a document and did not find it is not looking at the real stylesheet,
 * and must fall back to emitting everything rather than concluding "no textures
 * needed". See `documentTextureCss()` in lib/runtime/index.js.
 */
const TEXTURE_SENTINEL_PREFIX = 'latt-a11y-tex';

// ONE pass over the text, not one per prefix. The runtime calls this on every
// content pass — up to ~7 times a second while an author types — against an
// inlined engine sheet of ~1.7 MB, so eight separate `.test()` sweeps was eight
// times the work for the same answer.
//
// The captured prefix is everything before the trailing `-<digits>`, non-greedy
// so `#latt-onyx-tex-light-1` yields `latt-onyx-tex-light` rather than stopping
// at `latt-onyx-tex`. Unknown ids simply fail the table lookup.
const TEXTURE_REF_RE = /url\(\s*["']?#(latt-[a-z0-9-]*?)-\d/g;

/**
 * Which pattern sets does this CSS (or markup) actually reference?
 *
 * THE shared answer, called by BOTH emission sites — the emulator over the
 * assembled deck stylesheet, the runtime over the live document (HARD RULE #1).
 * A single kernel is the only durable way to make the two agree: they reach
 * their CSS by completely different routes (chain files on disk vs. the live
 * `<style>` text), and a second copy of this matcher would drift the first time
 * a set was added.
 *
 * Matches all three spellings a reference can take — `url(#x)`, `url("#x")`,
 * `url('#x')`. Our own themes write the bare form, but an author's CSS or inline
 * SVG may quote it, and a CSSOM round-trip (`cssRules[i].cssText`) adds quotes to
 * anything it re-serializes. Nothing in this repo reads CSS that way today; the
 * quoted branch is here for the author, not for a code path of ours.
 *
 * Returns the matched prefixes in TABLE order, so the answer is comparable as a
 * plain string against a previous injection's `data-latt-tex-sets`.
 */
function texturePrefixesReferencedIn(cssText) {
  if (typeof cssText !== 'string' || cssText.indexOf('#latt-') === -1) return [];
  const found = new Set();
  TEXTURE_REF_RE.lastIndex = 0;
  for (let m = TEXTURE_REF_RE.exec(cssText); m !== null; m = TEXTURE_REF_RE.exec(cssText)) {
    found.add(m[1]);
  }
  return TEXTURE_SET_PREFIXES.filter((prefix) => found.has(prefix));
}

/**
 * The shared `<defs>` markup for the requested pattern sets.
 *
 * `only` is a list of id prefixes — normally the return of
 * `texturePrefixesReferencedIn()` over everything that will be in the document.
 * Omit it (or pass a non-array) to emit EVERY set: that is the conservative
 * answer, and it is what a caller that cannot read the document's CSS must use.
 * Emitting a set nothing references is pure waste but never a visual change; NOT
 * emitting one something references is a blank fill. So the fallback is always
 * "emit more".
 *
 * The wrapper `<svg>` is emitted even when nothing is wanted: `.latt-a11y-defs`
 * is the marker both call sites use to find their own previous injection, and
 * `data-latt-tex-sets` records which sets that injection covers — so the runtime
 * can tell "already correct" from "the theme changed under me" without
 * re-serializing the element.
 */
function texturePatternDefs(only) {
  const wanted = Array.isArray(only)
    ? TEXTURE_SETS.filter(([prefix]) => only.includes(prefix))
    : TEXTURE_SETS;
  const defs = wanted.map(([, build]) => build()).join('');
  const sets = wanted.map(([prefix]) => prefix).join(' ');
  return `<svg width="0" height="0" aria-hidden="true" style="position:absolute" class="latt-a11y-defs" data-latt-tex-sets="${sets}"><defs>${defs}</defs></svg>`;
}

module.exports = {
  texturePatternDefs, texturePrefixesReferencedIn, TEXTURE_SET_PREFIXES, TEXTURE_SENTINEL_PREFIX,
  // Exported for `test/unit/core/texture-mirror.test.js` ONLY. These are hand-copied
  // mirrors of theme ramps (see their declarations); the test is what keeps the copy
  // honest, and it cannot read a module-private const. Nothing in the engine should
  // import them — read the tokens instead.
  MIRRORED_RAMPS: { CAT_FILLS, CAT_FILLS_DARK, CONCRETE_FILLS_LIGHT, CONCRETE_FILLS_DARK },
};
