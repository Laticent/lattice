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
