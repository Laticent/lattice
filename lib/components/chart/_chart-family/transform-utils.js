/**
 * Shared string helpers for the SVG chart transforms (quadrant, radar, …) —
 * the "same convention" toolkit those kernels used to each carry a private
 * copy of (the quadrant↔radar pair was the single biggest exact clone the
 * duplication scan found, 71 lines). One home, imported per kernel.
 *
 * NOTE the escape/strip variants here are the QUADRANT/RADAR flavor:
 *   - stripTags folds &nbsp; to a space (funnel/map's local variant folds
 *     &amp; instead — different post-processing, deliberately NOT merged;
 *     byte-level output compatibility beats a forced abstraction).
 * The list walkers (findOuterUL / splitTopLevelLI) are the <ul>-only
 * siblings of lib/core/html-lists.js's generic <ul>/<ol> walkers; they keep
 * their exact historical matching behavior for the transforms that use them.
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 */

function escHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function fmtNum(n) {
  return Number(Number(n).toFixed(2)).toString();
}

// ── Balanced-tag list extraction ───────────────────────────────────────────
// Depth-counting scans so a nested <ul> inside an item doesn't confuse the
// walker (a lazy regex stops at the first inner </ul>).

function findOuterUL(html) {
  const start = html.indexOf('<ul');
  if (start < 0) return null;
  const tagEnd = html.indexOf('>', start);
  if (tagEnd < 0) return null;
  let depth = 1, pos = tagEnd + 1;
  while (pos < html.length) {
    if (html.startsWith('<ul', pos) &&
        (html[pos + 3] === '>' || html[pos + 3] === ' ' || html[pos + 3] === '\t' || html[pos + 3] === '\n')) {
      const e = html.indexOf('>', pos);
      if (e < 0) return null;
      depth++; pos = e + 1;
    } else if (html.startsWith('</ul>', pos)) {
      depth--;
      if (depth === 0) return { start, end: pos + 5, inner: html.slice(tagEnd + 1, pos) };
      pos += 5;
    } else { pos++; }
  }
  return null;
}

function splitTopLevelLI(ulInner) {
  const lis = [];
  let pos = 0;
  while (pos < ulInner.length) {
    const liStart = ulInner.indexOf('<li', pos);
    if (liStart < 0) break;
    const liTagEnd = ulInner.indexOf('>', liStart);
    if (liTagEnd < 0) break;
    let ulDepth = 0, scan = liTagEnd + 1, liEnd = -1;
    while (scan < ulInner.length) {
      if (ulInner.startsWith('<ul', scan) &&
          (ulInner[scan + 3] === '>' || ulInner[scan + 3] === ' ' || ulInner[scan + 3] === '\t' || ulInner[scan + 3] === '\n')) {
        const e = ulInner.indexOf('>', scan);
        if (e < 0) break;
        ulDepth++; scan = e + 1;
      } else if (ulInner.startsWith('</ul>', scan)) {
        ulDepth--; scan += 5;
      } else if (ulInner.startsWith('</li>', scan) && ulDepth === 0) {
        liEnd = scan; break;
      } else { scan++; }
    }
    if (liEnd < 0) break;
    lis.push(ulInner.slice(liTagEnd + 1, liEnd));
    pos = liEnd + 5;
  }
  return lis;
}

module.exports = { escHtml, escAttr, stripTags, fmtNum, findOuterUL, splitTopLevelLI };
