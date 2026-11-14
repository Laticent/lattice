/**
 * The player's metadata pass (lib/export/player-images.mjs `cleanDocImages`): every picture baked into a player loses
 * its metadata through `@laticent/lastra` `cleanerFor`, in every place a player keeps one, once per distinct picture;
 * an already-clean picture keeps its exact bytes; one the cleaner cannot read becomes the drawn stand-in and is named.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { cleanJpeg } = require('@laticent/lastra');
const { WEB_IMAGE_PLACEHOLDER } = require('../../../lib/core/media-sources');

const load = () => import('../../../lib/export/player-images.mjs');
const JPEG = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'lattice-input', 'upright-secret.jpg'));
const DIRTY = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
const CLEAN = `data:image/jpeg;base64,${Buffer.from(cleanJpeg(new Uint8Array(JPEG))).toString('base64')}`;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';
const FRAGMENT = 'data:image/gif;base64,R0lGOD';

test('every place a player keeps a picture is cleaned, once per distinct picture', async () => {
  const { cleanDocImages } = await load();
  const dom = new JSDOM(`<!doctype html><style>.a{background:url("${DIRTY}")}</style>
    <img id="i" src="${DIRTY}"><img id="s" srcset="${DIRTY} 1x, ${GIF} 2x"><div id="d" style="background-image:url('${DIRTY}')"></div>
    <svg><image id="v" href="${DIRTY}"/></svg><video id="p" poster="${DIRTY}"></video>`);
  const doc = dom.window.document;
  const r = cleanDocImages(doc);
  assert.equal(r.cleaned, 1, 'one distinct picture, cleaned once');
  assert.deepEqual(r.refused, []);
  assert.equal(doc.getElementById('i').getAttribute('src'), CLEAN);
  assert.equal(doc.getElementById('s').getAttribute('srcset'), `${CLEAN} 1x, ${GIF} 2x`, 'an already-clean picture keeps its bytes');
  assert.ok(doc.getElementById('d').getAttribute('style').includes(CLEAN));
  assert.equal(doc.getElementById('v').getAttribute('href'), CLEAN);
  assert.equal(doc.getElementById('p').getAttribute('poster'), CLEAN);
  assert.ok(doc.querySelector('style').textContent.includes(CLEAN));
  assert.ok(!doc.documentElement.outerHTML.includes(JPEG.toString('base64')), 'the original bytes are gone');
});

test('a picture the cleaner cannot read becomes the drawn stand-in, and is named', async () => {
  const { cleanDocImages } = await load();
  const doc = new JSDOM(`<!doctype html><img id="i" src="${FRAGMENT}">`).window.document;
  const r = cleanDocImages(doc);
  const src = doc.getElementById('i').getAttribute('src');
  // The stand-in is the drawn placeholder, percent-encoded so it can be pasted into any container: the same picture.
  assert.equal(decodeURIComponent(src), decodeURIComponent(WEB_IMAGE_PLACEHOLDER));
  assert.doesNotMatch(src, /['" ]/);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /; not embedded$/);
});

/** The bytes a `data:` URI carries, read the way the cleaner reads them (base64, or percent-encoded). */
const bytesOf = (uri) => {
  const comma = uri.indexOf(',');
  const body = uri.slice(comma + 1);
  return /;base64/i.test(uri.slice(0, comma)) ? Buffer.from(decodeURIComponent(body).replace(/\s+/g, ''), 'base64') : Buffer.from(unescape(body), 'latin1');
};
const B64 = JPEG.toString('base64');
const CLEAN_BYTES = bytesOf(CLEAN);

test('every form of data:image address a browser draws is cleaned, decided by the bytes, never the MIME', async () => {
  const { cleanDocImages } = await load();
  const forms = {
    jpg: `data:image/jpg;base64,${B64}`,
    params: `data:image/jpeg;name=x.jpg;base64,${B64}`,
    upper: `DATA:IMAGE/JPEG;BASE64,${B64}`,
    wrapped: `data:image/jpeg;base64,${B64.replace(/(.{76})/g, '$1\n')}`,
    percent: `data:image/jpeg,${[...JPEG].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('')}`,
    mislabelled: `data:image/png;base64,${B64}`,
  };
  const doc = new JSDOM('<!doctype html>').window.document;
  for (const [id, uri] of Object.entries(forms)) {
    const img = doc.createElement('img');
    img.id = id;
    img.setAttribute('src', uri);
    doc.body.append(img);
  }
  const r = cleanDocImages(doc);
  assert.deepEqual(r.refused, []);
  for (const id of Object.keys(forms)) {
    const src = doc.getElementById(id).getAttribute('src');
    assert.ok(bytesOf(src).equals(CLEAN_BYTES), `${id}: the cleaned JPEG (got ${src.slice(0, 40)})`);
  }
});

