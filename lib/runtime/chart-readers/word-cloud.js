/** The word-cloud chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

/**
 * WORD CLOUD. Each placed word is a `text.wc-word`, named by `data-label`, with its weight as written in
 * `data-raw` (JSON: one string, or none for a word with no pill) and its place in weight order in
 * `data-rank`. The words go back in rank order: the kernel sorts by weight and breaks ties by source order,
 * so rank order sorts to the same ranks, and the normalized weights depend only on the set of weights. A
 * word's note goes back as a placeholder, keyed by its `data-mark`.
 *
 * Refused: a cloud that could not seat every word (the packer drops it from the drawing, and the frame
 * records the drop as `data-label-drops` on the body), ranks with a gap, and a word whose canvas count
 * does not match the words drawn.
 */
function readWordCloud(body) {
  if (uncarried(body)) return null;
  if (body.hasAttribute('data-label-drops')) return null;
  const canvas = body.querySelector('.word-cloud-canvas');
  if (!canvas || body.querySelectorAll('.word-cloud-canvas').length !== 1) return null;
  const words = [...body.querySelectorAll('text.wc-word')];
  if (!words.length || Number(canvas.dataset.count) !== words.length) return null;
  // The ranks run 1..n with no gap, so no word the drawing ranked is missing.
  const ranked = words.map((w) => ({ w, rank: Number(w.dataset.rank) })).sort((a, b) => a.rank - b.rank);
  if (ranked.some((r, k) => r.rank !== k + 1)) return null;
  const items = [];
  for (const { w } of ranked) {
    let raw;
    try { raw = JSON.parse(w.getAttribute('data-raw')); } catch { return null; }
    if (!Array.isArray(raw) || raw.length > 1 || raw.some((r) => typeof r !== 'string')) return null;
    const label = w.dataset.label ?? '';
    if (!label || shortened(label)) return null;
    const mark = w.dataset.mark;
    items.push(`<li>${esc(label)}${raw.length ? ` <code>${esc(raw[0])}</code>` : ''}${mark === undefined ? '' : noteFor(body, mark)}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'word-cloud', read: readWordCloud };
