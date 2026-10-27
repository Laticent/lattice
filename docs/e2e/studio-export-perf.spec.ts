import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, gotoStudio, railButtons, test } from './studio-fixture';

// STUDIO EXPORT PERF — the time and memory of a photo-heavy deck's PDF export, on the real built Studio.
//
// WHY IT EXISTS. The shared slide camera (PR 2904) made the Studio's PDF export of a 52-slide photo deck
// 2.15x slower than before (112 s against 52 s) and crashed an iPhone on it. Nothing measured it: the
// unit suites, the camera oracle and every green CI check passed, and the owner found it by hand. HARD
// RULE #19 asks for evidence on a performance claim; this is the instrument for the Studio's export.
//
// HOW IT MEASURES. Seconds do not travel between machines, so the time is a SCORE: export seconds
// divided by the seconds a fixed workload took in the same page, just before (six noise canvases encoded
// to PNG by the browser). A slow runner slows both; a slower code path slows only the export. The
// ceilings are in test/benchmark/export-budget.json and follow preview-budget.json's rules: a budget
// over a baseline, set against the regression worth catching, never re-blessed per machine.
//
// WHERE IT RUNS. Tagged @perf, so it is NOT on the PR gate (wall-clock numbers would be a flaky
// merge blocker) and it runs in perf-nightly.yml, which greps the log for BREACH_TOKEN to tell a
// real breach from a broken harness and files the issue. Run it by hand with
//   npx playwright test --project=desktop --grep "@perf.*export"
//
// THE DECK. 20 slides, each with one photo, 6 distinct pictures of 1179 x 1179 px that do not compress
// well (a gradient with grain): the Yearn deck's shape, in which 18 such photos ride 52 slides. PERF_SLIDES,
// PERF_PHOTOS, PERF_SIDE and PERF_PER change it for an investigation. A deck of two 1500 px photos on each
// of 20 slides crashes the tab on main's html-to-image export, so it is not a deck a budget can stand on.
test.describe.configure({ timeout: 600_000 });

/** Assembled, so the literal never appears anywhere a code frame or grep could pick it up. */
const BREACH_TOKEN = `::perf-${'ceiling'}-breach::`;
const HERE = path.dirname(fileURLToPath(import.meta.url)); // ESM: no __dirname
const BUDGET = JSON.parse(fs.readFileSync(path.join(HERE, '../../test/benchmark/export-budget.json'), 'utf8')) as {
	ceilings: { pdfScore: number; pdfPeakHeapMB: number };
};
const require = createRequire(import.meta.url);
const SLIDES = Number(process.env.PERF_SLIDES || 20);
const PHOTOS = Number(process.env.PERF_PHOTOS || 6);
const SIDE = Number(process.env.PERF_SIDE || 1179);
const PER = Number(process.env.PERF_PER || 1);

/** A photo-like PNG: a smooth gradient with grain, seeded so every run draws the same pixels. */
function photo(seed: number): Buffer {
	// pngjs ships no type declarations; only the two members used here are typed.
	type Png = { data: Uint8Array };
	const { PNG } = require('../../node_modules/pngjs') as { PNG: { new (size: { width: number; height: number }): Png; sync: { write(png: Png): Buffer } } };
	const png = new PNG({ width: SIDE, height: SIDE });
	let s = 1234567 + seed * 7919;
	for (let y = 0; y < SIDE; y++) {
		for (let x = 0; x < SIDE; x++) {
			const i = (y * SIDE + x) * 4;
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			const grain = ((s >>> 24) % 17) - 8;
			png.data[i] = Math.max(0, Math.min(255, (x * 255) / SIDE + grain + seed * 20));
			png.data[i + 1] = Math.max(0, Math.min(255, (y * 255) / SIDE + grain));
			png.data[i + 2] = Math.max(0, Math.min(255, ((x + y) * 128) / SIDE + grain + seed * 10));
			png.data[i + 3] = 255;
		}
	}
	return PNG.sync.write(png);
}

