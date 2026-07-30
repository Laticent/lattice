/**
 * lib/core/export-settings.js
 *
 * The EXPORT PRODUCER's decisions, carried into the artifact it produces.
 *
 * WHY THIS IS NOT FRONT MATTER. Front matter is the author's deck: what the slides
 * are and how they look. An export setting is a property of the RENDER TARGET —
 * one deck source is previewed while authoring, exported to a bundle for a
 * recipient, and printed to PDF for the record, and the same question ("who is the
 * overflow marker addressed to?") has three different correct answers decided
 * entirely by which command you ran. That is a target property, not an authoring
 * fact, and it does not belong in the deck.
 *
 * This repo ruled the same way one day earlier, on `autosplit:`
 * (engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md): page count is a
 * function of content and box, so it cannot be an authoring-time switch, and the
 * instrumentation need moved to a tool flag. `overflow-marker` shipped briefly as a
 * deck register and was moved here for the same reason
 * (engineering/decisions/2026-07-30-overflow-marker-register.md).
 *
 * So the settings ride in their OWN block, not in the front-matter snapshot. Three
 * things follow from that separation, and each one was a defect while the value was
 * a front-matter key:
 *
 *   · Nobody can mistake it for something to write in a deck. A front-matter key
 *     that the export writes but never reads back is a key that LOOKS like an input
 *     and is not — someone will copy it into their source and expect it to work.
 *   · A re-export cannot inherit it. Exporting a bundle's own `.md` (an ordinary
 *     thing to do with a deck a recipient sent back) used to carry the previous
 *     export's choice forward silently — which mattered most for `off`, the level
 *     that makes a clipped slide look finished.
 *   · The block is regenerated, so it is always the CURRENT export's decision and
 *     is replaced rather than stacked, exactly like the front-matter snapshot.
 *
 * The payload is JSON because these are typed values, where the front-matter block
 * carries raw YAML for readers that already parse YAML.
 */

const { dataBlock } = require('./data-block');

/**
 * The type the block is addressed by — distinct from the front-matter snapshot's.
 *
 * NO NOTE COMMENT, deliberately. Marpit turns a non-directive HTML comment into a
 * SPEAKER NOTE, so the explanatory comment this block first shipped with landed in
 * the recipient's presenter view and in the PPTX notes pane the bundle's README
 * advertises — engine-internal prose in front of an audience. (The front-matter
 * block's note pays that cost for a reason: it warns an editor that the snapshot
 * overrides the front matter they are looking at. Nobody is expected to hand-edit
 * this one, and the `type` says what it is.) The bundle README explains it instead.
 */
const EXPORT_SETTINGS_TYPE = 'application/lattice-export-settings';

const BLOCK = dataBlock(EXPORT_SETTINGS_TYPE);

/**
 * The block to append to an exported deck, or '' when there is nothing to carry.
 * @param {{overflowMarker?: string}} settings
 */
function exportSettingsBlock(settings) {
  const keep = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (v !== undefined && v !== null && v !== '') keep[k] = v;
  }
  return Object.keys(keep).length ? BLOCK.write(keep) : '';
}

/** Strip any previously written block from a deck source. */
function withoutExportSettingsBlock(deckSource) {
  return BLOCK.strip(deckSource);
}

/**
 * Read the settings out of a live document AND REMOVE the block, or null.
 *
 * A non-object payload reads as null: guessing would let `settings.overflowMarker`
 * read off a string or an array and hand a reader the authoring signal, or vice
 * versa. `null` is the signal "this document is not an exported artifact", so it
 * has to mean exactly that.
 */
function readExportSettings(doc) {
  const parsed = BLOCK.read(doc);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

module.exports = {
  EXPORT_SETTINGS_TYPE,
  exportSettingsBlock,
  withoutExportSettingsBlock,
  readExportSettings,
};
