import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// An outside change (here a deck rename, which rewrites the title heading) is shown in Compose: the line and the changed words are painted,
// then the paint removes itself, and the deck's bytes are the ones the change wrote. followups.d/2861-p3;
// engineering/decisions/2026-10-21-compose-point-and-click.md §8d.

const DECK = ['<!-- _class: content -->', '', '# Launch plan', '', 'The launch is on Monday.', '', 'Closing words.'].join('\n');
const RENAMED = DECK.replace('# Launch plan', '# Pilot plan');

/** Rename the active deck from the switcher: its button is named by the deck's title, and a phone shows no slide count beside it. */
async function rename(page: Page, from: string, to: string): Promise<void> {
	page.once('dialog', (d) => d.accept(to));
	await page.locator('header').getByRole('button', { name: new RegExp(`^${from}`) }).first().click();
	await page.getByRole('menuitem', { name: /^Rename/ }).click();
}

test.describe('an outside change shown in Compose', () => {
	test('@crosswidth the changed line and words are painted, fade, and leave the deck bytes alone', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		const block = page.locator('.cs-host .cs-flash-block');
		await expect(block).toHaveCount(1);
		await expect(block).toContainText('Pilot plan');
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveText('Pilot');
		// The paint is on screen with an accent rule on the leading edge, not a restyle of the words.
		const shadow = await block.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(shadow).not.toBe('none');
		await expect.poll(() => savedDeck(page)).toBe(RENAMED);
		// It removes itself when the fade ends (150 ms in, 1.2 s hold, 1.6 s out, plus the words' lag).
		await expect(block).toHaveCount(0, { timeout: 10_000 });
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveCount(0);
		expect(await savedDeck(page)).toBe(RENAMED);
	});

	test('with reduced motion the tint holds without a fade, then goes in one step', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		const block = page.locator('.cs-host .cs-flash-block');
		await expect(block).toHaveCount(1);
		expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
		expect(await block.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
		await expect(block).toHaveCount(0, { timeout: 5_000 });
		expect(await savedDeck(page)).toBe(RENAMED);
	});

	test('the shell\u2019s undo shows what it restored', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		await expect(page.locator('.cs-host .cs-flash-block')).toContainText('Pilot plan');
		await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
		await expect(page.locator('.cs-host .cs-flash-block')).toContainText('Launch plan');
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveText('Launch');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});
});