async function latticeFile(): Promise<Buffer> {
	const JSZip = require('../../node_modules/jszip') as typeof import('jszip');
	const zip = new JSZip();
	const names = Array.from({ length: PHOTOS }, (_, i) => `img-${9000 + i}`);
	const media = names.map((name, i) => {
		const bytes = photo(i);
		zip.file(`media/${name}.png`, bytes);
		return { name, kind: 'image', scope: 'library', mime: 'image/png', bytes: bytes.length, width: SIDE, height: SIDE, sourceName: `${name}.png`, original: true, addedAt: 1790000000000 + i, file: `${name}.png`, caption: `Photo ${i + 1}, a gradient with grain.` };
	});
	const slides = Array.from({ length: SLIDES }, (_, i) => `## Slide ${i + 1}\n\n${Array.from({ length: PER }, (_, k) => `- ![Photo ${((i + k) % PHOTOS) + 1}](asset:${names[(i + k) % PHOTOS]})`).join('\n')}`).join('\n\n---\n\n');
	zip.file('deck.md', `---\ntheme: indaco\n---\n\n${slides}\n`);
	zip.file('manifest.json', JSON.stringify({ format: 'lattice', version: 1, title: 'Export perf probe', engine: 'lattice', generatedAt: 1790000000000, comments: [] }));
	zip.file('media.json', JSON.stringify(media));
	return zip.generateAsync({ type: 'nodebuffer' });
}

test('@perf the Studio PDF export of a photo-heavy deck stays within its time and heap budget', async ({ page }) => {
	await gotoStudio(page);
	await page.locator('input[type="file"][accept*=".lattice"]').setInputFiles({ name: 'export-perf.lattice', mimeType: 'application/zip', buffer: await latticeFile() });
	await expect(railButtons(page)).toHaveCount(SLIDES, { timeout: 60_000 });

	// The calibration: a fixed workload the export's speed is divided by. Median of five so one slow tick does not move it.
	const calibrationSeconds = await page.evaluate(async () => {
		const once = async () => {
			const t0 = performance.now();
			let seed = 42;
			for (let n = 0; n < 10; n++) {
				const c = document.createElement('canvas');
				c.width = 1000;
				c.height = 1000;
				const g = c.getContext('2d') as CanvasRenderingContext2D;
				const img = g.createImageData(1000, 1000);
				for (let i = 0; i < img.data.length; i += 4) {
					seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
					const v = (seed >>> 24) & 255;
					img.data[i] = v;
					img.data[i + 1] = (v * 3) & 255;
					img.data[i + 2] = (v * 7) & 255;
					img.data[i + 3] = 255;
				}
				g.putImageData(img, 0, 0);
				await new Promise<void>((resolve) => c.toBlob(() => resolve(), 'image/png'));
				// Hand the pixels back at once: the export that follows is measured on a page that is not still holding this.
				c.width = 0;
				c.height = 0;
			}
			return (performance.now() - t0) / 1000;
		};
		const runs = [await once(), await once(), await once(), await once(), await once()].sort((a, b) => a - b);
		return runs[2];
	});

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();

	await page.evaluate(() => {
		const w = window as unknown as { __peakHeap: number };
		w.__peakHeap = 0;
		setInterval(() => {
			const used = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
			if (used > w.__peakHeap) w.__peakHeap = used;
		}, 100);
	});
	const download = page.waitForEvent('download', { timeout: 540_000 });
	const t0 = Date.now();
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	const exportSeconds = (Date.now() - t0) / 1000;
	const peakHeapMB = (await page.evaluate(() => (window as unknown as { __peakHeap: number }).__peakHeap)) / 1e6;
	const bytes = fs.statSync((await file.path()) as string).size;

	const score = exportSeconds / calibrationSeconds;
	console.log(`\nSTUDIO-EXPORT-PERF slides=${SLIDES} export=${exportSeconds.toFixed(1)}s calibration=${calibrationSeconds.toFixed(2)}s score=${score.toFixed(1)} peakHeap=${peakHeapMB.toFixed(0)}MB pdf=${(bytes / 1e6).toFixed(1)}MB`);

	// A harness that exported nothing must not read as a fast export.
	expect(bytes, 'the PDF is empty: nothing was measured').toBeGreaterThan(100_000);
	expect(score, `${BREACH_TOKEN} PDF export score ${score.toFixed(1)} (${exportSeconds.toFixed(1)} s over a ${calibrationSeconds.toFixed(2)} s calibration) is past the ${BUDGET.ceilings.pdfScore} ceiling: the Studio's PDF export got slower for a photo deck`).toBeLessThan(BUDGET.ceilings.pdfScore);
	expect(peakHeapMB, `${BREACH_TOKEN} PDF export peak JS heap ${peakHeapMB.toFixed(0)} MB is past the ${BUDGET.ceilings.pdfPeakHeapMB} MB ceiling`).toBeLessThan(BUDGET.ceilings.pdfPeakHeapMB);
});
