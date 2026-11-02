import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

// Icons as a font on the REAL Studio (engineering/decisions/2026-11-01-icon-font.md): the live preview draws each icon
// as a Lattice Icons glyph (its `::before`, from `data-glyph`) in our font, not a fallback; Share → PDF embeds the face
// and an editable PowerPoint holds the icon as a run in it; under `fonts: system-emoji` neither carries it, since no
// machine has our icons. FALSIFIABLE: with the face not staged, the preview's glyph falls back (a font check fails) and
// no export finds the face to embed. Needs poppler.
test.describe.configure({ timeout: 300_000 });

const BODY = '## Icons\n\nStorage `^{database, c3}` and `{S3, icon=bucket, c4}` done.\n';

async function download(page: Page, format: 'pdf' | 'pptx'): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
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
			.poll(() => glyph.evaluate(async (el) => {
				await el.ownerDocument.fonts.ready;
				const ps = getComputedStyle(el, '::before');
				return ps.fontFamily.includes('Lattice Icons') && el.ownerDocument.fonts.check(`400 16px "Lattice Icons"`, el.getAttribute('data-glyph') || '');
			}))
			.toBe(true);
		await expect(frame.locator('.lat-icon-svg').first()).toBeHidden();

		const pdf = await download(page, 'pdf');
		expect(execFileSync('pdffonts', [pdf], { encoding: 'utf8' })).toMatch(/LatticeIcons/);
		const pptx = await download(page, 'pptx');
		const { default: JSZip } = await import('jszip');
		const slide = await (await JSZip.loadAsync(readFileSync(pptx))).file('ppt/slides/slide1.xml')?.async('string');
		expect(slide).toMatch(/typeface="Lattice Icons/);
	});

	test(`under fonts: system-emoji the Studio's exports carry no icon font and draw the svg${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, `---\ntheme: indaco\nfonts: system-emoji\n---\n\n${BODY}`);
		await expect(livePreview(page).locator('.lat-icon').first()).toBeVisible();
		const pdf = await download(page, 'pdf');
		expect(execFileSync('pdffonts', [pdf], { encoding: 'utf8' })).not.toMatch(/LatticeIcons/);
		// The icon is still on the page: its <svg> drew it, as vector paths or in the photo.
		const ink = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
		expect(ink).toContain('Storage');
	});
}
