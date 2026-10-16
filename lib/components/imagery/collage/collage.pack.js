/**
 * Collage packing — Lattice's side of the `collage` layout. The search itself is the `tree`
 * strategy of @laticent/mosaico (docs/src/lib/mosaico); this file holds what is Lattice's: the
 * stage shapes, the gutter and stretch pinned to collage.styles.css, the bleed weights, the
 * even-grid fallback, and the result shape collage.transform.js emits as CSS grid.
 *
 * Given 1 to MAX_PHOTOS photo aspect ratios (width / height), mosaico finds the tightest way to
 * cut a box into rows and columns with straight cuts (a "guillotine" layout) so that every photo
 * gets a rectangle of its own shape. No DOM, no fs: the CLI build and the browser preview call
 * the same function, so both pick the same layout (HARD RULE #1).
 *
 * Two orders (spec section 4):
 *   - `free`    (default) the search may reorder photos; only where a tile sits changes.
 *               Written order stays the DOM, tab and `_focus: item N` order — the caller
 *               places each photo by the `areas[i]` returned for photo i.
 *   - `ordered` the same search restricted to splits whose left part is a prefix of the
 *               written order, so photos read left to right, top to bottom as written.
 *
 * Two fits:
 *   - `tight` (default) never crops. A leftover shape becomes a matte border.
 *   - `fill`  may stretch the layout up to `fillMax` (8%) so it closes the empty space; the
 *             CSS cover crop absorbs the stretch.
 *
 * The search is exponential, so more than MAX_PHOTOS photos is refused and returns the even
 * grid (a Playground preview that re-renders while someone pastes a seventh photo must not
 * hang the tab). Output is deterministic: same input, same layout, byte for byte, and the same
 * bytes this file returned before the search moved into mosaico (test/unit/components/
 * collage-golden.test.js).
 *
 * See engineering/decisions/2026-10-11-collage-component.md and 2026-10-16-mosaico-layout-library.md.
 */

const { pack, toGrid, MAX_TREE_ITEMS } = require('@laticent/mosaico');

const MAX_PHOTOS = MAX_TREE_ITEMS;
const MIN_PHOTOS = 1;
// Both pinned to collage.styles.css by test/unit/components/collage-pack.test.js.
const FILL_MAX = 0.08;       // a `fill` collage may stretch the layout by at most 8%. MUST equal --collage-snap
                             // under `section.collage.fill` in collage.styles.css.
const DEFAULT_GAP = 0.012;   // gutter as a fraction of the stage height. MUST equal --collage-gap-ratio in
                             // collage.styles.css.
// A bleed collage stretches the grid to the slide, so what a layout leaves empty is cropped off every
// photo. Empty space costs more there, and a small tile costs more too, so the cut is not bought with
// a sliver of a photo. Swept on 300 random sets of 4-6 photos across six canvases: against the plain
// weights (1, 1.5, floor 0.4) mean crop falls from 9-11% to 3.5-4.7% and the 95th percentile from
// 24-31% to 10-16%; the smallest tile stays at least 15% of the largest in 95% of sets (24% before).
const BLEED_WEIGHTS = Object.freeze({ empty: 4, smallTile: 5, smallTileFloor: 0.2 });

// Stage (the box the collage may fill) aspect ratios, width / height. The collage only uses
// this to STEER which layout wins; the CSS fits the grid to the real container, so a wrong
// estimate costs a little matte and can never overflow. First values, to be tuned against a
// real render in visual review. `beside` = text column left, photos right. `bleed` is the whole
// slide (the photos run edge to edge, with no header, footer or page number), so its stage is the
// slide itself. The table holds 16:9, 1:1 and 9:16 for a caller that cannot measure the slide, and a
// caller that can (the CLI knows the deck's size, the live path measures the section) passes the real
// aspect as `slideAspect`, which wins. The bleed grid is stretched to the slide, so whatever the
// layout leaves empty becomes crop at each photo's edges: that is `empty` in the result. The
// BLEED_WEIGHTS above make the packer pay for it. Measured numbers: `engineering/decisions/2026-10-11-collage-component.md` §11.
const STAGE_ASPECT = Object.freeze({
  landscape: Object.freeze({ beside: 1.41, above: 3.4, bleed: 16 / 9 }),
  square: Object.freeze({ beside: 1.0, above: 1.7, bleed: 1.0 }),
  portrait: Object.freeze({ beside: 0.62, above: 1.0, bleed: 9 / 16 }),
});

