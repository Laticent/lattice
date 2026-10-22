import type { Page } from '@playwright/test';
import { addLibraryPhoto, insertVia, openDeckInCompose, savedDeck } from './compose-insert';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

/**
 * COMPOSE — images: drawn, chosen from the Library by looking, and edited in a panel.
 *
 * A Library photo (`![alt](asset:harbor)`) used to be an `<img>` the browser could not load, so Compose showed a broken-image mark
 * where the slide shows the photo, and the only way to put a photo on a slide was to type `![](asset:` and read a completion menu.
 * Now Compose draws it from the Studio's own name-to-URL map, an Image door opens a photo picker, and a tap opens a panel
 * (docs/src/components/studio/image-node-view.ts, PhotoPicker.tsx, ImagePanel.tsx). The oracle is the PERSISTED SOURCE.
 * Design: engineering/decisions/2026-10-21-compose-point-and-click.md §6.
 */

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Photos',
	'',
	'Some words here.',
	'',
	'![A harbor at dawn](asset:harbor)',
	'',
	'![bg right:40% blur](asset:forest)',
	'',
	'![Elsewhere](https://example.com/x.png)',
].join('\n');

const panel = (page: Page) => page.locator('[data-slot="popover-content"]');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose a photo' });

/** Fill the Library with two photos, then open the deck in Compose. */
async function openWithPhotos(page: Page, source: string = DECK): Promise<void> {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('button', { name: 'Filter' }).click();
	await page.getByRole('menuitemradio', { name: 'Images' }).click();
	await addLibraryPhoto(page, 'Harbor.png', '#1a6fb5');
	await addLibraryPhoto(page, 'Forest.png', '#2a8a4a');
	await expect(page.locator('[data-media-card="forest"]')).toBeVisible();
	await page.getByRole('button', { name: CHROME.library }).click();
	await openDeckInCompose(page, source);
}

