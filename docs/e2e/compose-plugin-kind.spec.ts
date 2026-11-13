import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { chipZip } from './plugin-fence-fixture';
import { expect, gotoStudio, test } from './studio-fixture';

// An installed plugin's inline kind (`@tag-chip{Label, hot}`) opens a panel drawn from its manifest's slot in Compose, and a pick
// writes only the word it changed. followups.d/2846-p4; engineering/decisions/2026-10-21-compose-point-and-click.md §4.

const DECK = ['<!-- _class: content -->', '', '## Launch', '', 'The launch is `@tag-chip{Launch, hot}` this week.', '', 'Closing words.'].join('\n');

const panel = (page: Page) => page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').last();

/** A second kind in the same plugin that declares NO slot: Compose edits its record as one line (2026-10-14-plugin-inline-door.md §4.5). */
const STAMP = { stamp: { title: 'Stamp', placeholder: { size: 'sm' } } };

async function installChipPlugin(page: Page): Promise<void> {
	// Install wide on every project (the `mobile` project opens at 390px): the Library button is docked at this width.
	// The project's own size comes back afterwards, so the panel is driven at 390 and 820 too, not at 1440 three times.
	const own = page.viewportSize();
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'chip-plugin.zip', mimeType: 'application/zip', buffer: await chipZip(undefined, undefined, STAMP) });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await page.keyboard.press('Escape');
	if (own) await page.setViewportSize(own);
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

	test('@crosswidth @gecko @webkit-tablet @webkit-phone a kind with no slot opens a panel on its record, and a change writes the call whole', async ({ page }, info) => {
		const deck = DECK.replace('`@tag-chip{Launch, hot}`', '`@stamp{Approved, Q3}`');
		await installChipPlugin(page);
		await openDeckInCompose(page, deck);
		await page.getByRole('button', { name: 'Edit Stamp' }).click();
		const record = panel(page).getByRole('textbox', { name: 'Record' });
		await expect(record).toHaveValue('Approved, Q3');
		// On a phone the panel is a sheet that slides up: the evidence is taken once the field is on screen, not mid-slide.
		await expect(record).toBeInViewport();
		await page.screenshot({ path: info.outputPath(`stamp-panel-${info.project.name}.png`) });
		await record.fill('Rejected, Q4');
		await record.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(deck.replace('@stamp{Approved, Q3}', '@stamp{Rejected, Q4}'));
		// A record that would end the call early is refused, and the deck keeps the last good one.
		await record.fill('a} and {b');
		await record.press('Enter');
		await expect(panel(page).getByRole('alert')).toContainText('cannot be written');
		expect(await savedDeck(page)).toBe(deck.replace('@stamp{Approved, Q3}', '@stamp{Rejected, Q4}'));
	});
});
