/**
 * Focus resolver — tag the ordinal target of a `_focus:` directive.
 *
 * Design: engineering/decisions/2026-06-16-focus-highlighting.md. The author
 * names a target with an ordinal grammar on the slide directive —
 * `<!-- _focus: row 4 -->`, `item 3`, `col 5`, `cell 4,5`, `line 3-4`,
 * `row 2, row 5`, `item 2-4`. The directive apply step (lib/engine/directives.js)
 * has already stamped `data-focus="row 4"` on the <section>. This transformer
 * reads it, finds the slide's primary collection for that axis, and tags the
 * matched element(s) `.lat-focus` and their siblings `.lat-recede`. Treatment is
 * pure CSS keyed on those classes plus `data-focus-axis` / `data-focus-style`
 * (lib/base/base.focus.css); the engine never styles, only tags.
 *
 * Explicit tags (not `:nth-child`) are deliberate: the treatment CSS then needs
 * no `:has()` / `:not(:has())`, which are silently broken in the Marp preview
 * Chromium (CLAUDE.md HARD RULE 12).
 *
 * Axes (each shipped in BOTH render paths in lock-step — HARD RULE 1):
 *   item  — top-level <li> of the slide's first list (lists, card grids)
 *   row   — <tbody> <tr> (tables)
 *   col   — the Nth cell of every row (tables)
 *   cell  — a single <td>, addressed `cell R,C` (table body)
 *   line  — code lines; the <code> text is wrapped into per-line <span class="ln">
 *           (lines render as text, not elements, so they must be wrapped first)
 *
 * Two render forms, one kernel:
 *   - applyToHtml — full Marpit/engine HTML string (lattice-emulator via
 *                   lib/engine → PDF/PPTX/HTML). Depth-aware section + child walk.
 *   - applyToDom  — live DOM (lattice-runtime.js, marp-vscode preview).
 *
 * Idempotent: guarded on the `data-focus-resolved` marker (string + DOM).
 */

const { splitSections } = require('../core/split-sections');
// Shared "primary collection" toolkit (HARD RULE 15 — reuse, don't clone). The
// focus + narrative-build resolvers both find/rewrite the same ordinal
// collections off these walkers; only the per-member tag differs. See
// lib/core/collections.js.
const {
  readAttr, setAttr, addClassToFirstTag,
  directChildren, rewriteSpans, allRows, rowCells, firstList, tbodyBody, splitCodeLines,
} = require('../core/collections');

const SUPPORTED_AXES = new Set(['item', 'row', 'col', 'cell', 'line']);

// Content-aware default (decision doc §5.2): table-like axes keep every cell
// legible (ring); list/grid/code recede the rest (spotlight). An explicit
// `_focusStyle` always overrides this.
function defaultStyle(axis) {
  return (axis === 'row' || axis === 'col' || axis === 'cell') ? 'ring' : 'spotlight';
}

// ── grammar ────────────────────────────────────────────────────────────────
// "row 4" · "item 2-4" · "row 2, row 5" · "col 5" · "cell 4,5" · "line 3-4".
// `cell` carries R,C pairs (extracted before the comma split, since comma is the
// general target separator); the rest become per-axis 1-based index Sets.
function parseFocusSpec(spec) {
  if (typeof spec !== 'string') return [];
  const groups = [];
  let cell = null;
  const rest = spec.replace(/\bcell\s+(\d+)\s*,\s*(\d+)/gi, (_, r, c) => {
    if (!cell) { cell = { axis: 'cell', pairs: [] }; groups.push(cell); }
    cell.pairs.push({ r: +r, c: +c });
    return '';
  });
  const byAxis = new Map();
  for (const part of rest.split(',')) {
    const m = /^\s*([a-z]+)\s+(.+?)\s*$/i.exec(part);
    if (!m) continue;
    const axis = m[1].toLowerCase();
    const indices = byAxis.get(axis) || new Set();
    byAxis.set(axis, indices);
    for (const tok of m[2].split(/\s+/)) {
      const r = /^(\d+)(?:-(\d+))?$/.exec(tok);
      if (!r) continue;
      const lo = +r[1];
      const hi = r[2] ? +r[2] : lo;
      for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) indices.add(i);
    }
  }
  for (const [axis, indices] of byAxis) groups.push({ axis, indices });
  return groups;
}

