// The `urlArg` fact `makeCssRefSpans(…, { urlArg: true })` adds to each span (lib/core/css-ref-reader.js): a string that
// is the address of a `url(` which does not close right after it. Chromium 153 fetches each of these (red team of
// #3024; test/integration/export/inliner-browser-oracle.test.js), and the two exports embed the string
// (lib/export/html-player.js, lib/export/inline-url-media.mjs). Callers that do not ask get the spans without the field.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { makeCssRefSpans } = require('../../../lib/core/css-ref-reader.js');
const { isClosedString } = require('../../../lib/export/css-closed-string.js');
const parser = require('../../../lib/core/css-ref.generated.js');
const helpers = require('../../../lib/core/css-token-readers.js');

const withFact = makeCssRefSpans(parser, helpers, { urlArg: true });
const read = (css) => withFact(css).map((sp) => [sp.kind, sp.value, sp.urlArg === true]);

test('a url( string with a modifier, a comment or the end of the text after it', () => {
  for (const css of ['a{b:url("x" crossorigin(anonymous))}', "a{b:url('x' referrerpolicy(no-referrer))}", 'a{b:url("x" /*c*/)}', 'a{b:url( "x" foo)}', 'a{b:url("x', 'a{b:u\\72l("x" integrity("sha"))}']) {
    assert.deepEqual(read(css)[0], ['string', 'x', true], css);
  }
});

test('not urlArg: a url() that closes, a plain string, an image-set string, a modifier\'s own string', () => {
  assert.deepEqual(read('a{b:url("x")}'), [['url', 'x', false]]);
  assert.deepEqual(read('a{b:url( "x" )}'), [['url', 'x', false]]);
  assert.deepEqual(read('a{content:"x"}'), [['string', 'x', false]]);
  assert.deepEqual(read('a{b:image-set("x" 1x)}'), [['string', 'x', false]]);
  assert.deepEqual(read('a{b:url("x" integrity("y"))}'), [['string', 'x', true], ['string', 'y', false]]);
});

test('without the option the spans carry no urlArg field', () => {
  const plain = makeCssRefSpans(parser, helpers);
  assert.equal('urlArg' in plain('a{b:url("x" foo)}')[0], false);
});

test('isClosedString: a quote, an escaped quote, a bad string, the end of the text', () => {
  assert.equal(isClosedString('"a"', false), true);
  assert.equal(isClosedString('"a\\"', false), false);
  assert.equal(isClosedString('"a\\\\"', false), true);
  assert.equal(isClosedString('"a', false), false);
  assert.equal(isClosedString('"a', true), true);
});

test('the CLI export embeds the picture in all three shapes, and keeps what follows valid', () => {
  const { inlineDocAssets } = require('../../../lib/export/html-player.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'url-arg-'));
  try {
    fs.writeFileSync(path.join(dir, 'p.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const href = pathToFileURL(path.join(dir, 'p.png')).href;
    for (const [style, tail] of [
      [`background-image:url("${href}" crossorigin(anonymous))`, '" crossorigin(anonymous))'],
      [`background-image:url("${href}" /*c*/)`, '" /*c*/)'],
      // The end of the text closes it: the end of the attribute, and a sheet that ends there.
      [`background-image:url("${href}`, '"'],
    ]) {
      const { JSDOM } = require('jsdom');
      const doc = new JSDOM(`<!doctype html><html><body><div style='${style}'></div><style>.z{${style}${tail === '"' ? '' : '}'}</style></body></html>`).window.document;
      const { count } = inlineDocAssets(doc);
      assert.equal(count, 1, `${style}: the picture was not read`);
      const text = doc.documentElement.outerHTML;
      assert.doesNotMatch(text, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${style}: the local path shipped`);
      assert.ok(text.split('data:image/png').length - 1 >= 2, `${style}: not embedded in both channels`);
      assert.ok(text.includes(`url("data:image/png`) && text.includes(tail.slice(1)), `${style}: the url( lost its tail`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a refused file\'s stand-in stays a valid address in a \'-quoted, a "-quoted and a bare url() (red team, 2026-11-04)', () => {
  const { inlineDocAssets } = require('../../../lib/export/html-player.js');
  const { JSDOM } = require('jsdom');
  for (const [open, close] of [["url('", "')"], ["url('", "' crossorigin(anonymous))"], ['url("', '")'], ['url(', ')']]) {
    const doc = new JSDOM('<!doctype html><div></div>').window.document;
    doc.querySelector('div').setAttribute('style', `background-image:${open}file:///nowhere/outside.png${close};color:red`);
    inlineDocAssets(doc, { confine: { allows: () => false } });
    const style = doc.querySelector('div').getAttribute('style');
    assert.doesNotMatch(style, /nowhere/, `${open}: the refused path shipped`);
    // The stand-in sits in one `"` string, or in the `'` string it fits in, and the declaration after it survives.
    const m = /url\((["']?)(data:[\s\S]*?)\1(\)| crossorigin)/.exec(style);
    assert.ok(m, `${open}: no stand-in url in ${style}`);
    assert.ok(!m[1] || !m[2].replace(/\\./g, '').includes(m[1]), `${open}: the stand-in breaks its own quotes: ${style}`);
    assert.match(style, /;color:red$/, `${open}: the neighbor declaration was lost`);
  }
});
