// lib/core/screen-canvas.mjs: a 4K deck keeps its 4K canvas only where the screen shows more than
// FOUR_K_FROM device pixels across the slide.
const test = require('node:test');
const assert = require('node:assert/strict');

test('screenCanvas', async (t) => {
	const { screenCanvas, FOUR_K_FROM } = await import('../../../lib/core/screen-canvas.mjs');

	await t.test('a deck that is not 4K keeps its own canvas everywhere', () => {
		for (const size of [undefined, null, '', 'hd', '16:9', 'standard', 'story']) {
			assert.equal(screenCanvas(size, 393, 3), null, String(size));
			assert.equal(screenCanvas(size, 3840, 1), null, String(size));
		}
	});

	await t.test('a phone gets HD (393 CSS px at 3x is 1,179 device px)', () => {
		assert.equal(screenCanvas('4k', 393, 3), 'hd');
	});

	await t.test('an iPad and a desktop editor preview get HD', () => {
		assert.equal(screenCanvas('4k', 1180, 2), 'hd'); // iPad landscape, full width: 2,360
		assert.equal(screenCanvas('4k', 800, 2), 'hd'); // a laptop's editor pane
	});

	await t.test('a 4K display presenting full screen keeps 4K', () => {
		assert.equal(screenCanvas('4k', 3840, 1), null);
		assert.equal(screenCanvas('4K', 1920, 2), null); // 4K at 200% scaling
		assert.equal(screenCanvas(' 4k ', 1512, 2), null); // a 14" laptop, full screen: 3,024
		assert.equal(screenCanvas('4k', 1376, 2), null); // a 13" iPad in landscape, full width: 2,752
	});

	await t.test('the boundary is strictly above FOUR_K_FROM device px', () => {
		assert.equal(screenCanvas('4k', FOUR_K_FROM, 1), 'hd');
		assert.equal(screenCanvas('4k', FOUR_K_FROM + 1, 1), null);
	});

	await t.test('the player can carry the function: its text names nothing outside itself, and its line is FOUR_K_FROM', () => {
		const text = screenCanvas.toString();
		assert.doesNotMatch(text, /FOUR_K_FROM|is4k|deckSizeOf/, 'no reference outside the body');
		assert.ok(text.includes(`> ${FOUR_K_FROM} `), 'the inlined threshold is FOUR_K_FROM');
		const carried = new Function(`return (${text})`)();
		assert.equal(carried('4k', 393, 3), 'hd');
		assert.equal(carried('4k', 3840, 1), null);
	});

	await t.test('no width yet, or a missing density, lands on the safe side', () => {
		assert.equal(screenCanvas('4k', 0, 3), 'hd');
		assert.equal(screenCanvas('4k', Number.NaN, 3), 'hd');
		assert.equal(screenCanvas('4k', 3840, 0), null); // density 0 reads as 1
		assert.equal(screenCanvas('4k', 1000, undefined), 'hd');
	});
});
