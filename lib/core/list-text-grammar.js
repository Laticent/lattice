/**
 * list-text-grammar — the list-text notations as one Segno grammar: the leading state marker
 * (`[x] Senior`), the matrix-grid cell (`[-]`) and the `_track` directive
 * (`Cost | [Payback] | Risk`).
 *
 * This is the ONE reader of that text. tools/build-segno-grammar.js compiles `listTextSpec` with
 * Segno's code generator into lib/core/list-text.generated.js, and the kernels walk that parser's
 * flat tree: leading-marker.js (the marker shapes), matrix-grid-cells.js (`parseCell`) and
 * track-spec.js (`parseTrackSpec`). Change the grammar here, then run `npm run segno-lib:build`;
 * build:check fails while the generated file is stale.
 *
 * Each entry rule reads a WHOLE string, so the reader passes its text and picks the rule:
 *
 *   line   `[m]`, whitespace, then text with no line break      `[x] Senior`        list items, cells
 *   lead   `[m]`, whitespace, then anything                      `[x] Senior\n…`     a marker to strip
 *   cell   `line`, after at most one opening tag                 `<b>[x] Senior`     narration's cells
 *   tagged `lead`, after whitespace and at most one opening tag  `  <b>[x] Q3`       roadmap cells
 *   bare   only a marker, where `X` counts too                   `[X]`               row-label bet
 *   grid   a matrix-grid marker, up to 8 spaces or tabs, text    `[x] Owner`         matrix-grid
 *   track  labels between pipes; a label wholly in brackets      `A | [B] | C`       `_track`
 *          is the current one
 *   spoken `grid` with no bound on the gap, untrimmed              `[x]   Owner`       matrix-grid speech
 *   any    any one character in brackets, whitespace, anything   `[!] Blocked`       a bracket to unsay
 *
 * The shapes are the regular expressions they replaced (Segno phase 3, decision 20), character
 * for character, and test/unit/tools/list-text-grammar.test.js holds them to those expressions'
 * frozen outputs. `spoken` and `any` are chart narration's own readings of a matrix-grid cell;
 * `spoken` differs from `grid` only on text narration trims anyway, and folding the two is a
 * recorded follow-up (followups.d/2546-p3-fold-spoken-into-grid.md). Two details that look arbitrary are that parity:
 *
 *   · WHITESPACE is JavaScript's `\s` (and `String.prototype.trim`): the Unicode space
 *     separators, the line breaks and U+FEFF. TEXT on a `line` stops at a line break as `.` did:
 *     `\n`, `\r`, U+2028, U+2029. So `[x]\nSenior` reads (the break is the marker's gap) and
 *     `[x] Senior\nmore` does not.
 *   · `bare` takes `[X]` and no other entry does. GitHub reads `[X]` as a checked box, so it is
 *     not a marker anywhere a mark is drawn; the row-label bet (table-row-label.js) only asks
 *     whether a cell is a status tick, and `[X]` is one.
 *
 * `track` is the one with a decision in it. An item is CURRENT when, trimmed, it opens with `[`
 * and closes with `]`; brackets inside a label (`Cost [net]`) leave it plain. The closing bracket
 * is only known at the item's end, so the grammar does not guess: after a `[` it marks every run
 * of `]` and whitespace as a `shut` (each `]` an `rb`), and the item is current when its last
 * `shut` ends it. The label is what lies between the opening bracket and that run's last `]`.
 *
 * Pass the Segno API in (`makeListTextGrammar(S)`): the build bundles Segno's TypeScript source,
 * and the bake-off and the unit test load whichever copy they measure. Pure data, no fs, no DOM.
 */

// JavaScript's `\s`: WhiteSpace and LineTerminator, the set `trim()` removes.
const WS = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
// What `.` does not match.
const LINE_BREAK = '\n\r\u2028\u2029';
// The six state markers (lib/core/state-marks.js MARKERS), and matrix-grid's three.
const MARKERS = 'x-!? /';
const GRID_MARKERS = 'x- ';
// The matrix-grid gap: at most this many spaces or tabs between the marker and its label.
const GRID_GAP = 8;

function makeListTextGrammar(S) {
  const { alt, any, chars, greedy, many, many1, node, noneOf, opt, seq } = S;

  const ws = chars(WS, 'whitespace');
  const gap = greedy(many(ws));
  const marker = (set) => seq('[', node('mark', chars(set, 'a marker')), ']');
  const head = marker(MARKERS);
  const lineText = node('rest', many(noneOf(LINE_BREAK, 'text on one line')));
  const anyText = node('rest', many(any()));
  // One opening tag: `<`, at least one character that is not `>`, then `>`.
  const tag = seq('<', many1(noneOf('>', 'a tag name')), '>');

  // `[ \t]{0,8}`, longest first: eight nested optional characters.
  let gridGap = null;
  for (let k = 0; k < GRID_GAP; k++) {
    const one = chars(' \t', 'a space');
    gridGap = greedy(opt(gridGap ? seq(one, gridGap) : one));
  }

  // A `_track` item opened by `[`: every run of `]` and whitespace is a `shut`, so the reader can
  // see whether one ends the item.
  const shut = node('shut', seq(node('rb', ']'), greedy(many(alt(ws, node('rb', ']'))))));
  const bracketed = seq(node('open', '['), many(alt(noneOf(']|', 'a label character'), shut)));
  const plain = seq(noneOf(`|[${WS}`, 'a label character'), many(noneOf('|', 'a label character')));
  const item = node('item', seq(many(ws), opt(alt(bracketed, plain))));

  const listTextSpec = {
    start: 'line',
    rules: {
      line: seq(head, gap, lineText),
      lead: seq(head, gap, anyText),
      cell: seq(opt(seq(tag, many(ws))), head, gap, lineText),
      tagged: seq(many(ws), opt(node('tag', seq(tag, many(ws)))), head, gap, anyText),
      bare: marker(`${MARKERS}X`),
      grid: seq(marker(GRID_MARKERS), gridGap, lineText),
      track: seq(item, many(seq('|', item))),
      spoken: seq(marker(GRID_MARKERS), greedy(many(chars(' \t', 'a space'))), lineText),
      any: seq('[', node('mark', noneOf(']', 'a character')), ']', gap, anyText),
    },
  };
  return { listTextSpec };
}

module.exports = { makeListTextGrammar, WS, LINE_BREAK, MARKERS, GRID_MARKERS, GRID_GAP };
