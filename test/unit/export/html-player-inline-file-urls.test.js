// The player's local-file inliner bakes a local picture into the shared file, in three places only: an `<img src>`,
// a `style` attribute and a `<style>` body. It works on the PARSED document (lib/export/html-player.js, `inlineDocAssets`),
// so the parser decides what an attribute and a text node are, and these cases pin what that gives: every spelling of a
// quote (the parser decodes them), nothing read from a position a browser ignores, and the engine's own background strings.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bake } = require('./bake-helper.js');

const photo = pathToFileURL(path.join(__dirname, '../../../lib/samples/photo-wide.jpg')).href;
const forms = {
  'raw double quote (a <style> block)': `<style>.x{background-image:url("${photo}")}</style>`,
  'raw single quote': `<div style="background-image:url('${photo}')"></div>`,
  'no quote': `<div style="background-image:url(${photo})"></div>`,
  'entity quote (the engine section style)': `<div style="background-image:url(&quot;${photo}&quot;)"></div>`,
  'decimal entity quote': `<div style="background-image:url(&#34;${photo}&#34;)"></div>`,
  'hex entity quote': `<div style="background-image:url(&#x22;${photo}&#x22;)"></div>`,
  'padded numeric entity single quote': `<div style="background-image:url(&#0039;${photo}&#0039;)"></div>`,
  'upper-case hex entity': `<div style="background-image:url(&#X27;${photo}&#X27;)"></div>`,
};

