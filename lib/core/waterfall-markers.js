/**
 * lib/core/waterfall-markers.js — the waterfall's explicit type markers, as a second inline-code
 * pill on a row: `` `+1.4M` `total` `` (a level) or `` `step` `` (a delta). One kernel the chart
 * and `lint:deck` share (HARD RULE #1), so the linter reads a marker exactly as the chart does.
 *
 * Each is a Segno flag with its aliases (row 15 of the Segno note's grammar table), so the words
 * fold case the way every other enum word does. The aliases are why a deck can write one meaning
 * two ways (`total` on one slide, `sum` on the next), which `mixed-spelling` asks it not to
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md decision 7).
 */
const { flag } = require('@laticent/segno/read');

const MARK_TOTAL = flag('total', { aliases: ['subtotal', 'sum', 'level'] });
const MARK_STEP = flag('step', { aliases: ['delta', 'change'] });

/** `'total'`, `'step'`, or `''` for a pill that is not a marker. */
function markerOf(pill) {
  const w = String(pill).trim();
  return MARK_TOTAL.read(w) ? 'total' : MARK_STEP.read(w) ? 'step' : '';
}

/**
 * The marker a pill spells, as a Segno spelling (lib/core: `consistency` groups these per deck):
 * the canonical word, the word as written (lower case), and where it sits in the pill's text.
 * Null for a pill that is not a marker.
 */
function markerSpelling(pill) {
  const text = String(pill);
  const canonical = markerOf(text);
  if (!canonical) return null;
  const from = text.length - text.trimStart().length;
  const word = text.trim();
  return { param: 'marker', canonical, written: word.toLowerCase(), from, to: from + word.length, shortcut: false };
}

module.exports = { MARK_TOTAL, MARK_STEP, markerOf, markerSpelling };
