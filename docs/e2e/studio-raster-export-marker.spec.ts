import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { expect, gotoStudio, persistedSource, setEditorContent, shareExport, test } from './studio-fixture';

// THE RASTER EXPORTS SHOW A READER THE EXPORT SETTING'S MARKER, NOT THE AUTHOR'S (followups.d/2739-p6).
// The Studio's PDF, images and PowerPoint exports rasterize a capture frame whose runtime paints the
// overflow marker into every clipped slide. With no level passed the frame took itself for an authoring
// surface and a recipient saw the red ring, "OVERFLOWS" and "Fix Me" (decisions/2026-10-16-player-as-library-audit.md
// §11.8 fixed the Webpage export and left these three). Each export now carries the workspace's level, `reader`
// by default: a calm "Content clipped" pill and no ring. The oracle is a pixel: the author ring is a red
// border, so the left edge, mid-height, of the clipped slide is red under `author` and the slide's own
// background under `reader`.

const LONG = Array.from({ length: 14 }, (_, i) => `- item ${i + 1}: a long line of text that keeps going so the slide holds far too much to fit`).join('\n');
const DECK = `---\ntheme: indaco\n---\n\n# Fits\n\nA short slide.\n\n---\n\n# Overflows\n\n${LONG}\n`;

/** The left-edge, mid-height pixel of a PNG, decoded in the page. */
async function leftEdge(page: import('@playwright/test').Page, png: Buffer): Promise<[number, number, number]> {
	return page.evaluate(async (b64) => {
		const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
		const bmp = await createImageBitmap(blob);
		const c = new OffscreenCanvas(bmp.width, bmp.height);
		const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
		ctx.drawImage(bmp, 0, 0);
		const d = ctx.getImageData(1, Math.floor(bmp.height / 2), 1, 1).data;
		return [d[0], d[1], d[2]] as [number, number, number];
	}, png.toString('base64'));
}

const isAuthorRed = ([r, g, b]: [number, number, number]) => r > 180 && g < 100 && b < 80;

async function exportOverflowDeck(page: import('@playwright/test').Page, format: 'pdf' | 'images' | 'pptx') {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('# Overflows');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, format);
	return (await download).path();
}

test('the Studio images export shows no authoring ring on a clipped slide', async ({ page }) => {
	test.setTimeout(300_000);
	const zip = await JSZip.loadAsync(fs.readFileSync(await exportOverflowDeck(page, 'images')));
	const slide = Object.keys(zip.files).filter((n) => /slides\/.*-02\.png$/.test(n))[0];
	expect(slide, 'the clipped slide is in the zip').toBeTruthy();
	const px = await leftEdge(page, Buffer.from(await zip.files[slide].async('uint8array')));
	expect(isAuthorRed(px), `left edge ${px} is the author ring`).toBe(false);
});

test('the Studio PowerPoint export shows no authoring ring on a clipped slide', async ({ page }) => {
	test.setTimeout(300_000);
	const zip = await JSZip.loadAsync(fs.readFileSync(await exportOverflowDeck(page, 'pptx')));
	const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/image-2-.*\.png$/.test(n))[0];
	expect(media, 'the clipped slide picture is in the deck').toBeTruthy();
	const px = await leftEdge(page, Buffer.from(await zip.files[media].async('uint8array')));
	expect(isAuthorRed(px), `left edge ${px} is the author ring`).toBe(false);
});

test('the Studio PDF export shows no authoring ring on a clipped slide', async ({ page }) => {
	test.setTimeout(300_000);
	try {
		execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
	} catch {
		test.skip(true, 'pdftoppm (poppler-utils) is not installed; the images and PowerPoint arms cover the same capture frame');
	}
	const file = await exportOverflowDeck(page, 'pdf');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-pdf-marker-'));
	execFileSync('pdftoppm', ['-r', '50', '-f', '2', '-l', '2', '-png', file, path.join(dir, 'page')]);
	const png = fs.readdirSync(dir).find((n) => n.endsWith('.png'));
	expect(png, 'pdftoppm wrote page 2').toBeTruthy();
	const px = await leftEdge(page, fs.readFileSync(path.join(dir, png as string)));
	expect(isAuthorRed(px), `left edge ${px} is the author ring`).toBe(false);
});
