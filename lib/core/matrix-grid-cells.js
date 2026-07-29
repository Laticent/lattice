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
// kept for the filled shape.
const CELL_MARKER = /^\[([x\- ])\]\s*(.*)$/;

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

/** The `<span class="cell …">` a parsed cell renders as. */
function cellHtml({ shape, label, stateLabel }) {
  const sr = stateLabel ? `<span class="cell-sr-label">${stateLabel}</span>` : '';
  return `<span class="cell ${shape}">${label}${sr}</span>`;
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
      td.innerHTML = cellHtml(parsed);
    }
  }
}

module.exports = { CELL_MARKER, parseCell, cellHtml, applyToDom };
