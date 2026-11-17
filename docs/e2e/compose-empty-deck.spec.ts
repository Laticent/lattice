// AN EMPTY DECK LOOKS EMPTY (engineering/decisions/2026-11-17-compose-empty-deck.md). Driven on the real Studio: a blank
// deck shows no slide chrome in Compose, only one line to write on and the start grid; typing or a tile starts the deck;
// one Undo takes it back to a truly empty file; a pasted deck arrives as its own slides; Preview and Present say there
// is nothing to show instead of drawing a blank slide numbered 1.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

const COMPOSE = 'Compose — rich editor';

/** The persisted deck source, JSON-decoded (see compose-fenced-code.spec.ts). */
async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	if (!raw) return '';
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

/** Open the Studio, empty the deck in Source, and switch to Compose. */
async function openEmptyDeck(page: Page): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	// The fixture's helper checks the EDITOR emptied (a fresh deck that was never saved also reads as '' from storage, so
	// polling storage alone passed on webkit-phone with the welcome deck still in place).
	await setEditorContent(page, '');
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await expect(start(page)).toBeVisible();
}

const start = (page: Page) => page.getByRole('region', { name: 'Start your deck' });
const tiles = (page: Page) => start(page).getByRole('list', { name: 'Starting slides' }).getByRole('button');
const editor = (page: Page) => page.locator('.cs-host .ProseMirror');

/** Put the caret on the empty line, the way an author does: a tap on the canvas where the grid has no control. */
async function caretOnEmptyLine(page: Page): Promise<void> {
	await page.locator('.cs-host .cs-slide-content p').first().click();
	await expect(editor(page)).toBeFocused();
}

test('@crosswidth @webkit-phone @gecko an empty deck shows no slide chrome, one start grid, and no other door', async ({ page }) => {
	await openEmptyDeck(page);
	// No slide bar: no collapse, no delete, no layout button for a slide that does not exist.
	await expect(page.locator('.cs-slide-bar')).toBeHidden();
	await expect(page.getByRole('button', { name: 'Delete slide' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Layout: / })).toHaveCount(0);
	// The grid: a labeled region, its hint as the description, four starting slides with title first, and the way to the rest.
	await expect(start(page)).toHaveAccessibleDescription(/^Pick a first slide, or /);
	await expect(tiles(page)).toHaveCount(4);
	await expect(tiles(page).first()).toHaveAccessibleName(/^Insert title/);
	await expect(start(page).getByRole('button', { name: /^Browse all \d+ layouts$/ })).toBeVisible();
	// Compose holds the only call to add a slide: the floating New slide door stands down while the deck is empty.
	await expect(page.locator('[data-new-slide]')).toHaveCount(0);
});

test('@crosswidth @webkit-phone @gecko typing starts a content slide, and one Undo leaves a truly empty deck', async ({ page }) => {
	await openEmptyDeck(page);
	await caretOnEmptyLine(page);
	await page.keyboard.type('W');
	await expect.poll(() => deckSource(page)).toBe('W');
	await expect(start(page)).toBeHidden();
	// The slide is real now, and its layout button names the default component by its class.
	await expect(page.locator('.cs-slide-active .cs-sb-pill .cs-sb-layout .cs-lb-name')).toHaveText('content');
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => deckSource(page)).toBe('');
	await expect(start(page)).toBeVisible();
	await expect(page.locator('.cs-slide-bar')).toBeHidden();
});

test('@crosswidth keys that write nothing leave the deck empty, and Tab reaches the grid', async ({ page }) => {
	await openEmptyDeck(page);
	await caretOnEmptyLine(page);
	for (const key of ['ArrowDown', 'ArrowRight', 'ControlOrMeta+b', 'ControlOrMeta+i', 'Shift', 'Escape']) await page.keyboard.press(key);
	await caretOnEmptyLine(page);
	await page.keyboard.press('Tab');
	await expect(tiles(page).first()).toBeFocused();
	expect(await deckSource(page)).toBe('');
	await expect(start(page)).toBeVisible();
});

test('@crosswidth @webkit-phone @gecko a tile makes slide 1 in its layout, and Undo empties the deck again', async ({ page }) => {
	await openEmptyDeck(page);
	await tiles(page).first().click();
	await expect.poll(() => deckSource(page)).toMatch(/^<!-- _class: title -->\n/);
	// One slide, not a blank one before it.
	await expect(page.locator('.cs-slide')).toHaveCount(1);
	await expect(start(page)).toBeHidden();
	await page.getByRole('button', { name: 'Undo', exact: true }).filter({ visible: true }).first().click();
	await expect.poll(() => deckSource(page)).toBe('');
	await expect(start(page)).toBeVisible();
});

test('@crosswidth a whole deck pasted into an empty one arrives as its own slides', async ({ page, browserName }) => {
	await openEmptyDeck(page);
	await caretOnEmptyLine(page);
	const deck = '# One\n\nFirst point.\n\n---\n\n<!-- _class: big-number -->\n\n# 93%';
	if (browserName === 'firefox') {
		await page.evaluate((t) => navigator.clipboard.writeText(t), deck);
		await page.keyboard.press('ControlOrMeta+v');
	} else {
		await page.evaluate((t) => {
			const dt = new DataTransfer();
			dt.setData('text/plain', t);
			(document.activeElement as HTMLElement).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
		}, deck);
	}
	await expect(page.locator('.cs-slide')).toHaveCount(2);
	// The save is debounced: wait for the pasted deck to be the deck, then check nothing blank sits before it.
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: big-number -->');
	const src = await deckSource(page);
	expect(src.trimStart().startsWith('# One'), `a blank slide was left before the pasted deck: ${JSON.stringify(src)}`).toBe(true);
	await expect(start(page)).toBeHidden();
});

test('@crosswidth Browse all opens the add-slide picker, which says the pick becomes slide 1', async ({ page }) => {
	await openEmptyDeck(page);
	await start(page).getByRole('button', { name: /^Browse all \d+ layouts$/ }).click();
	await expect(page.getByText(/as slide 1/).first()).toBeVisible();
});

test('@crosswidth Preview and Present say the deck is empty instead of showing a blank slide', async ({ page }) => {
	// A phone-width window shows one pane at a time (the `mobile` project is a 390px viewport, not an emulated device).
	const phone = (page.viewportSize()?.width ?? 1440) < 768;
	await openEmptyDeck(page);
	if (phone) await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	await expect(page.locator('[data-preview-empty]')).toBeVisible();
	await expect(page.locator('[data-preview-empty]')).toContainText('No slides yet');
	await expect(page.getByText('No slides', { exact: true }).filter({ visible: true }).first()).toBeVisible();
	const present = page.getByRole('button', { name: 'Present', exact: true }).first();
	// On a wide window the toolbar's Present button says it is unavailable; the phone's Present tab carries no state. Both,
	// pressed, say why instead of opening a blank slide (`force`: an aria-disabled button still takes a pointer).
	if (!phone) await expect(present).toHaveAttribute('aria-disabled', 'true');
	await present.click({ force: true });
	await expect(page.getByText('Add a slide to present.').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByRole('dialog', { name: /present/i })).toHaveCount(0);
});
