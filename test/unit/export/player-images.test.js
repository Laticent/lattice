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
  assert.equal(doc.getElementById('i').getAttribute('src'), WEB_IMAGE_PLACEHOLDER);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0], /its metadata cannot be removed; not embedded/);
});
