/** The funnel chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

// `esc` writes `'` as `&#39;`; markdown-it leaves it bare. A bare `'` in element text is inert, so
// matching markdown-it keeps a redraw byte-identical and stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

// The kernel keeps a value as markdown-it wrote it inside `<code>`, entities and all, so the attribute
// decodes to source text. Decode it once, in one pass, and encode it back the way markdown-it does.
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const fromSource = (s) => escText(String(s).replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]));

/**
 * FUNNEL. The kernel draws one `polygon.funnel-band[data-mark]` per stage, in authored order, and
 * writes the stage's name (`data-label`) and its value as written (`data-value`) on it. A stage the
 * author gave no value has no `data-value`, so it reads back as a bare name. A stage's note comes
 * back as a placeholder the redraw swaps for the exported template node.
 */
function readFunnel(body) {
  if (uncarried(body)) return null;
  const bands = [...body.querySelectorAll('polygon.funnel-band[data-mark]')];
  // The kernel declines a list of fewer than two stages, so fewer bands means this is not its drawing.
  if (bands.length < 2) return null;
  // Every stage gets a band, numbered 0..n-1. A gap means a stage the marks do not carry.
  if (bands.some((b, k) => Number(b.dataset.mark) !== k)) return null;
  const items = [];
  for (const [i, b] of bands.entries()) {
    const label = b.dataset.label || '';
    if (shortened(label)) return null;
    const value = b.dataset.value;
    const pill = value === undefined ? '' : ` <code>${fromSource(value)}</code>`;
    items.push(`<li>${escText(label)}${pill}${noteFor(body, i)}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'funnel', read: readFunnel };
