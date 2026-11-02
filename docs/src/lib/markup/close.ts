/**
 * close.ts — the depth-aware scan for the close tag matching an open tag at `startPos` (which must point AT that open
 * tag's `<`). Returns the index right after the matching `</tagName>`, or -1 when the tags are unbalanced (the caller's
 * "leave it untouched" signal). Moved from lib/core/find-matching-close.js, unchanged. Pure string-in/string-out.
 */

export function findMatchingClose(html: string, tagName: string, startPos: number): number {
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
