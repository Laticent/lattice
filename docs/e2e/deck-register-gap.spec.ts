import { expect, gotoStudio, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// The four deck registers the 2026-09-24 gap audit gave Inspector controls
// (engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.2a), plus the
// editor autocomplete for their values. Each control is asserted on the persisted
// source — the key the engine reads — not on the control's own label. `persistedSource`
// returns the JSON-encoded record, so a line reads as `\nkey: value\n` there, escaped.

const DECK = '---\ntitle: Gap\n---\n\n# Gap\n\n## One\n\nBody.\n';

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openInspector(page);
});

test('Look ▸ More: Card rows and Text overflow write cards: and guards:', async ({ page }) => {
	await page.getByText('More look settings').click();

	await page.getByRole('combobox', { name: 'Choose card row placement' }).click();
	await page.getByRole('option', { name: /Spread/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\ncards: spread\\n');
	// Auto is "each component decides" — it REMOVES the key rather than writing a value.
	await page.getByRole('combobox', { name: 'Choose card row placement' }).click();
	await page.getByRole('option', { name: /each component/ }).click();
	await expect.poll(() => persistedSource(page)).not.toContain('cards:');

	await page.getByRole('combobox', { name: 'Choose text overflow handling' }).click();
	await page.getByRole('option', { name: /Trim to fit/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nguards: strict\\n');
});

test('General: AI writes in writes ai-lang:', async ({ page }) => {
	await openSection(page, 'General');
	await page.getByRole('combobox', { name: 'Choose AI output language' }).click();
	await page.getByRole('option', { name: /United Kingdom/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nai-lang: en-GB\\n');
});

test('Motion: the exported-player switch appears with motion on and writes player-motion: off', async ({ page }) => {
	await openSection(page, 'Motion');
	const player = page.getByRole('switch', { name: 'Motion in the exported player' });
	await expect(player).toHaveCount(0); // meaningless while motion is off
	await page.getByRole('switch', { name: 'Chart motion' }).click();
	await expect(player).toHaveAttribute('aria-checked', 'true');
	await player.click();
	await expect.poll(() => persistedSource(page)).toContain('\\nplayer-motion: off\\n');
});

test('the editor completes guards: values from the engine vocabulary', async ({ page }) => {
	// Typed, not inserted: completion activates on typing (`activateOnTyping`).
	await setEditorContent(page, '---\ntitle: Gap\n---\n');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('End');
	await page.keyboard.type('\nguards: s');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: 'strict' })).toBeVisible();
});
