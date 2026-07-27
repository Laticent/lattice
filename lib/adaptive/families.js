/**
 * Adaptive box-families — the SINGLE source of truth for the four structural
 * families a component reflows across (engineering/decisions/2026-06-18-
 * component-adaptive-sizing.md).
 *
 * "Size" splits into two independent problems:
 *   · SCALE     — type/spacing grows with the slide. Continuous, already solved
 *                 by the cqi token system (anchored to the slide via --_sec-1cqi).
 *   · STRUCTURE — 2-col → 1-col, rail stacks, drop-the-tertiary. A *step*, so it
 *                 is bucketed into the four families below and triggered by a
 *                 box-local `@container` aspect query.
 *
 * A component queries the nearest container named `lattice` (the engine names the
 * `section` that; a split/grid Cell can name itself the same so a NESTED
 * component resolves against ITS cell, not the deck). The query is on
 * aspect-ratio because that is what distinguishes a portrait deck AND a narrow
 * nested cell from a wide slide — inline-size alone can't (a 1080-wide portrait
 * slide is wider than a 960-wide 4:3 landscape one).
 *
 * `@container` conditions CANNOT read `var()`, so the numeric boundaries must be
 * written literally in each component's CSS. This module is the canonical list;
 * `test/unit/adaptive/families.test.js` asserts every piloted component's CSS
 * only uses these exact boundaries, so they can never silently drift.
 *
 * MIND THE TWO LISTS. `BOUNDARIES` is what JS classifies (the DECK box);
 * `CSS_BOUNDARIES` is what the CSS literals must use (the container's CONTENT
 * box, which is proportionally wider). They are the same bands measured two
 * ways, and using one where the other belongs is #1218 — see the long note on
 * CSS_BOUNDARIES below.
 */

// The four families, widest-aspect first. `min` is exclusive, `max` inclusive,
// matching the `(aspect-ratio > min) and (aspect-ratio <= max)` CSS form.
const FAMILIES = Object.freeze([
  { name: 'wide',   min: 1.05, max: Infinity, intent: 'horizontal — side-by-side, multi-column' },
  { name: 'square', min: 0.9,  max: 1.05,     intent: 'balanced — 2×2 grids, 2-up' },
  { name: 'tall',   min: 0.5,  max: 0.9,      intent: 'vertical-leaning — 1–2 columns, paired rows' },
  { name: 'strip',  min: 0,    max: 0.5,      intent: 'single-column stream, biggest type, shed tertiary' },
]);

const FAMILY_NAMES = Object.freeze(FAMILIES.map((f) => f.name));

// The DECK-aspect boundaries — what `familyFor()` classifies in JS, from the
// geometry (`lib/engine/css.js orientationFor({width, height})`).
const BOUNDARIES = Object.freeze([0.5, 0.9, 1.05]);

// ── The CSS boundaries are DIFFERENT NUMBERS FOR THE SAME BANDS (#1218) ───────
//
// These two lists describe one model measured two ways, and conflating them was
// a live defect: a 1080x1080 deck classified `square` in JS while every
// `@container lattice (aspect-ratio <= 1.05)` rule in the library — 18 files —
// silently did NOT match, so the whole square tier was inert on square decks.
//
// WHY they differ. `section` is `container-type: size`, and a container query
// evaluates the container's CONTENT box, not its border box. The section carries
// asymmetric padding (more vertical than horizontal), so its content box is
// proportionally WIDER than the deck. Measured, rendering one deck per registered
// `@size` through the emulator:
//
//     size                deck aspect    content aspect   family
//     landscape (hd)            1.778             2.148   wide
//     square                    1.000             1.078   square   ← 1.078 > 1.05
//     portrait, 4:5             0.800             0.831   tall
//     story, reel, 9:16         0.563             0.557   tall
//     mobile                    0.462             0.448   strip
//
// Only `square` crossed a boundary: its band is 0.15 wide and the drift there is
// ~+0.078, while `tall`'s band is 0.4 wide and absorbs its +0.031. That is why
// portrait always worked and square never did.
//
// WHY NOT A FORMULA. The drift is not a clean function of deck aspect. Vertical
// padding is `cqi` (width-derived) but resolves against the ICB, which is the
// EXPORT geometry while the section box may be a scaled CSS size — landscape's
// `5cqi` side padding is 96px on a 1280px box, i.e. 7.5% of the box, not 5%. Slide
// chrome moves it too (a footer-less title slide measures 1.0435 where a footered
// one measures 1.069). A closed-form conversion would encode all of that and
// re-break the moment any of it changed.
//
// WHY FIXED NUMBERS ARE NEVERTHELESS EXACT. `size:` must name a REGISTERED
// `@size` (the emulator hard-errors on an unknown one), so the set of authorable
// deck aspects is finite and enumerable. Boundaries placed in the measured GAPS
// are therefore correct for every deck that can actually be authored — and
// `tools/check-adaptive-families.js` renders every registered `@size` and asserts
// the CSS's own verdict matches `familyFor()`, so a new `@size` (a theme may add
// one) or a padding change fails the gate instead of silently disagreeing.
//
// Each CSS boundary is placed at the MIDPOINT of its measured gap, so drift in
// either direction has maximum room. Measured across all 14 registered @sizes by
// tools/check-adaptive-families.js (content-box aspects shown):
//
//     boundary        gap between                              deck   css
//     strip | tall    mobile 0.453 .. story 0.559               0.5   0.5
//     tall  | square  portrait/4:5 0.819 .. square 1.049        0.9   0.93
//     square| wide    square 1.049 .. standard(4:3) 1.467      1.05   1.25
//
// `standard` is why this matters: at 4:3 its content box reads 1.467, so a
// square|wide boundary of 1.4 would have sat just 0.067 away from a real deck
// size. 1.25 leaves ~0.2 on both sides.
const CSS_BOUNDARIES = Object.freeze([0.5, 0.93, 1.25]);