test.describe('compose images', () => {
	test('@smoke a Library photo is drawn as the picture it is, a web image is not fetched, and opening the deck writes nothing', async ({ page }) => {
		const requested: string[] = [];
		page.on('request', (r) => requested.push(r.url()));
		await openWithPhotos(page);
		const harbor = page.locator('.cs-img-btn img').first();
		await expect(harbor).toBeVisible();
		await expect.poll(() => harbor.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1))).toBe(800);
		expect(await harbor.getAttribute('src')).toMatch(/^blob:/);
		// A background says so, and is drawn too.
		await expect(page.locator('.cs-img-badge')).toHaveText(/Background · Right side/);
		// A web image is a stand-in that says what it is. Compose never reaches the network for it.
		await expect(page.locator('.cs-img-stand')).toContainText('Elsewhere');
		expect(requested.filter((u) => new URL(u).hostname === 'example.com')).toEqual([]);
		expect(await savedDeck(page)).toBe(DECK);
	});

	test('a photo the Library does not hold is a stand-in that names it, not a broken image', async ({ page }) => {
		await openDeckInCompose(page, ['<!-- _class: content -->', '', '## Lost', '', '![Gone](asset:never-added)'].join('\n'));
		await expect(page.locator('.cs-img-missing')).toContainText('never-added');
		await expect(page.locator('.cs-img-btn img')).toHaveCount(0);
	});

	test('@smoke a tap opens the panel, and the description is written when the author leaves the field', async ({ page }) => {
		await openWithPhotos(page);
		await page.getByRole('button', { name: 'Edit image: A harbor at dawn' }).click();
		await expect(panel(page)).toBeVisible();
		await expect(panel(page)).toContainText('Library photo: harbor');
		const alt = panel(page).getByRole('textbox', { name: 'Description' });
		await alt.fill('Boats in the harbor');
		// Nothing is written on each key.
		expect(await savedDeck(page)).toBe(DECK);
		await alt.press('Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![A harbor at dawn](asset:harbor)', '![Boats in the harbor](asset:harbor)'));
		// The panel follows the write.
		await expect(page.getByRole('button', { name: 'Edit image: Boats in the harbor' })).toBeVisible();
	});

	test('Replace photo opens the picker, shows the photos as pictures, and a pick writes the source only', async ({ page }) => {
		await openWithPhotos(page);
		await page.getByRole('button', { name: 'Edit image: A harbor at dawn' }).click();
		await panel(page).getByRole('button', { name: 'Replace photo' }).click();
		await expect(picker(page)).toBeVisible();
		await expect(picker(page).getByRole('button', { name: 'Photo forest' }).locator('img')).toBeVisible();
		await picker(page).getByRole('textbox', { name: 'Search photos' }).fill('for');
		await expect(picker(page).getByRole('button', { name: /^Photo / })).toHaveCount(1);
		await picker(page).getByRole('button', { name: 'Photo forest' }).click();
		await expect(picker(page)).toHaveCount(0);
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![A harbor at dawn](asset:harbor)', '![A harbor at dawn](asset:forest)'));
		// The panel stays open on the image after the picker closes.
		await expect(panel(page)).toContainText('Library photo: forest');
	});

	test('@smoke Add a photo in the picker imports through the Library flow and picks the new photo', async ({ page }) => {
		// A new author: the Library is empty, so the picker offers the upload itself.
		await openDeckInCompose(page, ['<!-- _class: content -->', '', '## New', '', 'Words.'].join('\n'));
		await insertVia(page, 'Image');
		await expect(picker(page)).toBeVisible();
		await expect(picker(page)).toContainText('Your Library has no photos yet');
		const png = await page.evaluate(async () => {
			const c = document.createElement('canvas');
			c.width = 400;
			c.height = 300;
			(c.getContext('2d') as CanvasRenderingContext2D).fillRect(0, 0, 400, 300);
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		});
		await picker(page).locator('input[type="file"]').setInputFiles({ name: 'Dock Crane.png', mimeType: 'image/png', buffer: Buffer.from(png) });
		// The Library's own format dialog asks how to store it.
		const dialog = page.getByRole('dialog').filter({ hasText: /How should|stored|format/i }).last();
		await dialog.getByRole('button', { name: /^Add photo/ }).click();
		await expect(picker(page)).toHaveCount(0);
		await expect.poll(() => savedDeck(page)).toMatch(/!\[[^\]]*\]\(asset:dock-crane\)/);
		// It is on the shelf the Library shows.
		await page.getByRole('button', { name: CHROME.library }).click();
		await expect(page.locator('[data-media-card="dock-crane"]')).toBeVisible();
	});

	test('a background shows its placement, and a pick writes only the side word', async ({ page }) => {
		await openWithPhotos(page);
		await page.getByRole('button', { name: 'Edit background image' }).click();
		await expect(panel(page).getByRole('textbox', { name: 'Description' })).toHaveCount(0);
		await expect(panel(page).getByRole('radio', { name: 'Placement: Right side' })).toHaveAttribute('aria-checked', 'true');
		await panel(page).getByRole('radio', { name: 'Placement: Left side' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![bg right:40% blur]', '![bg left:40% blur]'));
		await panel(page).getByRole('radio', { name: 'Placement: Full slide' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![bg right:40% blur]', '![bg blur]'));
	});

	test('Remove takes the image and its paragraph, and Undo brings it back', async ({ page }) => {
		await openWithPhotos(page);
		await page.getByRole('button', { name: 'Edit image: A harbor at dawn' }).click();
		await panel(page).getByRole('button', { name: /Remove/ }).click();
		await expect(panel(page)).toHaveCount(0);
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![A harbor at dawn](asset:harbor)\n\n', ''));
		await page.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('@smoke the Image door picks from the Library and puts the photo on the slide in a paragraph of its own', async ({ page }) => {
		await openWithPhotos(page, ['<!-- _class: content -->', '', '## Photos', '', 'Some words here.'].join('\n'));
		await page.locator('.cs-slide-content p').first().click();
		await insertVia(page, 'Image');
		await expect(picker(page)).toBeVisible();
		await picker(page).getByRole('button', { name: 'Photo harbor' }).click();
		await expect.poll(() => savedDeck(page)).toBe(['<!-- _class: content -->', '', '## Photos', '', 'Some words here.', '', '![Harbor](asset:harbor)'].join('\n'));
		// The panel is open on the new image, so the description is one tap away.
		await expect(panel(page)).toBeVisible();
		await expect(panel(page).getByRole('textbox', { name: 'Description' })).toHaveValue('Harbor');
		await expect(page.locator('.cs-img-btn img')).toBeVisible();
	});

	// Run under BOTH pointer states (`@parity`: the `*-touch` projects at 1440, 820 and 390px as well as `desktop`). On touch the image is
	// opened with a real tap, the picker is a sheet, and the photo is chosen by tapping it. Touch EMULATION in Chromium, not a device.
	test('@parity a touch tap on an image opens the panel, and picking a photo from the picker writes only the source', async ({ page }) => {
		await openWithPhotos(page);
		const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
		const tap = async (l: ReturnType<Page['locator']>) => (touch ? l.tap() : l.click());
		await tap(page.getByRole('button', { name: 'Edit image: A harbor at dawn' }));
		const sheet = page.locator('[data-slot="popover-content"], [role="dialog"]').last();
		await expect(sheet).toBeVisible();
		await tap(sheet.getByRole('button', { name: 'Replace photo' }));
		await expect(picker(page)).toBeVisible();
		await tap(picker(page).getByRole('button', { name: 'Photo forest' }));
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('![A harbor at dawn](asset:harbor)', '![A harbor at dawn](asset:forest)'));
	});

	test('an empty Library says so and offers the Library', async ({ page }) => {
		await openDeckInCompose(page, ['<!-- _class: content -->', '', '## Photos', '', 'Some words here.'].join('\n'));
		await page.locator('.cs-slide-content p').first().click();
		await insertVia(page, 'Image');
		await expect(picker(page).getByText('Your Library has no photos yet')).toBeVisible();
		await picker(page).getByRole('button', { name: 'Open the Library' }).click();
		await expect(picker(page)).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Media', exact: true })).toBeVisible();
	});

	test('a locked slide takes no image: the door says so', async ({ page }) => {
		await openWithPhotos(page, ['<!-- _class: content -->', '', '## Locked', '', 'Has ~~old~~ words.'].join('\n'));
		await page.locator('.cs-slide-content p').first().click();
		await page.locator('.cs-slide-active').getByRole('button', { name: 'Insert', exact: true }).click();
		await expect(page.getByRole('menuitem', { name: /^Image/ })).toHaveAttribute('data-disabled', '');
		await expect(page.getByRole('menuitem', { name: /^Image/ })).toContainText('edited in Markdown');
	});
});
