/**
 * lib/core/record-dom.js
 *
 * The browser's reading of "is this inline-code element a chart row's `{…}` record": the DOM twin of the engine's pill
 * pass (lib/integrations/markdown-it/plugins.js, which counts place from tokens in lib/core/chart-places.js). Both ask
 * the one decision, `ownsRecordSpan` (lib/core/chart-rows.js); this measures the span's place from the DOM, because the
 * runtime and the docs site cannot run markdown-it, and test/unit/core/place-oracle.test.js holds it to the engine's answer.
 *
 * It lives apart from resolve-inline-code.js on purpose: that module is imported by the engine, whose route budget
 * (docs/route-budget.json `engineJsGz`) would otherwise pay for DOM code only the runtime and the authoring bundle run.
 */

const { recordChart, ownsRecordSpan } = require('./chart-rows');
const { isOwnedRowSpan } = require('./resolve-inline-code');

/**
 * Is this inline-code element a span its component owns — on a list row of an owning slide, no
 * deeper than the owner reads, and in the list it reads? The runtime's gate; the markdown-it
 * plugin and lint ask `ownedRowDepth` and `ownsFirstListOnly` of the slide and count themselves.
 */
function isOwnedElement(el) {
  return isOwnedRowSpan(el) || isOwnedRecordElement(el);
}

/**
 * Is this inline-code element a chart row's DATA RECORD (`{4.2M, target=5.0M}`), which the chart
 * reads itself? The DOM mirror of the engine's check in `inlinePills`: both ask
 * `ownsRecordSpan` (lib/core/chart-rows.js), each measuring the span's place its own way. The span
 * must be a direct child of its row's lead (`li`, its `p`) or fill its table cell, last in it, outside
 * a quote, with no code right before it.
 */
function isOwnedRecordElement(el, scope) {
  if (!el || typeof el.closest !== 'function') return false;
  // `scope` is the slide's section when the caller already iterates it (matrix-grid's pass): a raw `<section>` the
  // author wrote inside the slide is the nearest section of its content, and carries no chart class.
  const section = scope || el.closest('section');
  if (!section) return false;
  const classes = [...section.classList];
  if (!recordChart(classes)) return false;
  const block = el.parentElement;
  const cell = block?.localName === 'td';
  const table = cell ? block.closest('table') : null;
  const inHead = /^(?:p|h[1-6])$/.test(block?.localName || '') && block.parentElement?.localName === 'li';
  if (!cell && block?.localName !== 'li' && !inHead) return false;
  // Only blank text is blank: a comment between spans is content, as the pill pass counts it (an `html_inline` kid).
  const blank = (n) => n.nodeType === 3 && !n.textContent.trim();
  let lastInRow = true;
  for (let n = el.nextSibling; n; n = n.nextSibling) {
    if (blank(n)) continue;
    if (!cell && n.nodeType === 1 && LEAD_ENDS.has(n.tagName)) break; // the lead ends here
    lastInRow = false;
    break;
  }
  let before = el.previousSibling;
  while (before && blank(before)) before = before.previousSibling;
  if (cell && before) lastInRow = false; // the record is the whole cell
  // Only a row's last span can be its record, so the rest answer before the row's lead is read (a row of many spans stays linear).
  if (!lastInRow) return false;
  let depth = 0;
  const lis = []; // the enclosing list items, innermost first
  let outer = null;
  let wrapped = false; // a list straight inside another list is raw HTML around it, which the engine counts as a list ahead
  for (let n = el.parentElement; n && n !== section; n = n.parentElement) {
    if (n.localName === 'li') { depth++; lis.push(n); }
    if (n.localName === 'ul' || n.localName === 'ol') {
      outer = n;
      const up = n.parentElement;
      // Only a wrapper outside every list item: the engine counts raw lists at the slide's top level, not inside a row.
      if ((up?.localName === 'ul' || up?.localName === 'ol') && !up.parentElement?.closest('li')) wrapped = true;
    }
  }
  const place = {
    firstList: cell ? table === section.querySelector('table') : !wrapped && outer === section.querySelector('ul, ol'),
    cell, depth, lastInRow, // A pill the pass already drew from an earlier span was code in the source (`wasCode` in the engine).
    afterCode: Boolean(before && (before.localName === 'code' || before.classList?.contains('lat-pill'))),
    quoted: Boolean(el.closest('blockquote')),
  };
  if (!cell) {
    const lead = leadOf(lis[0]);
    place.ancestors = lis.slice(1).reverse().map((li) => leadOf(li).spans);
    place.lead = lead.region === block && lead.nodes.includes(el);
    place.leadSpans = place.lead ? lead.spans : [];
    place.at = place.lead ? lead.nodes.indexOf(el) : -1;
  }
  return ownsRecordSpan(classes, el.textContent || '', place);
}

/** Block elements that end a list item's lead when they follow it (a nested list, a quote, or a later block). */
const LEAD_ENDS = new Set(['UL', 'OL', 'BLOCKQUOTE', 'P', 'TABLE', 'PRE', 'DIV', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * A list item's lead: the paragraph or heading its first block is, or (a tight item) its own inline run before
 * the first block. Returns the container, its code nodes, and their texts. A pill the pass already drew from
 * a code span reads back as `{label}`: the source text is gone, and the label is enough to tell a value.
 */
function leadOf(li) {
  const first = [...li.childNodes].find((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
  const head = first && first.nodeType === 1 && /^(?:p|h[1-6])$/.test(first.localName);
  const region = head ? first : li;
  const nodes = [];
  for (const n of region.childNodes) {
    if (n.nodeType === 1 && LEAD_ENDS.has(n.tagName)) break;
    if (n.nodeType !== 1) continue;
    if (n.localName === 'code' || n.classList?.contains('lat-pill')) nodes.push(n);
    // Inside an inline wrapper (`**`40`**`, a link, emphasis): the engine's flat inline tokens count that span too.
    else nodes.push(...n.querySelectorAll('code, .lat-pill'));
  }
  return { region, nodes, spans: nodes.map(spanSource) };
}

/** The source text of the pills this runtime drew, by element: a drawn pill loses it, and the label is not enough to recover it. */
const PILL_SOURCE = new WeakMap();
function rememberPillSource(el, text) {
  PILL_SOURCE.set(el, text);
}

/**
 * The source text of a code node in a lead. A pill this runtime drew answers with its remembered source. One the engine drew
 * (its source is gone) answers `{label}` only when it is a bare label pill, which is how the engine decided it; a badge
 * (`{1, circle, c5}`) or a tag has a shape or a color, so it is not a value.
 */
function spanSource(n) {
  // An escape (`\{4}`) was resolved in place: the pill pass read its raw source, which is no value.
  if (n.localName === 'code') return n.hasAttribute?.('data-lat-escaped') ? `\\${n.textContent}` : n.textContent;
  if (PILL_SOURCE.has(n)) return PILL_SOURCE.get(n);
  const bare = n.getAttribute?.('data-shape') === 'pill' && !n.hasAttribute('data-c') && !n.hasAttribute('data-size');
  return bare ? `{${n.textContent}}` : '{pill}';
}

module.exports = {
  isOwnedElement,
  isOwnedRecordElement,
  rememberPillSource,
};
