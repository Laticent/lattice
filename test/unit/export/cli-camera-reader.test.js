// The CLI slide camera's read hook (lib/export/cli-camera.js `createCameraReader`): the PNG, raster-PDF and
// office paths ask it for every picture AND every font a slide's CSS names. Before #3095 it answered fonts with
// the player's picture-only reader, so a deck's own `@font-face` in `style:` drew in a fallback face in a PNG
// while its HTML loaded the font, and the warning called the font "a picture". These pin both halves: a confined
// local font loads, and a refused one is named as a font.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createCameraReader, fontFileToDataUri } = require('../../../lib/export/cli-camera.js');
const { createFileConfiner } = require('../../../lib/core/file-confine.js');

const REPO = path.resolve(__dirname, '../../..');
const WOFF2 = fs.readFileSync(path.join(REPO, 'assets/fonts/caveat-700.woff2'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGNgYPiPhEAcTAEAAHEgD/GQJqEAAAAASUVORK5CYII=', 'base64');

function sandbox() {
	const top = fs.mkdtempSync(path.join(os.tmpdir(), 'camera-reader-'));
	const deck = path.join(top, 'deck');
	fs.mkdirSync(path.join(deck, 'fonts'), { recursive: true });
	fs.writeFileSync(path.join(deck, 'fonts', 'hand.woff2'), WOFF2);
	fs.writeFileSync(path.join(deck, 'fonts', 'fake.woff2'), 'not a font at all');
	fs.writeFileSync(path.join(deck, 'logo.png'), PNG);
	fs.writeFileSync(path.join(top, 'outside.woff2'), WOFF2);
	const warnings = [];
	const reader = createCameraReader({ confine: createFileConfiner([deck]), warn: (m) => warnings.push(m) });
	return { top, deck, reader, warnings, url: (p) => pathToFileURL(p).href };
}

test('a font inside the deck folder comes back as a font data: URI, with no warning', async () => {
	const s = sandbox();
	const uri = await s.reader.read(s.url(path.join(s.deck, 'fonts', 'hand.woff2')));
	assert.match(uri, /^data:font\/woff2;base64,/);
	assert.equal(Buffer.from(uri.split(',')[1], 'base64').length, WOFF2.length);
	assert.deepEqual(s.warnings, []);
	assert.deepEqual(s.reader.failed(), []);
});

test('pictures still go through the picture reader', async () => {
	const s = sandbox();
	assert.match(await s.reader.read(s.url(path.join(s.deck, 'logo.png'))), /^data:image\/png;base64,/);
	assert.deepEqual(s.warnings, []);
});

test('a font outside the confined folders is refused and the warning names it as a font', async () => {
	const s = sandbox();
	const url = s.url(path.join(s.top, 'outside.woff2'));
	assert.equal(await s.reader.read(url), null);
	assert.equal(s.warnings.length, 1);
	assert.match(s.warnings[0], /a font could not be read/);
	assert.ok(s.warnings[0].includes(url));
	assert.doesNotMatch(s.warnings[0], /picture/);
	assert.deepEqual(s.reader.failed(), [url]);
});

test('a file named .woff2 whose bytes are not a font is refused', async () => {
	const s = sandbox();
	assert.equal(await s.reader.read(s.url(path.join(s.deck, 'fonts', 'fake.woff2'))), null);
	assert.match(s.warnings[0], /a font could not be read/);
});

test('a remote font is never fetched, even with allowRemote', async () => {
	const warnings = [];
	const reader = createCameraReader({ allowRemote: true, warn: (m) => warnings.push(m) });
	const realFetch = globalThis.fetch;
	let fetched = 0;
	globalThis.fetch = async () => {
		fetched++;
		throw new Error('no network in a unit test');
	};
	try {
		assert.equal(await reader.read('https://example.invalid/x.woff2'), null);
	} finally {
		globalThis.fetch = realFetch;
	}
	assert.equal(fetched, 0);
	assert.match(warnings[0], /remote fonts are not fetched/);
});

test('one read and one warning per address, however many slides name it', async () => {
	const s = sandbox();
	const url = s.url(path.join(s.top, 'outside.woff2'));
	await s.reader.read(url);
	await s.reader.read(url);
	assert.equal(s.warnings.length, 1);
});

test('fontFileToDataUri sniffs the font type from its bytes, not its name', () => {
	const s = sandbox();
	const renamed = path.join(s.deck, 'fonts', 'hand.ttf');
	fs.copyFileSync(path.join(s.deck, 'fonts', 'hand.woff2'), renamed);
	assert.match(fontFileToDataUri(renamed), /^data:font\/woff2;base64,/);
	assert.equal(fontFileToDataUri(path.join(s.deck, 'fonts')), null); // a folder, not a file
});

test('a host-qualified file URL is refused before any file-system call', async () => {
  const calls = [];
  const confine = { allows: (p) => { calls.push(p); return true; } };
  const warnings = [];
  const reader = createCameraReader({ confine, warn: (m) => warnings.push(m) });
  assert.equal(await reader.read('file://evil-host/share/brand.woff2'), null);
  assert.deepEqual(calls, [], 'the confine (and so realpath) must never see a UNC path');
});
