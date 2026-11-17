import { expect, test } from '@playwright/test';
import { motionSettled } from './barriers';
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

// A setting change raises an Undo toast at the foot of a phone screen, and the next picker opened while it is up used
// to open UNDER it: a tap on a row the toast covered went to the toast, closed the list and chose nothing (and could
// land on Undo). Measured at 390px: "Logo style · Undo" at y 770–828 over the color list's "Accent + ink" at 788–820.
// The open list now sits above the toaster (components/ui/select.tsx).
test('@mobile a tap on a picker row the Undo toast would cover chooses that row', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await waitForStudioPaint(page);
	await setEditorContent(page, DECK);
	await page.setViewportSize({ width: 390, height: 844 });
	await openDeckSettingsAt(page, 390);
	await openSection(page, CHROME.deckTab.chrome);
	const source = async () => JSON.parse(await persistedSource(page)) as string;

	await page.getByRole('combobox', { name: 'Choose logo position' }).click();
	await page.getByRole('option', { name: 'Bottom center' }).click();
	await expect.poll(() => source()).toContain('logo-finish: bottom-center');
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Undo' });
	await expect(toast).toBeVisible();

	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	const list = page.locator('[data-slot="select-content"]');
	await expect(list).toBeVisible();
	await motionSettled(page, '[data-slot="select-content"]');
	// A point inside both the toast and a row of the open list: the overlap this test exists for. Asserted, so the test
	// cannot pass by the toast having moved out of the way.
	const at = await page.evaluate(() => {
		const t = [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].find((e) => e.textContent?.includes('Undo'))?.getBoundingClientRect();
		const vp = document.querySelector<HTMLElement>('[data-radix-select-viewport]')?.getBoundingClientRect();
		if (!t || !vp) return null;
		for (const row of document.querySelectorAll<HTMLElement>('[data-radix-select-viewport] [role="option"]')) {
			const r = row.getBoundingClientRect();
			const top = Math.max(r.top, t.top, vp.top);
			const bottom = Math.min(r.bottom, t.bottom, vp.bottom);
			if (bottom - top >= 8) return { name: row.textContent?.trim() ?? '', x: Math.max(r.left, t.left) + 12, y: (top + bottom) / 2 };
		}
		return null;
	});
	expect(at, 'no row of the open list sits under the Undo toast').not.toBeNull();
	if (!at) return;
	await page.mouse.click(at.x, at.y);
	await expect(list).toBeHidden();
	// Every row under the toast is a color, not the default, so the pick adds a word to the one line.
	await expect.poll(() => source(), { message: `the tap on "${at.name}" did not choose it` }).toMatch(/logo-finish: "bottom-center [a-z-]+"/);
});
