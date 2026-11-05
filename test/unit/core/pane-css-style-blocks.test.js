/**
 * THE PANE WIDENER'S MARKUP SCAN against the HTML reader (security spine; followups.d/3022).
 *
 * lib/core/pane-css.js `widenStyleBlocks` rewrites the author `<style>` blocks of a rendered panes document. It keeps a
 * scan of its own, because the engine does not carry the HTML reader (html-ref-reader.js, +1.9 KB gzip on every
 * route), so this test is what holds the two to one answer: its raw-text closer is `rawTextEnd`'s, and the style
 * blocks it widens are the style elements `scanHtml` reads, over a fuzz of the markup it models. The scan as it was
 * (tools/segno-legacy/pane-css-style-blocks.js) is the failing arm on each fixed case.
 *
 * Out of the fuzz, and named here as the scan's known limits: a `<style` inside another tag (an attribute value, or a
 * tag name such as `</iframe<style>`, which is one end tag), a bogus comment (`<!x …>`, `<?x …>`), and foreign
 * content (`<svg>`, `<math>`), and a double-escaped `<script>` (`<script><!--<script>…`), which `scanHtml` marks unsure.
 * On those the scan can widen text that is not a style element, which `sanitizeStyleText`
 * still guards, or miss one, which leaves a pane unstyled.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { widenStyleBlocks, widenForPanes, rawTextClose } = require('../../../lib/core/pane-css.js');
const { sanitizeStyleText } = require('../../../lib/core/sanitize-style-text.mjs');
const { rawTextEnd, RAW_TEXT } = require('../../../lib/core/html-ref-reader.js');
const { scanHtml } = require('../../../lib/core/remote-ref.js');
const legacy = require('../../../tools/segno-legacy/pane-css-style-blocks.js');

const PANE = '<lat-pane class="quote"></lat-pane>';
let seed = 0x9e3779b9;
const rand = (n) => {
  seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  return seed % n;
};

/** The marker numbers of the style elements the reader reads. */
const readerStyles = (doc) => {
  const { tags } = scanHtml(doc);
  return tags.filter((t) => t.name === 'style' && !t.closing && t.body).flatMap((t) => [...doc.slice(...t.body).matchAll(/\.k(\d+)\b/g)].map((m) => +m[1])).sort((a, b) => a - b);
};
const widened = (doc) => [...widenStyleBlocks(doc, ['quote'], ['quote']).matchAll(/section lat-pane\.quote \.k(\d+)/g)].map((m) => +m[1]).sort((a, b) => a - b);
/** The document `widenStyleBlocks` should write: each style body the READER reads, widened and sanitized, the rest byte for byte. */
function expectedFromReader(doc) {
  let out = '';
  let at = 0;
  for (const t of scanHtml(doc).tags) {
    if (t.name !== 'style' || t.closing || !t.body) continue;
    const css = doc.slice(...t.body);
    const wide = widenForPanes(css, ['quote'], ['quote']);
    if (wide === css) continue;
    out += doc.slice(at, t.body[0]) + sanitizeStyleText(wide);
    at = t.body[1];
  }
  return at ? out + doc.slice(at) : doc;
}
const legacyStyles = (doc) => legacy.styleBlockSpans(doc).flatMap(([a, b]) => [...doc.slice(a, b).matchAll(/\.k(\d+)\b/g)].map((m) => +m[1])).sort((a, b) => a - b);

const RAW = [...RAW_TEXT].filter((n) => n !== 'plaintext');
function fuzzDoc() {
  let k = 0;
  const bits = [PANE];
  const n = 2 + rand(10);
  for (let i = 0; i < n; i++) {
    const name = RAW[rand(RAW.length)];
    const pick = rand(16);
    if (pick < 4) bits.push(`<style${[' ', '>', '\n', '/'][rand(4)] === '>' ? '' : ' '}>section.quote .k${k++}{color:red}</style${['>', ' >', '\n>', 's>', 'x>'][rand(5)]}`);
    else if (pick < 6) bits.push(`<${name}>`);
    else if (pick < 8) bits.push(`</${name}${['>', ' >', 's>'][rand(3)]}`);
    else if (pick < 9) bits.push(['<!--', '-->', '<!-->', '<!--->', '--!>'][rand(5)]);
    else if (pick < 10) bits.push(`<style-x>section.quote .k${k++}{}`);
    else if (pick < 11) bits.push(`<STYLE>section.quote .k${k++}{}`);
    else if (pick < 13) bits.push(`section.quote .k${k++}{color:blue}`);
    else bits.push(['<p>', '</p>', '<div class="a">', '</div>', 'text'][rand(5)]);
  }
  return bits.join('');
}

describe('pane-css: the style-block scan against the HTML reader', () => {
  test('its raw-text closer is rawTextEnd on 20,000 fuzzed tails', () => {
    const parts = ['</style', '</STYLE', '</styles', '</style>', '</style ', '</style/', '</style\n', '</ style', '<', '/', 'a', ' ', '>', '</title', '</'];
    for (let i = 0; i < 20000; i++) {
      let s = '';
      for (let j = rand(8); j >= 0; j--) s += parts[rand(parts.length)];
      for (const name of ['style', 'title', 'noscript']) assert.equal(rawTextClose(s, name, 0), rawTextEnd(s, name, 0), JSON.stringify([s, name]));
    }
  });

  test('it writes what widening the reader\'s style elements writes, byte for byte, on 5,000 fuzzed documents', () => {
    let legacyDisagreed = 0;
    for (let i = 0; i < 5000; i++) {
      const doc = fuzzDoc();
      const { unsure } = scanHtml(doc);
      if (unsure.length) continue;
      assert.equal(widenStyleBlocks(doc, ['quote'], ['quote']), expectedFromReader(doc), JSON.stringify(doc));
      if (JSON.stringify(legacyStyles(doc)) !== JSON.stringify(readerStyles(doc))) legacyDisagreed++;
    }
    assert.ok(legacyDisagreed > 0, 'the fuzz reaches a case the old scan read differently');
  });

  for (const [what, doc, want] of [
    ['`<style-x>` is not a style element', `${PANE}<style-x>section.quote .k0{}</style>`, []],
    ['`</styles>` does not end a style element', `${PANE}<style>section.quote .k0{}</styles>section.quote .k1{}</style>`, [0, 1]],
    ['`<!-->` is a whole comment', `${PANE}<!--><style>section.quote .k0{}</style>`, [0]],
    ['`<!--->` is a whole comment', `${PANE}<!---><style>section.quote .k0{}</style>`, [0]],
    ['`--!>` ends a comment', `${PANE}<!-- a --!><style>section.quote .k0{}</style>`, [0]],
    ['a `<style>` left open runs to the end of the document', `${PANE}<style>section.quote .k0{}`, [0]],
    ['a `<noscript>` body is text', `${PANE}<noscript><style>section.quote .k0{}</style></noscript>`, []],
  ]) {
    test(`${what}: the reader, the widener, and the old scan as the failing arm`, () => {
      assert.deepEqual(readerStyles(doc), want);
      assert.notDeepEqual(legacyStyles(doc), want);
      const got = widened(doc);
      // The widener twins the rules it can; `</styles>` leaves junk ahead of the second selector, so only .k0 is twinned.
      assert.deepEqual(got, what.includes('</styles>') ? [0] : want);
    });
  }
});
