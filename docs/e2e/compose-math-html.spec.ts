import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// Inline math, a `$$` block and a block of HTML are atoms in Compose: drawn, opened in a panel, written back byte for byte.
// followups.d/2846-p2; engineering/decisions/2026-10-21-compose-point-and-click.md §7.
// Before: a slide holding any of them locked read-only, which held 51 of the 96 locked slides in the shipped decks.

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Area',
	'',
	'The area is $A = \\pi r^2$ per shape.',
	'',
	'$$',
	'\\frac{a_1}{b_1}',
	'$$',
	'',
	'<div class="note">',
	'  <b>Keep</b> this',
	'</div>',
	'',
	'Closing words.',
].join('\n');

const panel = (page: Page) => page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').last();

test.describe('compose math and html', () => {
	test('@crosswidth a slide with math and a block of HTML is editable, and opening it writes nothing', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await expect(page.locator('.cs-slide-locked')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Edit math: A = \\pi r^2' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit math block' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit HTML block' })).toBeVisible();
		// KaTeX loads on demand: the span and the block become the formula (MathML) after a moment.
		await expect(page.locator('.cs-math-btn math')).toBeVisible();
		await expect(page.locator('.cs-raw-math math')).toBeVisible();
		expect(await savedDeck(page)).toBe(DECK);
		// Typing in the slide's own text leaves the three atoms' bytes alone.
		await page.getByText('Closing words.').click();
		await page.keyboard.press('End');
		await page.keyboard.type(' More.');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('Closing words.', 'Closing words. More.'));
	});

	test('@crosswidth a tap on inline math opens the TeX field with a live preview, and Enter writes only the TeX', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: 'Edit math: A = \\pi r^2' }).click();
		const tex = panel(page).getByRole('textbox', { name: 'TeX' });
		await expect(tex).toHaveValue('A = \\pi r^2');
		await expect(panel(page).getByTestId('math-preview').locator('math')).toBeVisible();
		await tex.fill('E = mc^2');
		// Nothing is written on each key; the preview follows.
		expect(await savedDeck(page)).toBe(DECK);
		await expect(panel(page).getByTestId('math-preview')).toContainText('E');
		await tex.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('$A = \\pi r^2$', '$E = mc^2$'));
		// A dollar sign cannot be written inside inline math: the panel says so and the deck keeps the last good TeX.
		await tex.fill('a$b');
		await tex.press('Enter');
		await expect(panel(page).getByRole('alert')).toContainText('$');
		expect(await savedDeck(page)).toBe(DECK.replace('$A = \\pi r^2$', '$E = mc^2$'));
	});

	test('a math block edits its TeX and keeps its lines', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: 'Edit math block' }).click();
		const tex = panel(page).getByRole('textbox', { name: 'TeX' });
		await expect(tex).toHaveValue('\\frac{a_1}{b_1}');
		await tex.fill('\\sum_{i} x_i');
		await tex.blur();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('\\frac{a_1}{b_1}', '\\sum_{i} x_i'));
	});

	test('a block of HTML edits its source, and a blank line is refused', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: 'Edit HTML block' }).click();
		const src = panel(page).getByRole('textbox', { name: 'HTML source' });
		await expect(src).toHaveValue('<div class="note">\n  <b>Keep</b> this\n</div>');
		await src.fill('<div class="note">\n\n</div>');
		await src.blur();
		await expect(panel(page).getByRole('alert')).toContainText('blank line');
		expect(await savedDeck(page)).toBe(DECK);
		await src.fill('<div class="note">\n  <i>Edited</i>\n</div>');
		await src.blur();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('<b>Keep</b> this', '<i>Edited</i>'));
	});

	test('Remove takes a block out and Undo brings it back', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByRole('button', { name: 'Edit HTML block' }).click();
		await panel(page).getByRole('button', { name: /Remove/ }).click();
		await expect.poll(() => savedDeck(page)).not.toContain('class="note"');
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('a slide with HTML inside a list item stays locked', async ({ page }) => {
		await openDeckInCompose(page, ['<!-- _class: content -->', '', '## T', '', '- a', '  <div>nested</div>'].join('\n'));
		await expect(page.locator('.cs-slide-locked')).toHaveCount(1);
	});
});
