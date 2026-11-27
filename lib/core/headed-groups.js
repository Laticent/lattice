/**
 * The layouts whose split reads `###` groups each over a list as its members (split-envelope.js `headedListGroups`).
 * Each is a `cover-paginate` layout, the only strategy with that branch (pinned by headed-list-groups.test.js); the
 * in-page measure (fit-measure.js) reads the same list, so a layout whose split would cut one list (`team-profile
 * sides`) is never measured as groups and keeps its measured item plan (checker, 2026-11-16).
 *
 * A function, not a value, so the measure's injected source carries it as code (`.toString()`), as it does the
 * sentence rules, rather than a string built from data. Its own module so the engine's splitter can read the list
 * without bundling the whole measure, which only the preview runtime runs (route budget, 2026-11-22).
 */
function headedGroupLayouts() {
  return ['regulatory-update'];
}

const HEADED_GROUP_LAYOUTS = headedGroupLayouts();

module.exports = { headedGroupLayouts, HEADED_GROUP_LAYOUTS };
