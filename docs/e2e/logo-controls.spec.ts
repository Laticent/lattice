import { expect, test } from '@playwright/test';
import { CHROME, gotoStudio, openDeckSettingsAt, openSection, persistedSource, setEditorContent, waitForStudioPaint } from './studio-fixture';

// Studio → Chrome → Logo: Position, Color, Size and Show on all write ONE `logo-finish:` line, and the
// Position row says which chrome the berth hides. The engine side is covered in
// test/unit/parsing/markdown-it-plugins.test.js; this pins the Inspector's writes.

const DECK = '---\nmarp: true\ntheme: indaco\nlogo: lattice\n---\n\n# Logo controls\n\nBody\n';

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
	await position.click();
	await page.getByRole('option', { name: 'Bottom center' }).click();
	await expect.poll(() => source()).toContain('logo-finish: bottom-center');
	await expect(page.getByText('Hides the footer text.')).toBeVisible();

	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	await page.getByRole('option', { name: 'Accent + ink' }).click();
	await expect.poll(() => source()).toContain('logo-finish: "bottom-center accent-ink"');

	await page.getByRole('combobox', { name: 'Choose logo size' }).click();
	await page.getByRole('option', { name: 'Large' }).click();
	await expect.poll(() => source()).toContain('logo-finish: "bottom-center accent-ink lg"');

	// Back to defaults: the key goes, so a default deck stays one line shorter.
	await page.getByRole('combobox', { name: 'Choose logo position' }).click();
	await page.getByRole('option', { name: 'Auto — Top right', exact: true }).click();
	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	await page.getByRole('option', { name: 'Auto — Watermark' }).click();
	await page.getByRole('combobox', { name: 'Choose logo size' }).click();
	await page.getByRole('option', { name: 'Auto — Medium' }).click();
	await expect.poll(() => source()).not.toContain('logo-finish');

	await page.screenshot({ path: testInfo.outputPath(`logo-controls-${label}.png`) });
});
}
