import type { Page } from '@playwright/test';
import { insertVia, openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// A note edits in its panel, and the Insert menu's Motion item opens the Library on its scenes.
// followups.d/2846-p5; engineering/decisions/2026-10-21-compose-point-and-click.md §7.

const DECK = ['<!-- _class: content -->', '', '## Plan', '', 'First paragraph.', '', '<!-- say: the slide reads as this. -->', '', '<!-- a plain note. -->', '', 'Second paragraph.'].join('\n');

const pill = (page: Page, name: RegExp) => page.locator('.cs-host .cs-comment', { hasText: name });

test.describe('notes and motion in Compose', () => {
	test('@crosswidth @gecko @webkit-tablet a note edits in place and keeps the bytes around its words', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /say/).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		const field = page.getByRole('textbox', { name: 'say text' });
		await expect(field).toHaveValue('the slide reads as this.');
		// Opened and left: nothing is written.
		await field.press('Escape');
		expect(await savedDeck(page)).toBe(DECK);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await field.fill('it reads as that.');
		await field.press('ControlOrMeta+Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
		// A note that would end its own comment is refused, with the words kept.
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await field.fill('bad --> <b>');
		await field.press('ControlOrMeta+Enter');
		await expect(page.getByRole('alert').filter({ hasText: 'end its comment early' })).toBeVisible();
		await expect(field).toHaveValue('bad --> <b>');
		expect(await savedDeck(page)).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
	});

	test('@crosswidth @gecko @webkit-tablet the Insert menu has a Motion item that opens the Library on its scenes', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByText('First paragraph.').click();
		await insertVia(page, 'Motion');
		// Motion lives in the Design section; the Library opens on it.
		await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
	});
});
