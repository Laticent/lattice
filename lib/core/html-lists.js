/**
 * Depth-aware HTML list walkers — the canonical home for the two primitives
 * every string-rewriting transform needs when it walks rendered Markdown:
 * "give me the top-level <li> contents of this list" and "find the first
 * <ul>/<ol> in this HTML."
 *
 * Both are tag-depth scanners, not regexes, because the naive
 * /<ul>([\s\S]*?)<\/ul>/ stops at the first NESTED </ul> and silently
 * truncates any list whose items carry sublists — the exact shape most
 * Lattice layouts author (— Title / nested body).
 *
 * History: these lived in lib/components/chart/_chart-family/chart-family.js
 * and were copied ("kept local to keep the kernel self-contained") into
 * funnel, map, and mark-detail — and imported from chart-family by
 * lib/core/split-panels.js, which made a core primitive depend on a
 * component (the one architectural-boundary violation the quality
 * assessment flagged). Moving them here inverts that edge: components
 * import core, never the reverse. See engineering/quality-assessment.md.
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 */

// Walk a list's inner HTML and return its top-level `<li>` contents,
// tracking depth so a nested </li> doesn't terminate the outer item.
// Tolerates attributes on <li>, <ul>, <ol> (e.g. the engine renders
// ordered lists with `start="2"` for resumed numbering).
function parseTopLevelLis(inner) {
  const items = [];
  let depth = 0, liContentStart = -1, i = 0;
  const matchOpen = (tag, idx) => {
    if (!inner.startsWith('<' + tag, idx)) return -1;
    const next = inner.charCodeAt(idx + 1 + tag.length);
    // Either '>' or whitespace before attributes
    if (next === 0x3e /* '>' */ || next === 0x20 /* ' ' */ || next === 0x09 /* tab */) {
      const close = inner.indexOf('>', idx);
      return close < 0 ? -1 : close + 1;
    }
    return -1;
  };
  while (i < inner.length) {
    const liOpenEnd = matchOpen('li', i);
    if (liOpenEnd > 0) {
      if (depth === 0) liContentStart = liOpenEnd;
      depth++;
      i = liOpenEnd;
      continue;
    }
    if (inner.startsWith('</li>', i)) {
      depth--;
      if (depth === 0 && liContentStart !== -1) {
        items.push(inner.slice(liContentStart, i));
        liContentStart = -1;
      }
      i += 5;
      continue;
    }
    const ulOpenEnd = matchOpen('ul', i);
    if (ulOpenEnd > 0) { depth++; i = ulOpenEnd; continue; }
    const olOpenEnd = matchOpen('ol', i);
    if (olOpenEnd > 0) { depth++; i = olOpenEnd; continue; }
    if (inner.startsWith('</ul>', i) || inner.startsWith('</ol>', i)) {
      depth--; i += 5; continue;
    }
    i++;
  }
  return items;
}

// Depth-aware extractor for the first <ul>/<ol> in src. Tolerates attributes
// on opening tags (the engine adds data-tight, id, class, start, etc.).
// Returns { inner, start, end } or null. Unlike /<ul>([\s\S]*?)<\/ul>/ this
// correctly handles nested lists (the lazy regex stops at the first inner </ul>).
function extractFirstList(src) {
  // Find first <ul or <ol with optional attributes
  const matchListOpen = (pos) => {
    if (src[pos] !== '<') return -1;
    const isUl = src.startsWith('ul', pos + 1);
    const isOl = src.startsWith('ol', pos + 1);
    if (!isUl && !isOl) return -1;
    const next = src.charCodeAt(pos + 3);
    if (next !== 0x3e && next !== 0x20 && next !== 0x09 && next !== 0x0a) return -1;
    const gt = src.indexOf('>', pos);
    return gt < 0 ? -1 : gt + 1;
  };
  const isListClose = (pos) =>
    (src.startsWith('</ul>', pos) || src.startsWith('</ol>', pos)) ? pos + 5 : -1;

  let s = -1;
  for (let i = 0; i < src.length; i++) {
    const end = matchListOpen(i);
    if (end > 0) { s = i; break; }
  }
  if (s < 0) return null;

  let depth = 0, pos = s, inner = '';
  while (pos < src.length) {
    const openEnd = matchListOpen(pos);
    if (openEnd > 0) {
      if (depth > 0) inner += src.slice(pos, openEnd);
      depth++; pos = openEnd; continue;
    }
    const closeEnd = isListClose(pos);
    if (closeEnd > 0) {
      depth--;
      if (depth === 0) return { inner, start: s, end: closeEnd };
      inner += src.slice(pos, closeEnd); pos = closeEnd; continue;
    }
    if (depth > 0) inner += src[pos];
    pos++;
  }
  return null;
}

module.exports = { parseTopLevelLis, extractFirstList };
