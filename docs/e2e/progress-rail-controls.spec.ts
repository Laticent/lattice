import { expect, test } from '@playwright/test';
import { CHROME, gotoStudio, openDeckSettingsAt, openSection, persistedSource, setEditorContent, waitForStudioPaint } from './studio-fixture';

// Studio → Chrome → Section rail: Position and Style write ONE `progress-rail:` line
// (lib/core/resolve-progress-rail.js), the toggle writes its `off` word, and the editor completes
// each word. The engine side is test/unit/forms/progress-tile.test.js; this pins the Studio's writes.

const DECK = '---\nmarp: true\ntheme: indaco\nclass: no-progress\n---\n\n# Rail controls\n\n---\n\n<!-- _class: divider -->\n\n## One\n\n---\n\n## A slide\n\nBody\n\n---\n\n<!-- _class: divider -->\n\n## Two\n';

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth Section rail controls write one progress-rail line at ${label} (${width}px)`, async ({ page }, testInfo) => {
		// Authored at desktop width, where the editor pane is mounted, then resized to the width under test.
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await waitForStudioPaint(page);
		await setEditorContent(page, DECK);
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		await openSection(page, CHROME.deckTab.chrome);

		const source = async () => JSON.parse(await persistedSource(page)) as string;
		// The deck arrives with the OLD spelling, `class: no-progress`, which still reads as off.
		const toggle = page.getByRole('switch', { name: 'Section rail' });
		await expect(toggle).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByRole('combobox', { name: 'Choose section rail position' })).toHaveCount(0);
		// Turning it on clears the old spelling and writes nothing: on is the default.
		await toggle.click();
		await expect.poll(() => source()).not.toContain('no-progress');
		await expect.poll(() => source()).not.toContain('progress-rail');

		const position = page.getByRole('combobox', { name: 'Choose section rail position' });
		await expect(position).toContainText('Beside the page number');
		await position.click();
		await page.getByRole('option', { name: 'Right edge' }).click();
		await expect.poll(() => source()).toContain('progress-rail: edge');
		await expect(page.getByText('Upright on the right edge, mid-height.')).toBeVisible();

		await page.getByRole('combobox', { name: 'Choose section rail style' }).click();
		await page.getByRole('option', { name: 'Bar' }).click();
		await expect.poll(() => source()).toContain('progress-rail: "edge bar"');

		// Off is a word on the same line, so the placement and style survive a round trip.
		await toggle.click();
		await expect.poll(() => source()).toContain('progress-rail: "edge bar off"');
		await toggle.click();
		await expect.poll(() => source()).toContain('progress-rail: "edge bar"');

		await page.screenshot({ path: testInfo.outputPath(`progress-rail-controls-${label}.png`) });

		// Back to defaults: the key goes, so a default deck stays one line shorter.
		await page.getByRole('combobox', { name: 'Choose section rail position' }).click();
		await page.getByRole('option', { name: 'Auto — Beside the page number', exact: true }).click();
		await page.getByRole('combobox', { name: 'Choose section rail style' }).click();
		await page.getByRole('option', { name: 'Auto — Dots', exact: true }).click();
		await expect.poll(() => source()).not.toContain('progress-rail');
	});
}

test('the editor completes progress-rail: words, one per axis', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await waitForStudioPaint(page);
	// Typed, not inserted: completion activates on typing (`activateOnTyping`).
	await setEditorContent(page, '---\ntitle: Rail\n---\n');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('End');
	await page.keyboard.type('\nprogress-rail: e');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: 'edge' })).toBeVisible();
	await page.keyboard.press('Enter');
	// After a placement word, the next offer leaves the placement axis out.
	await page.keyboard.type(' ');
	await page.keyboard.press('Control+Space');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: 'bar' })).toBeVisible();
	await expect(menu.getByRole('option', { name: 'center' })).toHaveCount(0);
	await page.screenshot({ path: test.info().outputPath('progress-rail-complete.png') });
});
