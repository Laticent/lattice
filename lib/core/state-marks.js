/**
 * CHECKS — the six answers, in one place: their SYNTAX and their MEANING. The rows below
 * are a summary; the table is CHECKS, further down.
 *
 *   [x] yes             pass    + state-full     check on --pass
 *   [-] partly          warn    + state-half     dash on --warn
 *   [!] no              fail    + state-empty    ✕ on --fail
 *   [?] unknown         unknown + state-unknown  hollow ring with a drawn ?
 *   [ ] open / not yet  todo    + state-todo     hollow ring, empty
 *   [/] does not apply  skip    + state-slashed  slash, label struck
 *
 * ONE MEANING PER MARKER, IN EVERY LAYOUT. `[ ]` used to be overloaded: "not met" in
 * verdict-grid and "not yet" everywhere else, picked by a layout flag the author could not
 * see, so one keystroke drew opposite answers on two slides of a deck. "No" now has its own
 * marker, and a layout supplies only the WORDS for each answer (label sets, narration),
 * never the answer itself. engineering/decisions/2026-09-24-six-state-marks.md.
 *
 * ONE PARSE. The marker class used to be retyped as a private regex in eight places across
 * five files; a new marker added to seven of them would print literally on the eighth.
 * Every remaining pattern builds from MARKER_CLASS, and a unit test fails on a private copy
 * (test/unit/core/state-marks.test.js); every READER of a leading marker walks the list-text
 * grammar below, whose marker set a test holds to MARKERS.
 *
 * ONE GRAMMAR. A marker LEADING list or cell text (`[x] Senior`) is read by the Segno
 * list-text grammar, through the readers in leading-marker.js (Segno phase 3). This file
 * stays REQUIRE-FREE on purpose: the Studio's Compose editor imports it on the docs dev
 * server, whose CommonJS shim serves only a module with no `require` of its own
 * (docs/src/plugins/vite-cjs-lib-dev.test.ts).
 *
 * Pure: no DOM, no markdown-it, no fs.
 */

/**
 * THE CHECK REGISTRY — the six answers as one table, one row each. Every other list of
 * the six is DERIVED from this table (the exports below) or PINNED to it by a test
 * (test/unit/core/state-marks.test.js § the registry), because a stylesheet and a TSX
 * file cannot import it. The answers are called CHECKS (engineering/decisions/
 * 2026-10-18-checks.md §5, §12): "mark" and "state" are older names for the same thing,
 * kept in the identifiers until each importer moves.
 *
 *   id       the semantic class and the answer's id, also the `@check{…}` enum value
 *   marker   the character inside the bracket shortcut, `[x]`
 *   shape    the shape class; the class a stylesheet maps to the drawing
 *   mask     the `--mark-*` token the disc is cut with; null draws no mark (an empty ring)
 *   tone     the ink token the disc and its ring are painted in
 *   hollow   true for the two UNSETTLED answers, drawn as a ring rather than a disc
 *   word     the universal spoken name. A layout may speak its own words for the same
 *            answer (prose-projection WORD_MAPS, manifest label sets), never another answer.
 *   meaning  what the answer says, in one plain sentence
 *
 * Row order is the kernel's order: the shortcut list, the key and every picker follow it.
 * Adding an answer is adding a row.
 */
const CHECKS = Object.freeze([
  { id: 'pass', marker: 'x', shape: 'state-full', mask: '--mark-check', tone: '--pass', hollow: false, word: 'yes', meaning: 'The criterion is met.' },
  { id: 'warn', marker: '-', shape: 'state-half', mask: '--mark-dash', tone: '--warn', hollow: false, word: 'partly', meaning: 'The criterion is partly met.' },
  { id: 'fail', marker: '!', shape: 'state-empty', mask: '--mark-x', tone: '--fail', hollow: false, word: 'no', meaning: 'The criterion is not met.' },
  { id: 'unknown', marker: '?', shape: 'state-unknown', mask: '--mark-question', tone: '--muted-mark', hollow: true, word: 'unknown', meaning: 'Looked at, and it cannot be settled.' },
  { id: 'todo', marker: ' ', shape: 'state-todo', mask: null, tone: '--muted-mark', hollow: true, word: 'open', meaning: 'Not looked at yet.' },
  { id: 'skip', marker: '/', shape: 'state-slashed', mask: '--mark-slash', tone: '--muted-mark', hollow: false, word: 'does not apply', meaning: 'The criterion does not apply here.' },
].map((row) => Object.freeze(row)));

