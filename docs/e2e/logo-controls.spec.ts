import { expect, type Page, test } from '@playwright/test';
import { motionSettled } from './barriers';
import { CHROME, gotoStudio, openDeckSettingsAt, openSection, persistedSource, setEditorContent, waitForStudioPaint } from './studio-fixture';

// Studio → Chrome → Logo: Position, Color, Size and Show on all write ONE `logo-finish:` line, and the
// Position row says which chrome the berth hides. The engine side is covered in
// test/unit/parsing/markdown-it-plugins.test.js; this pins the Inspector's writes.

const DECK = '---\nmarp: true\ntheme: indaco\nlogo: lattice\n---\n\n# Logo controls\n\nBody\n';

/**
 * Open a picker and choose a row, with the row already on screen and the list at rest when the click is sent. A row
 * below the list's fold made Playwright's click scroll the list first, and an item-aligned Radix list answers that
 * scroll by growing and resetting its own scroll on the next frame. A click aimed before that and pressed after it
 * hit the row next door: a 390px trace aimed at y 757, and the passing runs show the row moving to 781. Scrolling the
 * row into view as its own step, then letting the list settle, means the click itself never scrolls.
 */
async function choose(page: Page, picker: string, row: string, exact = false) {
	await page.getByRole('combobox', { name: picker }).click();
	const list = '[data-slot="select-content"]';
	await motionSettled(page, list);
	const option = page.getByRole('option', { name: row, exact });
	await option.scrollIntoViewIfNeeded();
	await motionSettled(page, list);
	await option.click();
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
test(`@crosswidth Logo controls write one logo-finish line at ${label} (${width}px)`, async ({ page }, testInfo) => {
	// Authored at desktop width, where the editor pane is mounted, then resized to the width under test.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await waitForStudioPaint(page);
	await setEditorContent(page, DECK);
	await page.setViewportSize({ width, height });
	await openDeckSettingsAt(page, width);
	await openSection(page, CHROME.deckTab.chrome);

	const source = async () => JSON.parse(await persistedSource(page)) as string;
	// The persisted source, not the editor: at 390px the editor pane is swapped out while settings are open.
	const position = page.getByRole('combobox', { name: 'Choose logo position' });
	await expect(position).toContainText('Top right');
	await choose(page, 'Choose logo position', 'Bottom center');
	await expect.poll(() => source()).toContain('logo-finish: bottom-center');
	await expect(page.getByText('Hides the footer text.')).toBeVisible();

	await choose(page, 'Choose logo color', 'Accent + ink');
	await expect.poll(() => source()).toContain('logo-finish: "bottom-center accent-ink"');

	await choose(page, 'Choose logo size', 'Large');
	await expect.poll(() => source()).toContain('logo-finish: "bottom-center accent-ink lg"');

	// Back to defaults: the key goes, so a default deck stays one line shorter.
	await choose(page, 'Choose logo position', 'Auto — Top right', true);
	await choose(page, 'Choose logo color', 'Auto — Watermark');
	await choose(page, 'Choose logo size', 'Auto — Medium');
	await expect.poll(() => source()).not.toContain('logo-finish');

	await page.screenshot({ path: testInfo.outputPath(`logo-controls-${label}.png`) });
});
}

