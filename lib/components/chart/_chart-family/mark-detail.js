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
 * can import it without a circular dependency on the chart family's dispatch (lib/plugins/chart-family/chart-family.dispatch.js) (which
 * requires THEM) — core cycles with nothing. This is the generalization
 * of buildPieChart's inline detail capture + buildPieDetailNote (Hard Rules #1/#15).
 */

// Canonical depth-aware list walkers (lib/core/html-lists.js) — these were
// local copies kept to avoid a cycle with chart-family; core has no cycle.
// Re-exported below because tests + kernels use them under these names.
const { parseTopLevelLis: topLevelLis, extractFirstList } = require('../../../core/html-lists');

/**
 * A ROW'S DESCRIPTION: the `>` blockquote an author writes indented under a chart's list item
 * (the chart authoring model, engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
 * §3 decision 5). Lifts every blockquote that is a DIRECT child of the item out of it, so the
 * row's own reader sees only its label, value and nested list, and returns the quotes' inner HTML,
 * rendered Markdown with its paragraphs, lists, pills and sparks intact. A quote nested deeper
 * (inside a sublist item) belongs to that item and is left where it is.
 *
 * Before this, a quote under a row made the reader miss the row's value: bar, map, scatter and
 * bullet dropped the mark, waterfall the chart, pie and funnel the value.
 *
 * @param {string} item  one `<li>`'s inner HTML
 * @returns {{ item: string, desc: string }}  the item without its quotes, and their inner HTML
 *          ('' when it has none)
 */
function takeRowDescription(item) {
  const src = String(item);
  if (!src.includes('<blockquote')) return { item: src, desc: '' };
  const tag = /<(\/?)(ul|ol|li|blockquote)\b[^>]*>/gi;
  let depth = 0;         // open ul / ol / li / blockquote above the scan point
  let start = -1;        // where the current top-level quote opened
  let innerStart = -1;
  let out = '';
  let last = 0;
  const descs = [];
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (!closing) {
      if (name === 'blockquote' && depth === 0) { start = m.index; innerStart = m.index + m[0].length; }
      depth++;
    } else {
      depth--;
      if (name === 'blockquote' && depth === 0 && start >= 0) {
        descs.push(src.slice(innerStart, m.index).trim());
        out += src.slice(last, start);
        last = m.index + m[0].length;
        start = -1;
      }
    }
  }
  if (!descs.length) return { item: src, desc: '' };
  out += src.slice(last);
  return { item: out.replace(/\n{3,}/g, '\n\n'), desc: descs.join('\n') };
}

/** The first detail entry a row's description becomes: one `<li>` holding the rich HTML. */
function descItem(desc) {
  return desc ? `<li>${desc}</li>` : '';
}

/**
 * Split a chart row into its lead (label and value) and its detail: the row's `>` description
 * first, then the items of its first nested list. Both are HTML.
 */
function splitDetail(row) {
  const { item, desc } = takeRowDescription(row);
  const nestedIdx = item.search(/<ul[^>]*>/);
  if (nestedIdx < 0) return { lead: item, detail: descItem(desc) };
  const ext = extractFirstList(item.slice(nestedIdx));
  return { lead: item.slice(0, nestedIdx), detail: descItem(desc) + (ext ? ext.inner.trim() : '') };
}

/**
 * Detail is RICH HTML (a row's description keeps its Markdown), and the engine renders with
 * `html: true`, so an author's raw HTML reaches here as written. Two kinds of tag would break the
 * inert `<template>`, and this turns both into text:
 *   - A closing `</template` ends the element, and every byte after it becomes live markup in
 *     the rendered document, the HARD RULE #22 sink (a Studio preview's srcdoc, and an export
 *     with no sanitizer). A nested `<template` opener would need a second close, so it goes too.
 *   - An opener the parser reads as RAW text up to its own end tag: a comment (`<!--`), and
 *     `textarea`, `title`, `xmp`, `plaintext`, `noembed`, `noframes`, `noscript`, `style`,
 *     `script`, `iframe`. Left unclosed (`> <!-- todo`), it swallows the `</template>` and every
 *     slide after it: the red team's repro lost the rest of the deck.
 * Everything else in it is HTML the slide face would render anyway. Each chart used to flatten
 * its detail to escaped plain text for this reason, which is why a pill, a spark or a sublist
 * never reached the popover.
 */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * Close what an author's raw HTML left open, and escape a close tag with no opener, so a
 * detail fragment is balanced. The engine's later passes find a chart figure's end by counting
 * tags, and `> <div>` under a row, left open, made the whole chart revert to its list (the red
 * team's repro). The HTML parser would close the tag at `</template>` anyway; this just says so
 * in the string.
 */
function balanceTags(html) {
  const stack = [];
  const out = String(html).replace(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g, (tag, close, rawName, selfClose) => {
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClose) return tag;
    if (!close) { stack.push(name); return tag; }
    const at = stack.lastIndexOf(name);
    if (at < 0) return `&lt;${tag.slice(1)}`;
    const implied = stack.splice(at).slice(1).reverse().map((n) => `</${n}>`).join('');
    return implied + tag;
  });
  return out + stack.reverse().map((n) => `</${n}>`).join('');
}

function templateSafe(html) {
  return balanceTags(String(html)

    .replace(/<(\/?template)/gi, '&lt;$1')
    .replace(/<!--/g, '&lt;!--')
    .replace(/<(?=(?:textarea|title|xmp|plaintext|noembed|noframes|noscript|style|script|iframe)[\s/>])/gi, '&lt;'));
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
      ? `<template class="chart-detail" data-mark="${idx}">${templateSafe(m.detail)}</template>`
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
  // A block end (a paragraph, a list item) is a pause, so a description's sublist does not run
  // into its sentence: "Up on the year · two new distributors".
  const flatten = (html) => String(html)
    .replace(/<\/(?:p|li)>/gi, ' · ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*·\s*)+/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
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

module.exports = { splitDetail, takeRowDescription, descItem, templateSafe, detailPayload, detailNote, extractFirstList, topLevelLis };
