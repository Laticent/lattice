/**
 * scan-html.js — `scanHtml` as it was at e6c3a4a, before Segno R3's work fixed the live scanner and
 * built the generated reader meant to replace it (lib/core/html-ref-grammar.js, html-ref-reader.js).
 *
 * Frozen verbatim from lib/core/remote-ref.js at e6c3a4a (the helpers it reads are copied beside it).
 * test/unit/core/html-ref-differential.test.js and tools/check-html-ref-spans.mjs read it to show the
 * live scanner keeps its tags and only ever adds `risky`. Nothing in lib/ may read it. Do not fix bugs
 * here: a fix would change what the comparison measures. Delete it when nobody reads it.
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
        const a = html.indexOf('-->', lt + 4);
        const b = html.indexOf('--!>', lt + 4);
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
      if (e < 0) break;
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
      const top = foreign[foreign.length - 1];
      if (t.closing) {
        if (t.name === 'p' || t.name === 'br') risky = true;
        if (t.name === top) foreign.pop();
        continue;
      }
      tags.push(t);
      if (FOREIGN_RISK.has(t.name) || (t.name === 'svg' && top === 'math')) risky = true;
      if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push(t.name);
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
    if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push(t.name);
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

module.exports = { scanHtml, readTag, rawTextEnd, RAW_TEXT, FOREIGN_RISK };
