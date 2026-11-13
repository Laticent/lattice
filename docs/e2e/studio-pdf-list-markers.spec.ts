import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, gotoStudio, railButtons, test, typeDeck } from './studio-fixture';

// The Studio's PDF keeps every list marker (bullet and number), light and dark. The shared writer
// (lib/core/pdf-compose `hideDrawn`) hides drawn words by fill, and a `::marker` inherits that fill
// with no way back (Chromium ignores the property on `::marker`), so every marker used to leave the
// photo. The CLI is pinned by test/integration/export/pdf-list-markers.test.js; this drives the REAL
// Share sheet, the surface the Studio's users export from (HARD RULE #23).
test.describe.configure({ timeout: 240_000 });

const DECK = `---
theme: indaco
---

## Markers light

- Alpha is a plain item.
- Bravo holds \`code\` in running text.

1. Echo is numbered.

---

<!-- _class: dark -->

## Markers dark

- Golf is a plain item.

1. India is numbered.
`;

const DPI = 96;
const PX = DPI / 72;

/** Pixels unlike the background in the band left of a word box, where an outside marker hangs. */
function inkLeftOf(pgm: Buffer, box: { xMin: number; yMin: number; xMax: number; yMax: number }): number {
	const head = pgm.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	if (!head) throw new Error('not a binary PGM');
	const w = Number(head[1]);
	const px = pgm.subarray(head[0].length);
	const h = (box.yMax - box.yMin) * PX;
	const x1 = Math.floor(box.xMin * PX) - 2;
	const x0 = Math.max(0, Math.floor(x1 - 1.6 * h));
	const y0 = Math.floor(box.yMin * PX);
	const y1 = Math.ceil(box.yMax * PX);
	const bg = px[Math.max(0, y0 - 3) * w + x0];
	let ink = 0;
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.abs(px[y * w + x] - bg) > 60) ink++;
	return ink;
}

test('every list marker survives the Studio PDF, on a light and a dark slide @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(2);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	const file = join(tmpdir(), `list-markers-${process.pid}-${test.info().workerIndex}.pdf`);
	writeFileSync(file, readFileSync(path as string));

	const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' });
	const words: Record<string, { page: number; xMin: number; yMin: number; xMax: number; yMax: number }> = {};
	xml.split(/<page /).slice(1).forEach((pg, i) => {
		for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)) {
			if (!words[m[5]]) words[m[5]] = { page: i + 1, xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4] };
		}
	});
	const pages = new Map<number, Buffer>();
	const pageOf = (n: number) => {
		if (!pages.has(n)) {
			const base = `${file}-p${n}`;
			execFileSync('pdftoppm', ['-gray', '-r', String(DPI), '-f', String(n), '-l', String(n), '-singlefile', file, base]);
			pages.set(n, readFileSync(`${base}.pgm`));
		}
		return pages.get(n) as Buffer;
	};
	for (const word of ['Alpha', 'Bravo', 'Echo', 'Golf', 'India']) {
		expect(words[word], `"${word}" is real text in the Studio PDF`).toBeTruthy();
		expect(inkLeftOf(pageOf(words[word].page), words[word]), `a marker beside "${word}"`).toBeGreaterThan(6);
	}
	// Control: nothing hangs left of the heading, so the probe cannot pass on background alone.
	expect(inkLeftOf(pageOf(words.Markers.page), words.Markers)).toBe(0);
});
