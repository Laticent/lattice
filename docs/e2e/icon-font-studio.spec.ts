import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

// Icons as a font on the REAL Studio (engineering/decisions/2026-11-01-icon-font.md): the live preview draws each icon
// as a Lattice Icons glyph (its `::before`, from `data-glyph`) in our font, not a fallback; Share → PDF embeds the face,
// an editable PowerPoint draws the icon as a native shape, and Share → Webpage carries the face and draws the glyph in it.
// Under `font-embedding: system-emoji` no export carries it, since no machine has our icons: the PDF draws each icon's <svg>, and
// so does the webpage. FALSIFIABLE: with the face not staged, no Lattice Icons face loads (a `document.fonts` entry,
// not `fonts.check`, which says yes when no face of the family exists at all) and no export finds it to embed; with the
// webpage's switch lost, its glyphs show in no font. Needs poppler.
test.describe.configure({ timeout: 300_000 });

const BODY = '## Icons\n\nStorage `^{database, c3}` and `{S3, icon=bucket, c4}` done.\n';

/** True when the glyph's `::before` asks for Lattice Icons and a face of that family has LOADED in its document. */
async function drawnInOurFace(el: Element): Promise<boolean> {
	const doc = el.ownerDocument;
	await doc.fonts.ready;
	const asks = getComputedStyle(el, '::before').fontFamily.includes('Lattice Icons');
	return asks && [...doc.fonts].some((f) => f.family.replace(/["']/g, '') === 'Lattice Icons' && f.status === 'loaded');
}

/** The pictures of a PDF's first page as gray pixels, via poppler. */
function pixelsOf(pdf: string) {
	const stem = pdf.replace(/\.pdf$/, '');
	execFileSync('pdftoppm', ['-gray', '-r', '96', '-f', '1', '-l', '1', '-singlefile', pdf, stem]);
	const buf = readFileSync(`${stem}.pgm`);
	const head = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/) as RegExpMatchArray;
	return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

async function download(page: Page, format: 'pdf' | 'pptx' | 'html'): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	if (format === 'html') {
		await dialog.getByRole('button', { name: /Webpage/ }).click();
		const dl = page.waitForEvent('download', { timeout: 240_000 });
		await dialog.getByRole('button', { name: /Download webpage/ }).click();
		const file = join(mkdtempSync(join(tmpdir(), 'icon-font-')), 'deck.html');
		writeFileSync(file, readFileSync((await (await dl).path()) as string));
		await page.keyboard.press('Escape');
		return file;
	}
	if (format === 'pptx') {
		await dialog.getByRole('button', { name: /^PowerPoint/ }).click();
		const editable = dialog.getByRole('switch', { name: 'Editable text' });
		if ((await editable.getAttribute('aria-checked')) !== 'true') await editable.click();
	}
	const dl = page.waitForEvent('download', { timeout: 240_000 });
	if (format === 'pdf') await shareExport(page, 'pdf');
	else await dialog.getByRole('button', { name: /^Download PowerPoint/ }).click();
	const file = join(mkdtempSync(join(tmpdir(), 'icon-font-')), `deck.${format}`);
	writeFileSync(file, readFileSync((await (await dl).path()) as string));
	await page.keyboard.press('Escape');
	return file;
}

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`the Studio draws icons in the Lattice Icons font and every export carries it${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, `---\ntheme: indaco\n---\n\n${BODY}`);
		const frame = livePreview(page);
		const glyph = frame.locator('.lat-icon-glyph > [data-glyph]').first();
		await expect(glyph).toBeVisible();
		// The preview draws the glyph in our face: it loaded, and it is the face the `::before` asks for.
		await expect
			.poll(() => glyph.evaluate(drawnInOurFace))
			.toBe(true);
		await expect(frame.locator('.lat-icon-svg').first()).toBeHidden();

		const pdf = await download(page, 'pdf');
		expect(execFileSync('pdffonts', [pdf], { encoding: 'utf8' })).toMatch(/LatticeIcons/);
		// An editable PowerPoint always draws each icon as a native outline shape (lib/core/office-icons.js): apps that
		// ignore embedded fonts (Google Slides, iPhone Preview) cannot draw the glyph.
		const { default: JSZip } = await import('jszip');
		const slideOf = async (file: string) => (await JSZip.loadAsync(readFileSync(file))).file('ppt/slides/slide1.xml')?.async('string');
		const shapes = await slideOf(await download(page, 'pptx'));
		expect(shapes).not.toMatch(/typeface="Lattice Icons/);
		expect(shapes?.match(/<a:custGeom>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
	});

	test(`under font-embedding: system-emoji the Studio's exports carry no icon font and draw the svg${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, `---\ntheme: indaco\nfont-embedding: system-emoji\n---\n\n${BODY}`);
		await expect(livePreview(page).locator('.lat-icon').first()).toBeVisible();
		const pdf = await download(page, 'pdf');
		expect(execFileSync('pdffonts', [pdf], { encoding: 'utf8' })).not.toMatch(/LatticeIcons/);
		// The icon is still on the page, drawn by its <svg>: the page is the `icon: svg` page.
		await setEditorContent(page, `---\ntheme: indaco\nicon: svg\n---\n\n${BODY}`);
		const svgPdf = await download(page, 'pdf');
		const a = pixelsOf(svgPdf);
		const b = pixelsOf(pdf);
		expect([b.w, b.h]).toEqual([a.w, a.h]);
		let off = 0;
		for (let i = 0; i < a.px.length; i++) if (Math.abs(a.px[i] - b.px[i]) > 24) off++;
		expect(off / a.px.length, `${off} pixels differ from the icon: svg page`).toBeLessThan(0.001);
	});

	test(`Share → Webpage draws icons in the Lattice Icons face it carries, and its <svg> under font-embedding: system-emoji${tag}`, async ({ page, context }) => {
		const open = async (file: string) => {
			const p = await context.newPage();
			await p.goto(pathToFileURL(file).href);
			const glyph = p.locator('section .lat-icon-glyph > [data-glyph]').first();
			await glyph.waitFor({ state: 'attached' });
			return { p, glyph };
		};
		await gotoStudio(page);
		await setEditorContent(page, `---\ntheme: indaco\n---\n\n${BODY}`);
		await expect(livePreview(page).locator('.lat-icon').first()).toBeVisible();
		const font = await open(await download(page, 'html'));
		await expect(font.glyph).toBeVisible();
		await expect.poll(() => font.glyph.evaluate(drawnInOurFace)).toBe(true);
		await expect(font.p.locator('section .lat-icon-svg').first()).toBeHidden();
		await font.p.close();

		await setEditorContent(page, `---\ntheme: indaco\nfont-embedding: system-emoji\n---\n\n${BODY}`);
		const system = await open(await download(page, 'html'));
		await expect(system.glyph).toBeHidden();
		await expect(system.p.locator('section .lat-icon-svg').first()).toBeVisible();
		await system.p.close();
	});
}
