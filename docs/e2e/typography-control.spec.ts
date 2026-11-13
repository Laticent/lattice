import { expect, gotoStudio, openDeckSettingsAt, persistedSource, setEditorContent, test } from './studio-fixture';

// DECK SETTINGS → LOOK → TYPOGRAPHY, ON THE REAL STUDIO AT ALL THREE SHIPPED WIDTHS.
//
// `typography:` (lib/core/resolve-typography.js) picks one curated type set. The control reads
// the deck's set, a preset's included, and writes the line through the preset-aware helpers in
// src/components/studio/typography.ts: picking the set the preset already gives drops the line.
// Each width saves a screenshot of the open control under .scratch/shots/ for the PR's evidence.

const deck = (fm = '') =>
	`---\nmarp: true\ntheme: indaco\n${fm}header: "Type sets"\n---\n\n` + '`Revenue · Part two`\n\n## Three segments carried the quarter\n\n- Enterprise grew 18%\n- Mid-market held flat\n';
const live = (page: import('@playwright/test').Page) => page.frameLocator('[aria-label="Live deck preview"] iframe.live');

// The tablet and phone cases also run on real WebKit (iPad, iPhone): `@crosswidth` keeps them on desktop too. The
// desktop case also runs on Firefox (`@gecko`): the font files a set loads are fetched by each engine on its own.
for (const [label, width, height, tag] of [
	['desktop', 1440, 900, ' @gecko'],
	['tablet', 820, 1180, ' @crosswidth @webkit-tablet'],
	['mobile', 390, 844, ' @crosswidth @webkit-phone'],
] as const) {
	test(`Look → Typography writes typography: and restyles the slide (${label})${tag}`, async ({ page }) => {
		test.setTimeout(90_000);
		// The editor is not on screen at phone width, so the deck goes in at desktop width first.
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await setEditorContent(page, deck());
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		const control = page.getByRole('combobox', { name: 'Choose deck typography' });
		await control.scrollIntoViewIfNeeded();
		await expect(control).toContainText('Classic');
		await control.click();
		await page.screenshot({ path: `../.scratch/shots/typography-${label}-open.png` });
		await page.getByRole('option', { name: /^Ledger/ }).click();
		await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).toContain('typography: ledger');
		await expect
			.poll(async () => await live(page).locator('section[data-lattice-slide] h2').first().evaluate((h) => getComputedStyle(h).fontFamily), { timeout: 20_000 })
			.toContain('Newsreader');
		await page.screenshot({ path: `../.scratch/shots/typography-${label}-ledger.png` });
		// Back to Classic: the default writes no line.
		await control.click();
		await page.getByRole('option', { name: /^Auto — Classic/ }).click();
		await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).not.toContain('typography:');
	});
}

test('a preset carries its set; picking the preset\'s own set writes no line', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck('preset: editorial\n'));
	await openDeckSettingsAt(page, 1440);
	const control = page.getByRole('combobox', { name: 'Choose deck typography' });
	await expect(control).toContainText('Ledger');
	await control.click();
	await page.getByRole('option', { name: /^Poster/ }).click();
	await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).toContain('typography: poster');
	await control.click();
	await page.getByRole('option', { name: /^Auto — Ledger/ }).click();
	await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).not.toContain('typography:');
});
