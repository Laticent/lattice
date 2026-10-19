/**
 * chart-sites — where in the source a chart row's `{…}` records sit, from the shared place tracker.
 *
 * The line-addressed form of lib/core/chart-places.js for the readers that rewrite or skip source LINES: the narrator
 * (chart-source-bridge.js) and lint. The engine's pill pass counts place with the tracker directly and does not import this.
 */

const { recordChart, ownsRecordSpan } = require('./chart-rows');
const { createPlaceTracker } = require('./chart-places');

/**
 * Every code span `ownsRecordSpan` calls a chart row's record in a slide's tokens, with where it sits in the
 * source: the readers that rewrite or skip source LINES (the narrator, lint) take their answer from here
 * instead of walking lines themselves. `line` is the 0-based line the span's row ends on (a table cell: the
 * row's line, with `col` its 0-based column; a list row: `col` is -1 and `from` is the line its paragraph starts on,
 * because a code span may wrap onto a later line).
 *
 * `tokens` come from the engine-configured block parser (boundary-parser.mjs) over the slide's RAW text: a
 * trailing `<!-- c -->` is an `html_inline` kid there, so it ends the claim exactly as it does in the engine.
 * @param {object[]} tokens
 * @param {string[]} classTokens  the slide's class tokens
 * @returns {{ line: number, from?: number, col: number, text: string }[]}
 */
function ownedRecordSites(tokens, classTokens) {
  if (!recordChart(classTokens)) return [];
  const tracker = createPlaceTracker();
  tracker.reset(true);
  const sites = [];
  let col = -1;
  let rowLine = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    tracker.enter(tokens, i);
    if (token.type === 'tr_open') {
      col = -1;
      rowLine = token.map ? token.map[0] : -1;
    } else if (token.type === 'td_open' || token.type === 'th_open') col++;
    if (token.type !== 'inline') continue;
    const places = tracker.inline(token);
    if (!places) continue;
    for (const child of token.children) {
      if (child.type !== 'code_inline') continue;
      const place = places.placeOf(child);
      if (!place || !ownsRecordSpan(classTokens, child.content, place)) continue;
      sites.push(place.cell
        ? { line: rowLine, col, text: child.content }
        : { line: token.map ? token.map[1] - 1 : -1, from: token.map ? token.map[0] : -1, col: -1, text: child.content });
    }
  }
  return sites;
}

module.exports = { ownedRecordSites };
