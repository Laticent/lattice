import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, gotoStudio, railButtons, test, typeDeck } from './studio-fixture';

// The Studio's PDF draws a finish's backdrop instead of photographing it (lib/core/pdf-compose: read-slide.mjs
// `readBackdrop`, backdrop.mjs; engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md). The CLI is pinned by
// test/integration/export/pdf-backdrop-vector.test.js; this drives the REAL Share sheet, whose camera is html-to-image in
// the page (HARD RULE #23). On each finish slide: no slide-sized photo is left, the glow is one opaque quarter-resolution
// picture, and the page is where the screen has it (a glow, a clear panel), light and dark.
test.describe.configure({ timeout: 240_000 });

const DECK = `---
theme: indaco
---

<!-- _class: statement finish-loom -->

## A glow under a weave

The lattice is lines, and the glow under it is smooth.

---

<!-- _class: statement finish-nimbus dark -->

## Blooms on a dark canvas

Four soft blooms and an edge vignette.

---

<!-- _class: statement finish-atrium backdrop-clear -->

## A clear panel

The grid and the glow fade out behind the words.
`;

/** `pdfimages -list` rows as [page, num, type, width, height, …]. */
function imageRows(file: string): string[][] {
	return execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
}

/** One page at 96 dpi, RGB. */
function raster(file: string, page: number): { w: number; px: Buffer } {
	const base = join(tmpdir(), `backdrop-${process.pid}-${test.info().workerIndex}-${page}`);
	execFileSync('pdftoppm', ['-r', '96', '-f', String(page), '-l', String(page), '-singlefile', file, base]);
	const buf = readFileSync(`${base}.ppm`);
	const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	if (!head) throw new Error('not a binary PPM');
	return { w: Number(head[1]), px: buf.subarray(head[0].length) };
}
const at = (img: { w: number; px: Buffer }, x: number, y: number) => {
	const o = (y * img.w + x) * 3;
	return [img.px[o], img.px[o + 1], img.px[o + 2]];
};

test('the Studio PDF draws each finish backdrop: no slide photo, a smooth glow, light and dark @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(3);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	const file = join(tmpdir(), `backdrop-${process.pid}-${test.info().workerIndex}.pdf`);
	writeFileSync(file, readFileSync(path as string));

	const rows = imageRows(file);
	for (const pageNo of [1, 2, 3]) {
		const mine = rows.filter((c) => Number(c[0]) === pageNo);
		// No slide-sized photo: the backdrop is drawn, and what is left is cut to its inked parts.
		expect(mine.filter((c) => c[2] === 'image' && Number(c[3]) >= 1200), `page ${pageNo}:\n${rows.map((c) => c.join(' ')).join('\n')}`).toEqual([]);
		// The glow: one opaque picture a quarter of the slide wide (320 px for a 1280 px slide), with no soft mask.
		expect(mine.some((c, i) => c[2] === 'image' && Number(c[3]) === 320 && mine[i + 1]?.[2] !== 'smask'), `page ${pageNo} glow picture`).toBe(true);
	}
	// Where the screen has it. Slide 1: loom's corner glow (top left) tints the canvas, the far corner stays white.
	const one = raster(file, 1);
	const glow = at(one, 20, 120), plain = at(one, 1260, 700);
	expect(glow[0], `the glow tints the top left (${glow})`).toBeLessThan(plain[0] - 6);
	// Slide 2 is dark; slide 3's clear panel leaves the middle of the slide its plain canvas color.
	const two = raster(file, 2);
	expect(Math.max(...at(two, 640, 600)), 'a dark slide stays dark').toBeLessThan(80);
	const three = raster(file, 3);
	const mid = at(three, 640, 420);
	expect(Math.min(...mid), `the clear panel's middle is canvas (${mid})`).toBeGreaterThan(245);
});
