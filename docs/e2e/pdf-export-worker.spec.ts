import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// The PDF export has two lanes that must produce the SAME deck: the worker (which
// reads the capture's pixels and deflates them natively into a pdf-lib document) and
// the main-thread fallback (jsPDF, which re-encodes a canvas PNG). They share no
// encoder, so bytes cannot be compared — but the PIXELS must match, page for page,
// or the fast lane is quietly shipping a different artifact than the slow one.
//
// So the oracle here decodes each page's image stream back to pixels and compares a
// per-page signature between the two lanes. That catches a transposed page, a
// dropped page, a mis-composited alpha channel and a wrong page box in one
// assertion — none of which a page count would see.
test.describe.configure({ timeout: 240_000 });

const DECK = Array.from(
	{ length: 8 },
	(_, i) => `<!-- _class: big-number -->\n\n\`Slide ${i + 1}\`\n\n- ${i + 1}\n  - of eight, each visually distinct so a transposed page is visible.`,
).join('\n\n---\n\n');

/** Count the export workers a run constructs — an arm claiming a lane must prove it. */
async function countWorkers(page: Parameters<typeof gotoStudio>[0]) {
	await page.addInitScript(() => {
		const counter = window as unknown as { __pdfWorkers: number };
		counter.__pdfWorkers = 0;
		const Original = window.Worker;
		// A subclass, not a wrapper function: the app calls `new Worker(...)`, and an
		// arrow function (which is what the lint rule would push this toward) is not
		// constructible.
		window.Worker = class extends Original {
			constructor(url: string | URL, opts?: WorkerOptions) {
				if (/pdf-export-worker/.test(String(url))) counter.__pdfWorkers += 1;
				super(url, opts);
			}
		};
	});
}

/**
 * Undo `/FlateDecode` + `/Predictor 15` back to RGB rows.
 *
 * The PNG filters have to be implemented for real, not assumed away: the worker lane
 * writes every row with filter tag 0, but jsPDF passes through the canvas's own PNG
 * bytes, and canvas encoders pick a filter per row (Sub / Up / Average / Paeth).
 * Dropping the tag and keeping the bytes decodes THAT stream to noise — measured, it
 * read as a near-black page against the worker lane's near-white one.
 */
function decodeImage(raw: Uint8Array, width: number, height: number, predictor: number) {
	const bytes = new Uint8Array(inflateSync(Buffer.from(raw)));
	if (predictor < 10) return bytes;
	const bpp = 3;
	const rowLen = width * bpp;
	const out = new Uint8Array(rowLen * height);
	for (let y = 0; y < height; y++) {
		const tag = bytes[y * (rowLen + 1)];
		const src = (y * (rowLen + 1)) + 1;
		const dst = y * rowLen;
		const up = dst - rowLen;
		for (let i = 0; i < rowLen; i++) {
			const rawByte = bytes[src + i];
			const left = i >= bpp ? out[dst + i - bpp] : 0;
			const above = y > 0 ? out[up + i] : 0;
			const upLeft = y > 0 && i >= bpp ? out[up + i - bpp] : 0;
			let value = rawByte;
			if (tag === 1) value = rawByte + left;
			else if (tag === 2) value = rawByte + above;
			else if (tag === 3) value = rawByte + ((left + above) >> 1);
			else if (tag === 4) {
				const p = left + above - upLeft;
				const pa = Math.abs(p - left);
				const pb = Math.abs(p - above);
				const pc = Math.abs(p - upLeft);
				value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upLeft);
			}
			out[dst + i] = value & 0xff;
		}
	}
	return out;
}

/**
 * One signature per page: an 8x8 grid of block means over the decoded image. A mean
 * over the WHOLE page cannot tell two slides of the same layout apart (measured: all
 * eight collapsed to one value); a byte hash is the other extreme, failing on a
 * single pixel of encoder drift. Block means separate the slides and round away
 * sub-unit noise.
 *
 * Resolving the image goes through the page's CONTENT STREAM (`/Name Do`) and only
 * then into the resources — jsPDF gives every page of a document the same shared
 * XObject dictionary, so reading "the first image in the resources" returns the same
 * bytes for all eight pages and would call any order correct.
 */
