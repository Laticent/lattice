/** The pie chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

// The key prints a slice's name without decoding entities, so the name must come back encoded the way
// markdown-it encoded it: `&<>"`, but not `'`. `esc` writes `'` as `&#39;`, which the key then shows
// as the literal text `&#39;`. A bare `'` in element text is inert, so this stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

// The kernel keeps a value as markdown-it wrote it inside `<code>`, entities and all, so the attribute
// decodes to source text. Decode it once, in one pass, and encode it back the way markdown-it does.
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const fromSource = (s) => escText(String(s).replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]));

/**
 * PIECHART (and its `donut` variant, which rides on the section's class, not the list). The kernel
 * draws one `path.wedge[data-mark]` per slice, in authored order, and writes the slice's name
 * (`data-label`) and its value as written (`data-value`) on it. A slice the author gave no value has
 * no `data-value`: the kernel sizes it as zero and prints `0` in the key, so a bare name redraws the
 * same. A slice's note comes back as a placeholder the redraw swaps for the exported template node.
 */
function readPiechart(body) {
  if (uncarried(body)) return null;
  const wedges = [...body.querySelectorAll('path.wedge[data-mark]')];
  if (!wedges.length) return null;
  // The kernel draws every slice, numbered 0..n-1. A gap means a slice the marks do not carry.
  if (wedges.some((w, k) => Number(w.dataset.mark) !== k)) return null;
  const items = [];
  for (const [i, w] of wedges.entries()) {
    const label = w.dataset.label || '';
    if (shortened(label)) return null;
    const value = w.dataset.value;
    const pill = value === undefined ? '' : ` <code>${fromSource(value)}</code>`;
    items.push(`<li>${escText(label)}${pill}${noteFor(body, i)}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'piechart', read: readPiechart };
