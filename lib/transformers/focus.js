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
 *   mark  — a chart mark: every element carrying the chart-wide `data-mark` the
 *           chart transform already stamped (a bar, a wedge, a funnel band, a
 *           heatmap cell, a state). `mark 3` is `data-mark="2"` — ordinals count
 *           from 1, the attribute from 0. Detail `<template>`s are never tagged.
 *   series — a chart series: the SVG shapes carrying `data-series` (a line's path
 *           and dots, a radar polygon and its dots). Shapes only, because radar's
 *           container `<div>` also writes `data-series`, as a COUNT, and labels carry
 *           it on some charts as a palette slot. A line's invisible `.line-hit`
 *           columns carry `data-mark` and are never tagged: ringing one would draw
 *           an accent box around nothing.
 *
 * Two render forms, one kernel:
 *   - applyToHtml — full Marpit/engine HTML string (lattice via
 *                   lib/engine → PDF/PPTX/HTML). Depth-aware section + child walk.
 *   - applyToDom  — live DOM (lattice-runtime.js, marp-vscode preview).
 *
 * Idempotent: guarded on the `data-focus-resolved` marker (string + DOM).
 */

const { splitSections, splitCodeLines } = require('@laticent/markup');
// Shared "primary collection" toolkit (HARD RULE 15 — reuse, don't clone). The
// focus + narrative-build resolvers both find/rewrite the same ordinal
// collections off these walkers; only the per-member tag differs. See
// lib/core/collections.js.
const {
  readAttr, setAttr, addClassToFirstTag,
  directChildren, rewriteSpans, allRows, rowCells, firstList, tbodyBody,
  annotateLineSpans,
  domItemElements, domRowElements,
} = require('../core/collections');
// The index list (`3-5 9`) is Segno's reader, shared with `@code{focus=…}` and the linter so the three agree.
const { readIndexList } = require('@laticent/segno/read');
const { rescopeSectionHtml, rescopeSectionDom } = require('../core/step-rescope');
// One balanced fragment per source line, the split the code plugin numbers lines with.

const SUPPORTED_AXES = new Set(['item', 'row', 'col', 'cell', 'line', 'mark', 'series']);

// The chart axes read an attribute the chart transform stamped, so they need no
// collection walk: the attribute IS the address. `shapes` limits which tags count.
const SVG_SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const ATTR_AXES = {
  mark: { attr: 'data-mark', allows: (tag) => tag !== 'template' },
  series: { attr: 'data-series', allows: (tag) => SVG_SHAPES.has(tag) },
};

// Content-aware default (decision doc §5.2): table-like axes keep every cell
// legible (ring); list/grid/code recede the rest (spotlight). An explicit
// `_focusStyle` always overrides this.
function defaultStyle(axis) {
  return (axis === 'row' || axis === 'col' || axis === 'cell') ? 'ring' : 'spotlight';
}

// How a resolved unit is TAGGED. A plain `_focus` tags it with the class the CSS keys on
// (`classMark`); a `_focusSteps` slide tags it with the step it is lit at (`stepMark`), and the
// live surface turns that into the class when it walks to the step (lib/core/step-state.mjs
// `applyStepAt`). One walker, two tags, so a step lights exactly what the same `_focus` would.
// `focused === null` means a target with no recede set (the `cell` axis).
function classMark(outer, focused) {
  return addClassToFirstTag(outer, focused ? 'lat-focus' : 'lat-recede');
}
function stepMark(k) {
  return (outer, focused) => {
    const gt = outer.indexOf('>');
    if (gt < 0) return outer;
    const open = outer.slice(0, gt + 1);
    const attr = focused ? 'data-step' : 'data-step-recede';
    const cur = readAttr(open, attr);
    const list = cur ? cur.split(/\s+/) : [];
    if (list.includes(String(k))) return outer;
    list.push(String(k));
    // `setAttr` appends before the tag's own `>` / `/>`, so a self-closing SVG shape keeps its slash last.
    return setAttr(open, attr, list.join(' ')) + outer.slice(gt + 1);
  };
}

