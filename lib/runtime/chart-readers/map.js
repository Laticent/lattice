/** The map chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

// The key prints a region's name without decoding entities, so the name must come back encoded the way
// markdown-it encoded it: `&<>"`, but not `'`. `esc` writes `'` as `&#39;`, which the key then shows
// as the literal text `&#39;`. A bare `'` in element text is inert, so this stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

// The kernel keeps a value as markdown-it wrote it inside `<code>`, entities and all, so the attribute
// decodes to source text. Decode it once, in one pass, and encode it back the way markdown-it does.
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const fromSource = (s) => escText(String(s).replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]));

/**
 * MAP. The kernel draws every basemap region; a region an authored row names carries that row's index
 * (`data-mark`), its name as written (`data-label`) and its value as written (`data-value`). A group
 * row (`European Union`) paints many regions with one mark. The basemap (`us`, `robinson`) and the read
 * mode (`highlight`, `grouped`) ride on the section's class, not the list.
 *
 * A row the basemap could not match draws no region. The kernel lists its name in the figure's
 * `data-unmatched` and as a `?` row in the key, and never shows its value, so a bare name redraws it.
 */
function readMap(body) {
  if (uncarried(body)) return null;
  const figure = body.querySelector('.map-figure');
  if (!figure) return null;
  const rows = new Map();
  for (const p of body.querySelectorAll('path.map-region[data-mark]')) {
    const i = p.dataset.mark;
    const row = { label: p.dataset.label || '', value: p.dataset.value };
    const seen = rows.get(i);
    // Every region of one row carries the same name and value; anything else is not this kernel's drawing.
    if (seen && (seen.label !== row.label || seen.value !== row.value)) return null;
    rows.set(i, row);
  }
  // Rows are numbered 0..n-1. A gap is a row whose every region a later row painted over (`France`,
  // then `European Union`): its name and value are on no mark, so a redraw would lose it.
  const indices = [...rows.keys()].map(Number).sort((a, b) => a - b);
  if (indices.some((n, k) => n !== k)) return null;
  const items = [];
  for (const n of indices) {
    const { label, value } = rows.get(String(n));
    if (shortened(label)) return null;
    const pill = value === undefined ? '' : ` <code>${fromSource(value)}</code>`;
    items.push(`<li>${escText(label)}${pill}${noteFor(body, n)}</li>`);
  }
  // The kernel joins unmatched names with ", ", so a name holding ", " would split wrong. The key draws
  // one `?` row per unmatched name; refuse unless the two counts agree.
  const unmatchedAttr = figure.getAttribute('data-unmatched');
  const unmatched = unmatchedAttr == null ? [] : unmatchedAttr.split(', ');
  const askRows = [...body.querySelectorAll('text.chart-key-value:not([data-mark-for])')]
    .filter((t) => t.textContent.trim() === '?').length;
  if (unmatched.length !== askRows) return null;
  // An unmatched row takes no mark, no hue slot and no note, so its place in the list changes nothing.
  for (const name of unmatched) {
    if (!name || shortened(name)) return null;
    items.push(`<li>${escText(name)}</li>`);
  }
  if (!items.length) return null;
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'map', read: readMap };
