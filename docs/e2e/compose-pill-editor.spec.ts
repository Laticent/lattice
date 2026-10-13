import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/**
 * COMPOSE — the pill editor.
 *
 * Compose draws every pill the engine draws, as the slide draws it, and hides its grammar until the
 * caret touches it (owner, 2026-10-13). Clicking the drawn pill opens one shared editor for its
 * label, shape, color and size, and each pick rewrites ONLY the word the author changed
 * (engineering/decisions/2026-10-13-compose-inline-notation-editors.md). The two things that
 * would hurt an author silently are an edit that rewrites bytes it was not asked to touch and a
 * door that inserts something other than a pill, so those two carry `@smoke` and run on the PR
 * gate. The rest (undo, "Edit as text", the locked slide, the literal deck) run nightly.
 *
 * The oracle for "only that word" is the PERSISTED SOURCE, not the screen: the whole deck, byte
 * for byte, with one substitution. `desktop` only: the phone's sheet is covered by the unit tests
 * and was driven on the real Studio, and the touch projects reach Compose through different chrome.
 */

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Status board',
	'',
	'Shipped `{SHIPPED, c2}` and `{BETA, c4, tag}` and `{3, circle}`.',
	'',
	'Cost `{"Cost, excl. tax", chip}` today.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Plain slide',
	'',
	'Nothing here yet.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Locked slide',
	'',
	'This has ~~strike~~ and `{LOCKED, c6}`.',
].join('\n');

async function openDeckInCompose(page: Page, source = DECK): Promise<void> {
	await gotoStudio(page);
	await setEditorContent(page, source);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

const editor = (page: Page) => page.locator('[data-slot="popover-content"]');
const composeText = (page: Page) => page.locator('.cs-host .ProseMirror').innerText();
const drawnPills = (page: Page) => page.locator('.cs-npill .lat-pill');
const chip = (page: Page, name: RegExp | string) => page.getByRole('button', { name: typeof name === 'string' ? `Edit pill ${name}` : name });

test.describe('compose pill editor', () => {
	test('@smoke Compose shows the pill, not its grammar, and brings the grammar back when the caret reaches it', async ({ page }) => {
		await openDeckInCompose(page);
		// Four pills on the editable slide and one on the locked one, each drawn by the engine's own markup.
		await expect(drawnPills(page)).toHaveCount(5);
		await expect.poll(() => composeText(page)).not.toMatch(/\{SHIPPED|\{BETA|\{3, circle\}/);
		await expect(drawnPills(page).first()).toHaveAttribute('data-c', 'c2');
		// The pill carries the deck's own look, not an unstyled span: a capsule has a radius and a fill.
		const style = await drawnPills(page).first().evaluate((el) => {
			const c = getComputedStyle(el);
			return { radius: c.borderTopLeftRadius, bg: c.backgroundColor };
		});
		expect(style.radius).not.toBe('0px');
		expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');

		// Arrowing onto a pill shows its text, with the tag button, so the text can be edited.
		await page.locator('.cs-slide').first().locator('.cs-slide-content p', { hasText: 'Shipped' }).first().click({ position: { x: 4, y: 8 } });
		await page.keyboard.press('Home');
		for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
		await expect.poll(() => composeText(page)).toContain('{SHIPPED, c2}');
		await expect(page.locator('.cs-nchip')).not.toHaveCount(0);
		await page.keyboard.press('ArrowDown');
		await expect.poll(() => composeText(page)).not.toContain('{SHIPPED, c2}');
	});

	test('@smoke a pick rewrites only the word that was picked, and every other byte of the deck stays', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await expect(editor(page)).toBeVisible();

		await editor(page).getByRole('radio', { name: 'Color 5' }).click();
		await expect.poll(() => persistedSource(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, c5}`'));
		// And the pill on screen is the one the slide will draw: color 5.
		await expect(drawnPills(page).first()).toHaveAttribute('data-c', 'c5');

		// Adding a word, then taking one away: the other pills and the quoted label are untouched.
		await editor(page).getByRole('radio', { name: 'Shape: Diamond' }).click();
		await editor(page).getByRole('radio', { name: 'Size: Large' }).click();
		await editor(page).getByRole('radio', { name: 'Color: theme default' }).click();
		await expect.poll(() => persistedSource(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, diamond, lg}`'));
	});

	test('@smoke the order and spelling of the words the author wrote are kept', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'BETA').click();
		await editor(page).getByRole('radio', { name: 'Color 9' }).click();
		// `c4, tag` stays in that order, and only `c4` becomes `c9`.
		await expect.poll(() => persistedSource(page)).toBe(DECK.replace('`{BETA, c4, tag}`', '`{BETA, c9, tag}`'));
	});

	test('@smoke the insert door puts a pill at the caret and opens its editor on it', async ({ page }) => {
		await openDeckInCompose(page);
		await page.locator('.cs-slide').nth(1).locator('.cs-slide-content p').first().click();
		await page.keyboard.press('End');
		await page.locator('.cs-slide-active').getByRole('button', { name: 'Insert pill' }).click();

		await expect(editor(page)).toBeVisible();
		await expect(editor(page).getByRole('textbox', { name: 'Label' })).toHaveValue('Status');
		await editor(page).getByRole('textbox', { name: 'Label' }).fill('On track');
		await expect.poll(() => persistedSource(page)).toContain('Nothing here yet.`{On track}`');
	});

	test('a label that needs quoting is quoted, and a quoted one reads back as typed', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('textbox', { name: 'Label' }).fill('Cost, excluding tax');
		await expect.poll(() => persistedSource(page)).toContain('`{"Cost, excluding tax", c2}`');
	});

	test('one undo undoes one pick', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('radio', { name: 'Color 7' }).click();
		await expect.poll(() => persistedSource(page)).toContain('`{SHIPPED, c7}`');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await page.locator('.cs-host .ProseMirror').focus();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => persistedSource(page)).toBe(DECK);
	});

	test('Edit as text closes the editor and selects the text between the braces', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('button', { name: 'Edit as text' }).click();
		await expect(editor(page)).toBeHidden();
		await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('SHIPPED, c2');
	});

	test('a slide Compose cannot round-trip shows a disabled chip, and nothing opens', async ({ page }) => {
		await openDeckInCompose(page);
		const locked = chip(page, 'LOCKED');
		await expect(locked).toBeDisabled();
		await expect(editor(page)).toBeHidden();
	});

	test('a deck that turned the inline grammar off paints no chips', async ({ page }) => {
		await openDeckInCompose(page, '---\ninline-code: literal\n---\n\n## Literal deck\n\nShipped `{SHIPPED, c2}` here.');
		await expect(page.locator('.cs-nchip')).toHaveCount(0);
		await expect(page.locator('.cs-npill')).toHaveCount(0);
		await expect.poll(() => composeText(page)).toContain('{SHIPPED, c2}');
	});
});