/** Marker character → its registry row. */
const CHECK_BY_MARKER = Object.freeze(Object.fromEntries(CHECKS.map((c) => [c.marker, c])));

/** The registry row for a marker character, or null. */
function checkFor(marker) {
  return CHECK_BY_MARKER[marker] || null;
}

/**
 * @param {string} marker one of the six marker characters (`x` `-` `!` `?` ` ` `/`)
 * @returns {{sem:string, shape:string}|null}
 */
function stateClassesFor(marker) {
  const c = checkFor(marker);
  return c ? { sem: c.id, shape: c.shape } : null;
}

/** Spoken name per marker — the registry's `word` column. The disc carries this on
 * `aria-label`, never as text. */
const MARKER_LABELS = Object.freeze(Object.fromEntries(CHECKS.map((c) => [c.marker, c.word])));

/** The six canonical markers, and nothing near them. `[X]` is NOT a marker: GitHub-flavored
 * markdown reads it as a CHECKED box, the opposite of what a cross suggests. */
const MARKERS = Object.freeze(CHECKS.map((c) => c.marker));

/**
 * The regex CHARACTER CLASS matching one marker character. A consumer that needs its own
 * anchoring builds its pattern from this with `new RegExp(...)`; the two common shapes are
 * the helpers below. Never retype the class.
 */
const MARKER_CLASS = '[x\\-!? /]';

/**
 * Is this inline-code text a state marker? One of the six three-character forms, exactly,
 * with nothing around them.
 *
 * DELIBERATELY NARROW. This grammar reads every single-backtick span in every deck, and
 * `[` opens a CSS attribute selector (`[data-mark]`), an array index, a citation. Only
 * the six exact three-character forms dispatch; everything else stays literal, which is
 * what keeps `` `[data-mark]` `` and `` `[0]` `` untouched.
 *
 * @returns {{marker:string, sem:string, shape:string, label:string}|null}
 */
function parseInlineState(text) {
  if (typeof text !== 'string' || text.length !== 3) return null;
  if (text.charCodeAt(0) !== 0x5b /* [ */ || text.charCodeAt(2) !== 0x5d /* ] */) return null;
  const marker = text[1];
  if (!MARKERS.includes(marker)) return null;
  const { sem, shape } = stateClassesFor(marker);
  return { marker, sem, shape, label: MARKER_LABELS[marker] };
}

/** The class list a state mark carries. `lat-state` is the hook for the INLINE box;
 * `state`, the semantic and the shape are the existing universal vocabulary, so the
 * `--state-mark` mask, `.state.todo`'s open ring and every `checks-*` style variant
 * apply to an inline mark for free. */
function stateClassList({ sem, shape }) {
  return `state ${sem} ${shape} lat-state`;
}

/**
 * Render to an HTML string — the markdown-it path.
 *
 * `role="img"` + `aria-label`, never a visually-hidden span. A hidden span is still
 * TEXT: it jams into spoken narration and prints on a split page, whose section does not
 * carry the class a clip rule would be scoped to. Both were measured on the marks-cell
 * work before this shape replaced them.
 */
function stateHtml(text) {
  const s = parseInlineState(text);
  if (!s) return null;
  return `<span class="${stateClassList(s)}" role="img" aria-label="${s.label}"></span>`;
}

/** Build as a real element — the runtime's DOM path. No markup assignment, so this
 * stays off HARD RULE #22's post-sanitize injection surface. */
function stateElement(doc, text) {
  const s = parseInlineState(text);
  if (!s) return null;
  const el = doc.createElement('span');
  el.className = stateClassList(s);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', s.label);
  return el;
}

module.exports = {
  CHECKS, checkFor,
  stateClassesFor, parseInlineState, stateHtml, stateElement, stateClassList,
  MARKERS, MARKER_LABELS, MARKER_CLASS,
};
