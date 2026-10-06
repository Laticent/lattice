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

// `[x] Label` / `[-]` / `[ ]`, the whole cell — trailing text is read but only
// kept for the filled shape. The list-text grammar's `grid` rule reads it
// (list-text-grammar.js, generated into list-text.generated.js; Segno phase 3):
// up to 8 spaces or tabs after the marker, then text on one line. The gap's
// bound is the expression's it replaced (`[ \t]{0,8}(.*)`); that bound kept the
// expression linear, and the generated parser is linear whatever the gap.
const listText = require('./list-text.generated.js');
const LIST_KIND = Object.fromEntries(listText.parse('', 'track').tree.kinds.map((k, i) => [k, i]));

const SHAPES = { x: 'cell-filled', '-': 'cell-outlined', ' ': 'cell-empty' };
const STATE_LABELS = { 'cell-filled': '', 'cell-outlined': 'reachable', 'cell-empty': 'not applicable' };

/**
 * Parse one cell's trimmed text.
 * @returns {{shape: string, label: string, stateLabel: string}|null} null when
 *   the text is not a bracket marker (an ordinary label cell — leave it alone).
 */
function parseCell(text) {
  const s = String(text ?? '').trim();
  const r = listText.parse(s, 'grid');
  if (!r.ok) return null;
  const { buf, top } = r.tree;
  let shape = '';
  let rest = s.length;
  for (let k = 0; k < top; k = buf[k + 3]) {
    if (buf[k] === LIST_KIND.mark) shape = SHAPES[s[buf[k + 1]]];
    else if (buf[k] === LIST_KIND.rest) rest = buf[k + 1];
  }
  return { shape, label: shape === 'cell-filled' ? s.slice(rest) : '', stateLabel: STATE_LABELS[shape] };
}

/** The four characters that would otherwise let a label leave its text position. */
function escapeText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The `<span class="cell …">` a parsed cell renders as, as an HTML STRING.
 * Only the markdown-it path uses this — it emits an `html_inline` token, so a
 * string is what it needs, and its `label` comes from already-parsed inline
 * source rather than from a live document.
 *
 * The label is ESCAPED, for the same reason `cellNode` builds a text node: the
 * label is the concatenated `.content` of the cell's inline children — decoded
 * source TEXT, which markdown-it would have escaped on its own way out. Handing
 * it to an `html_inline` token skips that escaping, so a cell authored
 * `[x] Fees & Duties` emitted a bare `&` and `[x] <b>Tier 1</b>` (under the
 * `html: true` both render paths parse with) turned author text into live markup
 * — on the same slide where the DOM mirror keeps it text. Escaping is what makes
 * the two paths agree, and a cell label is prose in every deck we ship.
 */
function cellHtml({ shape, label, stateLabel }, row) {
  const sr = stateLabel ? `<span class="cell-sr-label">${escapeText(stateLabel)}</span>` : '';
  // A filled cell's label is also its IDENTITY for the Present Guide, which points at the cell
  // whose label opens the sentence being read ("Junior sits at Remember and Self."). The DOM path
  // below stamps the same attribute, so the two render paths agree.
  const id = label ? ` data-label="${escapeText(label)}"` : '';
  const hue = markContract(shape, row);
  const attrs = hue ? Object.entries(hue).map(([k, v]) => ` ${k}="${v}"`).join('') : '';
  return `<span class="cell ${shape}"${id}${attrs}>${escapeText(label)}${sr}</span>`;
}

/**
 * The mark-contract attributes (slot-contract.md) for a FILLED cell: its body is the row's
 * category tint, so it names that row's hue — `(row % 8) + 1`, the same cycle the stylesheet's
 * `tbody tr:nth-child(8n+k)` rules paint. Outlined and empty cells have no body to repaint and
 * carry nothing. `row` is the 0-based body row; a caller that cannot know it passes nothing.
 */
function markContract(shape, row) {
  if (shape !== 'cell-filled' || !Number.isInteger(row) || row < 0) return null;
  return { 'data-hue': String((row % 8) + 1), 'data-encodes': 'hue', 'data-paint': 'bg' };
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
function cellNode(doc, { shape, label, stateLabel }, row) {
  const cell = doc.createElement('span');
  cell.className = `cell ${shape}`;
  if (label) {
    cell.setAttribute('data-label', label);
    cell.appendChild(doc.createTextNode(label));
  }
  for (const [k, v] of Object.entries(markContract(shape, row) || {})) cell.setAttribute(k, v);
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
      const tr = td.parentElement;
      const row = tr?.parentElement?.tagName === 'TBODY' ? [...tr.parentElement.children].indexOf(tr) : undefined;
      td.replaceChildren(cellNode(doc, parsed, row));
    }
  }
}

module.exports = { SHAPES, STATE_LABELS, parseCell, markContract, cellHtml, cellNode, applyToDom };
