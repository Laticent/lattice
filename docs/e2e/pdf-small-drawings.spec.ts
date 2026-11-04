import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// Share → PDF on the REAL Studio draws an avatar's tile and ring, a sparkline's line and end dot, and the
// recommended card's spark (a masked mark) as vectors, as the CLI does (test/integration/export/pdf-small-drawings.test.js).
// The two hosts share the reader (lib/core/pdf-compose), but the Studio photographs with its own camera, which has to
// honor the same `hideDrawn` marks. The oracle is the CLI test's: beside each word, the PHOTO carries no ink and the
// page does. FALSIFIABLE: without `tileOf`, `dotOf` and `maskedMarkOf`, each drawing is back in the photo. Needs poppler.
test.describe.configure({ timeout: 240_000 });

const DECK = [
	'## Avatars', '', 'Alpha `!{Ada Okafor}` Bravo `!{Ben Liu, lg}` Charlie `!{Cy Diaz, rounded, border=c3}` Delta', '',
	'---', '', '## Sparks', '', 'Echo `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` Foxtrot `~{1.9/1.6, bullet}` Golf', '',
	'---', '', '<!-- _class: verdict-grid -->', '', '## Cards', '', '- Option one', '  - [x] Residency', '  - Fine.', '- Option Hotel', '  - [x] Residency', '  - Better.', '',
].join('\n');

type Pnm = { w: number; h: number; ch: number; px: Buffer };
function readPnm(file: string): Pnm {
	const buf = readFileSync(file);
	const head = buf.toString('latin1', 0, 64).match(/^P([56])\s+(\d+)\s+(\d+)\s+(\d+)\s/) as RegExpMatchArray;
	return { w: Number(head[2]), h: Number(head[3]), ch: head[1] === '6' ? 3 : 1, px: buf.subarray(head[0].length) };
}
const lum = (img: Pnm, x: number, y: number) => {
	const i = (y * img.w + x) * img.ch;
	return img.ch === 1 ? img.px[i] : (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3;
};
function inked(img: Pnm, x0: number, y0: number, x1: number, y1: number) {
	const bg = lum(img, x0, y0);
	let n = 0;
	for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) if (Math.abs(lum(img, x, y) - bg) > 24) n++;
	return n;
}

async function exportPdf(page: Page): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const dir = mkdtempSync(join(tmpdir(), 'studio-small-'));
	const file = join(dir, 'deck.pdf');
	writeFileSync(file, readFileSync((await (await download).path()) as string));
	return file;
}

// `@gecko` runs on Chromium desktop and Firefox; the `@webkit-tablet` copy on real WebKit.
for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`Share → PDF draws avatar tiles, spark dots and a card's mark as vectors, off the photo${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		const pdf = await exportPdf(page);
		const dir = join(pdf, '..');
		const pages = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' }).split('<page ').slice(1);
		expect(pages.length).toBe(3);
		execFileSync('pdfimages', [pdf, join(dir, 'img')]);
		const list = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
		execFileSync('pdftoppm', ['-gray', '-r', '96', pdf, join(dir, 'p')]);
		const files = readdirSync(dir);
		// The page's photo is its first image (the background, drawn first); a page with no photo fails here.
		const photoOf = (i: number) => {
			const n = list.findIndex((row) => Number(row[0]) === i + 1);
			expect(n, `page ${i + 1} has no photo`).toBeGreaterThanOrEqual(0);
			return readPnm(join(dir, files.find((f) => f.startsWith(`img-${String(n).padStart(3, '0')}`)) as string));
		};
		const pageOf = (i: number) => readPnm(join(dir, files.find((f) => new RegExp(`^p-0*${i + 1}\\.pgm$`).test(f)) as string));
		const word = (pg: string, t: string) => {
			const m = pg.match(new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)">${t}</word>`));
			expect(m, `no word ${t}`).toBeTruthy();
			return (m as RegExpMatchArray).slice(1, 5).map(Number);
		};
		// [page, the word just before the drawing, the band's height in line heights, where it starts and ends after the word].
		const cases: [number, string, number, number, number][] = [[0, 'Alpha', 1.3, 0.35, 1.3], [0, 'Bravo', 2.2, 0.35, 1.3], [0, 'Charlie', 1.3, 0.35, 1.3], [1, 'Echo', 0.6, 0.6, 1.6], [1, 'Foxtrot', 0.6, 0.6, 1.6]];
		for (const [i, t, k, a, b] of cases) {
			const pg = pages[i];
			const pageW = Number((pg.match(/width="([\d.]+)"/) as RegExpMatchArray)[1]);
			const [, y0, x1, y1] = word(pg, t);
			const h = y1 - y0, mid = (y0 + y1) / 2;
			const at = (img: Pnm) => {
				const s = img.w / pageW;
				return inked(img, Math.round((x1 + a * h) * s), Math.round((mid - (k * h) / 2) * s), Math.round((x1 + b * h) * s), Math.round((mid + (k * h) / 2) * s));
			};
			expect(at(photoOf(i)), `page ${i + 1}: the photo still carries the drawing after "${t}"`).toBe(0);
			expect(at(pageOf(i)), `page ${i + 1}: the page lost the drawing after "${t}"`).toBeGreaterThan(0);
		}
		// The recommended card's spark: the card's top right corner, level with its title.
		const pg = pages[2];
		const pageW = Number((pg.match(/width="([\d.]+)"/) as RegExpMatchArray)[1]);
		const [, y0, , y1] = word(pg, 'Hotel');
		const band = (img: Pnm) => { const s = img.w / pageW; return inked(img, Math.round((pageW - 86) * s), Math.round((y0 - 16) * s), Math.round((pageW - 52) * s), Math.round((y1 + 4) * s)); };
		expect(band(photoOf(2)), "the photo still carries the recommended card's spark").toBe(0);
		expect(band(pageOf(2)), "the page lost the recommended card's spark").toBeGreaterThan(0);
	});
}
