/**
 * collections.js — the slide's "primary collection" toolkit: pure, render-form-
 * agnostic helpers for finding and rewriting the ordinal collections a slide is
 * built from (list items, table rows/cells, code lines).
 *
 * Extracted verbatim from lib/transformers/focus.js so the focus resolver and the
 * narrative-build resolver share ONE implementation of "find the collection for
 * axis X and rewrite its members" (HARD RULE 15 — reuse, don't clone). A build is
 * "focus sequenced over time" (engineering/decisions/2026-06-16-narrative-step-spec.md),
 * so both transformers resolve the same axes (item · row · col · cell · line) off
 * the same string/DOM walkers; only the per-member tag differs (focus tags
 * `.lat-focus`/`.lat-recede`; build stamps `data-build-step="N"`).
 *
 * Pure & fs-free — safe for the browser bundle and unit-testable in isolation.
 * The string walkers are deliberately depth-aware hand-rolled scanners (not regex
 * across nesting) and the treatment they enable is explicit per-element tags, so
 * the consuming CSS never needs `:has()`/`:nth-child()` — both silently broken in
 * the Marp preview Chromium (CLAUDE.md HARD RULE 12).
 */

// ── attribute / class string helpers ─────────────────────────────────────────
function readAttr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function setAttr(tag, name, val) {
  if (new RegExp(`\\s${name}="`).test(tag)) {
    return tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${val}"`);
  }
  return tag.replace(/\s*\/?>$/, (close) => ` ${name}="${val}"${close}`);
}

