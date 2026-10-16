/**
 * The Export-to-Marp bundle carries its math typeset, never as TeX
 * (lib/core/marp-bundle-math.js; engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 15).
 * The real-marp-cli arm is test/integration/export/marp-bundle-author-script.test.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { bakeMath, canonicalKatexHtml, KATEX_ALLOWLIST, _internal: { encode, styleOk, blankFor } } = require('../../../lib/core/marp-bundle-math');
const { renderers } = require('../../../lib/plugins/math/math.render.js');

// What a MathJax-on Marp would read: commonmark with raw HTML, and no `$` left unescaped in text.
const marpLike = new MarkdownIt('commonmark', { html: true }).enable(['table']);
// Without `text_join`, an escaped `\$` stays a `text_special` token instead of merging into text.
const dollarProbe = new MarkdownIt('commonmark', { html: true }).enable(['table']).disable('text_join');
const liveDollars = (md) => {
  const out = [];
  const walk = (ts) => { for (const t of ts) { if (t.type === 'text' && t.content.includes('$')) out.push(t.content); if (t.children) walk(t.children); } };
  // An escaped `\$` becomes a `text_special` token, not text, so only unescaped dollars land here.
  walk(dollarProbe.parse(md, {}));
  return out;
};

describe('canonicalKatexHtml — a strict grammar, rewritten from what it read', () => {
  test('KaTeX output round-trips, with the punctuation in its text and values encoded', () => {
    const out = canonicalKatexHtml(renderers.math_inline({ content: 'a_1^2' }, { options: {} }));
    assert.ok(out);
    assert.match(out, /^<span class="katex">/);
    assert.match(out, /<annotation encoding="application\/x-tex">a&#95;1&#94;2<\/annotation>/);
  });

  for (const [name, html] of [
    ['a /-separated handler', '<span class="a" style="x:1"/onanimationstart="alert(1)">y</span>'],
    ['an unknown attribute', '<span class="a" onclick="x">y</span>'],
    ['an unquoted value', '<span class=a>y</span>'],
    ['a tag off the list', '<img src="x">'],
    ['a style url()', '<span style="background:url(http://h/b)">y</span>'],
    ['a style image-set()', '<span style="background-image:image-set(x)">y</span>'],
    ['a style property off the list', '<span style="behavior:x">y</span>'],
    ['an entity-encoded url()', '<span style="background&#58;url(http://h)">y</span>'],
    ['a mismatched close', '<span><mi>x</span></mi>'],
    ['an unclosed tag', '<span>x'],
    ['a comment', '<span><!-- x --></span>'],
    ['a bare ampersand', '<span>a & b</span>'],
    ['an unknown named entity', '<span>&copy;</span>'],
    ['a duplicate attribute', '<span class="a" class="b">y</span>'],
    ['a value holding <', '<span title="<img src=x onerror=alert(1)>">y</span>'],
    ['annotation-xml', '<math><semantics><annotation-xml encoding="text/html"><style></style></annotation-xml></semantics></math>'],
    ['a raw-text element', '<span><style>x</style></span>'],
  ]) {
    test(`refuses ${name}`, () => assert.equal(canonicalKatexHtml(html), null));
  }

  test('a free-text title is kept, and only encoded', () => {
    assert.equal(canonicalKatexHtml('<span title="a &quot;b&quot; | c">y</span>'), '<span title="a &#34;b&#34; &#124; c">y</span>');
  });

  test('the style grammar takes lengths, colors, calc() and var() only', () => {
    for (const ok of ['height:0.68em;', 'color:#cc0000', 'width:calc(100% - 2em)', 'color:var(--warn)', 'border:0.04em solid red']) assert.ok(styleOk(ok), ok);
    for (const bad of ['color:expression(x)', 'background:url(x)', 'color:red\\;x', 'width:attr(x)', 'top:1em;-moz-binding:x']) assert.ok(!styleOk(bad), bad);
  });

  test('encode leaves only letters, digits, spaces and non-ASCII', () => {
    assert.equal(encode('a*b_`$|<&\n∑'), 'a&#42;b&#95;&#96;&#36;&#124;&#60;&#38;&#10;∑');
  });

  test('every allowed tag is innocuous: no raw-text element, no linking element', () => {
    for (const bad of ['script', 'style', 'textarea', 'title', 'iframe', 'a', 'img', 'maction', 'mglyph', 'annotation-xml', 'foreignobject', 'use', 'image']) {
      assert.equal(KATEX_ALLOWLIST[bad], undefined, bad);
    }
    for (const attrs of Object.values(KATEX_ALLOWLIST)) for (const a of attrs) assert.doesNotMatch(a, /^on|href|src/);
  });
});

describe('bakeMath — the math the engine would typeset, written into the deck', () => {
  test('the two red-team vectors leave no live attribute and no url()', () => {
    const deck = String.raw`$x\style{animation:a 1s"/onanimationstart="top.h=1}{y}$ and $a\style{background:url(http://h/b)}{b}$`;
    const { markdown, baked, failed } = bakeMath(deck);
    assert.equal(baked + failed, 2);
    assert.doesNotMatch(markdown, /onanimationstart="|url\(/);
    assert.deepEqual(liveDollars(markdown), []);
  });

  test('inline, display, a math fence, a quote, a table cell and a list each bake', () => {
    const deck = [
      '# Head $a$', '', '> quoted $b$', '', '| x | y |', '|---|---|', '| $c$ | $c$ |', '', '- item $d$', '',
      '$$', '\\frac{1}{2}', '$$', 'After.', '', '```math', 'E=mc^2', '```', '',
    ].join('\n');
    const { markdown, baked, failed } = bakeMath(deck);
    assert.equal(failed, 0);
    assert.equal(baked, 7);
    assert.doesNotMatch(markdown, /\$/);
    // The display block is one HTML line, ended by a blank one, so `After.` stays a paragraph.
    assert.match(markdown, /^<p><span class="katex-display">.*<\/p>\n\nAfter\.$/m);
    const html = marpLike.render(markdown);
    assert.match(html, /<p>After\.<\/p>/);
    assert.match(html, /<td><span class="katex">.*<\/td>\n<td><span class="katex">/);
    assert.match(html, /<blockquote>\n<p>quoted <span class="katex">/);
  });

  test('prose dollars, code and raw HTML stay as written; prose dollars are escaped', () => {
    const deck = 'Costs $5 and $18M.\n\n`$x$` in code\n\n```js\nconst a = "$x$";\n```\n\n<div>\n$$x$$\n</div>\n';
    const { markdown, baked } = bakeMath(deck);
    assert.equal(baked, 0);
    assert.match(markdown, /^Costs \\\$5 and \\\$18M\.$/m);
    assert.match(markdown, /`\$x\$` in code/);
    assert.match(markdown, /const a = "\$x\$";/);
    assert.match(markdown, /<div>\n\$\$x\$\$\n<\/div>/);
    assert.deepEqual(liveDollars(markdown), []);
  });

  test('an escaped dollar stays escaped once, and the front matter is left alone', () => {
    const deck = '---\nmarp: true\ntitle: $x$\n---\n\nA \\$5 note and $y$.\n';
    const { markdown } = bakeMath(deck);
    assert.match(markdown, /^title: \$x\$$/m);
    assert.match(markdown, /A \\\$5 note and <span class="katex">/);
  });

  test('a $$ line Marp would read as display math inside a paragraph has its dollars escaped', () => {
    // marp-core's block rule may interrupt a paragraph; the engine's may not.
    const { markdown } = bakeMath('text\n$$\n\\style{a}{b}\n$$\n');
    assert.doesNotMatch(markdown, /^\$\$/m);
  });

  test('with the math plugin off nothing is typeset and every $ is escaped', () => {
    const { markdown, baked } = bakeMath('Hi $x$\n\n$$\ny\n$$\n', { math: false });
    assert.equal(baked, 0);
    assert.doesNotMatch(markdown, /katex/);
    assert.deepEqual(liveDollars(markdown), []);
  });

  test('a deck with no math comes back byte-identical', () => {
    const deck = '# Plain\n\nNo dollars here.\n';
    assert.equal(bakeMath(deck).markdown, deck);
  });

  test('re-baking a baked deck changes nothing', () => {
    const once = bakeMath('A $x^2$ and \\$5.\n').markdown;
    assert.equal(bakeMath(once).markdown, once);
  });

  test('header and footer directives have their dollars escaped, YAML-aware', () => {
    const deck = [
      '---', 'marp: true', "footer: '$a$ and \\$b'", 'header: "$x\\\\y$"', 'title: Costs $5', '---', '',
      '# S', '', "<!-- _footer: '$q$' -->", '', '```', '<!-- footer: $k$ -->', '```', '',
    ].join('\n');
    const { markdown } = bakeMath(deck);
    assert.match(markdown, /^footer: '\\\$a\\\$ and \\\$b'$/m, 'single-quoted: one backslash, an escaped one left alone');
    assert.match(markdown, /^header: "\\\\\$x\\\\y\\\\\$"$/m, 'double-quoted: two backslashes, which YAML reads as one');
    assert.match(markdown, /^title: Costs \$5$/m, 'other keys untouched');
    assert.match(markdown, /<!-- _footer: '\\\$q\\\$' -->/);
    assert.match(markdown, /<!-- footer: \$k\$ -->/, 'a comment inside code is quoted material');
  });

  test('display math in a tight list keeps the list tight', () => {
    const { markdown } = bakeMath('- one\n- $$x^2$$\n- three\n');
    assert.match(markdown, /^- <p>.*<\/p>\n- three$/m);
  });

  test('a dollar inside a bare URL is left as written', () => {
    assert.match(bakeMath('see https://ex.com/$abc and $5\n').markdown, /https:\/\/ex\.com\/\$abc and \\\$5/);
  });

  test('a CRLF deck keeps CRLF around a display block', () => {
    const { markdown } = bakeMath('$$\r\nx\r\n$$\r\nAfter.\r\n');
    assert.doesNotMatch(markdown.replace(/\r\n/g, ''), /[\r\n]/);
  });

  test('blankFor keeps a quote open and drops a list marker', () => {
    assert.equal(blankFor('> '), '>');
    assert.equal(blankFor('> - '), '>');
    assert.equal(blankFor('- '), '');
    assert.equal(blankFor('12. '), '');
  });
});
