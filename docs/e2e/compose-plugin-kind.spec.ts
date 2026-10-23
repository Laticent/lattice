import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { chipZip } from './plugin-fence-fixture';
import { expect, gotoStudio, test } from './studio-fixture';

// An installed plugin's inline kind (`@tag-chip{Label, hot}`) opens a panel drawn from its manifest's slot in Compose, and a pick
// writes only the word it changed. followups.d/2846-p4; engineering/decisions/2026-10-21-compose-point-and-click.md §4.

const DECK = ['<!-- _class: content -->', '', '## Launch', '', 'The launch is `@tag-chip{Launch, hot}` this week.', '', 'Closing words.'].join('\n');

const panel = (page: Page) => page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').last();

async function installChipPlugin(page: Page): Promise<void> {
	// Start wide on every project (the `mobile` project opens at 390px): the Library button is docked at this width.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'chip-plugin.zip', mimeType: 'application/zip', buffer: await chipZip() });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await page.keyboard.press('Escape');
}

test.describe('a plugin kind in Compose', () => {
	test('@crosswidth @gecko @webkit-tablet the span opens a panel from its slot, and a pick changes only that word', async ({ page }) => {
		// The plugin is kept in the browser, so the Studio opened for the deck below still has it.
		await installChipPlugin(page);
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: 'Edit Tag chip' }).click();
		await expect(panel(page).getByRole('textbox', { name: 'Label' })).toHaveValue('Launch');
		await expect(panel(page).getByRole('radio', { name: 'Tone: Hot' })).toHaveAttribute('aria-checked', 'true');
		await panel(page).getByRole('radio', { name: 'Tone: Cold' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('@tag-chip{Launch, hot}', '@tag-chip{Launch, cold}'));
		const label = panel(page).getByRole('textbox', { name: 'Label' });
		await label.fill('Pilot');
		await label.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('@tag-chip{Launch, hot}', '@tag-chip{Pilot, cold}'));
	});
});
