import { expect, gotoStudio, livePreview, railButtons, setEditorContent, test } from './studio-fixture';

// THE STUDIO'S INDEX THROUGH A SPLIT PANES SLIDE (docs/src/components/studio/pane-pages.ts).
//
// On a portrait deck the engine splits every panes slide into one slide per pane
// (lib/core/panes.js `installPaneSplit`), while the Studio counts the slides the author WROTE — its
// chunks feed write-back, so they are never cut. Before the map, the caret, the rail and lint were
// right in source terms and the preview was not: after the split it took its alignment fallback
// (the slide alone, numbered 1 of 1), and the panes slide itself only ever showed its first pane.
//
// This drives the real surface: the caret placed in the editor picks the rail slide, the preview
// shows that slide with the number the PDF gives it, a caret in the second pane shows the second
// page, and the ‹ › verbs step through the split. Both widths the Studio lays out differently.
const DECK = [
	'---',
	'theme: indaco',
	'size: 9:16',
	'paginate: true',
	'---',
	'',
	'# Opening',
	'',
	'---',
	'',
	'`Pipeline review · Q3`',
	'',
	'## EMEA carried the quarter while APAC held flat.',
	'',
	'<!-- panes: 35/65 -->',
	'<!-- pane: list -->',
	'',
	'- EMEA closed three late deals',
	'- APAC renewals slipped',
	'',
	'<!-- pane: table -->',
	'',
	'| Region | Q2 | Q3 |',
	'|---|---|---|',
	'| EMEA | 4.1 | 5.3 |',
	'| APAC | 2.8 | 2.8 |',
	'',
	'---',
	'',
	'## After the split',
	'',
	'The slide the caret moves to.',
	'',
	'---',
	'',
	'## Closing',
	'',
].join('\n');

/** Put the caret on the editor line holding `text`. */
async function caretOn(page: import('@playwright/test').Page, text: string) {
	await page.locator('.cm-line', { hasText: text }).first().click();
}

/** On a phone the editor and the preview are two panes: show the preview. */
async function showPreview(page: import('@playwright/test').Page, phone: boolean) {
	if (phone) await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
}
async function showSource(page: import('@playwright/test').Page, phone: boolean) {
	if (phone) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
}

/** A screenshot kept in the test's output dir — the evidence a reviewer opens. */
async function shot(page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo, name: string) {
	const path = info.outputPath(name);
	await page.screenshot({ path });
	return path;
}

for (const [width, height] of [
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${width}px`, () => {
		test.use({ viewport: { width, height } });
		const phone = width < 600;

		test('the caret on the slide after a split panes slide selects it, and the preview shows it', async ({ page }, info) => {
			await gotoStudio(page);
			await showSource(page, phone); // a phone boots on the preview pane
			await setEditorContent(page, DECK);
			await caretOn(page, 'The slide the caret moves to.');
			// The rail counts the slides the author wrote: the third of four.
			await expect(railButtons(page)).toHaveCount(4);
			await expect(railButtons(page).nth(2)).toHaveAttribute('aria-current', 'true');
			await showPreview(page, phone);
			const frame = livePreview(page);
			await expect(frame.locator('section').first()).toContainText('After the split');
			// …numbered as the PDF numbers it: the split made the panes slide two pages, so this is 4.
			await expect(frame.locator('section').first()).toHaveAttribute('data-lattice-pagination', '4');
			await info.attach(`after-split-${width}.png`, { path: await shot(page, info, `after-split-${width}.png`), contentType: 'image/png' });
		});

		test('a caret in the second pane shows the second page, and ‹ › step through the split', async ({ page }, info) => {
			await gotoStudio(page);
			await showSource(page, phone); // a phone boots on the preview pane
			await setEditorContent(page, DECK);
			await caretOn(page, '| EMEA | 4.1 | 5.3 |');
			await expect(railButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
			await showPreview(page, phone);
			const shown = livePreview(page).locator('section').first();
			await expect(shown).toContainText('4.1');
			await expect(shown).not.toContainText('EMEA closed three late deals');
			await expect(page.getByRole('status', { name: 'Page 3, 2 of 2 in this slide' })).toBeVisible();
			await info.attach(`second-pane-${width}.png`, { path: await shot(page, info, `second-pane-${width}.png`), contentType: 'image/png' });

			// The first pane's line brings the first page back.
			await showSource(page, phone);
			await caretOn(page, 'APAC renewals slipped');
			await showPreview(page, phone);
			await expect(shown).toContainText('EMEA closed three late deals');
			await expect(page.getByRole('status', { name: 'Page 2, 1 of 2 in this slide' })).toBeVisible();

			// "Next" spends the split's second page before it leaves the slide.
			await page.getByRole('button', { name: 'Next slide' }).first().click();
			await expect(shown).toContainText('4.1');
			await expect(railButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
			await page.getByRole('button', { name: 'Next slide' }).first().click();
			await expect(shown).toContainText('After the split');
			await expect(railButtons(page).nth(2)).toHaveAttribute('aria-current', 'true');
		});
	});
}
