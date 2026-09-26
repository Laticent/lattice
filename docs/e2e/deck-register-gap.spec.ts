import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// The four deck registers the 2026-09-24 gap audit gave Inspector controls
// (engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.2a), plus the
// editor autocomplete for their values. Each control is asserted on the persisted
// source — the key the engine reads — not on the control's own label. `persistedSource`
// returns the JSON-encoded record, so a line reads as `\nkey: value\n` there, escaped.

const DECK = '---\ntitle: Gap\n---\n\n# Gap\n\n## One\n\nBody.\n';

test.beforeEach(async ({ page }) => {
	// Seeding needs the editor and the Deck-scope button, which exist only at desktop width.
	// The @crosswidth tests narrow the viewport themselves, after this.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openInspector(page);
});

test('Look ▸ Frame and fit: Card rows and Fit write cards: and fit:', async ({ page }) => {
	// The rows sit under a heading in Advanced now, not inside a "More look settings" drawer.

	await page.getByRole('combobox', { name: 'Choose card row placement' }).click();
	await page.getByRole('option', { name: /Spread/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\ncards: spread\\n');
	// Auto is "each component decides" — it REMOVES the key rather than writing a value.
	await page.getByRole('combobox', { name: 'Choose card row placement' }).click();
	await page.getByRole('option', { name: /each component/ }).click();
	await expect.poll(() => persistedSource(page)).not.toContain('cards:');

	await page.getByRole('combobox', { name: 'Choose how slides fit' }).click();
	await page.getByRole('option', { name: /Heal and trim/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nfit: trim\\n');
	// Heal is the default — choosing it REMOVES the key.
	await page.getByRole('combobox', { name: 'Choose how slides fit' }).click();
	await page.getByRole('option', { name: /^Heal\b(?! and)/ }).click();
	await expect.poll(() => persistedSource(page)).not.toContain('fit:');
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

test('the editor completes fit: values from the engine vocabulary', async ({ page }) => {
	// Typed, not inserted: completion activates on typing (`activateOnTyping`).
	await setEditorContent(page, '---\ntitle: Gap\n---\n');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('End');
	await page.keyboard.type('\nfit: t');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: 'trim' })).toBeVisible();
});

// A value with a trailing YAML comment. The engine strips the comment (`frontMatterName`);
// the Studio's plain reader keeps it (#2087), so these rows read through
// `getFrontMatterName`. Without that, both rows below showed the OPPOSITE of what the
// engine renders.
test('a commented value reads the way the engine reads it', async ({ page }) => {
	await setEditorContent(page, '---\ntitle: Gap\nmotion: on\nguards: strict  # board pack\nplayer-motion: off # x\n---\n\n# Gap\n');
	// The OLD spelling, still honored: `guards: strict` reads as the Fit field's trim level.
	await expect(page.getByRole('combobox', { name: 'Choose how slides fit' })).toContainText('Heal and trim');
	await openSection(page, 'Motion');
	await expect(page.getByRole('switch', { name: 'Motion in the exported player' })).toHaveAttribute('aria-checked', 'false');
});

// The same four controls through the tablet and mobile ROUTES into deck settings, which
// have no Deck-scope button (see `CHROME.deckSettingsAt`). The deck is seeded at desktop
// width, where the editor is on screen, and the viewport then narrows.
async function openDeckSettingsAt(page: Page, width: number): Promise<void> {
	await expect(page.getByRole('button', { name: CHROME.deckScope })).toHaveCount(0);
	if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
}

for (const [label, width, height] of [
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth the four controls write their keys at ${label} (${width}px)`, async ({ page }) => {
		await page.keyboard.press('Escape'); // close the desktop Inspector the beforeEach opened
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		// Both breakpoint halves of the Inspector are in the DOM; act on the visible one.
		const vis = <T extends ReturnType<Page['locator']>>(l: T) => l.filter({ visible: true }).first();

		await vis(page.getByRole('combobox', { name: 'Choose card row placement' })).click();
		await page.getByRole('option', { name: /Spread/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\ncards: spread\\n');
		await vis(page.getByRole('combobox', { name: 'Choose how slides fit' })).click();
		await page.getByRole('option', { name: /Heal and trim/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nfit: trim\\n');

		await openSection(page, 'General');
		await vis(page.getByRole('combobox', { name: 'Choose AI output language' })).click();
		await page.getByRole('option', { name: /United Kingdom/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nai-lang: en-GB\\n');

		await openSection(page, 'Motion');
		await vis(page.getByRole('switch', { name: 'Chart motion' })).click();
		await vis(page.getByRole('switch', { name: 'Motion in the exported player' })).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nplayer-motion: off\\n');
	});
}
