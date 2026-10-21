import type { Page } from '@playwright/test';
import { insertEntry, insertVia, openInsertMenu } from './compose-insert';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/** The saved deck text. The store keeps it JSON-encoded, so decode it before comparing bytes. */
async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

/**
 * COMPOSE — the spark editor (phase 2 of engineering/decisions/2026-10-13-compose-inline-notation-editors.md).
 *
 * A spark (`~{12 14 17, bar, c3}`) is drawn as the slide draws it, as one inline object. A tap opens the
 * shared editor; each change rewrites ONLY the word the author changed. The oracle is the PERSISTED SOURCE,
 * the whole deck byte for byte with one substitution, never the screen. `desktop` only: the phone's sheet is
 * driven by hand at 390px with touch emulation, and this spec claims nothing about a device.
 */

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'<!-- _class: content -->',
	'',
	'## KPIs',
	'',
	'Revenue `~{12 14 13 17 21, bar, c3}` and share `~{72%}` and a trend `~{3 5 4 6}`.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Plain slide',
	'',
	'Nothing here yet.',
].join('\n');

async function openDeckInCompose(page: Page, source = DECK): Promise<void> {
	await gotoStudio(page);
	await setEditorContent(page, source);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

const editor = (page: Page) => page.locator('[data-slot="popover-content"]');
const drawn = (page: Page) => page.locator('.cs-npill .lat-spark');

test.describe('compose spark editor', () => {
	test('@smoke Compose shows the sparks, not their grammar, and opening the deck writes nothing', async ({ page }) => {
		await openDeckInCompose(page);
		await expect(drawn(page)).toHaveCount(3);
		await expect(drawn(page).first()).toHaveAttribute('data-type', 'bar');
		await expect(drawn(page).first()).toHaveAttribute('data-c', 'c3');
		await expect.poll(() => page.locator('.cs-host .ProseMirror').innerText()).not.toMatch(/~\{/);
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('@smoke a tap opens the editor, and each change rewrites only the word that changed', async ({ page }) => {
		await openDeckInCompose(page);
		await page.getByRole('button', { name: 'Edit spark, bar' }).click();
		await expect(editor(page)).toBeVisible();

		await editor(page).getByRole('radio', { name: 'Size: Large' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{12 14 13 17 21, bar, c3}', '~{12 14 13 17 21, bar, c3, lg}'));
		await expect(drawn(page).first()).toHaveAttribute('data-size', 'lg');

		await editor(page).getByRole('radio', { name: 'Color 6' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{12 14 13 17 21, bar, c3}', '~{12 14 13 17 21, bar, c6, lg}'));

		// One number: every other word stays as written.
		const point = editor(page).getByRole('textbox', { name: 'Point 3' });
		await point.fill('99');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{12 14 13 17 21, bar, c3}', '~{12 14 99 17 21, bar, c6, lg}'));
	});

	test('@smoke a chart the line marks do not fit clears them in the same write, and a bad number writes nothing', async ({ page }) => {
		await openDeckInCompose(page);
		await page.getByRole('button', { name: 'Edit spark, line' }).click();
		await editor(page).getByRole('button', { name: 'Mark: End dot' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{3 5 4 6}', '~{3 5 4 6, end}'));
		await editor(page).getByRole('radio', { name: 'Chart: Bars' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{3 5 4 6}', '~{3 5 4 6, bar}'));

		await editor(page).getByRole('textbox', { name: 'Point 1' }).fill('3x');
		await expect(editor(page).getByRole('alert')).toContainText('Numbers only');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{3 5 4 6}', '~{3 5 4 6, bar}'));
	});

	test('the insert door puts a spark after the caret and opens its editor; one undo takes the pick back', async ({ page }) => {
		await openDeckInCompose(page);
		await page.locator('.cs-slide').nth(1).locator('.cs-slide-content p').first().click();
		await page.keyboard.press('End');
		await insertVia(page, 'Spark');
		await expect(editor(page)).toBeVisible();
		await expect.poll(() => savedDeck(page)).toContain('Nothing here yet. `~{12 14 13 17 21}`');
		await editor(page).getByRole('radio', { name: 'Chart: Area' }).click();
		await expect.poll(() => savedDeck(page)).toContain('`~{12 14 13 17 21, area}`');
		await page.getByRole('button', { name: 'Undo' }).first().click();
		await expect.poll(() => savedDeck(page)).toContain('`~{12 14 13 17 21}`');
	});

	test('the drawn spark follows the site into dark mode, matching the preview', async ({ page }) => {
		await openDeckInCompose(page);
		const strokes = () =>
			page.evaluate(() => {
				const el = document.querySelector('.cs-npill .lat-spark .s-up, .cs-npill .lat-spark .s-line') as SVGElement;
				const frame = document.querySelector('#studio-preview iframe.live') as HTMLIFrameElement;
				const pv = frame.contentDocument?.querySelector('.lat-spark .s-up, .lat-spark .s-line') as SVGElement | null;
				return { compose: getComputedStyle(el).fill, preview: pv && frame.contentWindow ? frame.contentWindow.getComputedStyle(pv).fill : null };
			});
		const before = await strokes();
		expect(before.compose).toBe(before.preview);
		await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
		await expect.poll(async () => (await strokes()).preview, { timeout: 8000 }).not.toBe(before.preview);
		await expect.poll(async () => {
			const s = await strokes();
			return s.compose === s.preview;
		}, { timeout: 8000 }).toBe(true);
	});

	test('the insert door goes after the word the caret is in, and declines when a selection reaches into the author\'s own code', async ({ page }) => {
		await openDeckInCompose(page, DECK.replace('Nothing here yet.', 'Revenue grew `foo` fast.'));
		const para = page.locator('.cs-slide').nth(1).locator('.cs-slide-content p').first();
		await para.click();
		await page.keyboard.press('Home');
		// "Revenue gr|ew": the caret is mid-word.
		for (let i = 0; i < 'Revenue gr'.length; i++) await page.keyboard.press('ArrowRight');
		await insertVia(page, 'Spark');
		await expect.poll(() => savedDeck(page)).toContain('Revenue grew `~{12 14 13 17 21}` `foo` fast.');
		await editor(page).getByRole('button', { name: 'Done' }).click();

		// A selection from "grew" into the middle of `foo` would split the author's code: it declines and writes nothing.
		const before = await savedDeck(page);
		await para.click();
		await page.keyboard.press('Home');
		await page.keyboard.down('Shift');
		for (let i = 0; i < 'Revenue grew  '.length + 2; i++) await page.keyboard.press('ArrowRight');
		await page.keyboard.up('Shift');
		// The menu says why, and nothing is written.
		await openInsertMenu(page);
		await expect(insertEntry(page, 'Spark')).toHaveAttribute('data-disabled', '');
		await expect(insertEntry(page, 'Spark')).toContainText('inside a code span');
		await expect(editor(page)).toHaveCount(0);
		await expect.poll(() => savedDeck(page)).toBe(before);
	});
});

