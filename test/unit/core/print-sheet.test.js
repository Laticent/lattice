const test = require('node:test');
const assert = require('node:assert/strict');
// The print-sheet kernel is ESM (shared with the browser Print drawer); Node 22 `require`
// loads it directly, the same way lattice-emulator.js consumes it for `--paper` export.
const { resolvePrintSheet, fitSlideOnSheet, nUpCells, nUpGrid, handoutRegions, buildPrintCss, PRINT_SAFE_PX } = require('../../../lib/core/print-sheet.mjs');

// This is the ONE source of truth for how a deck maps onto paper (HARD RULE #1). The docs
// Print drawer has its own vitest suite over the same module; this pins the Node/CLI side.

test('resolvePrintSheet auto-picks the least-wasteful sheet + orientation', () => {
	// 16:9 → US Legal landscape; 4:3 → Letter landscape; tall → portrait.
	assert.deepEqual(resolvePrintSheet(1280, 720), { paper: 'legal', orientation: 'landscape', pageW: 1344, pageH: 816 });
	assert.deepEqual(resolvePrintSheet(960, 720), { paper: 'letter', orientation: 'landscape', pageW: 1056, pageH: 816 });
	assert.deepEqual(resolvePrintSheet(1080, 1920), { paper: 'letter', orientation: 'portrait', pageW: 816, pageH: 1056 });
});

test('explicit paper/orientation override the auto pick (→ the CLI --paper MediaBox)', () => {
	assert.deepEqual(resolvePrintSheet(1280, 720, { paper: 'a4', orientation: 'portrait' }), { paper: 'a4', orientation: 'portrait', pageW: 794, pageH: 1123 });
	assert.deepEqual(resolvePrintSheet(1280, 720, { paper: 'letter', orientation: 'landscape' }), { paper: 'letter', orientation: 'landscape', pageW: 1056, pageH: 816 });
});

test('fitSlideOnSheet fits inside the 9mm safe margin, centered, never upscaled', () => {
	const { pageW, pageH } = resolvePrintSheet(1280, 720); // legal landscape 1344×816
	const r = fitSlideOnSheet(1280, 720, pageW, pageH, 'page');
	assert.ok(r.w <= pageW - 2 * PRINT_SAFE_PX + 1e-3);
	assert.ok(r.h <= pageH - 2 * PRINT_SAFE_PX + 1e-3);
	assert.ok(Math.abs(r.w / r.h - 1280 / 720) < 1e-6); // aspect preserved
	assert.ok(Math.abs(r.x - (pageW - r.w) / 2) < 1e-6); // centered
});

test('nUpCells nup=1 collapses to exactly fitSlideOnSheet; 2/4 stay inside the sheet', () => {
	const one = nUpCells(1280, 720, 1344, 816, 1, 'page');
	const fit = fitSlideOnSheet(1280, 720, 1344, 816, 'page');
	assert.equal(one.length, 1);
	assert.ok(Math.abs(one[0].x - fit.x) < 1e-6 && Math.abs(one[0].w - fit.w) < 1e-6);
	assert.deepEqual(nUpGrid(4, 1344, 816, 1280, 720), { cols: 2, rows: 2 });
	for (const c of nUpCells(1280, 720, 1344, 816, 4, 'page')) {
		assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1344 + 1e-3 && c.y + c.h <= 816 + 1e-3);
	}
});

test('handoutRegions bands the slide over its notes, both inside the sheet', () => {
	const { slide, notes } = handoutRegions(1280, 720, 816, 1056, 'page');
	assert.ok(notes.y >= slide.y + slide.h - 1e-3); // notes below the slide
	assert.ok(notes.y + notes.h <= 1056 - PRINT_SAFE_PX + 1e-3); // inside the safe margin
});

test('buildPrintCss emits the paper @page keyword + a fitted zoom', () => {
	const css = buildPrintCss(1280, 720, { paper: 'letter', orientation: 'landscape', fit: 'page' });
	assert.match(css, /@page\{size:letter landscape;margin:9mm;\}/);
	assert.match(css, /zoom:0\.\d+/); // scaled to fit, floored below 1
});
