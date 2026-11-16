// FIND AND REPLACE, AND AN EDIT BAR THAT NEVER BLEEDS (engineering/decisions/2026-11-15-compose-layout-button.md §3).
// The find bar on the real Studio, in both editors: it counts, steps, replaces one, replaces all as ONE undo step, and in
// Compose leaves a slide Compose cannot edit alone. And the edit bar at the editor pane's minimum width: every control
// it moves out of the row is in its More menu, and the row never runs past its box.
import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, isPhone, persistedSource, setEditorContent, studioUndo, test } from './studio-fixture';

const DECK = ['---', 'marp: true', 'theme: indaco', '---', '', '## Pilot results', '', '- The pilot ran six weeks.', '- The pilot paid back.', '', '---', '', '## Next', '', '- Scale the pilot.', ''].join('\n');

async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

async function open(page: Page, mode: 'compose' | 'source', deck = DECK): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, deck);
	if (mode === 'compose') {
		await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
	}
}

const bar = (page: Page) => page.getByRole('search', { name: 'Find and replace' });

async function openFind(page: Page): Promise<void> {
	if (isPhone(page)) {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: 'Find and replace', exact: true }).click();
	} else await page.locator('#studio-pane-editor [data-slot="edit-bar"]').getByRole('button', { name: 'Find and replace', exact: true }).click();
	await expect(bar(page)).toBeVisible();
}

for (const mode of ['compose', 'source'] as const) {
	test(`@crosswidth @webkit-phone @gecko in ${mode}: find counts and steps, Replace all is one undo step`, async ({ page }) => {
		await open(page, mode);
		await openFind(page);
		const find = bar(page).getByRole('textbox', { name: 'Find' });
		await expect(find).toBeFocused();
		await find.fill('pilot');
		// Case-insensitive by default: "Pilot" in the heading counts. The count reads "n/4", where n is the match the
		// selection is on ("–" when on none): Enter steps forward through the four and wraps, Shift+Enter steps back.
		const count = bar(page).getByText(/^(–|\d)\/4$/);
		await expect(count).toBeVisible();
		const at = async () => Number.parseInt(((await count.textContent()) || '0').replace('–', '0'), 10);
		await find.press('Enter');
		const first = await at();
		expect(first).toBeGreaterThanOrEqual(1);
		await find.press('Enter');
		await expect.poll(at).toBe((first % 4) + 1);
		await find.press('Shift+Enter');
		await expect.poll(at).toBe(first);
		await bar(page).getByRole('button', { name: 'Match case' }).click();
		await expect(bar(page).getByText(/\/3$/)).toBeVisible();
		await bar(page).getByRole('button', { name: 'Show replace' }).click();
		await bar(page).getByRole('textbox', { name: 'Replace with' }).fill('trial');
		await bar(page).getByRole('button', { name: 'Replace all' }).click();
		await expect.poll(() => deckSource(page)).toContain('- The trial ran six weeks.');
		const after = await deckSource(page);
		expect(after).toContain('## Pilot results');
		expect(after).toContain('- Scale the trial.');
		await expect(bar(page).getByText('None')).toBeVisible();
		await bar(page).getByRole('button', { name: 'Close find' }).click();
		await expect(bar(page)).toBeHidden();
		await studioUndo(page).click();
		await expect.poll(() => deckSource(page)).toBe(DECK);
	});
}

