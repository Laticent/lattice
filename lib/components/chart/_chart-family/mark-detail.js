/**
 * mark-detail — the shared substrate for per-mark interactive detail across the
 * SVG chart family (funnel / map / quadrant / radar today; the pie shipped the
 * pattern first with bespoke wiring — see
 * engineering/decisions/2026-06-20-chart-detail-reveal-family.md).
 *
 * One authored nested sublist under a chart's primary list item becomes TWO
 * coexisting surfaces, from one source:
 *   1. Present/Practice/Preview — an inert `<template class="chart-detail"
 *      data-mark="i">` (renders nothing) read by the parent-hosted reveal layer
 *      (docs/src/playground/chart-interact.js) via data-mark; the
 *      chart's mark element carries the matching `data-mark="i"`.
 *   2. Static PDF — the same detail folded into the slide's SPEAKER NOTE as a
 *      Marp-faithful `<!-- … -->` comment; notes-core lifts it into the per-slide
 *      note channel (a PDF text annotation + the hidden aside) and strips the
 *      comment BEFORE render, so the chart pixels stay byte-identical.
 *
 * Pure: HTML strings in, HTML strings out — no DOM, no markdown-it. Its only
 * import is the lib/core list walkers (html-lists.js), so the per-chart kernels
 * can import it without a circular dependency on chart-family.js (which
 * requires THEM) — core cycles with nothing. This is the generalization
 * of buildPieChart's inline detail capture + buildPieDetailNote (Hard Rules #1/#15).
 */

// Canonical depth-aware list walkers (lib/core/html-lists.js) — these were
// local copies kept to avoid a cycle with chart-family; core has no cycle.
// Re-exported below because tests + kernels use them under these names.
const { parseTopLevelLis: topLevelLis, extractFirstList } = require('../../../core/html-lists');

function splitDetail(item) {
  const nestedIdx = item.search(/<ul[^>]*>/);
  if (nestedIdx < 0) return { lead: item, detail: '' };
  const ext = extractFirstList(item.slice(nestedIdx));
  return { lead: item.slice(0, nestedIdx), detail: ext ? ext.inner.trim() : '' };
}

/**
 * Emit the inert `<template>` payload for a chart's captured details.
 * @param {Array<{detail?: string}>} marks  one entry per mark, in mark order
 * @returns {string}  `<div class="chart-details" hidden>…</div>` or '' if none
 * carry detail. The mark elements themselves get `data-mark="i"` from the kernel;
 * here we emit the matching `<template class="chart-detail" data-mark="i">`.
 */
function detailPayload(marks) {
  const templates = marks
    .map((m, idx) => m?.detail
      ? `<template class="chart-detail" data-mark="${idx}">${m.detail}</template>`
      : '')
    .join('');
  return templates ? `<div class="chart-details" hidden>${templates}</div>` : '';
}

/**
 * Fold a chart's per-mark detail into one Marp-faithful speaker-note comment.
 * notes-core lifts it into the slide note (PDF annotation + hidden aside) and
 * strips the comment before render — so a detail chart's PDF gains the notes
 * WITHOUT touching the chart pixels. Returns '' when no mark carries detail.
 * One line per detailed mark: `Label (value): item · item`. Comment-safe (a
 * stray `-->` inside the detail can't terminate the note early) and decoded to
 * plain text. Generalizes buildPieDetailNote.
 * @param {Array<{label?: string, valueRaw?: string, detail?: string}>} marks
 */
function detailNote(marks) {
  const flatten = (html) => String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = [];
  for (const m of marks) {
    if (!m?.detail) continue;
    const items = topLevelLis(m.detail).map(flatten).filter(Boolean);
    const body = items.length ? items.join(' · ') : flatten(m.detail);
    if (!body) continue;
    const label = flatten(m.label || '');
    const value = m.valueRaw ? `(${flatten(m.valueRaw)})` : '';
    lines.push(`${[label, value].filter(Boolean).join(' ')}: ${body}`.trim());
  }
  if (!lines.length) return '';
  const safe = lines.join('\n').replace(/--+>?/g, '—');
  return `<!-- ${safe} -->`;
}

module.exports = { splitDetail, detailPayload, detailNote, extractFirstList, topLevelLis };
