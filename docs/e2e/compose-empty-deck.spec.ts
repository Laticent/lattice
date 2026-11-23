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

/** A box's top edge in CSS pixels, to a tenth. */
async function topOf(page: Page, selector: string): Promise<number> {
	return page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().top * 10) / 10);
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
	// …and so does the slide strip under the preview, where it is on screen (a wide window shows both panes).
	if ((page.viewportSize()?.width ?? 1440) >= 768) await expect(page.locator('[data-strip="pills"]')).toContainText('content');
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => deckSource(page)).toBe('');
	await expect(start(page)).toBeVisible();
	await expect(page.locator('.cs-slide-bar')).toBeHidden();
});

test('@parity @webkit-phone a touch tap on the grid canvas puts the caret even when the browser withholds its click', async ({ page }) => {
	// iOS Safari sometimes delivers a tap's pointer and touch events and then no mouse events and no click (three simulator
	// runs: jobs 137060162549, 137066156788, 137285553830). Cancelling touchend is the same withheld click on every engine:
	// the browser then synthesizes no mousedown and no click for the tap, and the grid's fallback puts the caret.
	await openEmptyDeck(page);
	await expect(editor(page)).not.toBeFocused();
	await page.evaluate(() => {
		const w = window as unknown as { __clicks: number };
		w.__clicks = 0;
		document.addEventListener('touchend', (e) => e.preventDefault(), { capture: true, passive: false });
		document.addEventListener('click', () => w.__clicks++, true);
	});
	const box = await page.locator('[data-start-grid]').boundingBox();
	if (!box) throw new Error('the start grid has no box');
	// The left padding, halfway down: grid background, no control under it.
	await page.touchscreen.tap(box.x + 6, box.y + box.height / 2);
	await expect(editor(page)).toBeFocused();
	expect(await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks), 'the browser did withhold the click').toBe(0);
});

test('@parity @webkit-phone a plain touch tap on the grid canvas leaves the caret on the empty line', async ({ page }) => {
	// The other half: when the browser DOES send the tap's mouse events, the click puts the caret, as it always did, and
	// nothing after it takes the focus away. PR 3436's first head put the caret on the release, and the tap's later
	// mousedown on the grid (a plain div) took the focus away on the iPhone simulator; this test catches that shape.
	await openEmptyDeck(page);
	const box = await page.locator('[data-start-grid]').boundingBox();
	if (!box) throw new Error('the start grid has no box');
	await page.evaluate(() => {
		const w = window as unknown as { __clicks: number };
		w.__clicks = 0;
		document.addEventListener('click', () => w.__clicks++, true);
	});
	await page.touchscreen.tap(box.x + 6, box.y + box.height / 2);
	// Wait for the tap's own click, the last of its late mouse events, then judge the focus.
	await expect.poll(() => page.evaluate(() => (window as unknown as { __clicks: number }).__clicks)).toBe(1);
	await expect(editor(page)).toBeFocused();
	expect(await page.evaluate(() => document.getSelection()?.anchorNode?.parentElement?.closest('p') != null || document.getSelection()?.anchorNode?.nodeName === 'P'), 'the caret is in the empty line').toBe(true);
});

test('@crosswidth keys that write nothing leave the deck empty, and Tab reaches the grid', async ({ page }) => {
	await openEmptyDeck(page);
	await caretOnEmptyLine(page);
	for (const key of ['ArrowDown', 'ArrowRight', 'ControlOrMeta+b', 'ControlOrMeta+i', 'Shift', 'Escape']) await page.keyboard.press(key);
	await caretOnEmptyLine(page);
	await page.keyboard.press('Tab');
	await expect(tiles(page).first()).toBeFocused();
	// The editor itself, not storage: a deck that was never saved also reads '' from storage (the checker on #3273).
	await expect(page.locator('.cs-host .cs-slide-content')).toHaveText('');
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
	// A whole deck, settings included: its front matter becomes the deck's, its breaks become slides.
	const deck = '---\ntheme: cuoio\npaginate: true\n---\n\n# One\n\nFirst point.\n\n---\n\n<!-- _class: big-number -->\n\n# 93%';
	const lineTop = await topOf(page, '.cs-host .cs-slide-content > *');
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
	expect(src.startsWith('---\ntheme: cuoio\npaginate: true\n---\n'), `the pasted settings did not become the deck's: ${JSON.stringify(src)}`).toBe(true);
	expect(src.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart().startsWith('# One'), `a blank slide was left before the pasted deck: ${JSON.stringify(src)}`).toBe(true);
	await expect(start(page)).toBeHidden();
	// The first pasted line lands where the empty line was: the reserved bar means nothing above it moves.
	expect(await topOf(page, '.cs-host .cs-slide-content > *')).toBe(lineTop);
	// One Undo takes back the slides and the settings together, to an empty file.
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => deckSource(page)).toBe('');
	await expect(start(page)).toBeVisible();
});

