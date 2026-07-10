/**
 * findMatchingClose — depth-aware scan for the close tag matching an open
 * tag at `startPos` (which must point AT that open tag's `<`). Jumps to the
 * next open/close occurrence via indexOf rather than testing every character
 * position (mirrors lib/core/section-walk.js's mapSections).
 *
 * Was pasted as a private ~15-line char-by-char scan into chart-family.js's
 * wrapRoadmapFigure (a <div class="horizons"> wrap) and extractChartBody (the
 * chart-frame body div) — same algorithm, different tag/start each time.
 *
 * Returns the index right AFTER the matching `</tagName>`, or -1 if the tags
 * are unbalanced (a real `<div>`/`</div>` can never legitimately go
 * unbalanced in Marpit-rendered HTML; -1 is the caller's "leave it
 * untouched" signal).
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 */

function findMatchingClose(html, tagName, startPos) {
  const openPrefix = '<' + tagName;
  const closeTag = '</' + tagName + '>';
  let depth = 0;
  let pos = startPos;
  while (pos < html.length) {
    const nextOpen = html.indexOf(openPrefix, pos);
    const nextClose = html.indexOf(closeTag, pos);
    if (nextClose < 0) return -1;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const c = html.indexOf('>', nextOpen);
      if (c < 0) return -1;
      depth++;
      pos = c + 1;
    } else {
      depth--;
      if (depth === 0) return nextClose + closeTag.length;
      pos = nextClose + closeTag.length;
    }
  }
  return -1;
}

module.exports = { findMatchingClose };
