/**
 * html-ref-reader — `scanHtml` over a parser generated from lib/core/html-ref-grammar.js.
 *
 * The reader half of Segno R3 (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md
 * §"R3 landed"; remote-ref.js `scanHtml` reads through it). The generated parser (html-ref.generated.js) tokenizes; this walks its
 * tape and keeps what the tree builder decides and the tokenizer does not: the foreign-content stack (`<svg>`,
 * `<math>`), raw text (whose end is an end-tag SEARCH, not a token), CDATA (foreign content only)
 * and `plaintext`. Where tree construction could read the markup differently from this reader, it
 * reports an `unsure` span instead of guessing, and the caller asks the platform parser (D7: fail
 * closed). test/unit/core/html-ref-differential.test.js holds it to the hand-written scanner it replaced,
 * frozen in tools/segno-legacy/scan-html-fixed.js: the same tags, field for field, and an unsure span on
 * exactly the inputs that scanner flagged `risky`.
 *
 * The `unsure` vocabulary is this island's (D6), not Segno's:
 *   comment-unterminated  a `<!--` that never ends: the tree puts the rest inside it, Chromium's
 *                         preload scanner still fetches the images after it
 *   foreign-content       a start tag inside `<svg>`/`<math>` the tree builder treats specially
 *                         (it leaves the foreign content, holds HTML, or is not raw text there)
 *   foreign-breakout      `</p>` or `</br>` inside foreign content
 *   select                a `<select>`, whose content newer browsers parse as markup
 *   noscript              a `<noscript>`, raw text here and markup to a sanitizer that runs no scripts
 *   escaped-script        a `<script>` holding `<!--`, whose end follows rules not modeled here
 *   foreign-cdata         a CDATA section in foreign content with a `>` before its `]]>` (or none):
 *                         inside an integration point (`<mi>`, `<desc>`) the browser reads a bogus
 *                         comment to that `>`, and the markup after it is live
 *   integration-point     a start tag inside an integration point, or a `</svg>`/`</math>` while one is
 *                         open: the tree builder runs HTML rules there (a `<title>` is text; `</svg>` is
 *                         ignored and the content stays foreign)
 *
 * The frozen scanner (e6c3a4a) had neither: it read every CDATA section in foreign content to its `]]>`,
 * and left foreign content on a `</svg>` the tree builder ignores, so `<math><mi><![CDATA[<picture><source
 * srcset=…>]]>` and `<svg><desc><x></svg></x></desc><style><img src=…>` reached the page with a live
 * element unseen (the first found by the parse5 differential, the rest by the review of R3; all confirmed
 * in Chromium). The hand-written scanner got the same rules before it was replaced, as `risky`.
 */
// The tokenizer's whitespace (a carriage return is a line feed by the time it tokenizes).
const isHtmlSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
// Elements whose content is text up to their end tag, in HTML content. `<noscript>` is read as
// raw text because every surface that shows a deck runs scripts. The grammar's `rtn` stops on
// these names and `plaintext` (RAW_NAMES in html-ref-grammar.js).
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'title']);
// Inside `<svg>` or `<math>` the tree builder follows rules this reader does not: no raw text,
// references and comments inside a `<style>`, a tag from this list leaves the foreign content,
// and `<foreignObject>` holds HTML. One of these inside foreign content means the reading may
// differ from the browser's, so it is `unsure`. Lattice's own SVG (charts, icons, diagrams) holds
// none of them: across 404 rendered decks, none.
// The elements inside `<svg>` or `<math>` whose content the tree builder reads by HTML rules (HTML
// integration points and MathML text integration points, HTML §13.2.6.5). The reader tracks the open ones
// per foreign element; `annotation-xml` is in FOREIGN_RISK already and is tracked the same way.
const INTEGRATION_POINTS = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']);
const FOREIGN_RISK = new Set([
  'style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'plaintext', 'template',
  'foreignobject', 'annotation-xml', 'math', 'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div',
  'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu',
  'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt',
  'u', 'ul', 'var', 'font',
]);
/** The node kinds the reader tests by number. */
const NEEDED = ['stag', 'etag', 'tn', 'rtn', 'an', 'av', 'sl', 'gt', 'copen', 'cdo', 'cend', 'cdx', 'bog', 'rgt'];

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
 * raw-text element in HTML content; `unsure` lists where tree construction could read the markup
 * differently (the vocabulary above). Comments and bogus comments end where the tokenizer ends
 * them, so a quote inside one cannot hide the tags after it.
 *   a tag   { from, end, nameEnd, name, closing, attrs, selfClosing, body? }
 *   an attr { name, sep, from, to, vq, vFrom, vTo, quote }: `vq` where the value starts (its quote,
 *           if any), `vFrom`/`vTo` the value itself (-1 with no value), `to` the end; `sep` the
 *           separator before the name, so removing `[sep, to)` removes it cleanly.
 * @returns {{ tags: object[], unsure: Array<{ from: number, to: number, why: string }> }}
 */
