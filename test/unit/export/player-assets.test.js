/**
 * Unit: `hoistRepeatedAssets` stores each repeated inlined picture once
 * (lib/export/player-assets.mjs; engineering/decisions/2026-10-16-player-as-library-audit.md §3).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', '..', 'lib', 'export', 'player-assets.mjs');
const load = () => import(MOD);

const b64 = (seed, n = 3000) => Buffer.alloc(n, seed).toString('base64');
const JPEG = `data:image/jpeg;base64,${b64('a')}`;
const PNG = `data:image/png;base64,${b64('b')}`;
const FONT = `data:font/woff2;base64,${b64('c')}`;
const doc = (head, body) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe('hoistRepeatedAssets', () => {
	test('a picture used on several slides is stored once and referenced by var()', async () => {
		const { hoistRepeatedAssets } = await load();
		const slide = `<div style="background-image:url('${JPEG}')"></div>`;
		const { html, hoisted, saved } = hoistRepeatedAssets(doc('', slide.repeat(4)));
		assert.equal(hoisted, 1);
		assert.equal(html.split(JPEG).length - 1, 1, 'exactly one copy of the bytes remains');
		assert.equal(html.split('style="background-image:var(--lp-asset-0)"').length - 1, 4);
		assert.match(html, /<style id="lp-assets">:root\{--lp-asset-0:url\(data:image\/jpeg;base64,/);
		assert.ok(saved > 3 * JPEG.length - 200, `saved ${saved}`);
	});

	test('names follow first occurrence, so the output is deterministic', async () => {
		const { hoistRepeatedAssets } = await load();
		const body = `<i style="background:url(${PNG})"></i><i style="background:url(${JPEG})"></i>`.repeat(2);
		const a = hoistRepeatedAssets(doc('', body)).html;
		assert.equal(a, hoistRepeatedAssets(doc('', body)).html);
		assert.ok(a.indexOf(`--lp-asset-0:url(${PNG})`) !== -1, 'the first-seen asset is number 0');
	});

	test('repeats inside stylesheets are hoisted too, with any quoting', async () => {
		const { hoistRepeatedAssets } = await load();
		const css = `<style>.a{background:url("${PNG}")}.b{mask:url( ${PNG} )}</style>`;
		const { html, hoisted } = hoistRepeatedAssets(doc(css, ''));
		assert.equal(hoisted, 1);
		assert.match(html, /\.a\{background:var\(--lp-asset-0\)\}\.b\{mask:var\(--lp-asset-0\)\}/);
	});

	test('fonts are never hoisted: var() is invalid in @font-face', async () => {
		const { hoistRepeatedAssets } = await load();
		const face = (w) => `@font-face{font-family:X;font-weight:${w};src:url(${FONT}) format('woff2')}`;
		const octet = FONT.replace('font/woff2', 'application/octet-stream');
		const faceOctet = (w) => `@font-face{font-family:Y;font-weight:${w};src:url(${octet})}`;
		const input = doc(`<style>${face(400)}${face(700)}${faceOctet(400)}${faceOctet(700)}</style>`, '');
		assert.deepEqual(hoistRepeatedAssets(input), { html: input, hoisted: 0, saved: 0 });
	});

	test('a single use, a small URI, <img src> and script bodies are left alone', async () => {
		const { hoistRepeatedAssets } = await load();
		const small = 'data:image/png;base64,iVBORw0KGgo=';
		const input = doc(
			`<style>.a{background:url(${JPEG})}.s{background:url(${small})}.t{background:url(${small})}</style>`,
			`<img src="${PNG}"><img src="${PNG}"><script>var u="url(${PNG})",v="url(${PNG})"</script>`,
		);
		assert.deepEqual(hoistRepeatedAssets(input), { html: input, hoisted: 0, saved: 0 });
	});

	test('a use inside a script does not count toward, or get rewritten by, a hoist', async () => {
		const { hoistRepeatedAssets } = await load();
		const input = doc('', `<p style="background:url(${PNG})"></p><p style="background:url(${PNG})"></p><script>x="url(${PNG})"</script>`);
		const { html } = hoistRepeatedAssets(input);
		assert.match(html, new RegExp(`<script>x="url\\(${PNG.replace(/[+/]/g, '\\$&')}\\)"</script>`));
	});

	test('a document without </head> is returned unchanged', async () => {
		const { hoistRepeatedAssets } = await load();
		const input = `<div style="background:url(${PNG})"></div>`.repeat(2);
		assert.equal(hoistRepeatedAssets(input).html, input);
	});
});