function mergeClass(attrs, name) {
  if (new RegExp(`class="[^"]*\\b${name}\\b`).test(attrs)) return attrs;
  if (/class="/.test(attrs)) return attrs.replace(/class="([^"]*)"/, (_, c) => `class="${c} ${name}"`);
  return `${attrs} class="${name}"`;
}

function addClassToFirstTag(outer, name) {
  return outer.replace(/^(<[a-zA-Z][\w-]*)([^>]*)>/, (_, lead, attrs) => `${lead}${mergeClass(attrs, name)}>`);
}

// ── structural span walkers (HTML-string path) ───────────────────────────────
// Top-level <tag>…</tag> spans within `html` (depth-aware; the tag may nest,
// e.g. li > ul > li). Returns { start, end } of each direct child, in order.
function directChildren(html, tag) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const isBoundary = (ch) => ch === undefined || ch === '>' || /\s/.test(ch) || ch === '/';
  const out = [];
  let i = 0;
  while (i < html.length) {
    const s = html.indexOf(open, i);
    if (s < 0) break;
    if (!isBoundary(html[s + open.length])) { i = s + open.length; continue; }
    const tagEnd = html.indexOf('>', s);
    if (tagEnd < 0) break;
    if (html[tagEnd - 1] === '/') { out.push({ start: s, end: tagEnd + 1 }); i = tagEnd + 1; continue; }
    let depth = 1;
    let pos = tagEnd + 1;
    let endPos = -1;
    while (pos < html.length) {
      if (html.startsWith(open, pos) && isBoundary(html[pos + open.length])) {
        const e = html.indexOf('>', pos);
        if (e < 0) break;
        if (html[e - 1] !== '/') depth++;
        pos = e + 1;
      } else if (html.startsWith(close, pos)) {
        depth--;
        if (depth === 0) { endPos = pos + close.length; break; }
        pos += close.length;
      } else pos++;
    }
    if (endPos < 0) break;
    out.push({ start: s, end: endPos });
    i = endPos;
  }
  return out;
}

// Replace each child span (from directChildren / rowCells / allRows) with the
// result of fn(outerHtml, index1Based). Stable single-pass rewrite.
function rewriteSpans(html, spans, fn) {
  let out = '';
  let cursor = 0;
  spans.forEach((sp, idx) => {
    out += html.slice(cursor, sp.start);
    out += fn(html.slice(sp.start, sp.end), idx + 1);
    cursor = sp.end;
  });
  return out + html.slice(cursor);
}

// Every <tr>…</tr> in `html` (tr never nests — flat scan).
function allRows(html) {
  const spans = [];
  let i = 0;
  for (;;) {
    const s = html.indexOf('<tr', i);
    if (s < 0) break;
    const e = html.indexOf('</tr>', s);
    if (e < 0) break;
    spans.push({ start: s, end: e + 5 });
    i = e + 5;
  }
  return spans;
}

// Every <td>/<th> cell in a row's outer HTML, in order (cells never nest).
function rowCells(rowHtml) {
  const spans = [];
  let i = 0;
  for (;;) {
    const td = rowHtml.indexOf('<td', i);
    const th = rowHtml.indexOf('<th', i);
    let s = -1;
    let close = '';
    if (td >= 0 && (th < 0 || td < th)) { s = td; close = '</td>'; }
    else if (th >= 0) { s = th; close = '</th>'; }
    if (s < 0) break;
    const e = rowHtml.indexOf(close, s);
    if (e < 0) break;
    spans.push({ start: s, end: e + close.length });
    i = e + close.length;
  }
  return spans;
}

// Every list that is not nested inside another list, in document order, as
// { at, tag, span } — the candidates for "the slide's collection".
function outerLists(inner) {
  const out = [];
  const re = /<(ul|ol)\b/gi;
  let m;
  while ((m = re.exec(inner))) {
    const at = m.index;
    // A nested `<ul>` inside an `<li>` is a member's BODY, never the slide's collection.
    if (out.some((c) => at > c.at && at < c.at + c.span.end)) continue;
    const tag = m[1].toLowerCase();
    const [span] = directChildren(inner.slice(at), tag);
    if (!span) continue;
    out.push({ at, tag, span });
  }
  return out;
}

/**
 * The slide's PRIMARY collection, split into { pre, body, post, tag } so a caller can rewrite
 * its direct <li> children and reassemble.
 *
 * "Primary" = the outer list with the MOST members, ties going to the first — not simply the
 * first list on the slide, which is what this did and which produced wrong output whenever a
 * slide carried a second one. An `inventory` slide with a two-item bulleted aside above its six
 * records split the ASIDE: one aside bullet per page, the six records repeated verbatim on both,
 * both pages clipped, under a "(cont.)" heading and a restarted ordinal. Reproduced on a real
 * render; §8 rule 1's `deriveAxis` hardening does not help, because it resolves which AXIS is on
 * the page and both lists are `item` — the container choice lives here. The rule-6 conservation
 * gate is structurally blind to it (containment reports shortfalls, never duplicates).
 *
 * Single-list slides — the overwhelming majority — are byte-identical either way; only slides
 * that were already being cut on the wrong container change. The same choice therefore also
 * corrects `countAxis` (capacity was counting the aside) and the `build`/`focus` per-item
 * transforms, which resolve their target through this function.
 */
function firstList(inner) {
  const lists = outerLists(inner);
  if (!lists.length) return null;
  let best = null;
  let bestCount = -1;
  for (const c of lists) {
    const open = inner.indexOf('>', c.at) + 1;
    const closeStart = c.at + c.span.end - (`</${c.tag}>`).length;
    const count = directChildren(inner.slice(open, closeStart), 'li').length;
    if (count > bestCount) { bestCount = count; best = { ...c, open, closeStart }; }
  }
  if (!best) return null;
  return {
    pre: inner.slice(0, best.open),
    body: inner.slice(best.open, best.closeStart),
    post: inner.slice(best.at + best.span.end),
    tag: best.tag,
  };
}

function tbodyBody(inner) {
  const at = inner.indexOf('<tbody');
  if (at < 0) return null;
  const open = inner.indexOf('>', at) + 1;
  const closeStart = inner.indexOf('</tbody>', open);
  if (closeStart < 0) return null;
  return { pre: inner.slice(0, open), body: inner.slice(open, closeStart), post: inner.slice(closeStart) };
}

// Split highlighted code into lines at depth-0 newlines (a newline inside a
// hljs <span> — e.g. a multi-line string — stays within its line, so tags stay
// balanced). Returns an array of line HTML fragments.
function splitCodeLines(code) {
  const lines = [];
  let cur = '';
  let depth = 0;
  let i = 0;
  while (i < code.length) {
    if (code.startsWith('<span', i)) { const e = code.indexOf('>', i); if (e < 0) { cur += code.slice(i); break; } cur += code.slice(i, e + 1); depth++; i = e + 1; continue; }
    if (code.startsWith('</span>', i)) { cur += '</span>'; if (depth > 0) depth--; i += 7; continue; }
    const ch = code[i];
    if (ch === '\n' && depth === 0) { lines.push(cur); cur = ''; i++; continue; }
    cur += ch;
    i++;
  }
  lines.push(cur);
  return lines;
}

// Count the primary collection for `axis` in RESOLVED slide `html` — the
// render-exact counterpart to lib/authoring/lint-core.js's markdown-stage
// approximation (engineering/decisions/2026-06-17-content-capacity-contract.md).
// Reuses the same walkers the focus/build resolvers do (mirroring
// lib/transformers/build.js resolveAxisHtml), so the count matches what renders
// and the content-capacity check can't drift from the layout. Returns an
// integer (0 = no collection of that axis present).
function countAxis(html, axis) {
  if (!html || !axis) return 0;
  if (axis === 'item') {
    const list = firstList(html);
    return list ? directChildren(list.body, 'li').length : 0;
  }
  if (axis === 'row') {
    const tb = tbodyBody(html);
    return tb ? allRows(tb.body).length : 0;
  }
  if (axis === 'col') {
    let cols = 0;
    for (const r of allRows(html)) cols = Math.max(cols, rowCells(html.slice(r.start, r.end)).length);
    return cols;
  }
  if (axis === 'cell') {
    const tb = tbodyBody(html);
    if (!tb) return 0;
    let n = 0;
    for (const r of allRows(tb.body)) n += rowCells(tb.body.slice(r.start, r.end)).length;
    return n;
  }
  if (axis === 'line') {
    const codeOpen = html.search(/<code\b/);
    if (codeOpen < 0) return 0;
    const openEnd = html.indexOf('>', codeOpen) + 1;
    const closeStart = html.indexOf('</code>', openEnd);
    if (closeStart < 0) return 0;
    return splitCodeLines(html.slice(openEnd, closeStart)).length;
  }
  return 0;
}

// Set/replace `start="N"` on the <ol …> open tag that `firstList` leaves at the
// end of `pre`, so a list split across slides keeps numbering continuous.
function setOlStart(pre, start) {
  return pre.replace(/<ol\b([^>]*)>$/, (_, attrs) => {
    // strip an existing start= and any trailing space so we never double-space
    const cleaned = attrs.replace(/\s+start="[^"]*"/, '').replace(/\s+$/, '');
    return `<ol${cleaned} start="${start}">`;
  });
}

// Partition the primary collection for `axis` in RESOLVED slide `html` into
// groups of at most `perSlide` members — the split-move counterpart to countAxis
// and the discrete actuator of the Fit Ladder
// (engineering/decisions/2026-06-22-the-fit-spine.md §3). Returns one
// slide-inner-HTML string per group, with the slide's surrounding structure
// repeated on each: the heading + intro + list/table wrapper (and a table's
// <thead>) live in `pre`/`post` and so recur on every slide; an <ol> gets a
// `start=` on slides 2+ so numbering stays continuous.
//
// Return contract is a deliberate tri-state so "fits" and "can't split" never
// collapse together:
//   · an ARRAY of length 1 — the collection already fits (count <= perSlide) or
//     is absent: a no-op single slide.
//   · an ARRAY of length >1 — the split, in order.
//   · null — the axis is NOT splittable without destroying meaning (`col`/`cell`
//     split a table's read-across; `line` splits an atomic code block). The
//     caller ESCALATES (the manifest's escalateTo) instead of splitting — the
//     Fit Ladder never splits a read-across ledger or a figure mid-stride.
//
// Pure & structural: it repeats `pre`/`post` verbatim and renumbers <ol>; the
// "(cont.)" continuation adornment is a presentation layer the caller adds. No
// keepTogether policy here — that is the per-component split policy the build-time
// consumer applies on top (it decides axis + perSlide + which groups are atomic).
//
// Whitespace is preserved exactly: each group's slice runs from the previous
// group's end (or `body` start) through its last member, and the final group runs
// to `body`'s end — so the union of the slices' inner content is `body` verbatim
// (seam/leading/trailing whitespace flows to the following slide, never dropped).
/**
 * Distribute `n` members over the pages a per-page CEILING implies, as evenly as possible.
 *
 * `perSlide` is a ceiling, not a chunk size — but chunking `i += perSlide` treats it as one,
 * which overfills the early pages and starves the last: 13 members at a ceiling of 4 came out
 * **4/4/4/1**, 21 at 5 came out 5/5/5/5/1. That is the "jarring uneven slides" §0b rejects,
 * and it silently contradicted the shipped claim that the cut is "BALANCED, never greedy — so
 * no page of a run is a runt" (manifest.schema.json, the `capacity-autosplit` advisory, and
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md). A scalar simply cannot
 * express 4/3/3/3, so the DISTRIBUTION has to live here rather than in the caller's target.
 *
 * Page count is unchanged (`ceil(n / ceiling)`), so no page ever exceeds the ceiling the
 * component declared; the members are then spread so the first `n % pages` pages take one
 * extra and every page differs from every other by at most 1. Found by the HARD RULE #25
 * adversarial trio; the prior unit test only used counts where ceiling and balance coincide.
 */
function evenGroups(n, perSlide) {
  const pages = Math.max(1, Math.ceil(n / perSlide));
  const base = Math.floor(n / pages);
  const extra = n % pages;
  return Array.from({ length: pages }, (_, k) => base + (k < extra ? 1 : 0));
}

function partitionAxis(html, axis, perSlide) {
  if (!html || !Number.isInteger(perSlide) || perSlide < 1) return [html];
  const split = (spans, body, assemble) => {
    if (spans.length <= perSlide) return [html];
    const out = [];
    let cursor = 0;
    let i = 0;
    for (const size of evenGroups(spans.length, perSlide)) {
      const group = spans.slice(i, i + size);
      const isLast = i + size >= spans.length;
      const end = isLast ? body.length : group[group.length - 1].end;
      out.push(assemble(body.slice(cursor, end), i));
      cursor = end;
      i += size;
    }
    return out;
  };
  if (axis === 'item') {
    const list = firstList(html);
    if (!list) return [html];
    const spans = directChildren(list.body, 'li');
    if (spans.length === 0) return [html];
    return split(spans, list.body, (inner, offset) => {
      const pre = list.tag === 'ol' && offset > 0 ? setOlStart(list.pre, offset + 1) : list.pre;
      return `${pre}${inner}</${list.tag}>${list.post}`;
    });
  }
  if (axis === 'row') {
    const tb = tbodyBody(html);
    if (!tb) return [html];
    const spans = allRows(tb.body);
    if (spans.length === 0) return [html];
    // tbodyBody's `post` already carries the closing </tbody>, so don't re-add it
    // (unlike firstList, whose close tag sits between `body` and `post`).
    return split(spans, tb.body, (inner) => `${tb.pre}${inner}${tb.post}`);
  }
  // col / cell / line — splitting destroys read-across or atomicity → escalate.
  if (axis === 'col' || axis === 'cell' || axis === 'line') return null;
  return [html];
}

// ── structural span walkers (live DOM path) ──────────────────────────────────
// Same axis contract as the HTML-string walkers above (item/row), for a LIVE
// root element. Extracted from lib/transformers/focus.js's resolveAxisDom
// (HARD RULE 15 — reuse, don't clone) and generalized so `root` can be either
// a `<section>` (focus.js's original caller) or any descendant clip-cell (the
// Fix-Me overlay's drill-down, lib/runtime/index.js). A clip-cell IS often the
// list's direct parent already (the first two clauses match it directly),
// while a bare section needs a per-cell-class fallback: a sovereign Frame
// (split-panel, split-compare, …) puts its list under `.panel-right` /
// `.compare-right`, never `.cell-stage` (the frameToggleSkip() exemption list,
// lib/forms/), and a Form-migrated STAGE layout puts it under `.cell-stage`.
// Builds the fallback clauses from CLIP_CELL_SELECTOR itself (not a
// hand-maintained duplicate list) so a new clip-cell class can't silently fall
// through this selector the way `.panel-right` originally did here — caught by
// test/unit/runtime/axis-dom-catalog.test.js, which renders every density-axis
// component's real sample and asserts the resolved selector finds something.
const { CLIP_CELL_SELECTOR } = require('./overflow-probe');
const CLIP_CELL_CLASSES = CLIP_CELL_SELECTOR.split(',').map((s) => s.trim());
const ITEM_SELECTOR = [
  ':scope > ul',
  ':scope > ol',
  ...CLIP_CELL_CLASSES.flatMap((cell) => [`:scope > ${cell} > ul`, `:scope > ${cell} > ol`]),
].join(', ');

function domItemElements(root) {
  if (!root || typeof root.querySelector !== 'function') return [];
  const list = root.querySelector(ITEM_SELECTOR);
  return list ? [...list.children].filter((el) => el.tagName === 'LI') : [];
}

function domRowElements(root) {
  if (!root || typeof root.querySelector !== 'function') return [];
  const tbody = root.querySelector(':scope table tbody');
  return tbody ? [...tbody.children].filter((el) => el.tagName === 'TR') : [];
}

module.exports = {
  readAttr,
  setAttr,
  mergeClass,
  addClassToFirstTag,
  directChildren,
  rewriteSpans,
  allRows,
  rowCells,
  firstList,
  tbodyBody,
  splitCodeLines,
  countAxis,
  partitionAxis,
  evenGroups,
  domItemElements,
  domRowElements,
};
