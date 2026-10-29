import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// The embedded checks plugin's full form (`@check{pass, label=Residency}`) in Compose: the span opens the plugin-kind panel
// drawn from the check's own slot (lib/plugins/checks/checks.inline.js SPEC), and a pick writes only what it changed.
// engineering/decisions/2026-10-18-checks.md §18.

const DECK = ['<!-- _class: content -->', '', '## Vendor review', '', 'Residency is `@check{pass, label=Residency}` today.', '', 'Closing words.'].join('\n');

const panel = (page: Page) => page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').last();

test.describe('a check in Compose', () => {
	test('@crosswidth @gecko @webkit-tablet `@check{…}` opens its panel, and a pick changes only the answer or the label', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: /^Edit check pass/ }).click();
		await expect(panel(page).getByRole('textbox', { name: 'Label' })).toHaveValue('Residency');
		await expect(panel(page).getByRole('radio', { name: /Answer: Pass/i })).toHaveAttribute('aria-checked', 'true');
		await panel(page).getByRole('radio', { name: /Answer: Fail/i }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('@check{pass, label=Residency}', '@check{fail, label=Residency}'));
		const label = panel(page).getByRole('textbox', { name: 'Label' });
		await label.fill('Audit, EU');
		await label.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('@check{pass, label=Residency}', '@check{fail, label="Audit, EU"}'));
	});
});
