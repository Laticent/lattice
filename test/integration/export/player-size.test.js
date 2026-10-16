/**
 * Integration: an exported `--player` file stores a repeated picture once and declares an
 * identical font file once (engineering/decisions/2026-10-16-player-as-library-audit.md §3).
 *
 * Measured before the change, on the 120-slide gallery deck: 54 inlined `data:` URIs carried 19
 * distinct assets, a photo reused on four slides was four copies, and the bundled faces embedded
 * one variable font file once per weight. The unit tests cover each kernel
 * (player-assets.test.js, player-font-merge.test.js); this one proves the CLI wires both into
 * the file it writes, through the real browser prune.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

describe('player-size', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 180000;
	const DECK = `---
theme: indaco
---

# One photo, three slides

Body text in the deck's own faces, with **bold** and \`code\`.

---

![bg](sample:photo-wide.jpg)

## The photo, full bleed

---

![bg left](sample:photo-wide.jpg)

## The same photo, on the left
`;

	let html;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-size-'));
		const src = path.join(dir, 'deck.md');
		fs.writeFileSync(src, DECK);
		const out = path.join(dir, 'deck.html');
		const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet', '--player'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		html = fs.readFileSync(out, 'utf8');
	}, { timeout: TIMEOUT });

	test('a photo used on two slides is stored once', () => {
		const uris = [...html.matchAll(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g)].map((m) => m[0]);
		assert.ok(uris.length >= 1, 'the photo is inlined');
		assert.equal(uris.length, new Set(uris).size, 'no JPEG is embedded twice');
		assert.match(html, /<style id="lp-assets">:root\{--lp-asset-0:url\(data:image\/jpeg;base64,/);
		assert.ok((html.match(/var\(--lp-asset-0\)/g) || []).length >= 2, 'both slides point at the one copy');
	});

	test('an identical font file is declared once, as a weight range', () => {
		const block = html.match(/<style id="lattice-embedded-fonts">([\s\S]*?)<\/style>/)?.[1] ?? '';
		assert.match(block, /font-weight:\d{3} \d{3}/, 'at least one run of identical files merged');
	});
});
