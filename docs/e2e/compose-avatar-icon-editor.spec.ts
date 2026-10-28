import type { Page } from '@playwright/test';
import { insertVia, openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

/**
 * COMPOSE — the avatar and icon editors.
 *
 * Compose draws every avatar and icon as the slide draws it, as one inline object: a tap selects it and opens one editor, and each
 * pick rewrites ONLY the word the author changed (docs/src/lib/compose/inline-objects.ts, lib/core/segno-edit.js). The oracle is the
 * PERSISTED SOURCE, whole deck, byte for byte, with one substitution. The two promises that would hurt an author silently are an edit
 * that rewrites bytes it was not asked to touch and a deck that changes just because it was opened, so they carry `@smoke`.
 * Design: engineering/decisions/2026-10-21-compose-point-and-click.md §3.
 */

const DECK = ['<!-- _class: content -->', '', '## Team', '', 'Lead `!{Ada Okafor, c3}` works with `^{database, lg}` on the `{LIVE, c2}` store.', '', 'Plain line here.'].join('\n');

const editor = (page: Page) => page.locator('[data-slot="popover-content"]');
const avatarButton = (page: Page) => page.getByRole('button', { name: 'Edit avatar Ada Okafor' });
const iconButton = (page: Page) => page.getByRole('button', { name: 'Edit icon database' });

test.describe('compose avatar and icon editors', () => {
	test('@smoke an avatar and an icon are drawn as the slide draws them, and opening the deck writes nothing', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await expect(page.locator('.cs-npill .lat-avatar svg')).toHaveCount(1, { timeout: 20_000 });
		await expect(page.locator('.cs-npill .lat-icon svg')).toHaveCount(1);
		await expect(page.locator('.cs-npill .lat-pill')).toHaveCount(1);
		// A click that opens and closes an editor changes no bytes either.
		await avatarButton(page).click();
		await expect(editor(page)).toBeVisible();
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await expect(editor(page)).toHaveCount(0);
		// Polled: the save is debounced (~400ms, `persistedSource` in studio-fixture.ts); a single read raced it on CI.
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('@smoke a trait pick writes one word and leaves every other byte alone', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await avatarButton(page).click();
		await editor(page).getByRole('button', { name: /Face and clothes/ }).click();
		await editor(page).getByRole('radio', { name: 'Hair: Bob' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('!{Ada Okafor, c3}', '!{Ada Okafor, c3, hair=bob}'));
		// The pick is shown as chosen, and "From name" says what the name would have picked.
		await expect(editor(page).getByRole('radio', { name: 'Hair: Bob' })).toHaveAttribute('aria-checked', 'true');
		await editor(page).getByRole('radio', { name: /^Hair: From name/ }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('tile color, size and shape write their words, and Standard removes the size word', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await avatarButton(page).click();
		await editor(page).getByRole('radio', { name: 'Color 5' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('!{Ada Okafor, c3}', '!{Ada Okafor, c5}'));
		await editor(page).getByRole('radio', { name: 'Size: Large' }).click();
		await expect.poll(() => savedDeck(page)).toContain('!{Ada Okafor, c5, lg}');
		await editor(page).getByRole('radio', { name: 'Shape: Square' }).click();
		await expect.poll(() => savedDeck(page)).toContain('!{Ada Okafor, c5, lg, square}');
		await editor(page).getByRole('radio', { name: 'Size: Standard' }).click();
		await expect.poll(() => savedDeck(page)).toContain('!{Ada Okafor, c5, square}');
	});

	test('the name is written when the author leaves the field, and the face follows it', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await avatarButton(page).click();
		const name = editor(page).getByRole('textbox', { name: 'Name' });
		await name.fill('Grace Hopper');
		// Nothing is written on each key.
		// Polled: the save is debounced (~400ms, `persistedSource` in studio-fixture.ts); a single read raced it on CI.
		await expect.poll(() => savedDeck(page)).toBe(DECK);
		await name.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('!{Ada Okafor, c3}', '!{Grace Hopper, c3}'));
		await expect(page.getByRole('button', { name: 'Edit avatar Grace Hopper' })).toBeVisible();
	});

	test('Undo takes a pick back as one step, and the editor follows', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await avatarButton(page).click();
		await editor(page).getByRole('radio', { name: 'Shape: Square' }).click();
		await expect.poll(() => savedDeck(page)).toContain('!{Ada Okafor, c3, square}');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await page.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('an icon: its options write one word each, and Change icon picks from the grid', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await iconButton(page).click();
		await expect(editor(page)).toBeVisible();
		await editor(page).getByRole('radio', { name: 'Color 4' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('^{database, lg}', '^{database, lg, c4}'));
		await editor(page).getByRole('radio', { name: 'Size: Standard' }).click();
		await expect.poll(() => savedDeck(page)).toContain('^{database, c4}');
		await editor(page).getByRole('radio', { name: 'Look: Etch' }).click();
		await expect.poll(() => savedDeck(page)).toContain('^{database, c4, etch}');
		// The grid is the icon set, drawn and searchable; the editor stays open under it.
		await editor(page).getByRole('button', { name: 'Change icon' }).click();
		await page.getByRole('textbox', { name: 'Search icons' }).fill('server');
		await page.getByRole('button', { name: /^server/ }).first().click();
		await expect.poll(() => savedDeck(page)).toContain('^{server, c4, etch}');
		await expect(editor(page)).toBeVisible();
	});

	test('the doors put a new avatar and a new icon at the caret and open their editors', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.locator('.cs-slide-content p').nth(1).click();
		await page.keyboard.press('End');
		await insertVia(page, 'Avatar');
		await expect(editor(page)).toBeVisible();
		await expect.poll(() => savedDeck(page)).toContain('Plain line here.`!{Alex Rivera}`');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		// The paragraph now ends in an avatar, so click at its left edge, not its middle.
		await page.locator('.cs-slide-content p').nth(1).click({ position: { x: 3, y: 8 } });
		await page.keyboard.press('Home');
		await insertVia(page, 'Icon');
		await expect(editor(page)).toBeVisible();
		await expect.poll(() => savedDeck(page)).toContain('Plain `^{star}` line here.');
	});

	// The same oracle, run under BOTH pointer states (`@parity` runs on the `*-touch` projects at 1440, 820 and 390px as well as
	// `desktop`). On a touch project the avatar is opened with a real touch tap and the pick is a tap: the editor that opens (a
	// popover, or a bottom sheet on a phone) and the one word it writes are what a phone author depends on. That is touch
	// EMULATION in Chromium, not a device: it claims the event path and the layout, not a phone's keyboard or iOS.
	test('@parity a touch tap on an avatar opens the editor, and a pick writes only the word that was picked', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
		const target = avatarButton(page);
		if (touch) await target.tap();
		else await target.click();
		const panel = page.locator('[data-slot="popover-content"], [role="dialog"]').last();
		await expect(panel).toBeVisible();
		const pick = panel.getByRole('radio', { name: 'Shape: Square' });
		if (touch) await pick.tap();
		else await pick.click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('!{Ada Okafor, c3}', '!{Ada Okafor, c3, square}'));
		await expect(page.locator('.cs-npill .lat-avatar')).toHaveAttribute('data-shape', 'square');
	});

	test('Edit as text turns an avatar back into the span it is, and the text door stays', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await avatarButton(page).click();
		await editor(page).getByRole('button', { name: 'Edit as text' }).click();
		await expect(page.locator('.cs-npill .lat-avatar')).toHaveCount(0);
		await expect(page.locator('.cs-host .ProseMirror')).toContainText('!{Ada Okafor, c3}');
		// Polled: the save is debounced (~400ms, `persistedSource` in studio-fixture.ts); a single read raced it on CI.
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});
});
