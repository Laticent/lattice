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

/** The type the block is addressed by — distinct from the front-matter snapshot's. */
const EXPORT_SETTINGS_TYPE = 'application/lattice-export-settings';

/** Matches an existing block (with its note), so re-exporting REPLACES rather than stacks. */
const NOTE = '<!-- Lattice: settings chosen when this deck was exported. '
  + 'Not deck front matter — re-export to change them. -->';

const BLOCK_RE = new RegExp(
  `(?:${NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)?`
  + `<script type="${EXPORT_SETTINGS_TYPE}">[\\s\\S]*?<\\/script>\\n?`,
  'g',
);

/**
 * The block to append to an exported deck, or '' when there is nothing to carry.
 *
 * `<` is escaped so the payload can never close its own `<script>` element — the
 * one character that could turn a data block into markup (same guard, same reason,
 * as `frontMatterBlock`).
 *
 * @param {{overflowMarker?: string}} settings
 */
function exportSettingsBlock(settings) {
  const keep = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (v !== undefined && v !== null && v !== '') keep[k] = v;
  }
  if (!Object.keys(keep).length) return '';
  const payload = JSON.stringify(keep).replace(/</g, '\\u003c');
  return `${NOTE}\n<script type="${EXPORT_SETTINGS_TYPE}">${payload}</script>\n`;
}

/** Strip any previously written block (and its note) from a deck source. */
function withoutExportSettingsBlock(deckSource) {
  return String(deckSource || '').replace(BLOCK_RE, '');
}

/**
 * Read the block out of a live document AND REMOVE IT, returning the settings
 * object (or null when the document carries none — every non-exported surface).
 *
 * Removal is the same hygiene `readBakedFrontMatter` applies: consumed state should
 * not linger in a document something else may copy, serialize, or sanitize (the
 * docs-site Studio re-hosts slide HTML — HARD RULE #22). The LAST block wins, for
 * the same reason: a hand-edited or concatenated document can hold more than one,
 * and the newest is the one to trust.
 */
function readExportSettings(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const nodes = [...doc.querySelectorAll(`script[type="${EXPORT_SETTINGS_TYPE}"]`)];
  if (!nodes.length) return null;
  const raw = nodes[nodes.length - 1].textContent || '';
  for (const node of nodes) node.remove();
  try {
    const parsed = JSON.parse(raw);
    // A non-object payload is a corrupt one — treat it as absent rather than
    // letting `settings.overflowMarker` read off a string or an array.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  EXPORT_SETTINGS_TYPE,
  EXPORT_SETTINGS_NOTE: NOTE,
  exportSettingsBlock,
  withoutExportSettingsBlock,
  readExportSettings,
};
