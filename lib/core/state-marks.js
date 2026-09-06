/**
 * STATE MARKS — the `[x]` `[-]` `[ ]` `[/]` vocabulary, in one place.
 *
 * The marker → (semantic, shape) decision is the same on every surface that draws a
 * state: `checklist` rows, `obligation-matrix` and `verdict-grid` badges, `matrix-grid`
 * cells, and now an INLINE mark written as `` `[x]` `` anywhere inline code can go.
 *
 * It used to live twice — `lib/integrations/markdown-it/plugins.js` and
 * `lib/runtime/index.js` each carried a private copy, which is exactly the drift HARD
 * RULE #1 exists to stop. Adding a third consumer is what forced the unification; both
 * originals now import from here.
 *
 * Pure: no DOM, no markdown-it, no fs.
 */

/**
 * @param {string} marker one of `x`, `-`, `/`, ` `
 * @param {boolean} neutralEmpty `[ ]` is OVERLOADED: a neutral "not started" in
 *   checklist (todo), obligation-matrix (exempt) and roadmap (planned), but "not met"
 *   in verdict-grid. `true` picks the neutral open ring; the default keeps the not-met
 *   treatment. An INLINE mark uses the neutral reading — a bare `[ ]` in a sentence is
 *   an unchecked box, not a failure.
 */
function stateClassesFor(marker, neutralEmpty = false) {
  if (marker === 'x') return { sem: 'pass', shape: 'state-full' };
  if (marker === '-') return { sem: 'warn', shape: 'state-half' };
  if (marker === '/') return { sem: 'skip', shape: 'state-slashed' };
  return neutralEmpty
    ? { sem: 'todo', shape: 'state-todo' }
    : { sem: 'fail', shape: 'state-empty' };
}

/** Spoken name per marker. The disc carries this on `aria-label`, never as text. */
const MARKER_LABELS = Object.freeze({
  x: 'done',
  '-': 'partial',
  '/': 'skipped',
  ' ': 'to do',
});

/** The four canonical markers, and nothing near them. `[?]` and `[!]` are NOT markers. */
const MARKERS = Object.freeze(['x', '-', '/', ' ']);

/**
 * Is this inline-code text a state marker? `[x]`, `[-]`, `[ ]`, `[/]` — exactly, with
 * nothing around them.
 *
 * DELIBERATELY NARROW. This grammar reads every single-backtick span in every deck, and
 * `[` opens a CSS attribute selector (`[data-mark]`), an array index, a citation. Only
 * the four exact three-character forms dispatch; everything else stays literal, which is
 * what keeps `` `[data-mark]` `` and `` `[0]` `` untouched.
 *
 * @returns {{marker:string, sem:string, shape:string, label:string}|null}
 */
function parseInlineState(text) {
  if (typeof text !== 'string' || text.length !== 3) return null;
  if (text.charCodeAt(0) !== 0x5b /* [ */ || text.charCodeAt(2) !== 0x5d /* ] */) return null;
  const marker = text[1];
  if (!MARKERS.includes(marker)) return null;
  const { sem, shape } = stateClassesFor(marker, true);
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
  MARKERS, MARKER_LABELS,
};
