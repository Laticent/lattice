/**
 * The chart family's render-time diagnostic channel for labels it could not paint.
 *
 * WHY THIS EXISTS
 * The family declines to paint a name on purpose, and those calls are right — two
 * overprinted names are not one readable name plus one lost, they are two lost.
 * What was wrong is that they were SILENT. Four mechanisms report here:
 *
 *   `overlap`  `placeLabels`' HIDE-OVERLAP (`svg-label.js`) — no position clears.
 *   `pitch`    the category GAP-CULL (`cartesian.js` § buildCategoryLabels).
 *   `density`  `quadrant` past its 16-item ceiling, where no name is offered to
 *              the placement pass at all — the only ALL-OR-NOTHING one.
 *   `pack`     `word-cloud`'s spiral packer, and the WORST of the four: the other
 *              three leave the name on `data-label`, in the speaker note and in the
 *              SVG `<desc>`, but `packCloud` returns only the placed words and the
 *              `<desc>` is built from that return, so the word is gone outright.
 *
 * `line`'s interior tick thinning is deliberately NOT one of them: it blanks a
 * label it never intended to paint, and the point stays plotted.
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
 * THE BRACKET IS SYNCHRONOUS, and `fn` must be too. The `finally` pops the sink when
 * `fn` RETURNS, so an `async fn` pops at its first `await` and every note taken after
 * that lands in the wrong sink or in none — silently, which is the one failure mode a
 * diagnostic channel cannot afford. Nothing reaches this today: every chart kernel's
 * `transformSection` is synchronous, and the whole family is free of `async`/`await`.
 * If that ever changes, this has to become an explicit push/pop pair the async frame
 * owns, not a `finally`.
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
 * @param {string} reason - `overlap` | `pitch` | `density` | `pack`, the mechanism
 *                          that dropped it (see the header for what each means)
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
 * PERCENT-ENCODED, NOT HTML-ESCAPED, and the difference is the whole of this
 * function. A label is AUTHOR text: it can hold the `|` this joins on, the `:` that
 * splits reason from label, and the `"` and `&` that would break the attribute. The
 * first cut escaped those as HTML character references (`&#124;`, `&#58;`, `&amp;`)
 * — which is correct for getting them INTO the markup and useless for getting them
 * back out, because this value's only reader calls `getAttribute`, and by then the
 * HTML parser has decoded every reference in the attribute value. The separators
 * came back as real separators.
 *
 * Measured before the fix, through the real CLI: `Revenue | EMEA` was reported as
 * two drops, `"Revenue "` and `" EMEA"`, the second carrying a FABRICATED `overlap`
 * reason (the fragment had no `reason:` prefix left, and the decoder's `at < 0`
 * branch defaults). A run that lost 10 names reported 12. The docblock above this
 * one calls a name altered on the way to a warning about losing that name its own
 * small betrayal; that is precisely what it did.
 *
 * `encodeURIComponent` escapes everything that matters here — `|` `&` `"` `<` `>` —
 * into `%XX`, which no HTML parser touches, so the value survives serialization and
 * re-parse byte for byte. It leaves `:` alone, so that one is escaped by hand.
 *
 * @param {Array<{label: string, reason: string}>} drops
 * @returns {string} `reason:label|reason:label`, or '' for no drops
 */
function encodeLabelDrops(drops) {
  if (!drops?.length) return '';
  const esc = (s) => encodeURIComponent(String(s)).replace(/:/g, '%3A');
  return drops.map((d) => `${esc(d.reason)}:${esc(d.label)}`).join('|');
}

/**
 * The inverse of `encodeLabelDrops`, for the consumers that read the attribute back
 * (the CLI warning, the unit arms). ONE grammar, both directions, in one place —
 * a reader that re-derives the writer's format drifts the first time it changes.
 *
 * @param {string} value - as `getAttribute` returns it, AFTER the HTML parser
 * @returns {Array<{label: string, reason: string}>}
 */
function decodeLabelDrops(value) {
  if (!value) return [];
  // `decodeURIComponent` throws on a malformed `%` sequence. Our own writer cannot
  // produce one, but this reads an ATTRIBUTE — hand-edited HTML, a re-serialization,
  // a future writer — and a diagnostic channel that throws inside the export it is
  // reporting on would turn a lost label into a lost deck.
  const unesc = (s) => { try { return decodeURIComponent(String(s)); } catch { return String(s); } };
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
