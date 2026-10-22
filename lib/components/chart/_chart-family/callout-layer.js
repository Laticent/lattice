/**
 * callout-layer.js — what every chart that reads `@callout{…}` imports: one surface over the two halves
 * (design note engineering/decisions/2026-10-20-callout-placement.md § 10).
 *
 * `callout-core.js` is always here: lifting, the side, the placement choice (a key with no callout
 * uses it too), the stage's shape, the boxes a marker must clear. `callout-place.js` is the lane, the
 * markers and the readers, and it weighs 17KB gzipped with `legend-svg.js`, so a deck with no callout
 * never loads it. Its functions below answer through `need()`, which is a `require` in Node and the
 * single-file bundles and an `install()` made by the host in the ESM build.
 *
 * A chart calls a heavy function only when the slide has a callout (the call sits behind `ctx.callouts`
 * or a resolved list). `test/unit/components/callout-layer-lazy.test.js` renders every chart with the
 * heavy half withheld to hold that line.
 */

const core = require('./callout-core');
const load = require('./callout-place-load');

let place = null;

/** The host (the ESM playground's `esm/callout-place.js` entry) hands the heavy half over here. */
function install(impl) {
  place = impl;
}

/** Drop what `install` set, so a test can withhold the heavy half. */
function uninstall() {
  place = null;
  withheld = true;
}
let withheld = false;
/** Let a withheld layer load again. */
function reset() {
  place = null;
  withheld = false;
}

/**
 * The heavy half, or a ChunkLoadError. A chart quietly drawn without its callouts is a confident wrong
 * answer, so a half that is not here throws, and the hosts turn the name into their reload offer.
 */
function need() {
  if (place) return place;
  const got = withheld ? null : load();
  if (got) return (place = got);
  load.missed = true;
  const err = new Error('The callout layer has not loaded.');
  err.name = 'ChunkLoadError';
  throw err;
}

const heavy = (name) => (...args) => need()[name](...args);

module.exports = {
  // Always here.
  sideFor: core.sideFor,
  lift: core.lift,
  around: core.around,
  choose: core.choose,
  stageAspects: core.stageAspects,
  chartBoxAspect: core.chartBoxAspect,
  STAGE_ASPECTS: core.STAGE_ASPECTS,
  PLACEMENT_MARGIN: core.PLACEMENT_MARGIN,
  FS_FLOOR: core.FS_FLOOR,
  LANE_PAD: core.LANE_PAD,
  MARKER_MIN_HEIGHT: core.MARKER_MIN_HEIGHT,
  matchName: core.matchName,
  detailByMark: core.detailByMark,
  mergeDetail: core.mergeDetail,
  addToDesc: core.addToDesc,
  textBox: core.textBox,
  pad: core.pad,
  gutterBoxes: core.gutterBoxes,
  lineBoxes: core.lineBoxes,
  // Loaded with the callout.
  resolve: heavy('resolve'),
  laneFor: heavy('laneFor'),
  place: heavy('place'),
  placeUnkeyed: heavy('placeUnkeyed'),
  describe: heavy('describe'),
  markerHeightFor: heavy('markerHeightFor'),
  pathShape: heavy('pathShape'),
  fromSvg: heavy('fromSvg'),
  onSvg: heavy('onSvg'),
  laneSvg: heavy('laneSvg'),
  laneHeight: heavy('laneHeight'),
  markerSvg: heavy('markerSvg'),
  markerShapes: heavy('markerShapes'),
  markerColors: heavy('markerColors'),
  install,
  uninstall,
  reset,
};
