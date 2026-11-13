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

/**
 * Put the caret at the end of a CodeMirror field. Not a bare `ControlOrMeta+End`: Playwright resolves that against the
 * test machine (Linux, so Ctrl), while CodeMirror reads the page's platform, and on the iPhone and iPad profiles it is in
 * Mac mode, where Ctrl+End is not the document's end (studio-fixture.ts `selectAllInEditor` has the measurement).
 */
async function toFieldEnd(page: Page) {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) || /iPhone|iPad/.test(navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+ArrowDown' : 'Control+End');
}

/** Accept with Tab, once the menu has been open past CodeMirror's interaction delay (as `acceptCompletion` does for Enter). */
async function acceptWithTab(page: Page) {
	await expect(menu(page)).not.toHaveClass(/cm-tooltip-autocomplete-disabled/);
	await expect
		.poll(() => page.evaluate(() => Date.now() - ((window as unknown as { __cmMenuAt?: number }).__cmMenuAt ?? Date.now())))
		.toBeGreaterThan(CM_INTERACTION_DELAY_MS + 25);
	await page.keyboard.press('Tab');
}

test('Ctrl-Space where nothing completes says so, and the note goes on the next key @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
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

test('Ctrl-Space where a source answers but nothing matches the word also says so @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudio(page);
	// The front-matter key source answers at column 0, and `zzz` filters every key out: CodeMirror shows no menu.
	await setEditorContent(page, '---\ntitle: Keys\nzzz');
	await page.keyboard.press('Control+Space');
	await expect(hint(page)).toHaveText('No suggestions here');
	await expect(menu(page)).toHaveCount(0);
});

test('Ctrl-Space where something completes opens the menu and no note @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: ');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^indaco/ })).toBeVisible();
	await expect(hint(page)).toHaveCount(0);
});

test('Tab accepts a suggestion, and picking a key opens its values @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Keys\n');
	// Seeding by insertText reads as typing, which can open the key menu over the editor on a phone: close it first.
	await page.keyboard.press('Escape');
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

test('a front-matter key already set is not offered again @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: indaco\n');
	await page.keyboard.press('Escape');
	await appendToEditor(page, 't');
	// The menu is open (the other `t…` keys are offered) before the absence is read, so the check cannot pass early.
	await expect(menu(page).getByRole('option', { name: /^title/ })).toBeVisible();
	await expect(menu(page).getByRole('option', { name: /^theme/ })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await setEditorContent(page, '---\ntitle: Keys\n');
	await page.keyboard.press('Escape');
	await appendToEditor(page, 't');
	await expect(menu(page).getByRole('option', { name: /^theme/ })).toBeVisible();
	await expect(menu(page).getByRole('option', { name: /^title/ })).toHaveCount(0);
});

test('the editor completes what the Playground does: directive names, a nested backdrop map, map regions @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
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
	test('Option-Esc opens suggestions, and so does Ctrl-Space @gecko @webkit-phone', async ({ page }) => {
		await gotoStudio(page);
		// A bare `_class:` position opens nothing by itself (an Enter there must stay a newline), so only the key can
		// open this menu.
		await setEditorContent(page, '---\ntitle: Mac\n---\n\n<!-- _class: ');
		await page.keyboard.press('Alt+Escape');
		await expect(menu(page).getByRole('option', { name: /^cards-grid/ })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu(page)).toHaveCount(0);
		await page.keyboard.press('Control+Space');
		await expect(menu(page).getByRole('option', { name: /^cards-grid/ })).toBeVisible();
	});
});

