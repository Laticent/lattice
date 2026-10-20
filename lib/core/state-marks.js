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
 * THE CHECK REGISTRY — the six answers as ONE table (engineering/decisions/2026-10-18-checks.md
 * §4 rule 4: the vocabulary is data). A row holds everything the engine knows about an
 * answer, so adding or changing one is a row edit and not a hunt through three files:
 *
 *   id      the semantic class (`pass`) and the answer id a future `@check{…}` takes
 *   marker  the typed shortcut character (`x`; `[x]`)
 *   shape   the shape class (`state-full`); the CSS maps it to the drawing in `mask`
 *   label   the universal spoken word; the disc carries it on `aria-label`
 *   mask    the `--mark-*` token the drawing reads, or null for the hollow ring (no mask)
 *   tone    the color token the disc takes by default (a layout may retune it)
 *   words   per-layout spoken words: a layout speaks the same answer in its own register
 *
 * `tone` and `mask` are declarations the stylesheets honor: base.modifiers.css maps shape to
 * mask, and the tone rules assign `--state-color`. A unit test pins both against the CSS, so
 * the table cannot drift from the drawing. The DERIVED exports below keep their old names
 * and shapes, so no reader changes.
 */
const CHECKS = Object.freeze([
  {
    id: 'pass', marker: 'x', shape: 'state-full', label: 'yes', mask: '--mark-check', tone: '--pass',
    words: { checklist: 'done', 'verdict-grid': 'yes', pricing: 'included', 'obligation-matrix': 'applies' },
  },
  {
    id: 'warn', marker: '-', shape: 'state-half', label: 'partly', mask: '--mark-dash', tone: '--warn',
    words: { checklist: 'partial', 'verdict-grid': 'partial', pricing: 'limited', 'obligation-matrix': 'partial' },
  },
  {
    id: 'fail', marker: '!', shape: 'state-empty', label: 'no', mask: '--mark-x', tone: '--fail',
    words: { checklist: 'failed', 'verdict-grid': 'no', pricing: 'missing', 'obligation-matrix': 'not required' },
  },
  {
    id: 'unknown', marker: '?', shape: 'state-unknown', label: 'unknown', mask: '--mark-question', tone: '--muted-mark',
    words: { checklist: 'unknown', 'verdict-grid': 'unknown', pricing: 'ask sales', 'obligation-matrix': 'unclear' },
  },
  {
    id: 'todo', marker: ' ', shape: 'state-todo', label: 'open', mask: null, tone: '--muted-mark',
    words: { checklist: 'to do', 'verdict-grid': 'not assessed', pricing: 'coming', 'obligation-matrix': 'undetermined' },
  },
  {
    id: 'skip', marker: '/', shape: 'state-slashed', label: 'does not apply', mask: '--mark-slash', tone: '--muted-mark',
    words: { checklist: 'skipped', 'verdict-grid': 'not applicable', pricing: 'not included', 'obligation-matrix': 'exempt' },
  },
].map((row) => Object.freeze({ ...row, words: Object.freeze({ ...row.words }) })));

/** Marker character → semantic + shape classes. Derived from CHECKS. */
const STATE_CLASSES = Object.freeze(Object.fromEntries(
  CHECKS.map((c) => [c.marker, Object.freeze({ sem: c.id, shape: c.shape })]),
));

/**
 * @param {string} marker one of the six marker characters (`x` `-` `!` `?` ` ` `/`)
 * @returns {{sem:string, shape:string}|null}
 */
function stateClassesFor(marker) {
  const c = STATE_CLASSES[marker];
  return c ? { sem: c.sem, shape: c.shape } : null;
}

/** Spoken name per marker — the universal words. A layout may speak its own words for the
 * same answer (`CHECKS[].words`, prose-projection WORD_MAPS, manifest label sets). The disc
 * carries this on `aria-label`, never as text. Derived from CHECKS. */
const MARKER_LABELS = Object.freeze(Object.fromEntries(CHECKS.map((c) => [c.marker, c.label])));

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
  stateClassesFor, parseInlineState, stateHtml, stateElement, stateClassList,
  MARKERS, MARKER_LABELS, MARKER_CLASS, CHECKS,
};
