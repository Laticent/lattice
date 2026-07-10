/**
 * Narrative-build resolver — tag the steppable units of a `_build` directive.
 *
 * Design: engineering/decisions/2026-06-16-narrative-step-model.md +
 * 2026-06-16-narrative-step-spec.md. "A build is focus sequenced over time": the
 * author opts a slide into progressive disclosure with a `_build` directive whose
 * grammar is a strict SUBSET of `_focus` (axis-selection + grouping only). The
 * directive apply step (lib/engine/directives.js) stamps `data-build="…"` on the
 * <section>; this transformer reads it, finds the slide's primary collection for
 * the axis (off the SHARED lib/core/collections.js walkers focus uses — HARD RULE
 * 15), and stamps each unit with the 1-based step it appears at (`data-build-step`)
 * plus the total on the section (`data-build-steps`).
 *
 * The ENGINE ONLY TAGS — reveal is pure CSS (lib/base/base.build.css) gated on a
 * `data-build-at` the *consumer* sets (live player / overlay export). Absent ⇒
 * every unit shows ⇒ a non-driven render, the live preview, and the final-state
 * PDF are byte-identical to today (the 0-pixel guarantee). Reveal-only — no
 * motion here; morph stays a gated, may-cut experiment (model ADR §3). Explicit
 * per-unit tags (not `:nth-child`) keep the CSS free of `:has()` (HARD RULE 12).
 *
 * Axes (each in BOTH render paths in lock-step — HARD RULE 1):
 *   item *(default)* — top-level <li> of the slide's first list / card grid
 *   row             — <tbody> <tr> (tables)
 *   col             — the Nth cell of every row (tables)
 *   line            — code lines (the <code> text wrapped into <span class="ln">)
 *
 * Two render forms, one kernel: applyToHtml (engine string path) + applyToDom
 * (lattice-runtime / preview). Idempotent: guarded on `data-build-resolved`.
 */

const { splitSections } = require('../core/split-sections');
const {
  setAttr, directChildren, rewriteSpans, allRows, rowCells, firstList, tbodyBody, splitCodeLines,
} = require('../core/collections');

const SUPPORTED_AXES = new Set(['item', 'row', 'col', 'line']);

// item|items → item, row|rows → row, col|cols|columns → col, line|lines → line.
function normalizeAxis(word) {
  const w = word.toLowerCase();
  if (w.startsWith('item')) return 'item';
  if (w.startsWith('row')) return 'row';
  if (w.startsWith('col')) return 'col';
  if (w.startsWith('line')) return 'line';
  return null;
}

// ── grammar (a subset of `_focus`) ───────────────────────────────────────────
// "" / "item"           → default axis, one step per unit
// "rows"                → axis only, one step per unit
// "1, 2-3, 4"           → default axis, grouped: step1=u1, step2=u2+u3, step3=u4
// "rows 1-2, 3"         → axis + grouping
// "none"                → opt OUT (return null)
// Returns { axis, groups } | null. `groups` is an array of ordinal Sets (one per
// step); empty ⇒ one step per unit in document order.
function parseBuildSpec(spec) {
  if (typeof spec !== 'string') return null;
  let s = spec.trim();
  if (s.toLowerCase() === 'none') return null;
  let axis = 'item';
  const m = /^([a-z]+)\b/i.exec(s);
  if (m && normalizeAxis(m[1])) { axis = normalizeAxis(m[1]); s = s.slice(m[0].length).trim(); }
  const groups = [];
  if (s) {
    for (const part of s.split(',')) {
      const set = new Set();
      for (const tok of part.trim().split(/\s+/)) {
        const r = /^(\d+)(?:-(\d+))?$/.exec(tok);
        if (!r) continue;
        const lo = +r[1];
        const hi = r[2] ? +r[2] : lo;
        for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) set.add(i);
      }
      if (set.size) groups.push(set);
    }
  }
  return { axis, groups };
}

// The 1-based step an ordinal appears at. No grouping ⇒ its own ordinal. Grouped
// ⇒ the first group it belongs to; an ungrouped unit shows from step 1 (context).
function stepFor(ord, groups) {
  if (!groups.length) return ord;
  for (let g = 0; g < groups.length; g++) if (groups[g].has(ord)) return g + 1;
  return 1;
}
const totalSteps = (count, groups) => (groups.length ? groups.length : count);

// ── string path (applyToHtml) ─────────────────────────────────────────────────
function readAttr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// Stamp data-build-step="N" on the first tag of a unit's outer HTML.
function tagStep(outer, step) {
  const gt = outer.indexOf('>');
  if (gt < 0) return outer;
  return setAttr(outer.slice(0, gt + 1), 'data-build-step', String(step)) + outer.slice(gt + 1);
}

function wrapBuildLines(lines, groups) {
  return lines
    .map((ln, idx) => `<span class="ln" data-build-step="${stepFor(idx + 1, groups)}">${ln}</span>`)
    .join('\n');
}