/** An SVG carrying the dirty JPEG, as an author's file holds it. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><!-- kept --><image href="${DIRTY}" width="4" height="4"/></svg>`;

test('a raster inside an SVG is cleaned, and the SVG is otherwise byte-identical', async () => {
  const { cleanSvgText, cleanDocImages } = await load();
  const r = cleanSvgText(SVG);
  assert.equal(r.text, SVG.replace(DIRTY, CLEAN));
  assert.equal(r.cleaned, 1);
  // The player bakes an SVG as a percent-encoded data: URI; the pass reads it and cleans the picture inside it.
  const doc = new JSDOM(`<!doctype html><img id="i" src="data:image/svg+xml,${encodeURIComponent(SVG)}">`).window.document;
  cleanDocImages(doc);
  const inner = bytesOf(doc.getElementById('i').getAttribute('src')).toString('utf8');
  assert.equal(inner, SVG.replace(DIRTY, CLEAN));
  assert.ok(!inner.includes(B64));
});

/** Whether a text parses as XML, read by the XML parser a browser draws an SVG with. */
const { DOMParser } = new JSDOM('').window;
const parsesAsXml = (text) => !new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror');

test('an address an SVG spells with XML character references is cleaned: the XML parser decodes them before it draws', async () => {
  const { cleanSvgText } = await load();
  for (const spelled of [DIRTY.replace('data:', 'data&#58;'), DIRTY.replace('data:', '&#100;ata:'), DIRTY.replace('data:', '&#x64;&#X61;ta&#x3A;')]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="${spelled}"/></svg>`;
    const r = cleanSvgText(svg);
    assert.equal(r.cleaned, 1, spelled.slice(0, 30));
    assert.ok(!r.text.includes(B64), `${spelled.slice(0, 30)}: the original bytes are gone`);
    assert.ok(r.text.includes(CLEAN));
    assert.ok(parsesAsXml(r.text));
  }
  // A reference that spells markup (`&#60;` is `<`) is never decoded: the SVG keeps its structure.
  const markup = `<svg xmlns="http://www.w3.org/2000/svg"><text>a &#60;b&#62; &#58;</text></svg>`;
  assert.equal(cleanSvgText(markup).text, markup, 'nothing to clean: the exact bytes, references and all');
});

test('an address CSS spells with an escape is cleaned, in a style attribute, a <style> element and inside an SVG', async () => {
  const { cleanSvgText, cleanDocImages } = await load();
  const escaped = [DIRTY.replace('data:', 'data\\3a '), DIRTY.replace('data:', 'data\\:'), DIRTY.replace('data:', '\\64 ata:')];
  for (const e of escaped) {
    const doc = new JSDOM(`<!doctype html><style>.a{background:u\\72l('${e}')}</style><div id="d" style="background-image:url('${e}')"></div><div id="s" style="background-image:image-set('${e}' 1x)"></div>`).window.document;
    const r = cleanDocImages(doc);
    assert.equal(r.cleaned, 1, e.slice(0, 20));
    assert.ok(!doc.documentElement.outerHTML.includes(B64), `${e.slice(0, 20)}: the original bytes are gone`);
    assert.ok(doc.getElementById('d').getAttribute('style').includes(`url(${CLEAN})`));
    assert.ok(doc.getElementById('s').getAttribute('style').includes(`'${CLEAN}'`), 'a string keeps its own quote');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url('${e}')}</style><rect style='background:url("${e}")'/></svg>`;
    const s = cleanSvgText(svg);
    assert.ok(!s.text.includes(B64), `${e.slice(0, 20)} in an SVG: the original bytes are gone`);
    assert.ok(parsesAsXml(s.text));
  }
  // A stylesheet with escapes and no picture keeps its exact text.
  const doc = new JSDOM(`<!doctype html><style>.q::before{content:"\\201C"} [data-x] .a\\:b{color:red}</style>`).window.document;
  const before = doc.querySelector('style').textContent;
  cleanDocImages(doc);
  assert.equal(doc.querySelector('style').textContent, before);
});

test('the stand-in keeps a single-quoted SVG attribute and CSS rule whole', async () => {
  const { cleanSvgText, cleanDocImages } = await load();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg'><image href='${FRAGMENT}' width='4'/><rect style='fill:url(${FRAGMENT})'/></svg>`;
  const r = cleanSvgText(svg);
  assert.equal(r.refused.length, 1);
  assert.ok(parsesAsXml(r.text), 'the SVG still parses, so it still draws');
  const doc = new JSDOM(`<!doctype html><div id="d" style="background:url('${FRAGMENT}');color:red"></div>`).window.document;
  cleanDocImages(doc);
  const el = doc.getElementById('d');
  assert.equal(el.style.color, 'red', 'the declaration after the stand-in still reads');
  assert.match(el.style.backgroundImage, /^url\(/);
});
