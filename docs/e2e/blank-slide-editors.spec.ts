import type { Page } from '@playwright/test';
import { buildDeckIndex } from '../src/lib/deck-outline/deck-outline';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

/**
 * A BLANK SLIDE through the Studio's editors, on the real Studio.
 *
 * `---` twice in a row is a slide to the engine and the PDF (followups.d/2789-p3, closed by #2803), so every
 * editor must keep it: Compose re-serializes the whole deck on each edit, and a deck rebuilt from a list that
 * skipped the blank slide would delete it from the source. These specs edit around a blank slide and read the
 * persisted source back through the same outline the editors index by.
 */

const COMPOSE = 'Compose — rich editor';
const BLANK = ['---', 'theme: indaco', '---', '', '# One', '', 'First body.', '', '---', '', '---', '', '# Three', '', 'Third body.', ''].join('\n');

/** The active deck's persisted source (JSON in localStorage, as compose-stress.spec.ts reads it). */
function activeSource(page: Page): Promise<string> {
	return page.evaluate(() => {
		const id = JSON.parse(window.localStorage.getItem('lattice-studio-active') ?? 'null')?.deckId;
		const raw = (id && window.localStorage.getItem(`lattice-studio-src-${id}`)) || '';
		try {
			const v = JSON.parse(raw);
			return typeof v === 'string' ? v : raw;
		} catch {
			return raw;
		}
	});
}
const units = async (page: Page) => buildDeckIndex(await activeSource(page)).units.length;

async function loadBlank(page: Page) {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, BLANK);
	await expect(railButtons(page)).toHaveCount(3, { timeout: 15_000 });
}

test('Compose shows the blank slide as a card and keeps it through an edit to the slide after it', async ({ page }) => {
	await loadBlank(page);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await expect(page.locator('.cs-slide')).toHaveCount(3);
	// Type at the end of slide 3's body: Compose re-serializes the deck from its cards.
	const third = page.locator('.cs-slide').nth(2).getByText('Third body.');
	await third.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' Edited.');
	await expect.poll(() => activeSource(page), { timeout: 10_000 }).toContain('Third body. Edited.');
	expect(await units(page), 'the blank slide was dropped from the source').toBe(3);
	await expect(railButtons(page)).toHaveCount(3);
	await expect(page.locator('.cs-slide')).toHaveCount(3);
});

test('the Markdown editor keeps the blank slide and the pills stay in step with it', async ({ page }) => {
	await loadBlank(page);
	await railButtons(page).nth(2).click();
	await expect(page.getByText('Slide 3 / 3', { exact: true })).toBeVisible();
	await railButtons(page).nth(1).click();
	await expect(page.getByText('Slide 2 / 3', { exact: true })).toBeVisible();
	expect(await units(page)).toBe(3);
});
