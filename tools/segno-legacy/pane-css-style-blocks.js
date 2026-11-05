// lib/core/pane-css.js `widenStyleBlocks`'s scan as it was at 2df7d832, before followups.d/3022 held its tags and
// comments to the HTML reader's. Frozen, verbatim except that it returns the style bodies it visits ([from, to]
// spans) where the original widened each one. test/unit/core/pane-css-style-blocks.test.js reads it as the failing
// arm; nothing in lib/ may. Do not fix bugs here.
function styleBlockSpans(html) {
  const OPENERS = /<!--|<(style|script|textarea|title|xmp)\b/gi;
  const CLOSERS = { style: /<\/style/gi, script: /<\/script/gi, textarea: /<\/textarea/gi, title: /<\/title/gi, xmp: /<\/xmp/gi };
  const spans = [];
  OPENERS.lastIndex = 0;
  for (let m = OPENERS.exec(html); m; m = OPENERS.exec(html)) {
    if (m[0] === '<!--') {
      const close = html.indexOf('-->', m.index + 4);
      if (close < 0) break;
      OPENERS.lastIndex = close + 3;
      continue;
    }
    const tag = m[1].toLowerCase();
    const openEnd = html.indexOf('>', m.index);
    if (openEnd < 0) break;
    const closer = CLOSERS[tag];
    closer.lastIndex = openEnd + 1;
    const found = closer.exec(html);
    if (!found) break;
    const close = found.index;
    OPENERS.lastIndex = close + tag.length + 2;
    if (tag !== 'style') continue;
    spans.push([openEnd + 1, close]);
  }
  return spans;
}

module.exports = { styleBlockSpans };
