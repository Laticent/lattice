// The `pdf-pdfkit` platform suite's measures (tools/pdfkit-check/metrics.mjs), on synthetic pictures: each one shown
// passing a faithful drawing and failing the fault it exists to catch. The suite itself runs on a macOS runner
// (.github/platform-suites.json), where PDFKit draws the exported PDF.
const test = require('node:test');
const assert = require('node:assert/strict');

let m;
test.before(async () => {
	m = await import('../../../tools/pdfkit-check/metrics.mjs');
});

/** A W x H RGBA picture whose color at (x, y) is f(x, y) -> [r, g, b]. */
function picture(W, H, f) {
	const data = new Uint8Array(W * H * 4);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const [r, g, b] = f(x, y);
		data.set([r, g, b, 255], (y * W + x) * 4);
	}
	return { width: W, height: H, data };
}

test('worstTile: text anti-aliasing averages out, a missing fade does not', () => {
	const glow = (x) => [255 - Math.round(x / 20), 250, 245];
	const screen = picture(320, 192, glow);
	// The same slide with a word drawn one pixel over (anti-aliasing differs between renderers).
	const shifted = picture(320, 192, (x, y) => (y > 90 && y < 100 && x > 40 && x < 140 && (x + y) % 3 === 0 ? [20, 20, 20] : glow(x)));
	const word = picture(320, 192, (x, y) => (y > 90 && y < 100 && x > 40 && x < 140 && (x + y + 1) % 3 === 0 ? [20, 20, 20] : glow(x)));
	assert.ok(m.worstTile(word, shifted) < 12, `a shifted word: ${m.worstTile(word, shifted).toFixed(1)}`);
	// A dropped soft mask: a box of solid panel color over a 64 px region the screen shows as the glow.
	const box = picture(320, 192, (x, y) => (x >= 128 && x < 192 && y >= 64 && y < 128 ? [30, 26, 21] : glow(x)));
	assert.ok(m.worstTile(box, screen) > 100, `a solid box: ${m.worstTile(box, screen).toFixed(1)}`);
	assert.equal(m.worstTile(screen, screen), 0);
});

test('blockiness: a smooth glow has almost no step over a level; a 12 px staircase of 2-level steps does', () => {
	// The same 16-level fall over 96 px: interpolated, and drawn nearest-neighbor from 8 samples.
	const smooth = picture(96, 30, (x) => [200 - Math.round(x / 6), 200, 200]);
	const stairs = picture(96, 30, (x) => [200 - 2 * Math.floor(x / 12), 200, 200]);
	assert.ok(m.blockiness(smooth, 0, 0, 96, 30) < 0.01);
	assert.ok(m.blockiness(stairs, 0, 0, 96, 30) > 0.05);
});

test('worstTileAt: a local fault is found where it is; a color shift moves the slide mean, a local fault barely does', () => {
	const flat = picture(320, 192, () => [100, 120, 140]);
	const box = picture(320, 192, (x, y) => (x >= 128 && x < 192 && y >= 64 && y < 128 ? [30, 26, 21] : [100, 120, 140]));
	const at = m.worstTileAt(box, flat);
	assert.equal(at.worst, m.worstTile(box, flat), 'the same worst tile as worstTile');
	assert.ok(at.x >= 128 && at.x < 192 && at.y >= 64 && at.y < 128, `found at ${at.x},${at.y}`);
	assert.deepEqual(at.a.map(Math.round), [30, 26, 21]);
	assert.deepEqual(at.b.map(Math.round), [100, 120, 140]);
	// Color management shifts every tile the same way: the slide mean moves as far as the worst tile.
	const shifted = picture(320, 192, () => [90, 110, 130]);
	const s = m.worstTileAt(shifted, flat);
	assert.deepEqual(s.meanDiff.map(Math.round), [-10, -10, -10]);
	assert.ok(Math.abs(at.meanDiff[0]) < at.worst / 5, `a local box moves the slide mean ${at.meanDiff[0].toFixed(1)}, far less than its own ${at.worst.toFixed(1)}`);
});
