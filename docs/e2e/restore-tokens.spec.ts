import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, livePreview, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// The RESTORE tokens from the Studio's side: in a deck that moves the bar to the left, the slide
// panel's Bar placement offers Top as an ordinary choice, writes `spectrum-edge-top`, and the live
// preview draws that slide's bar back on top. The engine half is test/unit/core/restore-tokens-paths.test.js;
// this pins the surface an author uses.

const DECK = '---\ntitle: Restore\nspectrum-edge: left\nheadline: center\n---\n\n<!-- _class: content -->\n\n## One slide\n\nBody.\n';

async function choose(page: Page, label: string, option: string): Promise<void> {
	await page.getByRole('combobox', { name: label }).filter({ visible: true }).first().click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

/** The live preview's slide: its classes, and which edges carry a bar. */
const painted = (page: Page) =>
	livePreview(page)
		.locator('section')
		.first()
		.evaluate((s) => {
			const cs = getComputedStyle(s);
			return { classes: [...s.classList], top: Number.parseFloat(cs.borderTopWidth), left: Number.parseFloat(cs.borderLeftWidth) };
		});

for (const tag of ['', ' @webkit-tablet']) {
	test(`slide settings: Top restores the top bar inside a left-bar deck${tag}`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		// THE CONTROL: the deck's left bar is what the slide paints before any choice.
		await expect.poll(async () => (await painted(page)).classes).toContain('spectrum-edge-left');
		await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
		await openSection(page, 'Accent');
		// The head names what the slide inherits; the default is listed as a choice of its own.
		await expect(page.getByRole('combobox', { name: 'Bar placement' }).filter({ visible: true }).first()).toContainText('Auto — Left');
		await choose(page, 'Bar placement', 'Top');
		await expect.poll(() => persistedSource(page)).toContain('content spectrum-edge-top');
		await expect.poll(async () => (await painted(page)).classes).toContain('spectrum-edge-top');
		const after = await painted(page);
		expect(after.classes).not.toContain('spectrum-edge-left');
		expect(after.top).toBeGreaterThan(0);
		expect(after.left).toBe(0);
		// And Auto takes the token away again: the slide follows the deck's left bar.
		await choose(page, 'Bar placement', 'Auto — Left');
		await expect.poll(() => persistedSource(page)).not.toContain('spectrum-edge-top');
	});
}
