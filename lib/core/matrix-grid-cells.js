/**
 * matrix-grid cell markers — the shared kernel behind the bracket-marker cell
 * (`[x] Senior` / `[-]` / `[ ]`) that a matrix-grid table renders as a filled,
 * outlined, or empty swatch.
 *
 * One rule, two consumers (HARD RULE #1):
 *   1. lib/integrations/markdown-it/plugins.js `matrixGridCells` — the engine's
 *      render-time path (the `lattice` CLI, the emulator, the docs playground).
 *   2. lib/runtime/index.js `transformMatrixGridCells` — the live-DOM path an
 *      Export-to-Marp bundle takes, where marp-core renders the markdown and
 *      never runs our markdown-it plugins. Its siblings obligation-matrix and
 *      verdict-grid have always mirrored the same parse; matrix-grid did not,
 *      so its cells came out of a Marp render as literal `[x]` / `[-]` / `[ ]`
 *      text (engineering/gotchas.md § "Known preview gaps", 2026-07-27).
 *
 * The shape+hue alone carries NO accessible text for "reachable" / "not
 * applicable" (no WORD_MAPS entry keys on this component — see
 * lib/transformers/prose-projection.mjs), so a visually-hidden span names the
 * state for anything reading the DOM text rather than looking at the swatch.
 * Only a FILLED cell's slot holds a title; trailing text on `[-]` / `[ ]` is
 * authoring debris, since those are pure position markers.
 */

// `[x] Label` / `[-]` / `[ ]`, anchored — trailing text is captured but only
// kept for the filled shape. The gap is BOUNDED (`{0,8}`, not `\s*`): the
// runtime runs this over `td.textContent` off a live document, and an unbounded
// `\s*` butted against `(.*)` is an ambiguous pair on whitespace — the
// superlinear shape CodeQL flags on an untrusted source. A cell's marker gap is
// one space in practice.
const CELL_MARKER = /^\[([x\- ])\][ \t]{0,8}(.*)$/;

const SHAPES = { x: 'cell-filled', '-': 'cell-outlined', ' ': 'cell-empty' };
const STATE_LABELS = { 'cell-filled': '', 'cell-outlined': 'reachable', 'cell-empty': 'not applicable' };

/**
 * Parse one cell's trimmed text.
 * @returns {{shape: string, label: string, stateLabel: string}|null} null when
 *   the text is not a bracket marker (an ordinary label cell — leave it alone).
 */
function parseCell(text) {
  const m = CELL_MARKER.exec(String(text ?? '').trim());
  if (!m) return null;
  const shape = SHAPES[m[1]];
  return { shape, label: shape === 'cell-filled' ? m[2] : '', stateLabel: STATE_LABELS[shape] };
}

/**
 * The `<span class="cell …">` a parsed cell renders as, as an HTML STRING.
 * Only the markdown-it path uses this — it emits an `html_inline` token, so a
 * string is what it needs, and its `label` comes from already-parsed inline
 * source rather than from a live document.
 */
function cellHtml({ shape, label, stateLabel }) {
  const sr = stateLabel ? `<span class="cell-sr-label">${stateLabel}</span>` : '';
  return `<span class="cell ${shape}">${label}${sr}</span>`;
}

/**
 * The same cell as a real NODE, for the live-DOM path.
 *
 * Built element-by-element rather than by handing `cellHtml`'s string to
 * `innerHTML`, because on this path the label arrives from `td.textContent` —
 * document text. Interpolating it into markup would reinterpret DOM text as
 * HTML: a cell authored `[x] <img src=x onerror=…>` reads back as the literal
 * text `<img …>`, and assigning that to `innerHTML` re-parses it into a live
 * element. Setting `.textContent` keeps a label a label. (Same class of sink
 * HARD RULE #22 exists for; here the fix is structural rather than a sanitizer,
 * since nothing on this path is supposed to carry markup at all.)
 */
function cellNode(doc, { shape, label, stateLabel }) {
  const cell = doc.createElement('span');
  cell.className = `cell ${shape}`;
  if (label) cell.appendChild(doc.createTextNode(label));
  if (stateLabel) {
    const sr = doc.createElement('span');
    sr.className = 'cell-sr-label';
    sr.textContent = stateLabel;
    cell.appendChild(sr);
  }
  return cell;
}

/**
 * Live-DOM adapter: rewrite every bracket-marker `<td>` inside a matrix-grid
 * section. Idempotent — a cell already holding a `.cell` span is skipped, so the
 * repeated passes a live preview triggers are a no-op.
 */
function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;
  for (const section of scope.querySelectorAll('section.matrix-grid')) {
    for (const td of section.querySelectorAll('td')) {
      if (td.querySelector('.cell')) continue; // already transformed
      const parsed = parseCell(td.textContent);
      if (!parsed) continue;
      td.replaceChildren(cellNode(doc, parsed));
    }
  }
}

module.exports = { CELL_MARKER, parseCell, cellHtml, cellNode, applyToDom };