// Deck boundary → its CSS counterpart, positionally. Used by familyQuery and by
// the drift guard so neither hard-codes the mapping a second time.
const DECK_TO_CSS_BOUNDARY = Object.freeze(
  Object.fromEntries(BOUNDARIES.map((b, i) => [b, CSS_BOUNDARIES[i]])),
);

/**
 * The `@container` prelude for a family, e.g.
 *   familyQuery('tall') → '@container lattice (aspect-ratio > 0.5) and (aspect-ratio <= 0.95)'
 * Authoring helper / documentation — kept in sync with the literal CSS by the test.
 */
function familyQuery(name, container = 'lattice') {
  const f = FAMILIES.find((x) => x.name === name);
  if (!f) throw new Error(`unknown family: ${name}`);
  // CSS_BOUNDARIES, not the deck numbers: a container query measures the
  // container's CONTENT box, which is proportionally wider than the deck (#1218).
  const parts = [];
  if (f.min > 0) parts.push(`(aspect-ratio > ${DECK_TO_CSS_BOUNDARY[f.min]})`);
  if (f.max !== Infinity) parts.push(`(aspect-ratio <= ${DECK_TO_CSS_BOUNDARY[f.max]})`);
  return `@container ${container} ${parts.join(' and ') || '(aspect-ratio > 0)'}`;
}

/** Classify a width/height (or aspect) into a family name — mirrors the CSS. */
function familyFor(aspect) {
  for (const f of FAMILIES) if (aspect > f.min && aspect <= f.max) return f.name;
  return 'strip';
}

/** Map the legacy 2-value `orientation` to the families it covers (derivation). */
const ORIENTATION_TO_FAMILIES = Object.freeze({
  landscape: Object.freeze(['wide', 'square']),
  portrait: Object.freeze(['tall', 'strip']),
});

// The 3-value deck orientation (landscape · square · portrait) each family maps
// to. This is the SINGLE source both the engine's server-side stamp
// (lib/engine/css.js orientationFor) and the runtime (lib/runtime/index.js
// stampOrientation) derive from, so `data-orientation` and `data-family` can
// never disagree (they used to: orientation's square boundary was 0.95, the
// family's is 0.9 — a box at 0.9–0.95 was portrait to the components but square
// to the Frame). See 2026-06-21-reflow-as-form-capability.md §7 (M1).
const FAMILY_TO_ORIENTATION = Object.freeze({
  wide: 'landscape',
  square: 'square',
  tall: 'portrait',
  strip: 'portrait',
});

/** The deck orientation (landscape|square|portrait) a box's aspect maps to,
 *  derived from its family — the one classifier the engine + runtime share. */
function orientationFor(aspect) {
  return FAMILY_TO_ORIENTATION[familyFor(aspect)];
}

module.exports = {
  FAMILIES,
  FAMILY_NAMES,
  BOUNDARIES,
  CSS_BOUNDARIES,
  DECK_TO_CSS_BOUNDARY,
  familyQuery,
  familyFor,
  ORIENTATION_TO_FAMILIES,
  FAMILY_TO_ORIENTATION,
  orientationFor,
};
