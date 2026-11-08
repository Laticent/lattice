import { currentSlide, expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// Speaker notes in the Studio's office export (#1833, the owner's ruling of 2026-11-08): notes ride
// by default, and "Strip speaker notes" leaves every notes pane empty. The oracle is the ARTIFACT,
// a real download: the note's text is searched for in every part of the zip, not only the notes
// slides, so a copy that lands anywhere else is caught too.

test.describe.configure({ timeout: 180_000 });

const SENTINEL = 'NOTE-SENTINEL-1833';
const DECK = [
	'# Atlas expansion plan\n\nThree markets, one playbook.',
	`## Why now\n\n- Demand is already there.\n\n<!-- ${SENTINEL} keep the layoffs out of this -->`,
].join('\n\n---\n\n');

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(2);
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Atlas expansion plan');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

async function exportPptx(page: import('@playwright/test').Page, { strip }: { strip: boolean }) {
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^PowerPoint/ }).click();
	await dialog.getByRole('switch', { name: 'Editable text' }).click();
	const stripSwitch = dialog.getByRole('switch', { name: 'Strip speaker notes' });
	await expect(stripSwitch).toHaveAttribute('aria-checked', 'false');
	if (strip) {
		await stripSwitch.click();
		await expect(stripSwitch).toHaveAttribute('aria-checked', 'true');
	}
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await dialog.getByRole('button', { name: /^Download PowerPoint/ }).click();
	const fs = await import('node:fs');
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync((await (await download).path()) as string));
	const hits: string[] = [];
	for (const name of Object.keys(zip.files)) {
		if (zip.files[name].dir) continue;
		if ((await zip.file(name)!.async('string')).includes(SENTINEL)) hits.push(name);
	}
	return hits;
}

test('@gecko @webkit-tablet an editable PowerPoint carries the speaker note in its notes pane by default', async ({ page }) => {
	const hits = await exportPptx(page, { strip: false });
	expect(hits.some((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)), `note found in: ${hits.join(', ')}`).toBe(true);
});

test('@gecko @webkit-tablet "Strip speaker notes" leaves the note out of every part of the PowerPoint file', async ({ page }) => {
	expect(await exportPptx(page, { strip: true })).toEqual([]);
});
