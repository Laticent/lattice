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
 * The disc is a SPAN, not a pseudo-element on the `<li>`, for two reasons the
 * checklist recipe does not face: the cell also holds pills, so the disc needs
 * its own box in the flex row; and the shape+hue alone carry no accessible text,
 * so the span holds a visually-hidden word naming the state. That word is also
 * why `lib/transformers/prose-projection.mjs` finds this cell — its `stateWordOf`
 * looks for a direct-child `.state`.
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

/** The `<span class="state …">` disc, as an HTML STRING (the markdown-it path). */
function stateHtml({ sem, shape, label }) {
  return `<span class="state ${sem} ${shape}"><span class="state-sr-label">${label}</span></span>`;
}

/** The same disc as a real NODE, for the live-DOM path. */
function stateNode(doc, { sem, shape, label }) {
  const span = doc.createElement('span');
  span.className = `state ${sem} ${shape}`;
  const sr = doc.createElement('span');
  sr.className = 'state-sr-label';
  sr.textContent = label;
  span.appendChild(sr);
  return span;
}

module.exports = { ROW_MARKER, MARKS_CLASS, MARKER_STATES, readMarker, isPillsOnly, stateHtml, stateNode };
