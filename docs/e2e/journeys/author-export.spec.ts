import { currentSlide, expect, gotoStudio, railButtons, setEditorContent, test, toastText } from '../studio-fixture';

// Journey: author → export. Draft a deck, then hand it off through Share. The
// oracle is the ARTIFACT: a real browser download (the exporter's Blob anchor)
// plus the "ready" toast — never a silent no-op. PDF exercises the full image
// pipeline (engine render of every slide → 2× raster → PDF bytes); Markdown
// exercises the source handoff with the theme embedded.

// The download wait needs real room: the config's 60s test timeout also pays
// for beforeEach (goto + authoring + the Share dialog), and the PDF raster is
// the slowest client-side pipeline the suite drives.
test.describe.configure({ timeout: 120_000 });

const DECK = [
	'<!-- _class: title -->\n\n# Atlas expansion plan\n\n`Growth · FY27`\n\nThree markets, one playbook.',
	'<!-- _class: big-number -->\n\n`The headline`\n\n- 3\n  - new markets entered with the same core platform.',
	'<!-- _class: closing -->\n\n## Approve the Atlas budget and we ship Q1.\n\n`The ask`',
].join('\n\n---\n\n');

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	// The preview follows the caret to the last edited slide — return to slide 1.
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Atlas expansion plan');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('a drafted deck exports to a PDF artifact', async ({ page }) => {
	// The download is the artifact; the toast is the app's own claim. Require BOTH
	// so a fabricated toast or a stray download can't pass alone.
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^PDF/ }).click();
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
	// The default workspace setting is LOSSLESS: page images embed as PNG
	// (Flate), never JPEG (DCT) — the fast format is strictly opt-in below.
	const fs = await import('node:fs');
	const bytes = fs.readFileSync((await d.path()) as string).toString('latin1');
	expect(bytes.includes('/DCTDecode')).toBe(false);
});

test('the Workspace "Fast (JPEG)" preference switches the PDF page images to DCT', async ({ page }) => {
	// Flip the persisted workspace setting exactly the way the General tab
	// writes it, then assert on the ARTIFACT: the exported PDF's page images
	// are JPEG (DCTDecode) instead of PNG (Flate).
	await page.evaluate(() => {
		const KEY = 'lattice-studio-settings';
		const cur = JSON.parse(window.localStorage.getItem(KEY) || '{}');
		window.localStorage.setItem(KEY, JSON.stringify({ ...cur, pdfPages: 'jpeg' }));
	});
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^PDF/ }).click();
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
	const fs = await import('node:fs');
	const bytes = fs.readFileSync((await d.path()) as string).toString('latin1');
	expect(bytes.includes('/DCTDecode')).toBe(true);
});

test('a drafted deck exports its Markdown source', async ({ page }) => {
	const download = page.waitForEvent('download');
	// /^Markdown/ avoids the "Print source … the Markdown" row.
	await page.getByRole('dialog').getByRole('button', { name: /^Markdown/ }).click();
	expect((await download).suggestedFilename()).toMatch(/\.md$/);
	await expect(toastText(page)).toContainText('Markdown ready.');
});