// Slice 3: the slide-body gaps the audit found, each driven by the key an author presses.
test('Ctrl-Space on a blank body line offers what a line starts with, and a layout opens the component menu @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Insert\n---\n\n# A heading\n\n');
	await watchMenuOpen(page);
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^<!-- _class: -->/ })).toBeVisible();
	await expect(menu(page).getByRole('option', { name: /^<!-- say: -->/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- _class:  -->');
	// The layout names follow at once, with the caret inside the directive.
	await expect(menu(page).getByRole('option').first()).toBeVisible();
	await page.keyboard.type('flowch');
	await expect(menu(page).getByRole('option', { name: /^flowchart/ })).toBeVisible();
});

test('a flowchart completes its own names after an arrow, and span words in a backtick @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Flow\n---\n\n<!-- _class: flowchart -->\n\n## Orders reach the ledger.\n\n- Storefront => Payments\n- Payments\n- Ledger\n');
	await watchMenuOpen(page);
	await appendToEditor(page, '- Payments -> Led');
	await expect(menu(page).getByRole('option', { name: /^Ledger/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('- Payments -> Ledger');
	await page.keyboard.type(' `dia');
	await expect(menu(page).getByRole('option', { name: /^diamond/ })).toBeVisible();
});

test('math completes TeX commands, and a command with arguments puts the caret inside @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Math\n---\n\n# Growth\n\nRate $r = ');
	await watchMenuOpen(page);
	await appendToEditor(page, '\\fra');
	await expect(menu(page).getByRole('option', { name: /^\\frac/ })).toBeVisible();
	await acceptCompletion(page);
	await page.keyboard.type('a');
	await expect(editorText(page)).toContainText('$r = \\frac{a}{}');
});

test('a slide directive completes its values, and <!-- offers the note channels @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Directives\n---\n\n# A\n\n<!-- _paginate: ');
	await page.keyboard.press('Control+Space');
	await expect(menu(page).getByRole('option', { name: /^false/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await setEditorContent(page, '---\ntitle: Directives\n---\n\n# A\n\n');
	await watchMenuOpen(page);
	await appendToEditor(page, '<!-- sa');
	await expect(menu(page).getByRole('option', { name: /^say/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- say: ');
});

test('an image reference completes Lattice’s sample art, from the list the site serves @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\ntitle: Pics\n---\n\n# Team\n\n');
	await watchMenuOpen(page);
	await appendToEditor(page, '![Team](sample:photo-w');
	await expect(menu(page).getByRole('option', { name: /^sample:photo-wide\.jpg/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('![Team](sample:photo-wide.jpg');
});

// Slice 4: the CSS fields. CodeField used to replace the CSS language's own completion with nothing; now both run, with
// the token names inside `var(`.
test('the Theme CSS field completes CSS properties and the token names @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudioPage(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const field = page.locator('.cm-content[aria-label="Theme CSS"]');
	await expect(field).toBeVisible();
	await field.click();
	await toFieldEnd(page);
	await page.keyboard.press('Enter');
	await page.keyboard.type('section { backgr');
	// CodeMirror's own CSS completion: a property name.
	await expect(menu(page).getByRole('option', { name: /^background-color/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.type('ound-color: var(--acc');
	await expect(menu(page).getByRole('option', { name: /^--accent\b/ }).first()).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.type('ent); font-size: var(--fs-b');
	await expect(menu(page).getByRole('option', { name: /^--fs-body\b/ }).first()).toBeVisible();
});

// Found while driving the test above on Firefox: typing at full speed into the Theme CSS field lost letters, with or
// without completion (`main` lost one in 4 of 5 runs). CodeField replaced its document with the parent's re-render of
// an OLDER text it had emitted itself; it now knows its own echoes (CodeField.tsx). Typed at Playwright's full speed on
// purpose: that is the race, and what the test asserts is the text, not a time.
test('typing fast into a CSS field loses no characters @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudioPage(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const field = page.locator('.cm-content[aria-label="Theme CSS"]');
	await field.click();
	await toFieldEnd(page);
	await page.keyboard.press('Enter');
	const css = 'x { color: var(--accent); font-size: var(--fs-body); background: var(--bg-alt); }';
	await page.keyboard.type(css);
	await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.cm-content[aria-label="Theme CSS"] .cm-line')].at(-1)?.textContent)).toBe(css);
});
