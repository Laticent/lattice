import { expect, gotoStudio, railButtons, test, typeDeck } from './studio-fixture';

// THE STRIP'S KEYBOARD AND SCREEN-READER MODEL (2026-10-27-slide-structure-strip.md §9). A roving-tabindex list: the
// current slide is the one tab stop and is always rendered, the arrows walk the deck with keyboard focus following,
// the shortcuts in §5's table act on the focused slide only when focus arrived by keyboard, and one live region says
// what each action did.

test.skip(({ isMobile }) => isMobile, 'a keyboard surface; the desktop project covers it');

const DECK = '# Alpha\n\na\n\n---\n\n# Bravo\n\nb\n\n---\n\n# Charlie\n\nc\n\n---\n\n# Delta\n\nd\n';
// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const source = (page: import('@playwright/test').Page) => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
const order = async (page: import('@playwright/test').Page) => [...(await source(page)).matchAll(/^# (\w+)/gm)].map((m) => m[1]).join(' ');
const counter = (page: import('@playwright/test').Page) => page.getByText(/^Slide \d+ \/ \d+$/).first();
const focused = (page: import('@playwright/test').Page) => page.evaluate(() => document.activeElement?.getAttribute('data-unit') ?? document.activeElement?.tagName);
const mod = async (page: import('@playwright/test').Page) => ((await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))) ? 'Meta' : 'Control');
const announced = (page: import('@playwright/test').Page) => page.locator('[aria-live]').filter({ hasText: /Duplicated|Moved|Deleted/ });

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect(railButtons(page)).toHaveCount(4);
});

/** Put keyboard focus on the strip's one tab stop, the way a keyboard user gets there. */
async function tabToStrip(page: import('@playwright/test').Page) {
	await railButtons(page).nth(0).click();
	await expect(counter(page)).toHaveText('Slide 1 / 4');
	// A pick hands focus to the editor; from there Tab order reaches the strip. Focus the tab stop directly, then
	// prove it is the only one: every other slide button is out of the tab order.
	await page.locator('nav[aria-label="Slide navigator"] button[data-unit][tabindex="0"]').focus();
	await expect(page.locator('nav[aria-label="Slide navigator"] button[data-unit][tabindex="0"]')).toHaveCount(1);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowLeft');
	await expect.poll(() => focused(page)).toBe('0');
}

test('the arrows walk the deck and keyboard focus follows the current slide', async ({ page }) => {
	await tabToStrip(page);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(counter(page)).toHaveText('Slide 3 / 4');
	await expect.poll(() => focused(page)).toBe('2');
	await page.keyboard.press('End');
	await expect(counter(page)).toHaveText('Slide 4 / 4');
	await expect.poll(() => focused(page)).toBe('3');
	await page.keyboard.press('Home');
	await expect(counter(page)).toHaveText('Slide 1 / 4');
});

test('the shortcuts act on the focused slide, keep focus in the strip, and are announced', async ({ page }) => {
	const m = await mod(page);
	await tabToStrip(page);
	await page.keyboard.press('ArrowRight');
	await expect(counter(page)).toHaveText('Slide 2 / 4');

	await page.keyboard.press(`${m}+d`);
	await expect.poll(() => order(page)).toBe('Alpha Bravo Bravo Charlie Delta');
	await expect(counter(page)).toHaveText('Slide 3 / 5');
	await expect.poll(() => focused(page)).toBe('2');
	await expect(announced(page)).toContainText('Duplicated. The copy is slide 3 of 5.');

	await page.keyboard.press(`${m}+Shift+ArrowRight`);
	await expect.poll(() => order(page)).toBe('Alpha Bravo Charlie Bravo Delta');
	await expect(counter(page)).toHaveText('Slide 4 / 5');
	await expect.poll(() => focused(page)).toBe('3');
	await expect(announced(page)).toContainText('Moved to position 4 of 5.');

	await page.keyboard.press('Backspace');
	await expect.poll(() => order(page)).toBe('Alpha Bravo Charlie Delta');
	await expect.poll(() => focused(page)).not.toBe('BODY');
	await expect(announced(page)).toContainText('Deleted.');

	// ⌘Z from the strip takes the delete back (Filo's one history).
	await page.keyboard.press(`${m}+z`);
	await expect.poll(() => order(page)).toBe('Alpha Bravo Charlie Bravo Delta');
});

test('focus a pointer put on a slide never arms the shortcuts: Backspace deletes nothing', async ({ page }) => {
	// A press focuses the pill without :focus-visible (a pointer put it there); leave before releasing, so no click picks.
	const pill = await railButtons(page).nth(2).boundingBox();
	if (!pill) throw new Error('no pill');
	await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
	await page.mouse.down();
	await expect.poll(() => focused(page)).toBe('2');
	await page.keyboard.press('Backspace');
	await page.mouse.move(pill.x + pill.width / 2, pill.y - 200);
	await page.mouse.up();
	await expect(railButtons(page)).toHaveCount(4);
	expect(await order(page)).toBe('Alpha Bravo Charlie Delta');
});

test('"?" lists every strip shortcut, and the palette reaches the same list', async ({ page }) => {
	await page.locator('#studio-pane-preview').click({ position: { x: 20, y: 60 } });
	await page.keyboard.press('?');
	const dialog = page.locator('[data-shortcuts-dialog]');
	await expect(dialog).toBeVisible();
	for (const does of ['New slide after', 'New slide before', 'Duplicate', 'Move earlier or later', 'Delete', 'Open the slide menu']) await expect(dialog.getByRole('cell', { name: does, exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByPlaceholder('Search or run a command…').fill('Keyboard shortcuts');
	await page.getByRole('option', { name: 'Keyboard shortcuts' }).click();
	await expect(dialog).toBeVisible();
});

// The focus drop reproduced on 2026-10-27 (followups.d/2927-p9-strip-keyboard-model): a focused tile that scrolled out
// of Veduta's window unmounted, and focus fell to the page. The current tile is now always rendered.
test('a focused map tile scrolled far out of the window keeps keyboard focus', async ({ page }) => {
	const deck = Array.from({ length: 60 }, (_, i) => `# Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n');
	await typeDeck(page, deck);
	await page.getByRole('button', { name: 'Slide map' }).first().click();
	const rail = page.locator('[data-map-rail]');
	await expect(rail.locator('button[aria-current="true"]')).toBeVisible();
	await rail.locator('button[aria-current="true"]').focus();
	await page.keyboard.press('Home');
	await expect(counter(page)).toHaveText('Slide 1 / 60');
	await expect.poll(() => focused(page)).toBe('0');
	const box = await rail.locator('[class*="overflow-x-scroll"]').first().boundingBox();
	if (!box) throw new Error('no scroller');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < 30; i++) await page.mouse.wheel(1200, 0);
	await expect.poll(() => rail.locator('[class*="overflow-x-scroll"]').first().evaluate((el) => el.scrollLeft)).toBeGreaterThan(2000);
	expect(await focused(page)).toBe('0');
	await page.keyboard.press('ArrowRight');
	await expect(counter(page)).toHaveText('Slide 2 / 60');
	await expect.poll(() => focused(page)).toBe('1');
});