test('@crosswidth @webkit-phone @gecko nothing moves: the line and the grid hold still through a tap, a letter and Undo', async ({ page }) => {
	await openEmptyDeck(page);
	const line = '.cs-host .cs-slide-content > p';
	const grid = '[data-empty-start]';
	const before = { line: await topOf(page, line), grid: await topOf(page, grid) };
	await caretOnEmptyLine(page);
	expect({ line: await topOf(page, line), grid: await topOf(page, grid) }, 'the tap moved the line or the grid').toEqual(before);
	// The first letter brings the slide bar back. It was reserved, so the letter is typed where the caret was.
	await page.keyboard.type('W');
	await expect(start(page)).toBeHidden();
	expect(await topOf(page, line), 'the first letter pushed the line down').toBe(before.line);
	// Undo: back to the same picture, with no change mark giving the empty line a second row.
	await page.keyboard.press('ControlOrMeta+z');
	await expect(start(page)).toBeVisible();
	await expect.poll(() => topOf(page, grid), { message: 'the grid moved after Undo' }).toBe(before.grid);
	expect(await topOf(page, line)).toBe(before.line);
	// The change mark is not drawn on a blank deck, so nothing is left to move the grid when it would have faded: its gap had
	// given the empty line a second row (27px on a desktop, measured before the fix).
	await expect(page.locator('.cs-host .cs-flash-gap')).toBeHidden();
	expect(await topOf(page, grid)).toBe(before.grid);
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

// The checker on #3273 found three ways the first build went wrong once the grid was not on screen. Each is held here.

test('a collapsed editor on an empty deck still offers New slide', async ({ page }) => {
	// Desktop only (no @crosswidth): a phone has no split to collapse; its Preview tab is the next test.
	await openEmptyDeck(page);
	await expect(page.locator('[data-new-slide]')).toHaveCount(0);
	await page.getByRole('button', { name: 'Collapse editor', exact: true }).click();
	// The grid went with the editor, so a door comes back: the deck is never left with no way to add a slide.
	await expect(page.locator('[data-start-grid]')).toBeHidden();
	await expect(page.getByRole('button', { name: 'New slide', exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('@crosswidth going to Source and back builds no new preview frames, and Preview hides the grid outright', async ({ page }) => {
	// Count every <iframe> the page ever creates (WebKit never frees a destroyed one, preview-pool.tsx).
	await page.addInitScript(() => {
		const w = window as unknown as { __frames: number };
		w.__frames = 0;
		new MutationObserver((ms) => {
			for (const m of ms)
				for (const n of m.addedNodes) {
					if (n.nodeName === 'IFRAME') w.__frames++;
					if (n instanceof Element) w.__frames += n.querySelectorAll('iframe').length;
				}
		}).observe(document, { childList: true, subtree: true });
	});
	await openEmptyDeck(page);
	await expect(tiles(page)).toHaveCount(4);
	const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
	await expect.poll(() => page.locator('[data-start-grid] iframe').count()).toBeGreaterThan(0);
	const before = await frames();
	for (let i = 0; i < 2; i++) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(page.locator('[data-start-grid]')).toBeHidden();
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await expect(start(page)).toBeVisible();
	}
	expect(await frames(), 'a return to Compose built new preview frames').toBe(before);
	// On a phone the Preview tab only covers the edit pane; the grid must be display:none under it, so its frames park.
	if ((page.viewportSize()?.width ?? 1440) < 768) {
		await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
		await expect(page.locator('[data-start-grid]')).toHaveCSS('display', 'none');
	}
});

