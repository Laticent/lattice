// `inlineFileUrls` bakes a local picture into the shared player file. The engine writes a plain
// slide's `![bg]` as `style="background-image:url(&quot;file://…&quot;)"` (and a custom property as
// `url(\&quot;file://…\&quot;)`), so the CSS pattern must read the entity and escaped quotes, not
// only raw ones — else the shared file points at a path on the author's disk (followups #2727).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { inlineFileUrls } = require('../../../lib/export/html-player.js');

const photo = pathToFileURL(path.join(__dirname, '../../../lib/samples/photo-wide.jpg')).href;
const forms = {
  'raw double quote (a <style> block)': `<style>.x{background-image:url("${photo}")}</style>`,
  'raw single quote': `<div style="background-image:url('${photo}')"></div>`,
  'no quote': `<div style="background-image:url(${photo})"></div>`,
  'entity quote (the engine section style)': `<div style="background-image:url(&quot;${photo}&quot;)"></div>`,
};

for (const [name, html] of Object.entries(forms)) {
  test(`inlines a file:// url written as: ${name}`, () => {
    const r = inlineFileUrls(html);
    assert.equal(r.count, 1);
    assert.deepEqual(r.missing, []);
    assert.match(r.html, /data:image\/jpeg;base64,/);
    assert.doesNotMatch(r.html, /file:\/\//);
  });
}

test('a file:// url that names no file is reported, and left as written', () => {
  const html = '<div style="background-image:url(&quot;file:///no/such/pic.jpg&quot;)"></div>';
  const r = inlineFileUrls(html);
  assert.equal(r.count, 0);
  assert.equal(r.missing.length, 1);
  assert.equal(r.html, html);
});

test("the engine's informational --background-image string is dropped, not inlined", () => {
  const html = `<section style="--background-image:&quot;url(\\&quot;${photo}\\&quot;)&quot;;background-image:url(&quot;${photo}&quot;);background-size:cover;"></section>`;
  const r = inlineFileUrls(html);
  assert.equal(r.count, 1, 'one picture inlined, from the real declaration');
  assert.doesNotMatch(r.html, /--background-image/);
  assert.doesNotMatch(r.html, /file:\/\//);
  assert.equal((r.html.match(/data:image\/jpeg/g) || []).length, 1, 'one copy, not two');
});

// The serializer writes `"` as `&quot;` in TEXT too, so a CSS sample an author SHOWS looks exactly like
// a style attribute to a pattern run over the whole document. Only CSS contexts are rewritten: the
// checker's repro baked a named file's bytes into the shared player in place of the author's code sample.
test('a url(file://…) shown in text, inline code or a code fence is left as written', () => {
  const shown = `url(&quot;${photo}&quot;)`;
  const html = `<p>Write <code>background-image:${shown}</code> like this.</p><pre><code class="language-css">.x{background-image:${shown}}\n.y{--background-image:&quot;url(\\&quot;${photo}\\&quot;)&quot;;color:red}</code></pre><p>${shown}</p>`;
  const r = inlineFileUrls(html);
  assert.equal(r.count, 0);
  assert.equal(r.html, html);
});

test('a <style> body is CSS and is inlined, but a <script> or <textarea> body is not', () => {
  const css = `.x{background-image:url(&quot;${photo}&quot;)}`;
  const r = inlineFileUrls(`<style>.x{background-image:url("${photo}")}</style><script>var s = 'url("${photo}")';</script><textarea>${css}</textarea>`);
  assert.equal(r.count, 1);
  assert.equal((r.html.match(/data:image\/jpeg/g) || []).length, 1, 'only the <style> body');
  assert.ok(r.html.includes(`<script>var s = 'url("${photo}")';</script>`), 'the <script> body is untouched');
});

test('the --background-image string is dropped even when the path holds a semicolon, and only in a style value', () => {
  const odd = pathToFileURL('/x/a;b.jpg').href;
  const attr = `<section style="--background-image:&quot;url(\\&quot;${odd}\\&quot;)&quot;;background-size:cover;"></section>`;
  assert.equal(inlineFileUrls(attr).html, '<section style="background-size:cover;"></section>');
  const shown = `<pre>--background-image:&quot;url(\\&quot;${odd}\\&quot;)&quot;;color:red</pre>`;
  assert.equal(inlineFileUrls(shown).html, shown, 'a code sample is not a declaration');
});

// Found by the second independent checker on the scanner itself.
test("a style='…' written inside ANOTHER attribute's value (an image's alt text) is not a style attribute", () => {
  const html = `<img alt="CSS sample style='background:url(${photo})'" src="data:image/png;base64,AAAA">`;
  const r = inlineFileUrls(html);
  assert.equal(r.count, 0);
  assert.equal(r.html, html);
});

test('a style attribute still reads when other attributes come first, are boolean, or are unquoted', () => {
  const r = inlineFileUrls(`<div hidden data-x=1 class="a" style="background-image:url(&quot;${photo}&quot;)"></div>`);
  assert.equal(r.count, 1);
  assert.match(r.html, /<div hidden data-x=1 class="a" style="background-image:url\(&quot;data:image\/jpeg/);
});

test('a </stylex inside a <style> body does not end it early', () => {
  const r = inlineFileUrls(`<style>.a{content:"</stylex"} .b{background:url(${photo})}</style>`);
  assert.equal(r.count, 1);
  assert.doesNotMatch(r.html, /file:\/\//);
});

test('a malformed --background-image string is left alone, never allowed to eat the next declarations', () => {
  const html = `<section style="--background-image:&quot;url(\\&quot;${photo};color:red;background:url(&quot;x&quot;);--x:&quot;\\&quot;)&quot;;"></section>`;
  assert.match(inlineFileUrls(html).html, /color:red/);
});

// Found by the fresh-eyes checker: the same "only read a real attribute" rule, for <img src> and for text a
// browser never parses as a tag.
test('<img>: only the src attribute is read, never data-src or a src typed inside another value', () => {
  for (const html of [
    `<img data-src="${photo}" alt="a">`,
    `<img alt="y src='${photo}'" src="pic.svg">`,
    `<img title='src="${photo}"' src="pic.svg">`,
  ]) {
    const r = inlineFileUrls(html);
    assert.equal(r.count, 0, html);
    assert.equal(r.html, html);
  }
  const real = inlineFileUrls(`<img class="x" src="${photo}" alt="a">`);
  assert.equal(real.count, 1);
  assert.match(real.html, /<img class="x" src="data:image\/jpeg;base64,/);
});

test('a style attribute inside an end tag, a bogus comment, or a non-markup body is never read', () => {
  const css = `style='background:url(${photo})'`;
  for (const html of [
    `</div x="<p ${css}>">`,
    `<?x <p ${css}>>`,
    `<!x <p ${css}>>`,
    `<!DOCTYPE <p ${css}>>`,
    `<![CDATA[ <p ${css}> ]]>`,
    `<xmp><p ${css}></p></xmp>`,
    `<noembed><p ${css}></p></noembed>`,
    `<iframe><p ${css}></p></iframe>`,
    `<noframes><p ${css}></p></noframes>`,
  ]) {
    const r = inlineFileUrls(html);
    assert.equal(r.count, 0, html);
    assert.equal(r.html, html);
  }
});

test('a hostile style value holding thousands of url(file:// starts does not stall the export', () => {
  const html = `<p style="${'url(file://'.repeat(20000)}"></p>`;
  const started = Date.now();
  inlineFileUrls(html);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});