function readHtml(P, K, src) {
  const html = String(src ?? '');
  const n = html.length;
  const tags = [];
  const unsure = [];
  const foreign = [];
  const flag = (from, to, why) => unsure.push({ from, to, why });
  const read = (rule, from) => {
    const r = P.parse(html, rule, from);
    // The grammar matches every string, so a refusal is a defect in the generated parser.
    if (!r.ok) throw new Error(`HTML reference parser refused the input at ${r.error.at}: expected ${r.error.expected}`);
    return r.tree;
  };
  /**
   * The tag whose name node is at `k` of `buf` (its parent `stag`/`etag` spans `[from, to)` after the
   * `<`), its attributes read from the tape up to `stop`. Returns the tag, or null when it has no `>`.
   */
  const tagFrom = (buf, k, stop, lt, closing, tag) => {
    const t = tag || { from: lt, end: 0, nameEnd: buf[k + 2], name: html.slice(buf[k + 1], buf[k + 2]).toLowerCase(), closing, attrs: [], selfClosing: false };
    let slashAt = -1;
    for (let j = tag ? k : k + 4; j < stop; j += 4) {
      const kind = buf[j];
      const from = buf[j + 1];
      const to = buf[j + 2];
      if (kind === K.an) {
        const c = html[from - 1];
        t.attrs.push({ name: html.slice(from, to).toLowerCase(), sep: isHtmlSpace(c) || c === '/' ? from - 1 : from, from, to, vq: -1, vFrom: -1, vTo: -1, quote: '' });
      } else if (kind === K.av) {
        const a = t.attrs[t.attrs.length - 1];
        const q = html[from];
        if (to > from && (q === '"' || q === "'")) Object.assign(a, { vq: from, quote: q, vFrom: from + 1, vTo: to - 1, to });
        else Object.assign(a, { vq: from, vFrom: from, vTo: to, to });
      } else if (kind === K.sl) slashAt = to;
      else if (kind === K.gt || kind === K.rgt) {
        t.selfClosing = slashAt === from;
        t.end = to;
        return t;
      }
    }
    return null;
  };
  // Once one comment never ends, none after it can: a later `<!--` sits inside the first comment's
  // unread rest, in the state (two dashes seen) its own start puts it in, so any end it could find the
  // first would have found. Without this, `'<!-- -'.repeat(n)` reads the rest once per comment.
  let noCommentEnd = false;
  let pos = 0;
  scan: for (;;) {
    const { buf, top } = read('top', pos);
    // Where `top` resumes; -1 when this parse read to the end with nothing left to decide.
    let next = -1;
    for (let k = 0; k < top; k = buf[k + 3]) {
      const kind = buf[k];
      // A sub-parse (`read`) overwrites `buf`: the generated parser's tape is module state. So every
      // offset a branch needs is read off the tape before its first sub-parse.
      const from = buf[k + 1];
      const to = buf[k + 2];
      if (kind === K.copen) {
        const lt = from - 2;
        let closed = -1;
        if (!noCommentEnd) {
          const c = read('comment', to);
          for (let j = 0; j < c.top; j += 4) if (c.buf[j] === K.cend) closed = c.buf[j + 2];
          noCommentEnd = closed < 0;
        }
        if (closed >= 0) next = closed;
        else {
          // A comment that never ends swallows the rest of the document in the tree, but Chromium's preload
          // scanner fetches the images after it anyway (measured in a document, `<svg><style><!--` then an
          // `<img>`), so the rest is read as markup and the page's parser is asked as well.
          flag(lt, n, 'comment-unterminated');
          next = to;
        }
        break;
      }
      if (kind === K.cdo) {
        // In HTML content `<![CDATA[` opens a bogus comment, which runs to the first `>`.
        const bogus = read('bogusRest', from);
        const bogusEnd = bogus.top ? bogus.buf[2] : from;
        const sawGt = bogusEnd > from && html.startsWith('>', bogusEnd - 1);
        if (!foreign.length) {
          if (!sawGt) break scan;
          next = bogusEnd;
          break;
        }
        // In foreign content a CDATA section, to `]]>`. Unless the current node is an integration point
        // (`<mi>`, `<mtext>`, `<desc>`, `<foreignObject>`, …), where Chromium and parse5 read a bogus comment
        // instead, and markup after its first `>` is live: `<math><mi><![CDATA[<picture><source srcset=…>]]>`
        // builds the `<source>`. This reader does not track the current node, so where the two readings part
        // (a `>` before the `]]>`, or a section that never ends after one), it is unsure, and an unterminated
        // section is read on as markup rather than dropped.
        const c = read('cdata', to);
        const end = c.top ? c.buf[2] : to;
        const closed = end - 3 >= to && html.startsWith(']]>', end - 3);
        if (!closed) {
          if (!sawGt) break scan;
          flag(from - 2, n, 'foreign-cdata');
          next = to;
          break;
        }
        if (bogusEnd < end) flag(from - 2, end, 'foreign-cdata');
        next = end;
        break;
      }
      if (kind !== K.stag && kind !== K.etag) continue;
      const lt = buf[k + 1] - (kind === K.etag ? 2 : 1);
      const closing = kind === K.etag;
      const nameAt = k + 4;
      let t;
      let raw = false;
      if (buf[nameAt] === K.rtn) {
        // The parse stopped after the name: the rest of the tag is read on its own.
        raw = true;
        const shell = { from: lt, end: 0, nameEnd: buf[nameAt + 2], name: html.slice(buf[nameAt + 1], buf[nameAt + 2]).toLowerCase(), closing, attrs: [], selfClosing: false };
        const rest = read('tagRest', buf[nameAt + 2]);
        t = tagFrom(rest.buf, 0, rest.top, lt, closing, shell);
      } else t = tagFrom(buf, nameAt, buf[k + 3], lt, closing, null);
      if (!t) break scan;
      if (foreign.length) {
        const frame = foreign[foreign.length - 1];
        const fTop = frame.name;
        if (t.closing) {
          if (t.name === 'p' || t.name === 'br') flag(t.from, t.end, 'foreign-breakout');
          // Inside an integration point the tree builder runs HTML rules, and `desc`, `mi` and the rest are
          // special there: `</svg>` is ignored and the content stays foreign (`<svg><desc><x></svg></x></desc><style>`
          // then holds markup, not raw text). This reader would leave the foreign content, so it is unsure.
          if ((t.name === 'svg' || t.name === 'math') && frame.points.length) flag(t.from, t.end, 'integration-point');
          if (frame.points.length && frame.points[frame.points.length - 1] === t.name) frame.points.pop();
          else if (t.name === fTop) foreign.pop();
          if (raw) {
            next = t.end;
            break;
          }
          continue;
        }
        tags.push(t);
        if (FOREIGN_RISK.has(t.name) || (t.name === 'svg' && fTop === 'math')) flag(t.from, t.end, 'foreign-content');
        // A start tag inside an integration point is HTML (a `<title>` there is text to its end tag, not
        // markup), which this reader does not model inside foreign content.
        if (frame.points.length) flag(t.from, t.end, 'integration-point');
        if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push({ name: t.name, points: [] });
        else if (INTEGRATION_POINTS.has(t.name) && !t.selfClosing) frame.points.push(t.name);
        if (raw) {
          next = t.end;
          break;
        }
        continue;
      }
      if (t.closing) {
        if (raw) {
          next = t.end;
          break;
        }
        continue;
      }
      tags.push(t);
      // Newer browsers let a `<select>` hold a table, a style and other markup that older ones drop, so what this
      // reader reads as raw text or text may be live elements there. The page's own parser decides.
      if (t.name === 'select') flag(t.from, t.end, 'select');
      // A `<noscript>` is raw text here, as it is in a page that runs scripts. A sanitizer parses without scripts, reads its
      // content as markup and keeps the elements: `<noscript><img srcset=…></noscript>` goes in with a hidden image and comes out
      // with a live one. The page's own parser (scripts off) reads it the second way, so it decides.
      if (t.name === 'noscript') flag(t.from, t.end, 'noscript');
      if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push({ name: t.name, points: [] });
      else if (t.name === 'plaintext') break scan;
      else if (RAW_TEXT.has(t.name)) {
        const close = rawTextEnd(html, t.name, t.end);
        t.body = [t.end, close < 0 ? n : close];
        // An escaped script (`<!--` inside it) ends by rules this reader does not follow.
        if (t.name === 'script' && html.slice(t.end, t.body[1]).includes('<!--')) flag(t.end, t.body[1], 'escaped-script');
        if (close < 0) break scan;
        next = close;
        break;
      }
      if (raw) {
        next = t.end;
        break;
      }
    }
    if (next < 0) break;
    pos = next;
  }
  // The tape and the input string are module state of the generated parser. A big tape is let go on the
  // next parse; parsing nothing now lets it go at once instead of holding megabytes between calls.
  P.parse('');
  return { tags, unsure };
}

/**
 * A `scanHtml` over `parser`, a parser generated from html-ref-grammar.js. Throws at once when the
 * parser lacks a node kind the reader needs: a kind renamed in the grammar would be `undefined` here
 * and its tags would be dropped without a sound (an `<img>` the browser fetches, unseen).
 */
function makeScanHtml(parser) {
  const kinds = Object.fromEntries(parser.parse('').tree.kinds.map((k, i) => [k, i]));
  for (const k of NEEDED) if (!Number.isInteger(kinds[k])) throw new Error(`html-ref-grammar.js has no node kind "${k}", which the HTML reference reader needs`);
  return (html) => readHtml(parser, kinds, html);
}

module.exports = { makeScanHtml, rawTextEnd, RAW_TEXT, FOREIGN_RISK, NEEDED };
