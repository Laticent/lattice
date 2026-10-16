/**
 * The list-text readers as they were before Segno phase 3 — FROZEN, verbatim (at f75d280).
 *
 * Segno phase 3 replaced every one of these with a reader that walks a parser generated from
 * lib/core/list-text-grammar.js. This copy is what tools/parser-bakeoff/freeze-list-text.mjs reads
 * to write the oracle (test/unit/tools/fixtures/list-text.frozen.json); nothing in lib/ may read
 * it. Each block names the file and the line it came from. Only the marker class is inlined
 * (it was `MARKER_CLASS` from lib/core/state-marks.js, whose value is unchanged).
 *
 * The Compose editor's four readers joined later, copied at 7a7ad30 before their own swap.
 *
 * Do not fix bugs here: a fix would change the oracle.
 */

// lib/core/state-marks.js
const MARKER_CLASS = '[x\\-!? /]';
const LEADING_MARKER_RE = new RegExp(`^\\[(${MARKER_CLASS})\\]\\s*(.*)$`);
const LEADING_MARKER_PREFIX_RE = new RegExp(`^\\[(${MARKER_CLASS})\\]\\s*`);

// lib/core/chart-narration.js (markedCell, without its cleanLabel pass)
const MARKED_CELL = new RegExp(`^(?:<[^>]+>\\s*)?\\[(${MARKER_CLASS})\\]\\s*(.*)$`);

// lib/components/chart/roadmap/roadmap.transform.js
const CELL_MARKER_RE = new RegExp(`^\\s*(?:<[^>]+>\\s*)?\\[(${MARKER_CLASS})\\]\\s*`);
const CELL_MARKER_STRIP_RE = new RegExp(`^\\s*(<[^>]+>\\s*)?\\[${MARKER_CLASS}\\]\\s*`);

// lib/core/table-row-label.js
const MARKER_CELL = new RegExp(`^\\[${MARKER_CLASS}\\]$`, 'i');

// lib/core/matrix-grid-cells.js
const CELL_MARKER = /^\[([x\- ])\][ \t]{0,8}(.*)$/;
const SHAPES = { x: 'cell-filled', '-': 'cell-outlined', ' ': 'cell-empty' };
const STATE_LABELS = { 'cell-filled': '', 'cell-outlined': 'reachable', 'cell-empty': 'not applicable' };
function parseCell(text) {
  const m = CELL_MARKER.exec(String(text ?? '').trim());
  if (!m) return null;
  const shape = SHAPES[m[1]];
  return { shape, label: shape === 'cell-filled' ? m[2] : '', stateLabel: STATE_LABELS[shape] };
}

// lib/core/chart-narration.js narrateMatrixGrid: its own matrix-grid cell (without cleanLabel)
// and the one-character bracket it strips before a cell is said
const GRID_SPOKEN = /^\[([x\- ])\][ \t]*(.*)$/;
const SPOKEN_BRACKET = /^\[[^\]]\]\s*/;

// The Studio's Compose editor (copied at 7a7ad30, before the editor swap):
// docs/src/lib/compose/table-commands.ts CELL_MARKER and CELL_MARKER_BARE, and
// docs/src/components/studio/ComposeView.tsx CELL_MARKER_RE (the same shape as CELL_MARKER_BARE)
const EDIT_CELL_MARKER = new RegExp(`^\\[(${MARKER_CLASS})\\]\\s?`);
const EDIT_CELL_MARKER_BARE = new RegExp(`^\\[(${MARKER_CLASS})\\]`);
// docs/src/lib/compose/deck-markdown.ts ESCAPED_LEADING_MARKER_RE
const ESCAPED_LEADING_MARKER_RE = new RegExp(`^\\\\\\[(${MARKER_CLASS})\\\\\\]`);

// lib/core/track-spec.js
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
function parseTrackSpec(spec) {
  const labels = [];
  let current = -1;
  for (const raw of String(spec ?? '').split('|')) {
    const item = tidy(raw);
    if (!item) continue;
    const marked = item.length >= 2 && item.startsWith('[') && item.endsWith(']');
    const label = marked ? tidy(item.slice(1, -1)) : item;
    if (!label) continue;
    if (marked && current === -1) current = labels.length;
    labels.push(label);
  }
  return { labels, current };
}

/**
 * Every reader, as each caller used it, in the shape the freeze records. The shipped side
 * (tools/parser-bakeoff/list-text.mjs `shippedReaders`) returns the same shapes.
 */
const readers = {
  // plugins.js verdictGridBadges / obligationMatrixBadges, runtime/index.js: marker and rest
  line: (s) => { const m = LEADING_MARKER_RE.exec(s); return m ? [m[1], m[2]] : null; },
  // plugins.js / runtime/index.js list items, slide-speech.js cells: marker and prefix length
  lead: (s) => { const m = LEADING_MARKER_PREFIX_RE.exec(s); return m ? [m[1], m[0].length] : null; },
  // chart-narration.js markedCell
  cell: (s) => { const m = String(s).match(MARKED_CELL); return m ? [m[1], m[2]] : null; },
  // roadmap.transform.js: marker and the cell with the marker stripped
  roadmap: (s) => { const m = CELL_MARKER_RE.exec(s); return m ? [m[1], s.replace(CELL_MARKER_STRIP_RE, '$1')] : null; },
  // table-row-label.js
  bare: (s) => MARKER_CELL.test(s),
  grid: (s) => parseCell(s),
  track: (s) => parseTrackSpec(s),
  // chart-narration.js narrateMatrixGrid gridCell. RETIRED from the oracle (not in READERS) since
  // narration reads `grid`; kept so this copy stays verbatim.
  spokenGrid: (s) => { const m = String(s).match(GRID_SPOKEN); return m ? [m[1], m[2]] : null; },
  // table-commands.ts setCellMarker: marker and the length it replaces (marker + one space)
  edit: (s) => { const m = EDIT_CELL_MARKER.exec(s); return m ? [m[1], m[0].length] : null; },
  // table-commands.ts currentCellMarker, ComposeView.tsx stateMarkerPlugin: the marker
  editBare: (s) => { const m = EDIT_CELL_MARKER_BARE.exec(s); return m ? m[1] : null; },
  // deck-markdown.ts serializeCell: the cell with a leading escaped marker un-escaped
  unescape: (s) => s.replace(ESCAPED_LEADING_MARKER_RE, '[$1]'),
  // chart-narration.js narrateMatrixGrid: the cell's words with a leading `[?]` stripped
  unbracket: (s) => s.replace(SPOKEN_BRACKET, ''),
};

module.exports = { readers, parseTrackSpec, parseCell };