function wrapLines(lines, indices) {
  return lines
    .map((ln, idx) => `<span class="ln ${indices.has(idx + 1) ? 'lat-focus' : 'lat-recede'}">${ln}</span>`)
    .join('\n');
}

// ── string path (applyToHtml) ─────────────────────────────────────────────────
function resolveAxisHtml(inner, group) {
  const { axis, indices } = group;
  if (axis === 'item') {
    const list = firstList(inner);
    if (!list) return null;
    const kids = directChildren(list.body, 'li');
    if (!kids.length) return null;
    const body = rewriteSpans(list.body, kids, (o, n) => addClassToFirstTag(o, indices.has(n) ? 'lat-focus' : 'lat-recede'));
    return list.pre + body + `</${list.tag}>` + list.post;
  }
  if (axis === 'row') {
    const tb = tbodyBody(inner);
    if (!tb) return null;
    const rows = allRows(tb.body);
    if (!rows.length) return null;
    const body = rewriteSpans(tb.body, rows, (o, n) => addClassToFirstTag(o, indices.has(n) ? 'lat-focus' : 'lat-recede'));
    return tb.pre + body + tb.post;
  }
  if (axis === 'col') {
    const rows = allRows(inner);
    if (!rows.length) return null;
    return rewriteSpans(inner, rows, (rowHtml) => {
      const cells = rowCells(rowHtml);
      if (!cells.length) return rowHtml;
      return rewriteSpans(rowHtml, cells, (o, n) => addClassToFirstTag(o, indices.has(n) ? 'lat-focus' : 'lat-recede'));
    });
  }
  if (axis === 'cell') {
    const tb = tbodyBody(inner);
    if (!tb) return null;
    const rows = allRows(tb.body);
    if (!rows.length) return null;
    const body = rewriteSpans(tb.body, rows, (rowHtml, ri) => {
      const cols = new Set(group.pairs.filter((p) => p.r === ri).map((p) => p.c));
      if (!cols.size) return rowHtml;
      const cells = rowCells(rowHtml);
      return rewriteSpans(rowHtml, cells, (o, ci) => (cols.has(ci) ? addClassToFirstTag(o, 'lat-focus') : o));
    });
    return tb.pre + body + tb.post;
  }
  if (axis === 'line') {
    const codeOpen = inner.search(/<code\b/);
    if (codeOpen < 0) return null;
    const openEnd = inner.indexOf('>', codeOpen) + 1;
    const closeStart = inner.indexOf('</code>', openEnd);
    if (closeStart < 0) return null;
    const code = inner.slice(openEnd, closeStart);
    if (code.indexOf('class="ln') >= 0) return null; // idempotent
    return inner.slice(0, openEnd) + wrapLines(splitCodeLines(code), indices) + inner.slice(closeStart);
  }
  return null;
}

function resolveSectionHtml(openTag, inner) {
  const spec = readAttr(openTag, 'data-focus');
  if (!spec || /\sdata-focus-resolved/.test(openTag)) return { openTag, inner };
  let newInner = inner;
  let axisStamped = null;
  for (const group of parseFocusSpec(spec)) {
    if (!SUPPORTED_AXES.has(group.axis)) continue;
    const next = resolveAxisHtml(newInner, group);
    if (next != null) { newInner = next; axisStamped = group.axis; }
  }
  let newOpen = setAttr(openTag, 'data-focus-resolved', '');
  if (axisStamped) {
    newOpen = setAttr(newOpen, 'data-focus-axis', axisStamped);
    const explicit = readAttr(newOpen, 'data-focus-style');
    newOpen = setAttr(newOpen, 'data-focus-style', explicit || defaultStyle(axisStamped));
  }
  return { openTag: newOpen, inner: newInner };
}

