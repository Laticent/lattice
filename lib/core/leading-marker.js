/**
 * leading-marker — the readers of a state marker LEADING list or cell text (`[x] Senior`),
 * in every shape a consumer reads one.
 *
 * Each walks the Segno list-text grammar (list-text-grammar.js, generated into
 * list-text.generated.js; Segno phase 3, decision 20: Segno is Lattice's one parser). They
 * replaced LEADING_MARKER_RE, LEADING_MARKER_PREFIX_RE and three private copies of them
 * (chart narration, roadmap, the row-label bet), and test/unit/tools/list-text-grammar.test.js
 * holds them to what those expressions returned. What a marker MEANS stays in state-marks.js,
 * which is kept require-free for the Studio's editor; this module is the one that requires the
 * generated parser.
 *
 * Pure: no DOM, no markdown-it, no fs.
 */

// The list-text parser keeps its state and its tree in module variables: a tree is valid only
// until the next parse() call, so every reader below reads it before returning.
const listText = require('./list-text.generated.js');
const LIST_KIND = Object.fromEntries(listText.parse('', 'track').tree.kinds.map((k, i) => [k, i]));

/**
 * Parse `text` from the list-text grammar's `rule`, and hand back the marker and where the
 * text after it starts (and, for `tagged`, where an opening tag sits), or null when the rule
 * does not read the whole string. Every rule ends in a `rest` node, so the walk is fixed.
 */
function readLead(text, rule) {
  const s = String(text);
  const r = listText.parse(s, rule);
  if (!r.ok) return null;
  const { buf, top } = r.tree;
  let marker = '';
  let rest = s.length;
  let tagFrom = 0;
  let tagTo = 0;
  for (let k = 0; k < top; k = buf[k + 3]) {
    if (buf[k] === LIST_KIND.mark) marker = s[buf[k + 1]];
    else if (buf[k] === LIST_KIND.rest) rest = buf[k + 1];
    else if (buf[k] === LIST_KIND.tag) { tagFrom = buf[k + 1]; tagTo = buf[k + 2]; }
  }
  return { s, marker, rest, tagFrom, tagTo };
}

/**
 * A marker leading ONE line of text: `[x] Senior` → { marker: 'x', rest: 'Senior' }.
 * Whitespace after the marker is skipped, a line break included; a line break in the text
 * after it means this is not a marked line (null). What a list item or a table cell reads.
 */
function readLeadingMarker(text) {
  const r = readLead(text, 'line');
  return r && { marker: r.marker, rest: r.s.slice(r.rest) };
}

/**
 * A marker leading any text, for a consumer that strips it and keeps the rest in place:
 * `[x]  Senior` → { marker: 'x', length: 5 } (the marker and the whitespace after it).
 */
function leadingMarkerPrefix(text) {
  const r = readLead(text, 'lead');
  return r && { marker: r.marker, length: r.rest };
}

/**
 * `readLeadingMarker`, after at most one opening tag: `<b>[x] Senior` reads as `[x] Senior`.
 * Chart narration's cells, which arrive as rendered inline HTML.
 */
function readMarkedCell(text) {
  const r = readLead(text, 'cell');
  return r && { marker: r.marker, rest: r.s.slice(r.rest) };
}

/**
 * `leadingMarkerPrefix` after leading whitespace and at most one opening tag, for a cell whose
 * tag stays and whose marker goes (the roadmap's status cells): `  <b>[x] Q3` →
 * { marker: 'x', tag: '<b>', length: 9 }, so the cell without its marker is
 * `tag + text.slice(length)`. `tag` carries the whitespace after it, and is '' when none.
 */
function cellMarkerPrefix(text) {
  const r = readLead(text, 'tagged');
  return r && { marker: r.marker, tag: r.s.slice(r.tagFrom, r.tagTo), length: r.rest };
}

/**
 * Any ONE character in brackets leading the text, and the whitespace after it: what narration
 * strips before it says a cell (`[!] Blocked` is said "Blocked"). Not a marker reader: it takes
 * `[a]` too. `[x]  Senior` → { marker: 'x', length: 5 }.
 */
function leadingBracketPrefix(text) {
  const r = readLead(text, 'any');
  return r && { marker: r.marker, length: r.rest };
}

/**
 * Is this cell ONLY a marker? The six, and `[X]`: the row-label bet (table-row-label.js) asks
 * whether a column is status ticks, and an `[X]` is a tick there even though it draws no mark.
 */
function isMarkerCell(text) {
  return listText.parse(String(text), 'bare').ok;
}

module.exports = {
  readLeadingMarker, leadingMarkerPrefix, readMarkedCell, cellMarkerPrefix, isMarkerCell, leadingBracketPrefix,
};
