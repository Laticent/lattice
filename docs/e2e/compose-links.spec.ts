import type { Page } from '@playwright/test';
import { insertVia, openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// Links in Compose, by pointing: the selection bar's Link button, a click on a link, and Insert → Link; and Insert → Check.
// engineering/decisions/2026-10-29-compose-links-markers-insert.md. Every write is held to the saved deck byte for byte.

const DECK = ['<!-- _class: content -->', '', '## Launch', '', 'Read the [launch notes](https://example.com/notes) before Friday.', '', 'The plan is ready.'].join('\n');

/** The saved deck with a typed trailing space's no-break space read as a space: the browser types one at a line end, before any link code runs. */
const saved = async (page: Page) => (await savedDeck(page)).replace(/\u00a0/g, ' ');

const panel = (page: Page) => page.locator('[data-link-panel]');
const address = (page: Page) => panel(page).getByRole('textbox', { name: 'Link address' });

/** Select `word` in the Compose text by double-clicking it. */
async function selectWord(page: Page, word: string): Promise<void> {
	await page.locator('.cs-host .ProseMirror').getByText(word, { exact: false }).first().waitFor();
	const box = await page.evaluate((w) => {
		const walker = document.createTreeWalker(document.querySelector('.cs-host .ProseMirror') as Node, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const i = n.textContent?.indexOf(w) ?? -1;
			if (i < 0) continue;
			const r = document.createRange();
			r.setStart(n, i);
			r.setEnd(n, i + w.length);
			const b = r.getBoundingClientRect();
			return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
		}
		return null;
	}, word);
	if (!box) throw new Error(`no ${word}`);
	await page.mouse.dblclick(box.x, box.y);
}

test.describe('links in Compose', () => {
	test('@crosswidth the selection bar makes a selected word a link, and a bare host gains https', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openDeckInCompose(page, DECK);
		await selectWord(page, 'plan');
		await page.getByRole('toolbar', { name: 'Text formatting' }).getByRole('button', { name: 'Link' }).click();
		await expect(address(page)).toBeFocused();
		await address(page).fill('example.org/plan');
		await address(page).press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('The plan is', 'The [plan](https://example.org/plan) is'));
		await expect(panel(page)).toHaveCount(0);
	});

	test('@crosswidth @gecko @webkit-tablet a click on a link shows its address; a new one changes only the address, and Remove keeps the words', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-host .ProseMirror a').first().click();
		await expect(address(page)).toHaveValue('https://example.com/notes');
		// The click leaves the caret in the text, not in the field.
		await expect(address(page)).not.toBeFocused();
		await address(page).fill('https://example.com/notes-v2');
		await panel(page).getByRole('button', { name: 'Done' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('notes)', 'notes-v2)'));
		await page.locator('.cs-host .ProseMirror a').first().click();
		await panel(page).getByRole('button', { name: 'Remove link' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('[launch notes](https://example.com/notes)', 'launch notes'));
	});

	test('an address a slide cannot carry is refused with the reason, and nothing is written', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-host .ProseMirror a').first().click();
		await address(page).fill('javascript:alert(1)');
		await address(page).press('Enter');
		await expect(panel(page).getByRole('alert')).toContainText('cannot link to a javascript: address');
		expect(await savedDeck(page)).toBe(DECK);
		await page.keyboard.press('Escape');
		await expect(panel(page)).toHaveCount(0);
		expect(await savedDeck(page)).toBe(DECK);
	});

	test('@crosswidth Insert → Link at an empty caret writes a word to type over and links it', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-host .ProseMirror p').filter({ hasText: 'The plan is ready.' }).click();
		await page.keyboard.press('End');
		await page.keyboard.type(' See ');
		await insertVia(page, 'Link');
		await expect(address(page)).toBeFocused();
		await address(page).fill('https://example.com/plan');
		await address(page).press('Enter');
		await expect.poll(() => saved(page)).toBe(DECK.replace('The plan is ready.', 'The plan is ready. See [link](https://example.com/plan)'));
	});
});

test.describe('Insert → Check', () => {
	test('@crosswidth writes the first answer at the caret and opens its panel', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-host .ProseMirror p').filter({ hasText: 'The plan is ready.' }).click();
		await page.keyboard.press('End');
		await page.keyboard.type(' ');
		await insertVia(page, 'Check');
		await expect.poll(() => saved(page)).toBe(DECK.replace('The plan is ready.', 'The plan is ready. `@check{pass}`'));
		await expect(page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').last().getByRole('radio').first()).toBeVisible();
	});
});
