import { currentSlide, expect, gotoStudio, railButtons, setEditorContent, test, toastText } from './studio-fixture';

// The Studio's Editable text export (PowerPoint and LibreOffice) runs the same capture the CLI does
// (`captureOfficeSlides`, docs/src/lib/calco/capture.ts). The oracle is the ARTIFACT, a real download:
// the text is live text in the file, slides that paint the same thing share one background, and the
// result is not one picture per slide.

test.describe.configure({ timeout: 180_000 });

const DECK = [
	'<!-- _class: title -->\n\n# Atlas expansion plan\n\n`Growth · FY27`\n\nThree markets, one playbook.',
	'## Why now\n\n- First\n  - Demand is already there.\n- Second\n  - The platform is ready.',
	'## What we ask\n\n- One\n  - Approve the budget.\n- Two\n  - Name an owner.',
].join('\n\n---\n\n');

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Atlas expansion plan');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

async function exportEditable(page: import('@playwright/test').Page, row: RegExp, confirm: RegExp) {
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: row }).click();
	const editable = dialog.getByRole('switch', { name: 'Editable text' });
	if ((await editable.getAttribute('aria-checked')) !== 'true') await editable.click();
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await dialog.getByRole('button', { name: confirm }).click();
	const d = await download;
	const fs = await import('node:fs');
	const { default: JSZip } = await import('jszip');
	return { name: d.suggestedFilename(), zip: await JSZip.loadAsync(fs.readFileSync((await d.path()) as string)) };
}

test('an editable PowerPoint export carries live text and shared backgrounds, not a picture per slide', async ({ page }) => {
	const { name, zip } = await exportEditable(page, /^PowerPoint/, /^Download PowerPoint/);
	expect(name).toMatch(/\.pptx$/);
	await expect(toastText(page)).toContainText('PowerPoint ready.');
	const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
	expect(slide1).toContain('Atlas expansion plan');
	// Slides 2 and 3 paint the same background, so they inherit one layout rather than each carrying a full-slide picture.
	const layouts = Object.keys(zip.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n));
	expect(layouts.length).toBeGreaterThan(1);
	const slide3 = await zip.file('ppt/slides/slide3.xml')!.async('string');
	const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
	const layoutOf = async (n: number) => (await zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)!.async('string')).match(/slideLayouts\/(slideLayout\d+)\.xml/)?.[1];
	expect(await layoutOf(2)).toBe(await layoutOf(3));
	expect(slide2).toContain('Why now');
	expect(slide3).toContain('What we ask');
	// The picture-only export names one full-slide image per slide; the editable one does not.
	const fullPictures = Object.keys(zip.files).filter((n) => /^ppt\/media\/image-\d+-1\.(png|jpe?g)$/.test(n));
	expect(fullPictures.length).toBeLessThan(3);
});

test('an editable LibreOffice export carries live text and master pages', async ({ page }) => {
	const { name, zip } = await exportEditable(page, /^LibreOffice/, /^Download LibreOffice/);
	expect(name).toMatch(/\.odp$/);
	const content = await zip.file('content.xml')!.async('string');
	expect(content).toContain('Atlas expansion plan');
	expect(content).toContain('Demand is already there.');
	const styles = await zip.file('styles.xml')!.async('string');
	expect((styles.match(/<style:master-page /g) || []).length).toBeGreaterThan(1);
});
