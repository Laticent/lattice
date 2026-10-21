import { closeInsertMenu, insertEntry, insertTrigger, insertVia, openDeckInCompose, openInsertMenu, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

/**
 * COMPOSE — the Insert menu, and the engine fences it writes.
 *
 * One door in the slide bar holds everything an author can put on a slide (docs/src/components/studio/InsertControls.tsx),
 * replacing four icon buttons that left no room for a fifth at 390px. The oracle is the PERSISTED SOURCE: the deck, byte for
 * byte, with one block added. Desktop only here; the phone is compose-objects-phone.spec.ts.
 * Design: engineering/decisions/2026-10-21-compose-point-and-click.md §5.
 */

const DECK = ['<!-- _class: content -->', '', '## Plan', '', 'Lead of the project.', '', '---', '', '<!-- _class: title -->', '', '# Hello', '', 'A subtitle line.'].join('\n');

test.describe('compose insert menu', () => {
	test('@smoke the menu names every thing an author can put on a slide, and the blocks it writes are tagged and ready to edit', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click();
		await openInsertMenu(page);
		for (const name of ['Table', 'Code', 'Diagram', 'Equation', 'Plot', 'Image', 'Pill', 'Spark', 'Avatar', 'Icon'] as const) await expect(insertEntry(page, name), name).toBeVisible();
		await closeInsertMenu(page);

		await insertVia(page, 'Diagram');
		await expect.poll(() => savedDeck(page)).toContain('Lead of the project.\n\n```mermaid\nflowchart LR\n  A[Plan] --> B[Build] --> C[Ship]\n```');
		// The starter is selected, so the first keystroke replaces it instead of adding to it.
		await page.keyboard.type('graph TD');
		await expect.poll(() => savedDeck(page)).toContain('```mermaid\ngraph TD\n```');
	});

	// Run under BOTH pointer states (`@parity`: the `*-touch` projects at 1440, 820 and 390px as well as `desktop`): the one Insert door
	// fits the slide bar at every width, opens with a tap, and its items are reachable and writable. Touch EMULATION in Chromium.
	test('@parity the Insert door fits the bar and writes a block by touch', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
		const para = page.locator('.cs-slide').first().locator('.cs-slide-content p').first();
		if (touch) await para.tap({ position: { x: 3, y: 8 } });
		else await para.click({ position: { x: 3, y: 8 } });
		const width = page.viewportSize()?.width ?? 0;
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		const door = await insertTrigger(page).boundingBox();
		expect((door?.x ?? 0) + (door?.width ?? 0)).toBeLessThanOrEqual(width);
		await insertVia(page, 'Equation', { tap: touch });
		await expect.poll(() => savedDeck(page)).toContain('Lead of the project.\n\n```math\nE = mc^2\n```');
	});

	test('Equation and Plot write their fences', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click();
		await insertVia(page, 'Equation');
		await expect.poll(() => savedDeck(page)).toContain('```math\nE = mc^2\n```');
		// The caret is in the new fence now, where a block cannot nest: the menu says so.
		await openInsertMenu(page);
		await expect(insertEntry(page, 'Plot')).toHaveAttribute('data-disabled', '');
		await expect(insertEntry(page, 'Plot')).toContainText('already in a code block');
		await closeInsertMenu(page);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click();
		await insertVia(page, 'Plot');
		await expect.poll(() => savedDeck(page)).toContain('```functionplot\n{ "data": [{ "fn": "x^2" }] }\n```');
	});

	test('a table does not suit a title slide: the menu says so instead of hiding the item', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		const title = page.locator('.cs-slide').nth(1);
		await title.locator('.cs-slide-content p').first().click();
		await openInsertMenu(page, { slide: title });
		await expect(insertEntry(page, 'Table')).toHaveAttribute('data-disabled', '');
		await expect(insertEntry(page, 'Table')).toContainText('does not suit this layout');
		await expect(insertEntry(page, 'Pill')).not.toHaveAttribute('data-disabled', '');
	});

	test('the keyboard reaches every item: Enter opens, the arrow keys move, Enter chooses, and focus goes back to the text', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click();
		await insertTrigger(page).focus();
		await page.keyboard.press('Enter');
		await insertEntry(page, 'Table').waitFor();
		// The first item has focus; the arrow keys walk down the list to Diagram. Each press waits for focus to move, as a typist's does.
		const focused = () => page.evaluate(() => document.activeElement?.textContent ?? '');
		for (let i = 0; i < 12; i++) {
			const before = await focused();
			if (before.startsWith('Diagram')) break;
			await page.keyboard.press('ArrowDown');
			await expect.poll(focused).not.toBe(before);
		}
		await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toMatch(/^Diagram/);
		await page.keyboard.press('Enter');
		await expect.poll(() => savedDeck(page)).toContain('```mermaid');
		await expect(page.locator('.cs-host .ProseMirror')).toBeFocused();
	});

	test('a locked slide gets no insert, and the menu names the reason on every item', async ({ page }) => {
		await openDeckInCompose(page, DECK.replace('Lead of the project.', 'Lead with ~~old~~ words.'));
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click();
		await openInsertMenu(page);
		for (const name of ['Table', 'Code', 'Diagram', 'Pill', 'Avatar'] as const) {
			await expect(insertEntry(page, name), name).toHaveAttribute('data-disabled', '');
			await expect(insertEntry(page, name), name).toContainText('edited in Markdown');
		}
	});
});