const SLIDE_ASPECT_MIN = 0.3;
const SLIDE_ASPECT_MAX = 4;

function stageAspectEstimate({ orientation = 'landscape', composition = 'beside', slideAspect } = {}) {
  // A bleed collage fills the slide, so the slide's own aspect is the stage. Anything outside a sane
  // range is a bad measurement (a hidden or collapsed section), not a canvas: fall back to the table.
  if (composition === 'bleed' && Number.isFinite(slideAspect) && slideAspect >= SLIDE_ASPECT_MIN && slideAspect <= SLIDE_ASPECT_MAX) return slideAspect;
  const row = STAGE_ASPECT[orientation] || STAGE_ASPECT.landscape;
  return row[composition] || row.beside;
}

function evenGrid(n, F, why) {
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  const areas = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols) + 1, c = (i % cols) + 1;
    areas.push([r, c, r + 1, c + 1]);
  }
  return {
    fallback: why, n, ar: F, cols: new Array(cols).fill(1), rows: new Array(rows).fill(1), areas,
    empty: 0, crop: 0, ratio: 1,
  };
}

/**
 * @param {number[]} aspects  one width/height ratio per photo, in written order
 * @param {object}   [opts]
 * @param {number}   [opts.stageAspect]  aspect of the box the collage may fill (default landscape/beside)
 * @param {'free'|'ordered'} [opts.order='free']
 * @param {'tight'|'fill'}   [opts.fit='tight']
 * @param {number}   [opts.gap]    gutter as a fraction of stage height
 * @param {boolean}  [opts.bleed]  the photos fill the slide, so empty space is crop: weigh it more (see BLEED_WEIGHTS)
 * @param {number}   [opts.hero]   index of the photo that must hold the largest tile, or -1
 * @returns {{fallback:(string|false), n:number, ar:number, cols:number[], rows:number[],
 *            areas:number[][], empty:number, crop:number, ratio:number, tree?:string}}
 *   `areas[i]` is [rowStart, colStart, rowEnd, colEnd] (1-based grid lines, end exclusive)
 *   for photo i in written order. `cols`/`rows` are track sizes in stage-height units; the
 *   caller emits them as `minmax(0, Nfr)`. `ar` is the layout's natural width/height.
 */
function packCollage(aspects, opts = {}) {
  const F = Number.isFinite(opts.stageAspect) && opts.stageAspect > 0 ? opts.stageAspect : stageAspectEstimate();
  const fit = opts.fit === 'fill' ? 'fill' : 'tight';
  const n = Array.isArray(aspects) ? aspects.length : 0;

  if (n < MIN_PHOTOS) return evenGrid(0, F, 'empty');
  if (n > MAX_PHOTOS) return evenGrid(n, F, 'too-many');
  // Numbers only: anything else is an unreadable photo (1:1), as it always was here.
  const res = pack(aspects.map((v) => (typeof v === 'number' ? v : NaN)), { aspect: F }, {
    order: opts.order === 'ordered' ? 'ordered' : 'free',
    fit,
    stretch: FILL_MAX,
    gap: Number.isFinite(opts.gap) && opts.gap >= 0 ? opts.gap : DEFAULT_GAP,
    hero: Number.isInteger(opts.hero) ? opts.hero : -1,
    weights: opts.bleed === true ? BLEED_WEIGHTS : undefined,
  });
  if (!res.ok) return evenGrid(n, F, res.reason);
  // One photo has one layout; it has always reported no crop, even under `fill`.
  if (n === 1) {
    return { fallback: false, n, ar: res.aspect, cols: [res.aspect], rows: [1], areas: [[1, 1, 2, 2]], empty: res.empty, crop: 0, ratio: 1, tree: '0' };
  }
  const { cols, rows, areas } = toGrid(res);
  return {
    fallback: false, n, ar: res.aspect, cols, rows, areas,
    empty: res.empty, crop: res.crop, ratio: res.ratio, tree: res.arrangement,
  };
}

module.exports = {
  MAX_PHOTOS, FILL_MAX, DEFAULT_GAP, STAGE_ASPECT, stageAspectEstimate, packCollage,
  fallbackGrid: evenGrid,
};
