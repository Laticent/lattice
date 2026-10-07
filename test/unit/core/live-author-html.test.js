/**
 * live-author-html — the count behind the CLI's warning that a plain `.html` export keeps the
 * deck's own script live (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10).
 * The export bytes do not change; what is pinned is that the CLI says so, and only when it is true.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { countLiveAuthorHtml, formatLiveAuthorHtmlWarning } = require('../../../lib/core/live-author-html');

test('an author <script> and an on… handler are counted', () => {
  const html = '<section><img src=x onerror="top.p=1"><script>window.q=1</script></section>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 1, handlers: 1, urls: 0 });
});

test("the engine's own marked scripts are not the deck's", () => {
  const html = '<script data-lattice-script>run()</script><script data-lattice-script="">x()</script>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 0, handlers: 0, urls: 0 });
});

test('a data script does not run, so it is not counted; a module does', () => {
  assert.equal(countLiveAuthorHtml('<script type="application/json">{}</script>').scripts, 0);
  assert.equal(countLiveAuthorHtml("<script type='text/x-template'>t</script>").scripts, 0);
  assert.equal(countLiveAuthorHtml('<script type="module">m()</script>').scripts, 1);
  assert.equal(countLiveAuthorHtml('<SCRIPT TYPE="text/javascript" src="a.js"></SCRIPT>').scripts, 1);
  assert.equal(countLiveAuthorHtml('<script type="">x()</script>').scripts, 1);
});

test('text inside a script or a style is not an attribute', () => {
  const html = '<script data-lattice-script>el.innerHTML = "<img onerror=boom>"</script>'
    + '<style>.x::after{content:"<b onclick=y>"}</style><p>plain onload= prose</p>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 0, handlers: 0, urls: 0 });
});

test('every handler on every element counts, in any case and quoting', () => {
  const html = '<svg onload=a()><rect ONCLICK="b()" onmouseover=\'c()\'/></svg><div/onfocus=d()>';
  assert.equal(countLiveAuthorHtml(html).handlers, 4);
});

test('a word that merely starts with "on" in an attribute name is not a handler', () => {
  assert.equal(countLiveAuthorHtml('<div data-one="1" none="2" class="online">x</div>').handlers, 0);
});

test('the warning names the file, the counts and --player; and is silent on a clean deck', () => {
  assert.deepEqual(formatLiveAuthorHtmlWarning({ scripts: 0, handlers: 0 }, 'deck.html'), []);
  const [head, tail] = formatLiveAuthorHtmlWarning({ scripts: 2, handlers: 1 }, 'deck.html');
  assert.match(head, /deck\.html keeps the deck's own HTML live: 2 <script>s and 1 on… handler\. Whoever opens the file runs them\./);
  const [three] = formatLiveAuthorHtmlWarning({ scripts: 1, handlers: 2, urls: 1 }, 'deck.html');
  assert.match(three, /1 <script>, 2 on… handlers and 1 javascript: URL or srcdoc frame\./);
  assert.match(tail, /--player/);
  const [side] = formatLiveAuthorHtmlWarning({ scripts: 1, handlers: 0 }, 'deck.html', { sidecar: true });
  assert.match(side, /deck\.html \(the HTML sidecar\) .*1 <script>\. Whoever opens the file runs it\./);
});

test("a handler on a script's own opening tag still counts", () => {
  assert.deepEqual(countLiveAuthorHtml('<script src="a.js" onload="b()"></script>'), { scripts: 1, handlers: 1, urls: 0 });
});

test('a srcdoc frame and a javascript: URL run code too', () => {
  const html = '<iframe srcdoc="&lt;script&gt;x()&lt;/script&gt;"></iframe><a href="javascript:alert(1)">a</a>'
    + "<a href=' javascript:void(0)'>b</a><svg><a xlink:href=\"javascript:y()\"><text>c</text></a></svg>";
  assert.equal(countLiveAuthorHtml(html).urls, 4);
  assert.equal(countLiveAuthorHtml('<a href="https://example.com/javascript:">ok</a><img src="javascript.png">').urls, 0);
});

// ── withoutLiveAuthorHtml: the Export-to-Marp bundle's strip (theme-css-is-a-preview-sink.md § 11)
const { withoutLiveAuthorHtml } = require('../../../lib/core/live-author-html');
const MarkdownIt = require('markdown-it');
const liveAfter = (md) => countLiveAuthorHtml(new MarkdownIt({ html: true }).render(md));
const NONE = { scripts: 0, handlers: 0, urls: 0 };

test('strip: script, handler, srcdoc and javascript: go; the elements and plain HTML stay', () => {
  const md = '# A\n\n<script>beacon()</script>\n\n<img src="a.png" onerror="b()">\n\n'
    + '<a href="javascript:c()">x</a>\n\n<iframe srcdoc="<script>d()</script>"></iframe>\n\n<div class="note">kept</div>\n';
  const { markdown, removed } = withoutLiveAuthorHtml(md);
  assert.deepEqual(removed, { scripts: 1, handlers: 1, urls: 2 });
  assert.deepEqual(liveAfter(markdown), NONE);
  assert.match(markdown, /<img src="a\.png"\s*>/);
  assert.match(markdown, /<div class="note">kept<\/div>/);
});

test('strip: fenced, indented and inline code are quoted material and stay byte-identical', () => {
  const md = 'Use `<img onerror=x>` or ``<script>`` here.\n\n```html\n<script>alert(1)</script>\n<b onclick=y>\n```\n\n'
    + '    <a href="javascript:z()">indented</a>\n';
  assert.deepEqual(withoutLiveAuthorHtml(md), { markdown: md, removed: NONE });
});

test('strip: a backtick inside live HTML does not open a code span that hides a handler', () => {
  // markdown-it reads the tag first, so the backtick sits in an attribute value and the handler is live.
  const md = 'a <img title="`" onerror="x()"> b `c`\n';
  const { markdown } = withoutLiveAuthorHtml(md);
  assert.doesNotMatch(markdown, /onerror/);
  assert.deepEqual(liveAfter(markdown), NONE);
  // …and in a raw HTML block a backtick is just a character.
  const block = '<div>`<script>y()</script>`</div>\n';
  assert.deepEqual(liveAfter(withoutLiveAuthorHtml(block).markdown), NONE);
});

test('strip: entity-encoded and whitespace-split javascript: URLs, data: frames, inline script', () => {
  const md = '<a href="jav&#x61;script:a()">1</a> <a href=" java\tscript:b()">2</a>\n\n'
    + '<iframe src="data:text/html,<script>c()</script>"></iframe>\n\npara <script>d()</script> end\n';
  const { markdown } = withoutLiveAuthorHtml(md);
  assert.deepEqual(liveAfter(markdown), NONE);
  assert.doesNotMatch(markdown, /data:text|script>/);
  assert.match(markdown, /para\s+end/);
  // A data: IMAGE in an <img> runs nothing and stays.
  const img = '<img src="data:image/png;base64,AAAA">\n';
  assert.equal(withoutLiveAuthorHtml(img).markdown, img);
});

test('strip: data scripts and the engine\'s marked scripts stay; an unclosed script loses its tag', () => {
  const md = '<script type="application/json">{"a":1}</script>\n\n<script data-lattice-script>x()</script>\n';
  assert.equal(withoutLiveAuthorHtml(md).markdown, md);
  const open = withoutLiveAuthorHtml('# A\n\n<script>\nrest of the deck\n');
  assert.doesNotMatch(open.markdown, /<script/);
  assert.match(open.markdown, /rest of the deck/);
});

test('strip: a deck with no raw HTML is returned unchanged', () => {
  const md = '---\nmarp: true\n---\n\n# Title\n\n- one\n- two\n';
  assert.deepEqual(withoutLiveAuthorHtml(md), { markdown: md, removed: NONE });
});

test('strip: a <base href> and a meta refresh go (they would re-point the runtime tags or navigate away)', () => {
  const md = '<base href="https://evil.example/">\n\n<meta http-equiv="refresh" content="0;url=https://e">\n\n<meta name="keep">\n';
  const { markdown, removed } = withoutLiveAuthorHtml(md);
  assert.doesNotMatch(markdown, /<base|refresh/);
  assert.match(markdown, /<meta name="keep">/);
  assert.equal(removed.urls, 2);
  // The warning's count leaves them out: they run nothing in a plain .html.
  assert.deepEqual(countLiveAuthorHtml('<base href="/x/">'), NONE);
});

test("strip: the inline-HTML regex matches markdown-it's own", async () => {
  // live-author-html.js copies markdown-it/lib/common/html_re by hand (it is ESM-only, and the
  // module is CJS loaded in the browser too); pin the copy to the original, match for match.
  const { HTML_TAG_RE } = await import('markdown-it/lib/common/html_re.mjs');
  const { HTML_INLINE } = require('../../../lib/core/live-author-html')._internal;
  const samples = ['<a href="x">', "<img title='`' onerror=x>", '<div/onclick=y>', '<!-- c -->', '<!-->',
    '</b >', '<?p?>', '<!DOCTYPE x>', '<![CDATA[x]]>', '<a b=`c`>', '<x-y z>', '<a\n  b="c"\n>', '<1a>', '<a b=c d>', '<!-- a -- b -->'];
  for (const tag of samples) assert.equal(HTML_INLINE.exec(tag)?.[0], HTML_TAG_RE.exec(tag)?.[0], tag);
});

test('strip: an out-of-range numeric entity does not throw', () => {
  const md = '<a href="&#x110000;javascript:a()">x</a> <a href="&#99999999999;">y</a>\n';
  assert.doesNotThrow(() => withoutLiveAuthorHtml(md));
});

test('strip: a cut that joins its neighbors into new live HTML is stripped again (to a fixed point)', () => {
  for (const md of [
    '<scr<script>x</script>ipt>alert(1)</scr<script>y</script>ipt>\n',
    '<img src=x o<script></script>nerror=alert(1)>\n',
    '<scr<scr<script>x</script>ipt>ipt>alert(1)</script>\n',
  ]) {
    const { markdown } = withoutLiveAuthorHtml(md);
    assert.deepEqual(liveAfter(markdown), NONE, `${md} → ${markdown}`);
    assert.doesNotMatch(markdown, /<script>|onerror=/i);
  }
});

test('strip: a Marp directive comment is stripped although plain markdown-it reads it as a comment', () => {
  const { markdown } = withoutLiveAuthorHtml('<!-- footer: <img src=x onerror=alert(1)> -->\n\n# A\n');
  assert.doesNotMatch(markdown, /onerror/);
});

test('strip: linear on adversarial input (no rescan to the end from every `<`)', () => {
  for (const md of ['<a onclick=1>' + '<a b'.repeat(40000), '<script '.repeat(20000), '<a b="'.repeat(30000)]) {
    const t = Date.now();
    withoutLiveAuthorHtml(md);
    assert.ok(Date.now() - t < 3000, `${md.slice(0, 12)}… took ${Date.now() - t} ms`);
  }
});

test('strip: vbscript: and data: documents go wherever they sit; data: images stay', () => {
  const md = '<a href="vbscript:msgbox(1)">v</a> <a href="data:text/html,<script>x()</script>">d</a> '
    + '<object data="data:image/svg+xml,<svg onload=y()>"></object>\n';
  const { markdown, removed } = withoutLiveAuthorHtml(md);
  assert.doesNotMatch(markdown, /vbscript|data:text|data:image\/svg/);
  assert.equal(removed.urls, 3);
  const keep = '<img src="data:image/svg+xml;base64,AAAA"> <a href="data:image/png;base64,AAAA">png</a>\n';
  assert.equal(withoutLiveAuthorHtml(keep).markdown, keep);
});

test('strip: raw-text elements inside SVG or MathML are markup, so a handler there goes', () => {
  // Chromium runs this one: inside <svg> a <style> is not raw text, and the <img> breaks out live.
  for (const md of ['<svg><style><img src=x onerror=w()></style></svg>\n', '<math><mtext><table><mglyph><style><img src=x onerror=v()>\n',
    '<svg><title><img src=x onerror=u()></title></svg>\n']) {
    assert.doesNotMatch(withoutLiveAuthorHtml(md).markdown, /onerror/, md);
  }
});

test('strip: a fence opened inside the front matter does not hide the body', () => {
  // Marp removes the front matter before it parses; plain markdown-it read this YAML value as an
  // unclosed fence and so the whole body as code (the independent checker, real marp-cli + Chromium).
  const { withoutLiveAuthorHtml } = require('../../../lib/core/live-author-html');
  const fm = '---\nmarp: true\nnote: |\n  ```\n---\n\n# Forged\n\n';
  const strip = withoutLiveAuthorHtml(`${fm}<img src=x onerror="document.title='pwned'">\n`);
  assert.equal(strip.removed.handlers, 1);
  assert.doesNotMatch(strip.markdown, /onerror/);
  // A real fence in the body after a plain front matter is still quoted material.
  const quoted = '---\nmarp: true\n---\n\n```html\n<img src=x onerror="q()">\n```\n';
  assert.equal(withoutLiveAuthorHtml(quoted).markdown, quoted);
});

test('math links: \\href, \\url and \\csname become \\text{} outside fenced code; a longer name and a fence stay', () => {
  const { withoutMathLinks } = require('../../../lib/core/live-author-html');
  const fence = '```tex\n\\href{k}{v}\n```\n';
  const { markdown, removed } = withoutMathLinks(`$\\href{#" autofocus onfocus="x"}{y}$ and $$\\url{a}$$ \\csname\n\n${fence}\\hrefx`);
  assert.equal(removed, 3);
  assert.doesNotMatch(markdown.replace(fence, ''), /\\(?:href|url|csname)(?![A-Za-z])/);
  assert.ok(markdown.includes(fence));
  assert.match(markdown, /\\hrefx$/);
  assert.deepEqual(withoutMathLinks('# plain'), { markdown: '# plain', removed: 0 });
});

test('front matter by Marp\'s rule: a longer opener, a trailing word, a longer closer; and no body when unclosed', () => {
  const { frontMatterEnd, withoutFrontMatterLines } = require('../../../lib/core/marp-front-matter');
  const { withoutLiveAuthorHtml } = require('../../../lib/core/live-author-html');
  // Measured on marp-core 4.4 (lib/core/marp-front-matter.js).
  assert.equal(frontMatterEnd(['---x\n', 'a: 1\n', '---\n', 'body']), 2);
  assert.equal(frontMatterEnd(['---\n', 'a: 1\n', '-----\n', 'body']), 2);
  assert.equal(frontMatterEnd(['---\n', 'a: 1\n', '...\n', 'body']), 2);
  assert.equal(frontMatterEnd(['---\n', 'a: 1\n', '   ---\n', 'body']), 2);
  assert.equal(frontMatterEnd(['----\n', 'a: 1\n', '---\n', 'body']), 3, '---- is not closed by ---');
  assert.equal(frontMatterEnd(['---\n', 'a: 1\n', '--- x\n', 'body']), 3, '--- x closes nothing');
  assert.equal(frontMatterEnd([' ---\n', 'body']), -1);
  assert.equal(withoutFrontMatterLines('---\r\nx\r\n---\r\nbody'), '\r\n\r\n\r\nbody');
  // Each variant that blinded the strip in the checker's run now strips the handler.
  for (const [open, close] of [['----', '----'], ['---x', '---'], ['---', '-----']]) {
    const deck = `${open}\nmarp: true\nnote: |\n  \`\`\`\n${close}\n\n# Hi\n\n<img src=x onerror="q()">\n`;
    assert.equal(withoutLiveAuthorHtml(deck).removed.handlers, 1, `${open} / ${close}`);
  }
});