// String path for the chart axes: tag every opening tag that carries the axis
// attribute, skipping `<template>` bodies (a detail payload is inert and must stay
// byte-identical). Returns null when no tag carried the attribute at all.
function resolveAttrAxisHtml(inner, axis, indices, mark = classMark) {
  const { attr, allows } = ATTR_AXES[axis];
  const tagRe = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\s${attr}="(\\d+)"[^>]*>`, 'g');
  let hit = false;
  const parts = inner.split(/(<template\b[\s\S]*?<\/template>)/);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(tagRe, (tag, name, n) => {
      if (!allows(name.toLowerCase()) || /\sclass="[^"]*\bline-hit\b/.test(tag)) return tag;
      hit = true;
      return mark(tag, indices.has(+n + 1));
    });
  }
  return hit ? parts.join('') : null;
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
    for (const i of readIndexList(m[2])) indices.add(i);
  }
  for (const [axis, indices] of byAxis) groups.push({ axis, indices });
  return groups;
}

function wrapLines(lines, indices, mark = classMark) {
  if (mark === classMark) {
    return lines
      .map((ln, idx) => `<span class="ln ${indices.has(idx + 1) ? 'lat-focus' : 'lat-recede'}">${ln}</span>`)
      .join('\n');
  }
  return lines.map((ln, idx) => mark(`<span class="ln">${ln}</span>`, indices.has(idx + 1))).join('\n');
}

// ── string path (applyToHtml) ─────────────────────────────────────────────────
// Index of the first `<code` that sits inside a `<pre>…</pre>`, or the first `<code` anywhere when the slide has
// no `<pre>` at all (the DOM path's `pre code` query finds nothing there, so only the string path ever wraps).
function codeInsidePre(inner) {
  const preRe = /<pre\b[^>]*>/g;
  let sawPre = false;
  for (let m = preRe.exec(inner); m; m = preRe.exec(inner)) {
    sawPre = true;
    const close = inner.indexOf('</pre>', preRe.lastIndex);
    const code = inner.slice(preRe.lastIndex, close < 0 ? inner.length : close).search(/<code\b/);
    if (code >= 0) return preRe.lastIndex + code;
  }
  return sawPre ? -1 : inner.search(/<code\b/);
}

function resolveAxisHtml(inner, group, mark = classMark) {
  const { axis, indices } = group;
  if (ATTR_AXES[axis]) return resolveAttrAxisHtml(inner, axis, indices, mark);
  if (axis === 'item') {
    const list = firstList(inner);
    if (!list) return null;
    const kids = directChildren(list.body, 'li');
    if (!kids.length) return null;
    const body = rewriteSpans(list.body, kids, (o, n) => mark(o, indices.has(n)));
    return list.pre + body + `</${list.tag}>` + list.post;
  }
  if (axis === 'row') {
    const tb = tbodyBody(inner);
    if (!tb) return null;
    const rows = allRows(tb.body);
    if (!rows.length) return null;
    const body = rewriteSpans(tb.body, rows, (o, n) => mark(o, indices.has(n)));
    return tb.pre + body + tb.post;
  }
  if (axis === 'col') {
    const rows = allRows(inner);
    if (!rows.length) return null;
    return rewriteSpans(inner, rows, (rowHtml) => {
      const cells = rowCells(rowHtml);
      if (!cells.length) return rowHtml;
      return rewriteSpans(rowHtml, cells, (o, n) => mark(o, indices.has(n)));
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
      return rewriteSpans(rowHtml, cells, (o, ci) => (cols.has(ci) ? mark(o, true) : o));
    });
    return tb.pre + body + tb.post;
  }
  if (axis === 'line') {
    // The block's own `<code>`: the first one INSIDE a `<pre>`, not the first `<code>` in the slide. A heading
    // with inline code (`## \`_focus: line 8\` — …`) would otherwise take the focus and the real block stay
    // untouched. Not only directly after `<pre>`: the code plugin puts a title or copy bar span between them,
    // and a `<pre>` with no code in it (ASCII art, a plugin body) must not stand in for the block.
    const codeOpen = codeInsidePre(inner);
    if (codeOpen < 0) return null;
    const openEnd = inner.indexOf('>', codeOpen) + 1;
    const closeStart = inner.indexOf('</code>', openEnd);
    if (closeStart < 0) return null;
    const code = inner.slice(openEnd, closeStart);
    if (code.indexOf('class="ln') >= 0) {
      // Already resolved, or the block's own `@code{focus=…}` chose its lines: that one wins.
      if (/\blat-(?:focus|recede)\b/.test(code)) return null;
      // Lines the code plugin already wrapped: mark them rather than wrap them again.
      const marked = annotateLineSpans(code, (open, n) => mark(open, indices.has(n)));
      return marked === null ? null : inner.slice(0, openEnd) + marked + inner.slice(closeStart);
    }
    return inner.slice(0, openEnd) + wrapLines(splitCodeLines(code), indices, mark) + inner.slice(closeStart);
  }
  return null;
}