test('@crosswidth ⌘F in either editor opens the find bar on the selected word', async ({ page }) => {
	test.skip(isPhone(page), 'a phone has no hardware ⌘F; the drawer opens the bar');
	await open(page, 'source');
	await page.locator('.cm-content').click();
	await page.keyboard.press('ControlOrMeta+f');
	await expect(bar(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(bar(page)).toBeHidden();
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	// Select a line from the keyboard (a double-click past the end of a short line selects nothing).
	await page.locator('.cs-host .ProseMirror li').first().click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	await page.keyboard.press('ControlOrMeta+f');
	await expect(bar(page)).toBeVisible();
	await expect(bar(page).getByRole('textbox', { name: 'Find' })).toHaveValue('The pilot ran six weeks.');
});

test('@crosswidth the find bar follows a switch of editor, and a second ⌘F keeps what the bar was set to', async ({ page }) => {
	test.skip(isPhone(page), 'a phone has no hardware ⌘F, and switches editor from its drawer');
	await open(page, 'source');
	await openFind(page);
	await bar(page).getByRole('textbox', { name: 'Find' }).fill('pilot');
	await bar(page).getByRole('button', { name: 'Match case' }).click();
	await bar(page).getByRole('button', { name: 'Show replace' }).click();
	await bar(page).getByRole('textbox', { name: 'Replace with' }).fill('trial');
	await expect(bar(page).getByText(/\/3$/)).toBeVisible();
	await expect(page.locator('.cm-searchMatch')).toHaveCount(3);
	// The bar stays open across the switch and searches the editor that came up: its highlights, its count, its steps.
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await expect(page.locator('.cs-host .ProseMirror-search-match')).toHaveCount(3);
	await expect(bar(page).getByText(/\/3$/)).toBeVisible();
	await bar(page).getByRole('textbox', { name: 'Find' }).press('Enter');
	await expect(bar(page).getByText(/^[1-3]\/3$/)).toBeVisible();
	// ⌘F again, from the text: the field takes the focus, and the replacement, Match case and the replace row stay.
	await page.locator('.cs-host .ProseMirror li').first().click();
	await page.keyboard.press('ControlOrMeta+f');
	await expect(bar(page).getByRole('textbox', { name: 'Find' })).toBeFocused();
	await expect(bar(page).getByRole('textbox', { name: 'Replace with' })).toHaveValue('trial');
	await expect(bar(page).getByRole('button', { name: 'Match case' })).toHaveAttribute('aria-pressed', 'true');
	// ⌘F inside the bar stays in the bar.
	await page.keyboard.press('ControlOrMeta+f');
	await expect(bar(page).getByRole('textbox', { name: 'Find' })).toBeFocused();
});

test('@crosswidth in Compose, Replace all leaves a slide Compose cannot edit alone', async ({ page }) => {
	// Strikethrough is a construct Compose cannot round-trip, so that slide is edited in Source.
	const deck = `${DECK}\n---\n\n## Old pilot\n\n~~The pilot that stopped.~~\n`;
	await open(page, 'compose', deck);
	await openFind(page);
	await bar(page).getByRole('textbox', { name: 'Find' }).fill('pilot');
	await bar(page).getByRole('button', { name: 'Show replace' }).click();
	await bar(page).getByRole('textbox', { name: 'Replace with' }).fill('trial');
	await bar(page).getByRole('button', { name: 'Replace all' }).click();
	await expect.poll(() => deckSource(page)).toContain('- Scale the trial.');
	expect(await deckSource(page)).toContain('~~The pilot that stopped.~~');
});

test('@crosswidth at the editor pane’s minimum width the edit bar fits its box, and More holds what it moved', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no edit bar');
	await open(page, 'source');
	const row = page.locator('#studio-pane-editor [data-slot="edit-bar"]');
	// The split's minimum (EDITOR_MIN): the pane as the divider leaves it when dragged as far as it goes.
	await page.evaluate(() => {
		const pane = document.querySelector('#studio-pane-editor') as HTMLElement;
		pane.style.flex = '0 0 300px';
		pane.style.maxWidth = '300px';
	});
	await expect.poll(() => row.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
	for (const name of ['Undo', 'Redo', 'More editor actions', 'Collapse editor']) await expect(row.getByRole('button', { name, exact: true })).toBeVisible();
	// What the row moved out is in More, and only there: each control in exactly one place.
	for (const name of ['Reshape slide', 'Fix all issues', 'Version history']) await expect(row.getByRole('button', { name, exact: true })).toBeHidden();
	await row.getByRole('button', { name: 'More editor actions', exact: true }).click();
	const menu = page.getByRole('menu');
	for (const name of ['Reshape slide…', 'Fix all issues', 'Version history']) await expect(menu.getByRole('menuitem', { name })).toBeVisible();
	await menu.getByRole('menuitem', { name: 'Version history' }).click();
	await expect(page.getByRole('dialog', { name: /Version history/ })).toBeVisible();
});

test('@crosswidth Reshape picked from More opens, and stays open, at the pane’s minimum width', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no edit bar');
	await open(page, 'source', DECK.replace('## Pilot results', '<!-- _class: cards-grid -->\n\n## Pilot results'));
	await page.locator('.cm-line', { hasText: 'The pilot ran six weeks' }).click();
	const row = page.locator('#studio-pane-editor [data-slot="edit-bar"]');
	await page.evaluate(() => {
		const pane = document.querySelector('#studio-pane-editor') as HTMLElement;
		pane.style.flex = '0 0 300px';
		pane.style.maxWidth = '300px';
	});
	await expect(row.getByRole('button', { name: 'Reshape slide', exact: true })).toBeHidden();
	await row.getByRole('button', { name: 'More editor actions', exact: true }).click();
	await page.getByRole('menu').getByRole('menuitem', { name: 'Reshape slide…' }).click();
	// The menu is gone and the focus has settled: the picker is still open, and holds the focus. (It used to open for a
	// moment and close as the menu handed the focus back to its trigger.)
	await expect(page.getByRole('menu')).toBeHidden();
	const picker = page.getByRole('dialog', { name: 'Reshape slide: pick a look' });
	await expect(picker).toBeVisible();
	await expect.poll(() => picker.evaluate((el) => el.contains(document.activeElement))).toBe(true);
	await expect(picker).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(picker).toBeHidden();
});