function applyToHtml(html) {
  if (typeof html !== 'string' || html.indexOf('data-focus="') === -1) return html;
  const pieces = splitSections(html);
  let out = '';
  for (const p of pieces) {
    if (p.type === 'gap') { out += p.text; continue; }
    const { openTag, inner } = resolveSectionHtml(p.openTag, p.inner);
    out += openTag + inner + '</section>';
  }
  return out;
}

// ── DOM path (applyToDom) ────────────────────────────────────────────────────
function tableCells(tr) {
  return [...tr.children].filter((el) => el.tagName === 'TD' || el.tagName === 'TH');
}

function resolveAxisDom(sec, group) {
  const { axis, indices } = group;
  if (axis === 'item') {
    // masthead-lift (lib/forms/cell/masthead/masthead.transform.js) wraps a
    // Form slide's body into a `.cell-stage` cell for STAGE_MIGRATED layouts
    // (the common case — Form has been default since 2026-06-26), moving the
    // list one level deeper than a bare `:scope > ul` reaches. The HTML-string
    // path (resolveAxisHtml above, via firstList/lib/core/collections.js) does
    // a depth-agnostic raw scan and is unaffected; this DOM path needs the
    // explicit fallback arm.
    const list = sec.querySelector(':scope > ul, :scope > ol, :scope > .cell-stage > ul, :scope > .cell-stage > ol');
    const items = list ? [...list.children].filter((el) => el.tagName === 'LI') : [];
    if (!items.length) return false;
    items.forEach((el, i) => { el.classList.add(indices.has(i + 1) ? 'lat-focus' : 'lat-recede'); });
    return true;
  }
  if (axis === 'row') {
    const tbody = sec.querySelector(':scope table tbody');
    const rows = tbody ? [...tbody.children].filter((el) => el.tagName === 'TR') : [];
    if (!rows.length) return false;
    rows.forEach((el, i) => { el.classList.add(indices.has(i + 1) ? 'lat-focus' : 'lat-recede'); });
    return true;
  }
  if (axis === 'col') {
    const rows = [...sec.querySelectorAll(':scope table tr')];
    if (!rows.length) return false;
    for (const tr of rows) tableCells(tr).forEach((c, i) => { c.classList.add(indices.has(i + 1) ? 'lat-focus' : 'lat-recede'); });
    return true;
  }
  if (axis === 'cell') {
    const rows = [...sec.querySelectorAll(':scope table tbody tr')];
    if (!rows.length) return false;
    let any = false;
    for (const { r, c } of group.pairs) {
      const cell = tableCells(rows[r - 1] || {})[c - 1];
      if (cell) { cell.classList.add('lat-focus'); any = true; }
    }
    return any;
  }
  if (axis === 'line') {
    const code = sec.querySelector(':scope pre code');
    if (!code || code.querySelector('.ln')) return false;
    code.innerHTML = wrapLines(splitCodeLines(code.innerHTML), indices);
    return true;
  }
  return false;
}

function resolveSectionDom(sec) {
  if (sec.hasAttribute('data-focus-resolved')) return;
  const spec = sec.getAttribute('data-focus');
  if (!spec) return;
  let axisStamped = null;
  for (const group of parseFocusSpec(spec)) {
    if (!SUPPORTED_AXES.has(group.axis)) continue;
    if (resolveAxisDom(sec, group)) axisStamped = group.axis;
  }
  if (axisStamped) {
    sec.setAttribute('data-focus-axis', axisStamped);
    if (!sec.getAttribute('data-focus-style')) sec.setAttribute('data-focus-style', defaultStyle(axisStamped));
  }
  sec.setAttribute('data-focus-resolved', '');
}

function applyToDom(root) {
  const scope = root?.querySelectorAll ? root : root?.ownerDocument;
  if (!scope?.querySelectorAll) return;
  for (const sec of scope.querySelectorAll('section[data-focus]')) resolveSectionDom(sec);
}

module.exports = {
  name: 'focus',
  selector: 'section[data-focus]',
  applyToHtml,
  applyToDom,
  // exported for unit tests
  parseFocusSpec,
  directChildren,
  splitCodeLines,
  resolveSectionHtml, SUPPORTED_AXES };