// `_focusSteps: row 1 | row 2 | col 3` — one slide, walked live
// (engineering/decisions/2026-11-09-steps-as-a-behavior.md). Each step is a whole `_focus` spec,
// resolved off the same walkers with `stepMark(k)`: a unit lit at step k carries k in `data-step`,
// a unit that recedes at step k carries k in `data-step-recede`. The section carries the walk:
// `data-steps` (how many), `data-step-kind="focus"`, and per step its axis and effective style
// (`data-step-axes`, `data-step-styles`, space-separated, `-` for a step that matched nothing).
// No `.lat-focus` is written, so the slide at rest — every still format — shows every unit even (S1).
// Strip quote characters off both ends, in linear time (no regex: an anchored alternation of `+` runs is
// polynomial in the regex census, tools/regex-census.json).
function unquote(x) {
  let a = 0;
  let b = x.length;
  while (a < b && (x[a] === "'" || x[a] === '"')) a += 1;
  while (b > a && (x[b - 1] === "'" || x[b - 1] === '"')) b -= 1;
  return x.slice(a, b);
}
// The five entities an attribute value is escaped with; `&amp;` decodes last, so `&amp;quot;` stays text.
function decodeAttr(v) {
  return String(v ?? '').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function readSteps(spec) {
  // A quote around a step is not part of it: the directive grammar unquotes a whole value that
  // starts and ends with one, so `'row 1' | 'row 2'` arrives as `row 1' | 'row 2`.
  return String(spec).split('|').map((x) => unquote(x.trim()).trim()).filter(Boolean);
}
function resolveStepsHtml(openTag, inner) {
  // The attribute as the DOM path sees it (`getAttribute` decodes): an author's `"row 1" | "row 2"` arrives here as
  // `&quot;`, and unquoting that literal text lit nothing on the string path only (HARD RULE #1, red team 2026-11-09).
  const steps = readSteps(decodeAttr(readAttr(openTag, 'data-focus-steps')));
  let newOpen = setAttr(openTag, 'data-focus-resolved', '');
  if (!steps.length) return { openTag: newOpen, inner };
  const explicit = readAttr(openTag, 'data-focus-style');
  const axes = [];
  const styles = [];
  let newInner = inner;
  steps.forEach((step, i) => {
    let axisStamped = null;
    for (const group of parseFocusSpec(step)) {
      if (!SUPPORTED_AXES.has(group.axis)) continue;
      const next = resolveAxisHtml(newInner, group, stepMark(i + 1));
      if (next != null) { newInner = next; axisStamped = group.axis; }
    }
    axes.push(axisStamped || '-');
    styles.push(axisStamped ? explicit || defaultStyle(axisStamped) : '-');
  });
  newOpen = setAttr(newOpen, 'data-steps', String(steps.length));
  newOpen = setAttr(newOpen, 'data-step-kind', 'focus');
  newOpen = setAttr(newOpen, 'data-step-axes', axes.join(' '));
  newOpen = setAttr(newOpen, 'data-step-styles', styles.join(' '));
  // A step that lights nothing on this slide is a press that changes nothing: drop it (lib/core/step-rescope.js).
  return rescopeSectionHtml(newOpen, newInner);
}

function resolveSectionHtml(openTag, inner) {
  // A stepping slide is walked, not lit: its own `_focusSteps` wins over a static `_focus` on it.
  if (readAttr(openTag, 'data-focus-steps') != null && !/\sdata-focus-resolved/.test(openTag)) return resolveStepsHtml(openTag, inner);
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
  if (typeof html !== 'string' || (html.indexOf('data-focus="') === -1 && html.indexOf('data-focus-steps="') === -1)) return html;
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

// The DOM twin of `classMark` / `stepMark`.
function classMarkDom(el, focused) {
  el.classList.add(focused ? 'lat-focus' : 'lat-recede');
}
function stepMarkDom(k) {
  return (el, focused) => {
    const attr = focused ? 'data-step' : 'data-step-recede';
    const list = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    if (!list.includes(String(k))) list.push(String(k));
    el.setAttribute(attr, list.join(' '));
  };
}

function resolveAxisDom(sec, group, mark = classMarkDom) {
  const { axis, indices } = group;
  if (ATTR_AXES[axis]) {
    const { attr, allows } = ATTR_AXES[axis];
    let hit = false;
    for (const el of sec.querySelectorAll(`[${attr}]`)) {
      if (!allows(el.tagName.toLowerCase()) || el.closest('template') || el.classList.contains('line-hit')) continue;
      // The same `\d+` the string path requires, so `data-mark=""` is not mark 0 on one path only.
      const raw = el.getAttribute(attr) ?? '';
      if (!/^\d+$/.test(raw)) continue;
      const n = Number(raw);
      mark(el, indices.has(n + 1));
      hit = true;
    }
    return hit;
  }
  if (axis === 'item') {
    // masthead-lift (lib/forms/cell/masthead/masthead.transform.js) wraps a
    // Form slide's body into a `.cell-stage` cell for STAGE_MIGRATED layouts
    // (the common case — Form has been default since 2026-06-26), moving the
    // list one level deeper than a bare `:scope > ul` reaches. The HTML-string
    // path (resolveAxisHtml above, via firstList/lib/core/collections.js) does
    // a depth-agnostic raw scan and is unaffected; domItemElements carries the
    // explicit fallback arm.
    const items = domItemElements(sec);
    if (!items.length) return false;
    items.forEach((el, i) => { mark(el, indices.has(i + 1)); });
    return true;
  }
  if (axis === 'row') {
    const rows = domRowElements(sec);
    if (!rows.length) return false;
    rows.forEach((el, i) => { mark(el, indices.has(i + 1)); });
    return true;
  }
  if (axis === 'col') {
    const rows = [...sec.querySelectorAll(':scope table tr')];
    if (!rows.length) return false;
    for (const tr of rows) tableCells(tr).forEach((c, i) => { mark(c, indices.has(i + 1)); });
    return true;
  }
  if (axis === 'cell') {
    const rows = [...sec.querySelectorAll(':scope table tbody tr')];
    if (!rows.length) return false;
    let any = false;
    for (const { r, c } of group.pairs) {
      const cell = tableCells(rows[r - 1] || {})[c - 1];
      if (cell) { mark(cell, true); any = true; }
    }
    return any;
  }
  if (axis === 'line') {
    const code = sec.querySelector(':scope pre code');
    if (!code) return false;
    const spans = code.querySelectorAll(':scope > .ln');
    if (spans.length) {
      // The code plugin's line spans (or this pass already ran): mark them, unless a focus is set.
      if (code.querySelector('.lat-focus, .lat-recede')) return false;
      spans.forEach((el, i) => {
        mark(el, indices.has(i + 1));
      });
      return true;
    }
    if (mark !== classMarkDom) {
      code.innerHTML = splitCodeLines(code.innerHTML).map((ln) => `<span class="ln">${ln}</span>`).join('\n');
      code.querySelectorAll(':scope > .ln').forEach((el, i) => { mark(el, indices.has(i + 1)); });
      return true;
    }
    code.innerHTML = wrapLines(splitCodeLines(code.innerHTML), indices);
    return true;
  }
  return false;
}

function resolveStepsDom(sec) {
  const steps = readSteps(sec.getAttribute('data-focus-steps'));
  sec.setAttribute('data-focus-resolved', '');
  if (!steps.length) return;
  const explicit = sec.getAttribute('data-focus-style');
  const axes = [];
  const styles = [];
  steps.forEach((step, i) => {
    let axisStamped = null;
    for (const group of parseFocusSpec(step)) {
      if (!SUPPORTED_AXES.has(group.axis)) continue;
      if (resolveAxisDom(sec, group, stepMarkDom(i + 1))) axisStamped = group.axis;
    }
    axes.push(axisStamped || '-');
    styles.push(axisStamped ? explicit || defaultStyle(axisStamped) : '-');
  });
  sec.setAttribute('data-steps', String(steps.length));
  sec.setAttribute('data-step-kind', 'focus');
  sec.setAttribute('data-step-axes', axes.join(' '));
  sec.setAttribute('data-step-styles', styles.join(' '));
  rescopeSectionDom(sec);
}

function resolveSectionDom(sec) {
  if (sec.hasAttribute('data-focus-resolved')) return;
  if (sec.hasAttribute('data-focus-steps')) return resolveStepsDom(sec);
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
  for (const sec of scope.querySelectorAll('section[data-focus], section[data-focus-steps]')) resolveSectionDom(sec);
}

module.exports = {
  name: 'focus',
  selector: 'section[data-focus], section[data-focus-steps]',
  applyToHtml,
  applyToDom,
  // exported for unit tests
  parseFocusSpec,
  readSteps,
  directChildren,
  resolveSectionHtml, SUPPORTED_AXES };
