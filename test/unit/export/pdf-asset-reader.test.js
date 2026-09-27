// The CLI's file reader for the shared PDF writer is callable by a deck's own scripts, so it
// is a trust boundary. These pin each wall a red-team pass found missing (2026-09-27).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createAssetReader, assetKind } = require('../../../lib/export/pdf-asset-reader.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGNgYPiPhEAcTAEAAHEgD/GQJqEAAAAASUVORK5CYII=', 'base64');

function sandbox() {
	const top = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-assets-'));
	const deck = path.join(top, 'deck');
	const outside = path.join(top, 'outside');
	fs.mkdirSync(deck); fs.mkdirSync(outside);
	fs.writeFileSync(path.join(deck, 'logo.png'), PNG);
	fs.writeFileSync(path.join(outside, 'private.png'), PNG);
	fs.writeFileSync(path.join(deck, 'notes.txt'), 'secret notes');
	fs.writeFileSync(path.join(deck, 'fonts.css'), 'body{color:red} @font-face { font-family: X; src: url(x.woff2); } .secret{content:"hunter2"}');
	return { top, deck, outside, url: (p) => pathToFileURL(p).href };
}

test('reads an image inside the deck folder', () => {
	const s = sandbox();
	const r = createAssetReader([s.deck]);
	assert.equal(Buffer.from(r.asset(s.url(path.join(s.deck, 'logo.png'))), 'base64').length, PNG.length);
});

test('refuses http(s): no request is made on a deck\'s say-so', () => {
	const r = createAssetReader([os.tmpdir()]);
	assert.throws(() => r.asset('http://127.0.0.1:1/ssrf'), /local files only/);
	assert.throws(() => r.asset('https://169.254.169.254/latest/meta-data'), /local files only/);
});

test('refuses a file outside the allowed folders, by .. and by symlink', () => {
	const s = sandbox();
	const r = createAssetReader([s.deck]);
	assert.throws(() => r.asset(s.url(path.join(s.outside, 'private.png'))), /outside/);
	assert.throws(() => r.asset(`${s.url(s.deck)}/../outside/private.png`), /outside/);
	fs.symlinkSync(path.join(s.outside, 'private.png'), path.join(s.deck, 'link.png'));
	assert.throws(() => r.asset(s.url(path.join(s.deck, 'link.png'))), /outside/);
});

test('refuses bytes that are not an image or a font, and anything that is not a regular file', () => {
	const s = sandbox();
	const r = createAssetReader([s.deck]);
	assert.throws(() => r.asset(s.url(path.join(s.deck, 'notes.txt'))), /not an image or a font/);
	assert.throws(() => r.asset(s.url(s.deck)), /regular file/);
	const big = createAssetReader([s.deck], { maxBytes: 10 });
	assert.throws(() => big.asset(s.url(path.join(s.deck, 'logo.png'))), /size cap/);
});

test('a stylesheet gives back its @font-face blocks and nothing else', () => {
	const s = sandbox();
	const r = createAssetReader([s.deck]);
	const out = r.fontFaceRules(s.url(path.join(s.deck, 'fonts.css')));
	assert.match(out, /@font-face/);
	assert.doesNotMatch(out, /hunter2|color:red/);
	assert.throws(() => r.fontFaceRules(s.url(path.join(s.deck, 'notes.txt'))), /not a stylesheet/);
});

test('assetKind: magic numbers, not extensions', () => {
	assert.equal(assetKind(PNG), 'png');
	assert.equal(assetKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), 'jpeg');
	assert.equal(assetKind(Buffer.from('wOF2xxxx')), 'font');
	assert.equal(assetKind(Buffer.from('#!/bin/sh')), '');
});
