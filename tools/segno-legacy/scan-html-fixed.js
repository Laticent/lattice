/**
 * scan-html-fixed.js — remote-ref.js's hand-written `scanHtml` as it was at 065bbfe, the last commit before
 * Segno R3's generated reader replaced it: the e6c3a4a scanner (scan-html.js) plus the six fixes R3's work
 * found (CDATA and start or end tags inside an integration point, a CDATA section with no `]]>`, linear
 * comment searches). The stray-`<body>` fix lives in `verifyWithParser`, not here.
 *
 * It is the ORACLE for test/unit/core/html-ref-differential.test.js and tools/check-html-ref-spans.mjs:
 * the generated reader must return these tags, field for field, and be unsure exactly where this one is
 * `risky`. Nothing in lib/ may read it. Do not fix bugs here: a fix would change what the differential
 * measures. Delete it when nobody reads it.
 */

const isHtmlSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isAsciiAlpha = (s, i) => {
  const c = s.charCodeAt(i) | 32;
  return c >= 97 && c <= 122;
};
// Elements whose content is text up to their end tag, in HTML content. `<noscript>` is read as
// raw text because every surface that shows a deck runs scripts.
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'title']);
// Inside `<svg>` or `<math>` the tree builder follows rules this scanner does not: no raw text,
// references and comments inside a `<style>`, a tag from this list leaves the foreign content,
// and `<foreignObject>` holds HTML. One of these inside foreign content means the scanner's
// reading may differ from the browser's, so `blockWebImages` asks a spec parser. Lattice's own
// SVG (charts, icons, diagrams) holds none of them: across 404 rendered decks, none.
// The elements inside `<svg>` or `<math>` whose content the tree builder reads by HTML rules (HTML
// integration points and MathML text integration points, HTML §13.2.6.5). `annotation-xml` is in
// FOREIGN_RISK already; it is listed so its content is tracked the same way.
const INTEGRATION_POINTS = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']);
const FOREIGN_RISK = new Set([
  'style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'plaintext', 'template',
  'foreignobject', 'annotation-xml', 'math', 'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div',
  'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu',
  'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt',
  'u', 'ul', 'var', 'font',
]);

/**
 * The tag at `html[i]` (`<` then a letter, or `</` then a letter), read as the tokenizer reads
 * it, or null when it never ends (the rest of the document is inside it). Each attribute keeps
 * the span of its value: `vq` where it starts (its quote, if any), `vFrom`/`vTo` the value
 * itself, `to` the end; `sep` is the separator before its name, so removing `[sep, to)` removes
 * it cleanly.
 */
function readTag(html, i) {
  const n = html.length;
  const closing = html[i + 1] === '/';
  let j = i + (closing ? 2 : 1);
  const nameFrom = j;
  while (j < n && !isHtmlSpace(html[j]) && html[j] !== '/' && html[j] !== '>') j++;
  const tag = { from: i, end: 0, nameEnd: j, name: html.slice(nameFrom, j).toLowerCase(), closing, attrs: [], selfClosing: false };
  let slash = false;
  for (;;) {
    while (j < n && (isHtmlSpace(html[j]) || html[j] === '/')) slash = html[j++] === '/';
    if (j >= n) return null;
    if (html[j] === '>') {
      tag.selfClosing = slash;
      tag.end = j + 1;
      return tag;
    }
    slash = false;
    const sep = isHtmlSpace(html[j - 1]) || html[j - 1] === '/' ? j - 1 : j;
    const from = j;
    j++; // the first character belongs to the name, even an `=`
    while (j < n && !isHtmlSpace(html[j]) && html[j] !== '/' && html[j] !== '>' && html[j] !== '=') j++;
    const attr = { name: html.slice(from, j).toLowerCase(), sep, from, to: j, vq: -1, vFrom: -1, vTo: -1, quote: '' };
    tag.attrs.push(attr);
    let k = j;
    while (k < n && isHtmlSpace(html[k])) k++;
    if (html[k] !== '=') continue;
    k++;
    while (k < n && isHtmlSpace(html[k])) k++;
    if (k >= n) return null;
    attr.vq = k;
    if (html[k] === '"' || html[k] === "'") {
      const close = html.indexOf(html[k], k + 1);
      if (close < 0) return null;
      Object.assign(attr, { quote: html[k], vFrom: k + 1, vTo: close, to: close + 1 });
      j = close + 1;
    } else {
      let e = k;
      while (e < n && !isHtmlSpace(html[e]) && html[e] !== '>') e++;
      Object.assign(attr, { vFrom: k, vTo: e, to: e });
      j = e;
    }
  }
}

/** Where the end tag of a raw-text element named `name` starts, at or after `from`, or -1. */
function rawTextEnd(html, name, from) {
  for (let k = html.indexOf('</', from); k >= 0; k = html.indexOf('</', k + 2)) {
    if (html.slice(k + 2, k + 2 + name.length).toLowerCase() !== name) continue;
    const c = html[k + 2 + name.length];
    if (c === undefined || c === '>' || c === '/' || isHtmlSpace(c)) return k;
  }
  return -1;
}

/**
 * Every start tag in `html`, in order, with its attributes, and the text span (`body`) of each
 * raw-text element in HTML content; `risky` when foreign content holds something the scanner
 * does not model (`FOREIGN_RISK`). Comments and bogus comments are skipped where the tokenizer
 * ends them, so a quote inside one cannot hide the tags after it.
 * @param {string} html
 */