for (const [name, html] of Object.entries(forms)) {
  test(`inlines a file:// url written as: ${name}`, () => {
    const r = bake(html);
    assert.equal(r.count, 1);
    assert.deepEqual(r.missing, []);
    assert.match(r.html, /data:image\/jpeg;base64,/);
    assert.doesNotMatch(r.html, /file:\/\//);
  });
}

test('mismatched quote kinds do not close the address', () => {
  assert.equal(bake(`<div style="background:url(&quot;${photo}&#39;)"></div>`).count, 0);
});

test('a file:// url that names no file is reported, and left as written', () => {
  const r = bake('<div style="background-image:url(&quot;file:///no/such/pic.jpg&quot;)"></div>');
  assert.equal(r.count, 0);
  assert.equal(r.missing.length, 1);
  assert.match(r.html, /file:\/\/\/no\/such\/pic\.jpg/);
});

test("the engine's informational --background-image string is dropped, not inlined", () => {
  const r = bake(`<section style="--background-image:&quot;url(\\&quot;${photo}\\&quot;)&quot;;background-image:url(&quot;${photo}&quot;);background-size:cover;"></section>`);
  assert.equal(r.count, 1, 'one picture inlined, from the real declaration');
  assert.doesNotMatch(r.html, /--background-image/);
  assert.doesNotMatch(r.html, /file:\/\//);
  assert.equal((r.html.match(/data:image\/jpeg/g) || []).length, 1, 'one copy, not two');
  assert.match(r.html, /background-size:\s*cover/);
});

test('the --background-image string is dropped even when the path holds a semicolon, and only in a style value', () => {
  const odd = pathToFileURL('/x/a;b.jpg').href;
  const attr = bake(`<section style="--background-image:&quot;url(\\&quot;${odd}\\&quot;)&quot;;background-size:cover;"></section>`);
  assert.equal(attr.doc.querySelector('section').getAttribute('style'), 'background-size:cover;');
  const shown = `<pre>--background-image:"url(\\"${odd}\\")";color:red</pre>`;
  assert.equal(bake(shown).html, shown, 'a code sample is not a declaration');
});

test('a malformed --background-image string is left alone, never allowed to eat the next declarations', () => {
  const r = bake(`<section style="--background-image:&quot;url(\\&quot;${photo};color:red;background:url(&quot;x&quot;);--x:&quot;\\&quot;)&quot;;"></section>`);
  assert.match(r.html, /color:red/);
});

test('a url(file://…) shown in text, inline code or a code fence is left as written', () => {
  const shown = `url(&quot;${photo}&quot;)`;
  const html = `<p>Write <code>background-image:${shown}</code> like this.</p><pre><code class="language-css">.x{background-image:${shown}}</code></pre><p>${shown}</p>`;
  const r = bake(html);
  assert.equal(r.count, 0);
  assert.doesNotMatch(r.html, /data:image/);
});

test('a <style> body is CSS and is inlined, but a <script> or <textarea> body is not', () => {
  const css = `.x{background-image:url(&quot;${photo}&quot;)}`;
  const r = bake(`<style>.x{background-image:url("${photo}")}</style><script>var s = 'url("${photo}")';</script><textarea>${css}</textarea>`);
  assert.equal(r.count, 1);
  assert.equal((r.html.match(/data:image\/jpeg/g) || []).length, 1, 'only the <style> body');
  assert.ok(r.html.includes(`<script>var s = 'url("${photo}")';</script>`), 'the <script> body is untouched');
});

test('a <style> body in <svg>, <math> and after an unclosed <svg> is CSS too', () => {
  assert.equal(bake(`<svg><style>.a{background:url("${photo}")}</style></svg>`).count, 1);
  assert.equal(bake(`<math><style>.a{background:url("${photo}")}</style></math>`).count, 1);
  assert.equal(bake(`<svg width="10"><p>x</p></div><style>.a{background:url("${photo}")}</style>`).count, 1);
});

test('<template> content is a CSS context: a style attribute and an img inside it are baked', () => {
  assert.equal(bake(`<template><div style="background:url(&quot;${photo}&quot;)"></div></template>`).count, 1);
  assert.equal(bake(`<template><img src="${photo}"></template>`).count, 1);
});

test('a style attribute still reads when other attributes come first, are boolean, or are unquoted', () => {
  const r = bake(`<div hidden data-x=1 class="a" style="background-image:url(&quot;${photo}&quot;)"></div>`);
  assert.equal(r.count, 1);
  assert.match(r.html, /<div hidden="" data-x="1" class="a" style="background-image:url\(&quot;data:image\/jpeg/);
});

test("a style='…' written inside ANOTHER attribute's value (an image's alt text) is not a style attribute", () => {
  const r = bake(`<img alt="CSS sample style='background:url(${photo})'" src="data:image/png;base64,AAAA">`);
  assert.equal(r.count, 0);
});

test('<img>: only the src attribute is read, never data-src or a src typed inside another value', () => {
  for (const html of [`<img data-src="${photo}" alt="a">`, `<img alt="y src='${photo}'" src="pic.svg">`, `<img title='src="${photo}"' src="pic.svg">`]) {
    assert.equal(bake(html).count, 0, html);
  }
  const real = bake(`<img class="x" src="${photo}" alt="a">`);
  assert.equal(real.count, 1);
  assert.match(real.html, /<img class="x" src="data:image\/jpeg;base64,/);
});

test('on a duplicate attribute the first wins, as in a browser', () => {
  assert.equal(bake(`<img src="data:," src="${photo}">`).count, 0);
  assert.equal(bake(`<img src="${photo}" src="data:,">`).count, 1);
  assert.equal(bake(`<div style="color:red" style="background:url('${photo}')"></div>`).count, 0);
});

test('positions a browser ignores are not read', () => {
  const css = `style='background:url(${photo})'`;
  const cases = {
    'attribute named <src': `<img <src="${photo}">`,
    'attribute named =src': `<img =src="${photo}">`,
    'img inside a script nest': `<script><!--<script></script><img src="${photo}"></script>`,
    'img after <plaintext>': `<plaintext></plaintext><img src="${photo}">`,
    'img inside a comment': `<!-- <img src="${photo}"> -->`,
    'img inside a comment ended by --!>': `<!-- x <img src="${photo}"> --!>`,
    'img inside an unterminated comment': `<!-- x <img src="${photo}">`,
    'NUL in the tag name': `<img\u0000 src="${photo}">`,
    'style inside an end tag': `</div x="<p ${css}>">`,
    'style inside a bogus comment': `<?x <p ${css}>>`,
    'style inside a doctype': `<!DOCTYPE <p ${css}>>`,
    'style inside CDATA in HTML': `<![CDATA[ <p ${css}> ]]>`,
    'style inside <xmp>': `<xmp><p ${css}></p></xmp>`,
    'style inside <iframe>': `<iframe><p ${css}></p></iframe>`,
  };
  for (const [name, html] of Object.entries(cases)) assert.equal(bake(html).count, 0, name);
});

test('positions a browser reads are read: an img after --!>, after <a "x>, and after a closed script', () => {
  assert.equal(bake(`<!-- x --!><img src="${photo}">`).count, 1);
  assert.equal(bake(`<a "x><img src="${photo}">`).count, 1);
  assert.equal(bake(`<script>var a = 1;</script><img src="${photo}">`).count, 1);
  assert.equal(bake(`<!-->${'<img src="' + photo + '">'}`).count, 1);
});

test('a non-ASCII letter whose lowercase is longer (İ) does not shift the readers', () => {
  assert.equal(bake(`<p style="content:'İİİİ';background:url(${photo})"></p>`).count, 1);
  assert.equal(bake(`<h1>${'İ'.repeat(40)}</h1><style>h1{}</style><img src="${photo}">`).count, 1);
});

// `count` is the number of DISTINCT addresses baked, and these cases reuse one picture, so each assertion counts the baked
// copies (`data:` hits) and what stayed as a file address, which is what tells a skipped url from a baked one.
const dataHits = (html) => (html.match(/data:image\/jpeg/g) || []).length;
const fileHits = (html) => (html.match(/file:\/\//g) || []).length;

test('CSS the way a browser tokenizes it: a url( in a comment or a string is text, and a nested url( is one bad url', () => {
  const css = (v) => `<div style="${v}"></div>`;
  const cases = [
    ['comment', `/* background:url(${photo}) */color:red`, 0, 1],
    ['single-quoted string', `content:'url(${photo})';color:red`, 0, 1],
    ['double-quoted string', `content:&quot;url(${photo})&quot;;color:red`, 0, 1],
    ['string with an escaped quote', `content:'it\\'s url(${photo})'`, 0, 1],
    ['nest: one bad url, the inner address is not read', `background:url(${photo}/url(${photo}))`, 0, 2],
    ['real ones around a comment', `background:url(${photo}) /* c */, url(${photo})`, 2, 0],
    ['a real one beside a commented one', `background:url(${photo}) /* url(${photo}) */`, 1, 1],
    ['unterminated comment', `/* unterminated url(${photo})`, 0, 1],
    ['not the url function', `myurl(${photo})`, 0, 1],
    ['upper-case function', `BACKGROUND:URL(${photo})`, 1, 0],
  ];
  for (const [name, v, baked, left] of cases) {
    const r = bake(css(v));
    assert.equal(dataHits(r.html), baked, `${name}: baked copies`);
    assert.equal(fileHits(r.html), left, `${name}: file addresses left as written`);
  }
  const body = bake(`<style>/* url("${photo}") */ .a{background:url("${photo}")}</style>`);
  assert.equal(dataHits(body.html), 1, 'a <style> body: the rule is read');
  assert.equal(fileHits(body.html), 1, 'a <style> body: the commented one is not');
});

test('whitespace around a url() address is allowed, as in CSS', () => {
  for (const v of [`url( ${photo} )`, `url(\n${photo}\n)`, `url( "${photo}" )`, `url( '${photo}'\t)`, `url(${photo} )`]) {
    const r = bake(`<div style="background:${v.replaceAll('"', '&quot;')}"></div>`);
    assert.equal(dataHits(r.html), 1, v);
    assert.equal(fileHits(r.html), 0, v);
  }
  assert.equal(dataHits(bake(`<div style="background:url(a ${photo})"></div>`).html), 0, 'inner whitespace makes a bad url');
  const empty = bake(`<div style="background:url(''), url(${photo})"></div>`);
  assert.equal(dataHits(empty.html), 1, 'an empty string is not an address, and the real one beside it is baked');
});

test('a newline ends an unclosed CSS string, so a url on the next line is real (a browser loads it)', () => {
  const r = bake(`<div style='content:"oops\n;background:url(${photo})'></div>`);
  assert.equal(dataHits(r.html), 1);
  assert.equal(fileHits(r.html), 0);
  // an escaped newline continues the string, so the url inside it stays text
  const cont = bake(`<div style='content:"a\\\nurl(${photo})"'></div>`);
  assert.equal(dataHits(cont.html), 0);
});

test('CSS escapes in an address are read: a browser loads these files, so they are baked', () => {
  const lead = photo.slice(0, photo.lastIndexOf('/') + 1);
  const cases = {
    'escaped dot': `url(${lead}photo-wide\\.jpg)`,
    'hex escape': `url("${lead}photo-wide\\2e jpg")`,
    'hex escape, six digits, no space': `url(${lead}photo-wide\\00002ejpg)`,
    'escaped letter in a quoted url': `url('${lead}photo\\-wide.jpg')`,
  };
  for (const [name, v] of Object.entries(cases)) {
    const r = bake(`<div style="background:${v.replaceAll('"', '&quot;')}"></div>`);
    assert.equal(dataHits(r.html), 1, name);
    assert.equal(fileHits(r.html), 0, name);
  }
  assert.equal(dataHits(bake(`<div style="background:url(a\\) url(${photo})"></div>`).html), 0, 'an escaped paren does not end the url');
});

test('a no-break space is not CSS whitespace, so it stays inside an unquoted address', () => {
  assert.equal(dataHits(bake(`<div style="background:url(${photo}\u00a0)"></div>`).html), 0);
});

test('an SVG <style> split by a child element is one stylesheet, as in a browser', () => {
  const split = bake(`<svg><style>#d{background-image:url(${photo.slice(0, 30)}<g></g>${photo.slice(30)})}</style></svg>`);
  assert.equal(dataHits(split.html), 1);
  assert.equal(fileHits(split.html), 0);
  assert.ok(split.doc.querySelector('style > g'), 'the child element survives');
  const commented = bake(`<svg><style>/* <g></g> #d{background:url(${photo})} */</style></svg>`);
  assert.equal(dataHits(commented.html), 0, 'a comment spanning the child hides the url');
});

test('a CRLF after a backslash is one newline, so the string continues and the url after it is real', () => {
  const r = bake(`<div style="content:'a\\&#13;&#10;b'; background-image:url(${photo})"></div>`);
  assert.equal(dataHits(r.html), 1);
});

test('an unclosed quoted url( does not rescan leading whitespace (it was quadratic)', () => {
  const body = ' '.repeat(500000) + 'url("\n'.repeat(40000);
  const t0 = Date.now();
  bake(`<style>${body}</style>`);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test('an SVG <style> with element children keeps them (each text node is baked on its own)', () => {
  const r = bake(`<svg><style>a{background:url("${photo}")}<g id="k">c</g>b{color:red}</style></svg>`);
  assert.equal(dataHits(r.html), 1);
  assert.ok(r.doc.querySelector('style > g#k'), 'the child element survives');
  assert.match(r.html, /b\{color:red\}/);
});

test('text between elements is untouched when nothing is baked', () => {
  const doc = '<p a="1" b="2">x &amp; y</p><!-- c --><br><i>z</i> <b>w</b>';
  assert.equal(bake(doc).html, doc);
});

// A hostile deck must not stall the export. The parse is jsdom's, which the assembler pays anyway; the readers add
// a pass over the attribute and style text. Each of these took seconds to minutes with the regex tokenizer.
const HOSTILE = {
  'unclosed double quotes': '<a "'.repeat(250000),
  'unclosed single-quoted values': "<a x='".repeat(150000),
  'repeated url(file:// in a <style> body': `<style>${'url(file://'.repeat(95000)}</style>`,
  'repeated url(file:// in a style attribute': `<div style="${'url(file://'.repeat(95000)}"></div>`,
  'repeated unclosed url( in a style attribute': `<div style="${'url(a'.repeat(190000)}"></div>`,
  'repeated <!--': '<!--'.repeat(250000),
  'repeated script escapes': '<script><!--<script>'.repeat(60000),
  'repeated unclosed quoted url( after whitespace': `<style>${' '.repeat(500000)}${'url("\n'.repeat(40000)}</style>`,
  'repeated escapes': `<div style="${'url(a\\\\'.repeat(120000)}"></div>`,
  'repeated --background-image strings': `<div style='${'--background-image:"url(\\"file://'.repeat(30000)}'></div>`,
};
for (const [name, html] of Object.entries(HOSTILE)) {
  test(`1 MB hostile deck under 3 s, parse included: ${name}`, () => {
    const t0 = Date.now();
    bake(html, { baseUrl: 'file:///tmp/deck/' });
    assert.ok(Date.now() - t0 < 3000, `${name} took ${Date.now() - t0} ms`);
  });
}