// Resolve one axis → { inner, count } (count = number of steppable units), or null.
function resolveAxisHtml(inner, axis, groups) {
  if (axis === 'item') {
    const list = firstList(inner);
    if (!list) return null;
    const kids = directChildren(list.body, 'li');
    if (!kids.length) return null;
    const body = rewriteSpans(list.body, kids, (o, n) => tagStep(o, stepFor(n, groups)));
    return { inner: list.pre + body + `</${list.tag}>` + list.post, count: kids.length };
  }
  if (axis === 'row') {
    const tb = tbodyBody(inner);
    if (!tb) return null;
    const rows = allRows(tb.body);
    if (!rows.length) return null;
    const body = rewriteSpans(tb.body, rows, (o, n) => tagStep(o, stepFor(n, groups)));
    return { inner: tb.pre + body + tb.post, count: rows.length };
  }
  if (axis === 'col') {
    const rows = allRows(inner);
    if (!rows.length) return null;
    let cols = 0;
    const out = rewriteSpans(inner, rows, (rowHtml) => {
      const cells = rowCells(rowHtml);
      cols = Math.max(cols, cells.length);
      if (!cells.length) return rowHtml;
      return rewriteSpans(rowHtml, cells, (o, n) => tagStep(o, stepFor(n, groups)));
    });
    return cols ? { inner: out, count: cols } : null;
  }
  if (axis === 'line') {
    const codeOpen = inner.search(/<code\b/);
    if (codeOpen < 0) return null;
    const openEnd = inner.indexOf('>', codeOpen) + 1;
    const closeStart = inner.indexOf('</code>', openEnd);
    if (closeStart < 0) return null;
    const code = inner.slice(openEnd, closeStart);
    if (code.indexOf('class="ln') >= 0) return null; // idempotent
    const lines = splitCodeLines(code);
    return { inner: inner.slice(0, openEnd) + wrapBuildLines(lines, groups) + inner.slice(closeStart), count: lines.length };
  }
  return null;
}

function resolveSectionHtml(openTag, inner) {
  if (/\sdata-build-resolved/.test(openTag)) return { openTag, inner };
  const spec = readAttr(openTag, 'data-build');
  if (spec == null) return { openTag, inner };
  const parsed = parseBuildSpec(spec);
  let newOpen = setAttr(openTag, 'data-build-resolved', '');
  if (!parsed || !SUPPORTED_AXES.has(parsed.axis)) return { openTag: newOpen, inner };
  const res = resolveAxisHtml(inner, parsed.axis, parsed.groups);
  if (!res) return { openTag: newOpen, inner };
  newOpen = setAttr(newOpen, 'data-build-axis', parsed.axis);
  newOpen = setAttr(newOpen, 'data-build-steps', String(totalSteps(res.count, parsed.groups)));
  return { openTag: newOpen, inner: res.inner };
}

function applyToHtml(html) {
  if (typeof html !== 'string' || html.indexOf('data-build="') === -1) return html;
  let out = '';
  for (const p of splitSections(html)) {
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

function resolveAxisDom(sec, axis, groups) {
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
    if (!items.length) return 0;
    items.forEach((el, i) => { el.setAttribute('data-build-step', String(stepFor(i + 1, groups))); });
    return items.length;
  }
  if (axis === 'row') {
    const tbody = sec.querySelector(':scope table tbody');
    const rows = tbody ? [...tbody.children].filter((el) => el.tagName === 'TR') : [];
    if (!rows.length) return 0;
    rows.forEach((el, i) => { el.setAttribute('data-build-step', String(stepFor(i + 1, groups))); });
    return rows.length;
  }
  if (axis === 'col') {
    const rows = [...sec.querySelectorAll(':scope table tr')];
    if (!rows.length) return 0;
    let cols = 0;
    for (const tr of rows) {
      const cells = tableCells(tr);
      cols = Math.max(cols, cells.length);
      cells.forEach((c, i) => { c.setAttribute('data-build-step', String(stepFor(i + 1, groups))); });
    }
    return cols;
  }
  if (axis === 'line') {
    const code = sec.querySelector(':scope pre code');
    if (!code || code.querySelector('.ln')) return 0;
    const lines = splitCodeLines(code.innerHTML);
    code.innerHTML = wrapBuildLines(lines, groups);
    return lines.length;
  }
  return 0;
}

function resolveSectionDom(sec) {
  if (sec.hasAttribute('data-build-resolved')) return;
  const spec = sec.getAttribute('data-build');
  if (spec == null) return;
  sec.setAttribute('data-build-resolved', '');
  const parsed = parseBuildSpec(spec);
  if (!parsed || !SUPPORTED_AXES.has(parsed.axis)) return;
  const count = resolveAxisDom(sec, parsed.axis, parsed.groups);
  if (!count) return;
  sec.setAttribute('data-build-axis', parsed.axis);
  sec.setAttribute('data-build-steps', String(totalSteps(count, parsed.groups)));
}

function applyToDom(root) {
  const scope = root?.querySelectorAll ? root : root?.ownerDocument;
  if (!scope?.querySelectorAll) return;
  for (const sec of scope.querySelectorAll('section[data-build]')) resolveSectionDom(sec);
}

module.exports = {
  name: 'build',
  selector: 'section[data-build]',
  applyToHtml,
  applyToDom,
  // exported for unit tests
  parseBuildSpec,
  stepFor,
  totalSteps,
  resolveSectionHtml,
};
