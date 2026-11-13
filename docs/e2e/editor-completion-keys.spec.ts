import type { Page } from '@playwright/test';
import { acceptCompletion, appendToEditor, CM_INTERACTION_DELAY_MS, expect, gotoStudio as gotoStudioPage, isPhone, setEditorContent, test, watchMenuOpen } from './studio-fixture';

// The completion keys and the completions the Studio's deck editor shares with the Playground, in the real Studio
// (engineering/decisions/2026-11-13-studio-autocomplete-audit.md, slices 1 and 2). Unit tests pin the sources
// (editor-complete.test.ts); these drive the keys a person presses, which only a real editor in a real browser answers.

const editorText = (page: Page) => page.getByLabel('Deck source');

/** The Studio, with the deck editor on screen: below 700px it shows one pane at a time, and the `Markdown source` cell swaps the editor in. */
async function gotoStudio(page: Page) {
	await gotoStudioPage(page);
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(editorText(page)).toBeVisible();
	}
}
const menu = (page: Page) => page.locator('.cm-tooltip-autocomplete');
const hint = (page: Page) => page.locator('.cm-completion-empty');

/** Accept with Tab, once the menu has been open past CodeMirror's interaction delay (as `acceptCompletion` does for Enter). */
async function acceptWithTab(page: Page) {
	await expect(menu(page)).not.toHaveClass(/cm-tooltip-autocomplete-disabled/);
	await expect
		.poll(() => page.evaluate(() => Date.now() - ((window as unknown as { __cmMenuAt?: number }).__cmMenuAt ?? Date.now())))
		.toBeGreaterThan(CM_INTERACTION_DELAY_MS + 25);
	await page.keyboard.press('Tab');
}

test('Ctrl-Space where nothing completes says so, and the note goes on the next key @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Keys\n---\n\n# A heading\n\nSome prose');
	await page.keyboard.press('Control+Space');
	await expect(hint(page)).toHaveText('No suggestions here');
	await expect(hint(page)).toHaveAttribute('role', 'status');
	await expect(menu(page)).toHaveCount(0);
	await page.keyboard.type('.');
	await expect(hint(page)).toHaveCount(0);
	await expect(editorText(page)).toContainText('Some prose.');
});

test('Ctrl-Space where something completes opens the menu and no note @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: ');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^indaco/ })).toBeVisible();
	await expect(hint(page)).toHaveCount(0);
});

test('Tab accepts a suggestion, and picking a key opens its values @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Keys\n');
	await watchMenuOpen(page);
	await appendToEditor(page, 'them');
	await expect(menu(page).getByRole('option', { name: /^theme/ })).toBeVisible();
	await acceptWithTab(page);
	await expect(editorText(page)).toContainText('theme:');
	// The palettes open without another key: the next thing the author types is the value.
	await expect(menu(page).getByRole('option', { name: /^indaco/ })).toBeVisible();
	await page.keyboard.type('indac');
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('theme: indaco');
	// With no menu open, completion does not take Tab: no suggestion is written, and the deck stays as it was.
	await page.keyboard.press('Escape');
	await expect(menu(page)).toHaveCount(0);
	const before = await editorText(page).innerText();
	await page.keyboard.press('Tab');
	await expect(menu(page)).toHaveCount(0);
	expect(await editorText(page).innerText()).toBe(before);
});

test('a front-matter key already set is not offered again @crosswidth @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: indaco\ntitle: Keys\n');
	await appendToEditor(page, 'th');
	await expect(menu(page).getByRole('option', { name: /^title/ })).toHaveCount(0);
	await expect(menu(page).getByRole('option', { name: /^theme/ })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await setEditorContent(page, '---\ntitle: Keys\n');
	await appendToEditor(page, 'th');
	await expect(menu(page).getByRole('option', { name: /^theme/ })).toBeVisible();
});

test('the editor completes what the Playground does: directive names, a nested backdrop map, map regions @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Shared\n---\n\n<!-- _');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^_header/ })).toBeVisible();
	await page.keyboard.press('Escape');
	// Inside a nested map, the map's own keys, never the deck's.
	await setEditorContent(page, '---\nbackdrop:\n  ');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^strength/ })).toBeVisible();
	await expect(menu(page).getByRole('option', { name: /^title/ })).toHaveCount(0);
	await page.keyboard.press('Escape');
	// A map slide's regions, from the completer the Studio loads on first use.
	await setEditorContent(page, '---\ntitle: Shared\n---\n\n<!-- _class: map -->\n\n- Fra');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^France/ })).toBeVisible();
});

// macOS. CodeMirror reads the platform when it loads, so the page is told it is a Mac before any script runs. The keys
// arrive as browser key events, as Playwright sends them: whether macOS itself takes ⌃Space first is a question for a
// real Mac (the audit's platform probe), not for this test.
test.describe('on a Mac', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
	});
	test('Option-Esc opens suggestions, and so does Ctrl-Space @gecko', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, '---\ntheme: ');
		await page.keyboard.press('Alt+Escape');
		await expect(menu(page).getByRole('option', { name: /^indaco/ })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu(page)).toHaveCount(0);
		await page.keyboard.press('Control+Space');
		await expect(menu(page).getByRole('option', { name: /^indaco/ })).toBeVisible();
	});
});
