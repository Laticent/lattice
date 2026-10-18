// The player inliner reads tags as a browser does, in one forward pass (lib/export/html-player.js, `mapPlayerContexts`).
// Each case below came from a checker pass on PR #2748 (followups.d/2748-p3-player-inliner-entity-spellings-and-template.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { inlineFileUrls, resolveStyleUrls } = require('../../../lib/export/html-player.js');

const photo = pathToFileURL(path.join(__dirname, '../../../lib/samples/photo-wide.jpg')).href;
const SAMPLES = pathToFileURL(path.join(__dirname, '../../../lib/samples') + path.sep).href;
const baked = (html) => inlineFileUrls(html).count;

for (const [name, q] of [['&#34;', '&#34;'], ['&#x22;', '&#x22;'], ['&#x0022;', '&#x0022;'], ['&#039;', '&#039;'], ['&#39;', '&#39;'], ['&#X27;', '&#X27;']]) {
  test(`a style attribute whose url() quote is written ${name} is inlined`, () => {
    const r = inlineFileUrls(`<div style="background:url(${q}${photo}${q})"></div>`);
    assert.equal(r.count, 1);
    assert.doesNotMatch(r.html, /file:\/\//);
  });
}

test('mixed quote spellings around one address still inline (a browser decodes both to a quote)', () => {
  assert.equal(baked(`<div style="background:url(&#34;${photo}&quot;)"></div>`), 1);
});

test('<template> content is a CSS context: a style attribute inside it is baked (a script clones it into the page)', () => {
  assert.equal(baked(`<template><div style="background:url(&quot;${photo}&quot;)"></div></template>`), 1);
});

test('positions a browser ignores are not read', () => {
  const cases = {
    'attribute named <src': `<img <src="${photo}">`,
    'attribute named =src': `<img =src="${photo}">`,
    'img inside a script nest': `<script><!--<script><img src="${photo}"></script>`,
    'img after <plaintext>': `<plaintext><img src="${photo}">`,
    'img inside a comment': `<!-- <img src="${photo}"> -->`,
    'img inside a bogus comment': `<?x <img src="${photo}">`,
    'a src typed inside alt text': `<img alt="x src='${photo}'">`,
    'NUL in the tag name': `<img\u0000 src="${photo}">`,
  };
  for (const [name, html] of Object.entries(cases)) {
    assert.equal(baked(html), 0, name);
  }
});

test('a quote inside an attribute name does not hide the next tag', () => {
  // `<a "x>` is a tag (attribute named `"x`), so the `<img>` after it is real and is read.
  assert.equal(baked(`<a "x><img src="${photo}">`), 1);
});

test('on a duplicate attribute the first wins, as in a browser', () => {
  assert.equal(baked(`<img src="data:," src="${photo}">`), 0);
  assert.equal(baked(`<img src="${photo}" src="data:,">`), 1);
  assert.equal(baked(`<div style="color:red" style="background:url('${photo}')"></div>`), 0);
});

test('a <style> body is CSS in a page and in <svg>/<math>, and an unclosed <svg> does not switch it off later', () => {
  assert.equal(baked(`<style>.a{background:url("${photo}")}</style>`), 1);
  assert.equal(baked(`<svg><style>.a{background:url("${photo}")}</style></svg>`), 1);
  assert.equal(baked(`<math><style>.a{background:url("${photo}")}</style></math>`), 1);
  assert.equal(baked(`<svg width="10"><p>x</p></div><style scoped>.a{background:url("${photo}")}</style>`), 1);
});

test('a non-ASCII letter whose lowercase is longer (İ) does not shift the readers', () => {
  assert.equal(baked(`<p style="content:'İİİİ';background:url(${photo})"></p>`), 1);
  assert.equal(baked(`<h1>${'İ'.repeat(40)}</h1><style>h1{}</style><img src="${photo}">`), 1);
  const r = resolveStyleUrls(`<p style="content:'İİ';background:url(photo-wide.jpg)"></p>`, SAMPLES, []);
  assert.match(r, /url\(file:\/\/\/.*photo-wide\.jpg\)/);
});

test('<plaintext> never ends and a script keeps its double-escape state', () => {
  assert.equal(baked(`<plaintext></plaintext><img src="${photo}">`), 0);
  assert.equal(baked(`<script><!--<script></script><img src="${photo}"></script>`), 0);
  assert.equal(baked(`<script><!--<script></script>--></script><img src="${photo}">`), 1);
  assert.equal(baked(`<script>var a = 1;</script><img src="${photo}">`), 1);
});

test('a closing quote of the other kind does not close the address; an upper-case entity quote is decoded', () => {
  assert.equal(baked(`<div style="background:url(&quot;${photo}&#39;)"></div>`), 0);
  const r = resolveStyleUrls('<p style="background:url(&QUOT;photo-wide.jpg&QUOT;)"></p>', SAMPLES, []);
  assert.match(r, /url\(&QUOT;file:\/\/\/.*photo-wide\.jpg&QUOT;\)/);
});

test('text between tags is byte-identical when nothing is baked', () => {
  const doc = '<p a=1 b="2">x &amp; y</p><!-- c --><br/><i>z</i> <b>w</b>';
  assert.equal(inlineFileUrls(doc).html, doc);
});

test('an unterminated tag drops the rest of the document, as a browser does', () => {
  assert.equal(baked(`<img src="${photo}"><div title="oops <img src="${photo}">`), 1);
});

// A hostile deck must not stall the export. Each of these took seconds to minutes with the regex tokenizer.
const HOSTILE = {
  'unclosed double quotes': '<a "'.repeat(250000),
  'unclosed single-quoted values': "<a x='".repeat(150000),
  'repeated url(file:// in a <style> body': `<style>${'url(file://'.repeat(95000)}</style>`,
  'repeated url(file:// in a style attribute': `<div style="${'url(file://'.repeat(95000)}"></div>`,
  'repeated unclosed url( in a style attribute': `<div style="${'url(a'.repeat(190000)}"></div>`,
  'repeated <!--': '<!--'.repeat(250000),
  'deeply repeated <svg>': '<svg>'.repeat(200000),
};
for (const [name, html] of Object.entries(HOSTILE)) {
  test(`1 MB hostile deck under 3 s: ${name}`, () => {
    const t0 = Date.now();
    inlineFileUrls(html);
    resolveStyleUrls(html, 'file:///tmp/deck/');
    assert.ok(Date.now() - t0 < 3000, `${name} took ${Date.now() - t0} ms`);
  });
}
