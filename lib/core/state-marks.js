/**
 * STATE MARKS — the six-marker vocabulary, in one place: its SYNTAX and its MEANING.
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
 * Every consumer now builds its pattern from MARKER_CLASS, and a unit test fails on a
 * private copy (test/unit/core/state-marks.test.js).
 *
 * Pure: no DOM, no markdown-it, no fs.
 */

/** Marker character → semantic + shape classes. */
const STATE_CLASSES = Object.freeze({
  x: Object.freeze({ sem: 'pass', shape: 'state-full' }),
  '-': Object.freeze({ sem: 'warn', shape: 'state-half' }),
  '!': Object.freeze({ sem: 'fail', shape: 'state-empty' }),
  '?': Object.freeze({ sem: 'unknown', shape: 'state-unknown' }),
  ' ': Object.freeze({ sem: 'todo', shape: 'state-todo' }),
  '/': Object.freeze({ sem: 'skip', shape: 'state-slashed' }),
});

/**
 * @param {string} marker one of the six marker characters (`x` `-` `!` `?` ` ` `/`)
 * @returns {{sem:string, shape:string}|null}
 */
function stateClassesFor(marker) {
  const c = STATE_CLASSES[marker];
  return c ? { sem: c.sem, shape: c.shape } : null;
}

/** Spoken name per marker — the universal words. A layout may speak its own words for the
 * same answer (prose-projection WORD_MAPS, manifest label sets). The disc carries this on
 * `aria-label`, never as text. */
const MARKER_LABELS = Object.freeze({
  x: 'done',
  '-': 'partial',
  '!': 'no',
  '?': 'unknown',
  ' ': 'to do',
  '/': 'skipped',
});

/** The six canonical markers, and nothing near them. `[X]` is NOT a marker: GitHub-flavored
 * markdown reads it as a CHECKED box, the opposite of what a cross suggests. */
const MARKERS = Object.freeze(['x', '-', '!', '?', ' ', '/']);

/**
 * The regex CHARACTER CLASS matching one marker character. A consumer that needs its own
 * anchoring builds its pattern from this with `new RegExp(...)`; the two common shapes are
 * the helpers below. Never retype the class.
 */
const MARKER_CLASS = '[x\\-!? /]';

/** `^[m] rest` — a marker leading a line of text. Groups: 1 marker, 2 the rest. */
const LEADING_MARKER_RE = new RegExp(`^\\[(${MARKER_CLASS})\\]\\s*(.*)$`);

/** `^[m]` followed by optional space — for consumers that keep the rest in place. */
const LEADING_MARKER_PREFIX_RE = new RegExp(`^\\[(${MARKER_CLASS})\\]\\s*`);

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
  stateClassesFor, parseInlineState, stateHtml, stateElement, stateClassList,
  MARKERS, MARKER_LABELS, MARKER_CLASS, LEADING_MARKER_RE, LEADING_MARKER_PREFIX_RE,
};