async function pageSignatures(bytes: Uint8Array): Promise<string[]> {
	const doc = await PDFDocument.load(bytes);
	return doc.getPages().map((page) => {
		const { width: pageW, height: pageH } = page.getSize();
		// BOTH shapes — `/Contents` is a single stream or a one-element array (pdf-lib
		// normalizes to the latter as soon as anything touches a page's resources). Taking
		// only the stream returns an empty signature for such a page, which would make this
		// oracle pass on ANY page order.
		const rawContents = doc.context.lookup(page.node.get(PDFName.of('Contents')));
		const contents =
			rawContents instanceof PDFRawStream
				? rawContents
				: doc.context.lookup((rawContents as unknown as { get(i: number): unknown })?.get?.(0) as never);
		const decoded = contents instanceof PDFRawStream ? inflateOrRaw(contents) : new Uint8Array();
		const name = /\/([A-Za-z0-9_.+-]+)\s+Do\b/.exec(new TextDecoder('latin1').decode(decoded))?.[1];
		const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
		const image = name && xobjects ? doc.context.lookup(xobjects.get(PDFName.of(name))) : null;
		if (!(image instanceof PDFRawStream)) return `no-image@${Math.round(pageW)}x${Math.round(pageH)}`;
		const width = Number(image.dict.get(PDFName.of('Width'))?.toString());
		const height = Number(image.dict.get(PDFName.of('Height'))?.toString());
		const parms = image.dict.lookup(PDFName.of('DecodeParms'), PDFDict);
		const predictor = Number(parms?.get(PDFName.of('Predictor'))?.toString() ?? 1);
		const rgb = decodeImage(image.contents, width, height, predictor);
		const GRID = 8;
		const cells: number[] = [];
		for (let by = 0; by < GRID; by++) {
			for (let bx = 0; bx < GRID; bx++) {
				let sum = 0;
				let n = 0;
				for (let y = Math.floor((by * height) / GRID); y < Math.floor(((by + 1) * height) / GRID); y += 4) {
					for (let x = Math.floor((bx * width) / GRID); x < Math.floor(((bx + 1) * width) / GRID); x += 4) {
						const i = (y * width + x) * 3;
						sum += rgb[i] + rgb[i + 1] + rgb[i + 2];
						n += 3;
					}
				}
				cells.push(n ? Math.round(sum / n) : 0);
			}
		}
		// The PAGE box rides in the signature too: the image dimensions are the same in
		// both lanes whatever box they are drawn on, so without this the comparison would
		// pass a page half the size it should be.
		return `${Math.round(pageW)}x${Math.round(pageH)}pt/${width}x${height}:${cells.join(',')}`;
	});
}

/** A content stream is flate-compressed in one lane and plain in the other. */
function inflateOrRaw(stream: PDFRawStream) {
	const filter = stream.dict.get(PDFName.of('Filter'))?.toString();
	return filter === '/FlateDecode' ? new Uint8Array(inflateSync(Buffer.from(stream.contents))) : stream.contents;
}

async function exportPdf(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	const path = await file.path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

test('the worker lane and the main-thread lane export the same pages', async ({ page }) => {
	await countWorkers(page);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(8);
	const viaWorker = await exportPdf(page);
	expect(await page.evaluate(() => (window as unknown as { __pdfWorkers: number }).__pdfWorkers)).toBe(1);

	const viaMainThread = await test.step('main-thread control', async () => {
		const context = await page.context().browser()?.newContext({ acceptDownloads: true });
		if (!context) throw new Error('no browser context');
		const control = await context.newPage();
		await countWorkers(control);
		// The worker script never arrives — the failure the fallback exists for.
		await control.route('**/pdf-export-worker*.js', (route) => route.abort());
		await gotoStudio(control);
		await setEditorContent(control, DECK);
		await expect(railButtons(control)).toHaveCount(8);
		const bytes = await exportPdf(control);
		await context.close();
		return bytes;
	});

	const [worker, control] = await Promise.all([pageSignatures(viaWorker), pageSignatures(viaMainThread)]);
	expect(worker).toHaveLength(8);
	// The oracle only means something if the pages are distinguishable: eight identical
	// signatures would make any permutation pass.
	expect(new Set(worker).size).toBe(8);
	expect(worker).toEqual(control);
});
