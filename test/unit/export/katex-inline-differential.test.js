/**
 * Segno P5b, Family B: lib/export/katex-inline.js read by the one CSS tokenizer, against the regexes it replaced (frozen
 * in tools/segno-legacy/katex-inline.js).
 *
 * On KaTeX's own sheet the bytes must be the same: that sheet is the only input the exports hand it. On a seeded corpus
 * of the pieces it reads, the two must agree wherever no comment or string holds one of those pieces; where one does,
 * the regexes read through it and the tokenizer does not, as CSS reads it. A face whose block opens a nested `{` ends
 * where CSS ends it, at the matching `}`, not at the first one, and a `src` that ends a longer name (`blocksrc:`) is not one.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/katex-inline.js');
const now = require('../../../lib/export/katex-inline.js');
const { cssTokens } = require('../../../lib/core/css-tokens.js');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const fake = (file) => (file.includes('Main') ? null : `QUJD${file.length}`);
const run = (m, css) => {
  const inlined = m.inlineKatexFonts(css, fake);
  return JSON.stringify([m.katexFontFiles(css), inlined, m.splitKatexSheet(inlined)]);
};

test("on KaTeX's own sheet the files, the inlined sheet and the split are byte-identical", () => {
  const css = fs.readFileSync(path.join(ROOT, 'node_modules/katex/dist/katex.min.css'), 'utf8');
  assert.ok(legacy.katexFontFiles(css).length >= 20, 'the sheet names its woff2 files');
  assert.equal(run(now, css), run(legacy, css));
});

const PIECES = [
  '@font-face{', '@font-face {', '}', '{', ';', 'font-family:KaTeX_Main;', 'src:url(fonts/KaTeX_Math-Italic.woff2)',
  "src:url('fonts/KaTeX_Size1-Regular.woff2')", 'src:url("fonts/KaTeX_Main-Bold.woff2")', " format('woff2')",
  ' format("woff2")', 'format(woff2)', ',url(fonts/a.woff) format("woff")', 'src: url(fonts/b.woff2) format(woff2)',
  'src:url(fonts/../x.woff2) format(woff2)', '/* c */', "'}'", '"src:url(fonts/q.woff2) format(woff2)"', '.katex{font:1em}',
  ' ', '\n', 'font-display:block',
];
const corpus = (seed, count) => {
  const rnd = prng(seed);
  return Array.from({ length: count }, (_, n) => {
    let s = '';
    const len = 1 + Math.floor(rnd() * 10);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return [`pieces#${seed}.${n}`, s];
  });
};
// A comment or a string (closed or not) holds a piece the regexes read: there they read it and CSS does not.
const READS = /src|@font-face|[{};]|url\(|format/;
const inToken = (css) => cssTokens(css).some((t) => (t.type === 'comment' || t.type === 'string') && READS.test(css.slice(t.from, t.to)));
// A face's block holds a `{` before its first `}`: the regex ends the face at that first `}`, CSS at the one that matches.
const nested = (css) => /@font-face\s*\{[^}]*\{/.test(css);
// `src:` as the tail of a longer name (`blocksrc:`): the regex has no word boundary, and that property is not `src`.
const tail = (css) => /[\w-]src:/.test(css);
const explained = (css) => inToken(css) || nested(css) || tail(css);

test('on the seeded corpus, every disagreement has a comment or string holding what the regexes read', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(3, 5000), ...corpus(9, 5000)]) {
    if (run(now, css) === run(legacy, css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained, []);
  assert.ok(agree > 3000, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test('failing arm: a src inside a comment or a string is not inlined', () => {
  const css = '@font-face{/* src:url(fonts/a.woff2) format(woff2) */font-family:"src:url(fonts/b.woff2) format(woff2)"}';
  assert.deepEqual(legacy.katexFontFiles(css), ['a.woff2'], 'the regex read the commented src, and its tail ate the next');
  assert.deepEqual(now.katexFontFiles(css), []);
  assert.equal(now.inlineKatexFonts(css, fake), css);
});

test("failing arm: a '}' inside a string does not end a face", () => {
  const css = "@font-face{font-family:'}';src:url(fonts/a.woff2) format(woff2)}.k{color:red}";
  assert.equal(legacy.splitKatexSheet(css).faces, "@font-face{font-family:'}");
  assert.deepEqual(now.splitKatexSheet(css), { faces: "@font-face{font-family:'}';src:url(fonts/a.woff2) format(woff2)}", rules: '.k{color:red}' });
});