function scanHtml(html) {
  const n = html.length;
  const tags = [];
  const foreign = [];
  let risky = false;
  // The next `-->` and `--!>` at or after where the last search began (-1: none). Searches only move forward,
  // so one found earlier is still the next one; searching again from every comment ran to the end of the
  // input once per comment, and 400 KB of `<!-- x -->` took 29 s.
  let nextA = -2;
  let nextB = -2;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    const next = html[lt + 1];
    if (html.startsWith('<!--', lt)) {
      // `<!-->` and `<!--->` close at once; otherwise the first `-->` or `--!>`.
      if (html[lt + 4] === '>') i = lt + 5;
      else if (html.startsWith('->', lt + 4)) i = lt + 6;
      else {
        if (nextA !== -1 && nextA < lt + 4) nextA = html.indexOf('-->', lt + 4);
        if (nextB !== -1 && nextB < lt + 4) nextB = html.indexOf('--!>', lt + 4);
        const a = nextA;
        const b = nextB;
        if (a < 0 && b < 0) {
          // A comment that never ends swallows the rest of the document in the tree, but Chromium's preload
          // scanner fetches the images after it anyway (measured in a document, `<svg><style><!--` then an
          // `<img>`), so the rest is read as markup and the page's parser is asked as well.
          risky = true;
          i = lt + 4;
          continue;
        }
        i = b < 0 || (a >= 0 && a < b) ? a + 3 : b + 4;
      }
      continue;
    }
    if (foreign.length && html.startsWith('<![CDATA[', lt)) {
      const e = html.indexOf(']]>', lt + 9);
      // Inside an integration point (`<mi>`, `<mtext>`, `<desc>`), Chromium and WebKit read a bogus comment that
      // ends at the first `>`, and the markup after it is live: `<math><mi><![CDATA[<picture><source srcset=…>]]>`
      // builds the `<source>`. This scanner does not track the current node, so where the readings part, it asks,
      // and an unterminated section is read on as markup rather than dropped.
      const gt = html.indexOf('>', lt + 2);
      if (e < 0) {
        if (gt < 0) break;
        risky = true;
        i = lt + 9;
        continue;
      }
      if (gt < e + 2) risky = true;
      i = e + 3;
      continue;
    }
    if (next === '!' || next === '?' || (next === '/' && lt + 2 < n && !isAsciiAlpha(html, lt + 2))) {
      // A doctype or a bogus comment runs to the first `>`; `</>` is dropped the same way.
      const e = html.indexOf('>', lt + 2);
      if (e < 0) break;
      i = e + 1;
      continue;
    }
    if (!(isAsciiAlpha(html, lt + 1) || (next === '/' && isAsciiAlpha(html, lt + 2)))) {
      i = lt + 1;
      continue;
    }
    const t = readTag(html, lt);
    if (!t) break;
    i = t.end;
    if (foreign.length) {
      const frame = foreign[foreign.length - 1];
      const top = frame.name;
      if (t.closing) {
        if (t.name === 'p' || t.name === 'br') risky = true;
        // Inside an integration point the tree builder runs HTML rules, and `desc`, `mi` and the rest are
        // special there: `</svg>` is ignored and the content stays foreign (`<svg><desc><x></svg></x></desc><style>`
        // then holds markup, not raw text). This scanner would leave the foreign content, so it asks.
        if ((t.name === 'svg' || t.name === 'math') && frame.points.length) risky = true;
        if (frame.points.length && frame.points[frame.points.length - 1] === t.name) frame.points.pop();
        else if (t.name === top) foreign.pop();
        continue;
      }
      tags.push(t);
      if (FOREIGN_RISK.has(t.name) || (t.name === 'svg' && top === 'math')) risky = true;
      // A start tag inside an integration point is HTML (a `<title>` there is text to its end tag, not markup),
      // which this scanner does not model inside foreign content.
      if (frame.points.length) risky = true;
      if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push({ name: t.name, points: [] });
      else if (INTEGRATION_POINTS.has(t.name) && !t.selfClosing) frame.points.push(t.name);
      continue;
    }
    if (t.closing) continue;
    tags.push(t);
    // Newer browsers let a `<select>` hold a table, a style and other markup that older ones drop, so what this
    // scanner reads as raw text or text may be live elements there. The page's own parser decides.
    if (t.name === 'select') risky = true;
    // A `<noscript>` is raw text here, as it is in a page that runs scripts. A sanitizer parses without scripts, reads its
    // content as markup and keeps the elements: `<noscript><img srcset=…></noscript>` goes in with a hidden image and comes out
    // with a live one. The page's own parser (scripts off) reads it the second way, so it decides.
    if (t.name === 'noscript') risky = true;
    if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push({ name: t.name, points: [] });
    else if (t.name === 'plaintext') break;
    else if (RAW_TEXT.has(t.name)) {
      const close = rawTextEnd(html, t.name, t.end);
      t.body = [t.end, close < 0 ? n : close];
      // An escaped script (`<!--` inside it) ends by rules this scanner does not follow.
      if (t.name === 'script' && html.slice(t.end, t.body[1]).includes('<!--')) risky = true;
      if (close < 0) break;
      const end = readTag(html, close);
      if (!end) break;
      i = end.end;
    }
  }
  return { tags, risky };
}

module.exports = { scanHtml, readTag, rawTextEnd, RAW_TEXT, FOREIGN_RISK, INTEGRATION_POINTS };
