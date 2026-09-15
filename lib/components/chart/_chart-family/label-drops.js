/**
 * The chart family's render-time diagnostic channel for labels it could not paint.
 *
 * WHY THIS EXISTS
 * The family drops a name on purpose, in three places, each with its reasoning
 * written where it lives: `placeLabels`' HIDE-OVERLAP (`svg-label.js`), the
 * category GAP-CULL (`cartesian.js` § buildCategoryLabels), and `line`'s interior
 * thinning. Those calls are right — two overprinted names are not one readable
 * name plus one lost, they are two lost. What was wrong is that they were SILENT.
 *
 * `test/unit/components/chart-label-drop-census.test.js` pins that the decks WE
 * ship never reach any drop path, and says outright that it does not protect an
 * author: five long names in one quadrant loses two, twenty rows on a `bar` loses
 * ten, both at the shipped sizes, both invisible. Its docblock closes with
 * "warning the author is real work and needs a render-time diagnostic channel the
 * family does not have". This is that channel (#2171).
 *
 * WHAT IT IS NOT. It does not change a single placement decision, and it must not:
 * the drop is still the right answer, and a warning that also moved the layout
 * would make the census measure something other than what ships. It is a report.
 *
 * SHAPE — an explicit bracket, not ambient state. `collectLabelDrops(fn)` runs one
 * chart's transform with a sink installed and hands back what fell out; outside a
 * bracket `noteLabelDrop` is a no-op, so every other render path pays nothing and
 * behaves byte-identically. The sink is a stack rather than a single slot so a
 * nested bracket cannot silently steal the outer one's drops.
 *
 * WHY THE NOTE IS TAKEN ON THE FINAL RESULT, NOT INSIDE THE SEARCH. `quadrant`
 * runs `placeLabels` up to NINE times per slide — once per rung of
 * `DOT_LABEL_LADDER` — and keeps exactly one. A note taken inside `placeLabels`
 * would report every rejected rung's casualties as if they had shipped, which is
 * a diagnostic that lies in the direction of panic. So `placeLabels` only LABELS
 * its entries (`label` beside the existing `hidden`), and the caller notes the
 * array it actually emits. The category cull is a single pass and notes in place.
 */

// A stack of sinks. Empty means nobody is collecting — the common case, and the
// one that has to cost nothing.
const sinks = [];

/**
 * Record one label this render declined to paint.
 *
 * No `component` argument on purpose. `buildCategoryLabels` is shared by seven
 * members and does not know which one called it, and threading the name through
 * all seven to reach a warning string would be a lot of churn for a fact the
 * bracket already holds: `collectLabelDrops` is opened by the chart-section
 * transform, which knows the layout token. It stamps it.
 *
 * @param {string} label  - the text that will not appear on the slide
 * @param {string} reason - `overlap` | `pitch`, the mechanism that dropped it
 */
function noteLabelDrop(label, reason) {
  if (!sinks.length) return;
  const text = String(label ?? '').trim();
  // An EMPTY label is not a loss, and this is the census's own first false
  // positive: `line` blanks an interior category deliberately, so the name was
  // never going to be painted and the point is still plotted. Reporting it would
  // put a warning on most `line` slides in the tree.
  if (!text) return;
  sinks[sinks.length - 1].push({ label: text, reason });
}

/**
 * Note every hidden entry in a finished `placeLabels` result.
 *
 * @param {Array<{hidden?: boolean, label?: string}>} placed - the array the caller emits
 * @returns {Array<{hidden?: boolean, label?: string}>} `placed`, unchanged, so this
 *   can be threaded into an existing expression without restructuring the caller
 */
function noteHiddenLabels(placed) {
  if (sinks.length && Array.isArray(placed)) {
    for (const p of placed) if (p?.hidden) noteLabelDrop(p.label, 'overlap');
  }
  return placed;
}

/**
 * Run `fn` with a drop sink installed.
 *
 * @param {Function} fn
 * @returns {{value: *, drops: Array<{label: string, reason: string}>}}
 */
function collectLabelDrops(fn) {
  const sink = [];
  sinks.push(sink);
  try {
    return { value: fn(), drops: sink };
  } finally {
    sinks.pop();
  }
}

/**
 * Serialize a drop list for the `data-label-drops` attribute the section carries.
 *
 * A LABEL IS AUTHOR TEXT, so it can hold anything a markdown author can type —
 * including the `|` this joins on and the `"` that would close the attribute. Both
 * are escaped rather than stripped, because the CLI prints these back to the author
 * and a name silently altered on the way to a warning ABOUT losing that name is its
 * own small betrayal. `&` goes first or the un-escaping is ambiguous.
 *
 * @param {Array<{label: string, reason: string}>} drops
 * @returns {string} `reason:label|reason:label`, or '' for no drops
 */
function encodeLabelDrops(drops) {
  if (!drops?.length) return '';
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/\|/g, '&#124;')
    .replace(/:/g, '&#58;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return drops.map((d) => `${esc(d.reason)}:${esc(d.label)}`).join('|');
}

/**
 * The inverse of `encodeLabelDrops`, for the consumers that read the attribute back
 * (the CLI warning, the unit arms). ONE grammar, both directions, in one place —
 * a reader that re-derives the writer's format drifts the first time it changes.
 *
 * @param {string} value
 * @returns {Array<{label: string, reason: string}>}
 */
function decodeLabelDrops(value) {
  if (!value) return [];
  const unesc = (s) => String(s)
    .replace(/&#124;/g, '|').replace(/&#58;/g, ':')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  return String(value).split('|').filter(Boolean).map((part) => {
    const at = part.indexOf(':');
    return at < 0
      ? { reason: 'overlap', label: unesc(part) }
      : { reason: unesc(part.slice(0, at)), label: unesc(part.slice(at + 1)) };
  });
}

module.exports = {
  noteLabelDrop,
  noteHiddenLabels,
  collectLabelDrops,
  encodeLabelDrops,
  decodeLabelDrops,
};
