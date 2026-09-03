/**
 * list-tabular marks cell — the shared kernel behind the trailing sublist
 * bullet that carries a row's checkbox and its pills.
 *
 * A list-tabular row is `name` + nested bullets. The last thing an author wants
 * to hang off a row is its status: a state marker, some pills, or both. So any
 * nested bullet holding only those becomes the row's MARKS cell — it leaves the
 * description column and lands right-aligned in the trailing column:
 *
 *     1. Row name
 *        - The description clause sits here.
 *        - [x] `stable` `v2`      →  (o) STABLE V2, right-aligned
 *
 * Two shapes qualify, and either alone is enough:
 *   - a bullet whose text opens with a state marker `[x]` / `[-]` / `[ ]` / `[/]`
 *     (the universal grammar — see `stateClassesFor`), optionally followed by a
 *     label and pills;
 *   - a bullet that is NOTHING BUT inline `code` pills.
 * Anything else is prose and stays the description.
 *
 * `[ ]` decodes NEUTRAL here (todo, a hollow ring), matching checklist rather
 * than verdict-grid: an unchecked row in a ledger reads "not yet", not "failed".
 *
 * The marker is STRIPPED and drawn as a disc (HARD RULE #29) — a typed `[x]` is
 * what a row rendered before this kernel existed, and a typed check is exactly
 * the shape that lands as a different font, a color emoji, or a hollow box
 * depending on the machine.
 *
 * The disc is a SPAN, not a pseudo-element on the `<li>`, because the cell also
 * holds pills and the disc needs its own box in the flex row. It carries no text
 * at all: the state's word rides `role="img"` + `aria-label`, so a screen reader
 * gets it while `textContent` stays exactly the pills.
 * `lib/transformers/prose-projection.mjs` reads the state from the CLASS, not from
 * that word — a visually-hidden span was tried and removed, because it joined
 * `textContent` and so both doubled the spoken narration and printed on a split
 * page, whose section does not carry the class the clip rule was scoped to.
 *
 * One rule, two consumers (HARD RULE #1):
 *   1. lib/integrations/markdown-it/plugins.js `listTabularMarks` — the engine's
 *      render-time path (the `lattice` CLI, the emulator, the docs playground).
 *   2. lib/runtime/index.js `transformListTabularMarks` — the live-DOM path an
 *      Export-to-Marp bundle takes, where marp-core renders the markdown and
 *      never runs our markdown-it plugins.
 */

// `[x]` / `[-]` / `[ ]` / `[/]`, anchored, with a BOUNDED gap ({0,8}, not `\s*`):
// the runtime runs this over live-document text, and an unbounded `\s*` butted
// against the rest is the superlinear pair CodeQL flags on an untrusted source.
const ROW_MARKER = /^\[([x\-/ ])\][ \t]{0,8}/;

/** The class a qualifying bullet carries, with or without a state marker. */
const MARKS_CLASS = 'marks';

/**
 * Marker → semantic + shape classes. The neutral-empty reading of the universal
 * grammar (`stateClassesFor(marker, true)`), because a ledger's `[ ]` is "not yet
 * started", not "not met".
 */
const MARKER_STATES = {
  x: { sem: 'pass', shape: 'state-full', label: 'done' },
  '-': { sem: 'warn', shape: 'state-half', label: 'partial' },
  '/': { sem: 'skip', shape: 'state-slashed', label: 'skipped' },
  ' ': { sem: 'todo', shape: 'state-todo', label: 'to do' },
};

/**
 * Does this bullet's leading text open with a state marker?
 * @returns {{sem: string, shape: string, label: string, consumed: number}|null}
 */
function readMarker(text) {
  const m = ROW_MARKER.exec(String(text ?? ''));
  if (!m) return null;
  return { ...MARKER_STATES[m[1]], consumed: m[0].length };
}

/**
 * Is this bullet nothing but inline pills? `parts` describes the bullet's inline
 * content as `{ code: boolean, text: string }` — the two render paths build it
 * from markdown-it children and from DOM child nodes respectively, so the "only
 * pills" judgment itself lives here once.
 *
 * At least ONE pill is required: an empty bullet is authoring debris, not a marks
 * cell, and promoting it would move a blank line into the trailing column.
 */
function isPillsOnly(parts) {
  let sawCode = false;
  for (const part of parts) {
    if (part.code) {
      sawCode = true;
      continue;
    }
    if (String(part.text ?? '').trim() !== '') return false;
  }
  return sawCode;
}

/**
 * The disc, as an HTML STRING (the markdown-it path).
 *
 * The state's word rides `role="img"` + `aria-label`, NOT a visually-hidden inner
 * span, and both halves of that matter. A clipped span is still TEXT: it joins the
 * cell's `textContent`, so the spoken projection read "donestable" — the word
 * jammed against the pill beside it — and on a split page, where the carousel
 * re-authors rows onto sections that do not carry the `.list-tabular` class, the
 * clip rule never matched and the word printed on the slide at body size.
 * `aria-label` names the disc for a screen reader without putting a character in
 * the document, so neither can happen; `role="img"` is what makes a generic
 * `<span>` take the label at all.
 *
 * With the word out of `textContent`, lib/transformers/prose-projection.mjs is
 * free to speak it from the CLASS again — see its `list-tabular` word map.
 */
function stateHtml({ sem, shape, label }) {
  return `<span class="state ${sem} ${shape}" role="img" aria-label="${label}"></span>`;
}

/** The same disc as a real NODE, for the live-DOM path. */
function stateNode(doc, { sem, shape, label }) {
  const span = doc.createElement('span');
  span.className = `state ${sem} ${shape}`;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', label);
  return span;
}

/**
 * The element whose children carry a bullet's inline content.
 *
 * A TIGHT list item holds its text and pills directly; a LOOSE one (blank lines
 * between the bullets) has markdown-it wrap them in a single `<p>`. Both paths
 * must look in the same place or they disagree about whether a bullet is a marks
 * cell at all — the DOM mirror used to stop at that `<p>`, decide "an element
 * before any text, so no marker", and leave a typed `[x]` on the reader's slide
 * while the engine stripped it.
 *
 * The `<p>` must be the item's ONLY element child for this to be the content
 * host; anything else is an item with real structure, not a loose wrapper — a
 * bullet carrying a marker AND a following paragraph falls through to the `<li>`,
 * whose first child is whitespace, so it is not promoted. The markdown-it path
 * enforces the same single-block rule by rejecting a second `paragraph_open`,
 * which is what keeps the two paths agreeing on that shape.
 */
function contentHost(li) {
  const els = [...li.childNodes].filter((n) => n.nodeType === 1);
  const text = [...li.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim() !== '');
  if (!text && els.length === 1 && els[0].tagName === 'P') return els[0];
  return li;
}

module.exports = {
  ROW_MARKER, MARKS_CLASS, MARKER_STATES, readMarker, isPillsOnly, stateHtml, stateNode, contentHost,
};
