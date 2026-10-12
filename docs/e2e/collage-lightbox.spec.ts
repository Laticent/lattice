import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── The collage lightbox, on the REAL Studio preview ────────────────────────────────
//
// `collage` photos enlarge on click. The opener is one kernel (`lib/core/collage-lightbox.mjs`)
// that three hosts call. The Playground and the exported player were driven when it shipped
// (#2635); the Studio never was. The Studio is the odd host: its live preview sits in a
// `pointer-events-none` box, so a click never reaches the frame's own guard. The holder
// (`previewHolderRef` in StudioShell.tsx) hit-tests the click into the SCALED frame itself
// (`tapCollageAt`, docs/src/playground/collage-host.js). A unit test cannot see that path, so
// every arm here clicks at the photo's SCREEN position, never on the in-frame element — a
// frame-locator click dispatches inside the frame and proves nothing about the box.
//
// After a photo closes, the keyboard must be the deck's again: a pointer open must not leave the
// photo focused, or Space or Enter would reopen it. Space is NOT a navigation key in the Studio's
// edit view (`SHELL_KEYMAP` drops it so the editor can type), so the Studio arm asserts that Space
// does not reopen the photo and that ArrowRight still turns the preview. "Space advances" is
// asserted where Space is bound: the exported player (test/integration/export) and Present.

const photos = [
	['Tall portrait', 'photo-tall.jpg'],
	['Wide landscape', 'photo-wide.jpg'],
	['Square', 'photo-square.jpg'],
	['Panorama', 'photo-pano.jpg'],
];
const grid = photos.map(([alt, file]) => `- ![${alt}](sample:${file})`).join('\n');
const deck = `---
marp: true
---

<!-- _class: collage -->

## First slide

${grid}

---

<!-- _class: collage bleed -->

## Second slide

${grid}
`;

// The engine paint is not the subject; stub the heavy externals the way the video spec does so
// nothing is network-gated.
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

/** The photo's centre in VIEWPORT coordinates: the frame is CSS-scaled, so scale the in-frame rect. */
async function photoAt(page: Page, index: number): Promise<{ x: number; y: number }> {
	const at = await photoPoint(page, index);
	if (!at) throw new Error(`photo ${index} is not in the preview`);
	return at;
}

function photoPoint(page: Page, index: number) {
	return page.evaluate((i) => {
		const fr = document.querySelector('iframe.live') as HTMLIFrameElement;
		const img = fr.contentDocument?.querySelectorAll('.collage-tile > img')[i] as HTMLElement | undefined;
		if (!img) return null;
		const r = img.getBoundingClientRect();
		const box = fr.getBoundingClientRect();
		const S = box.width / fr.offsetWidth;
		return { x: box.left + (r.left + r.width / 2) * S, y: box.top + (r.top + r.height / 2) * S };
	}, index);
}

async function openStudioDeck(page: Page) {
	// Type at desktop width, where the editor is on screen, then resize to the project's own box.
	const target = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	// The preview follows the caret, which typing left at the end of the deck: move it to slide 1.
	await page.keyboard.press('Control+Home');
	await expect(slideTitle(page)).toHaveText('First slide', { timeout: 15_000 });
	await page.setViewportSize(target);
	await expect(livePreview(page).locator('.collage-tile')).toHaveCount(4, { timeout: 30_000 });
	// The resize re-fits the scaled frame; click only once its box has stopped moving.
	let last = '';
	await expect
		.poll(async () => {
			const now = JSON.stringify(await photoPoint(page, 0));
			const same = now !== 'null' && now === last;
			last = now;
			return same;
		}, { intervals: [250], timeout: 15_000 })
		.toBe(true);
	// The bridge is installed by the parent after the frame paints; wait for it rather than race it.
	await expect
		.poll(() => page.evaluate(() => typeof (document.querySelector('iframe.live') as HTMLIFrameElement | null)?.contentWindow?.['__collageOpen' as keyof Window]), {
			timeout: 30_000,
		})
		.toBe('function');
	// Every photo is reachable by keyboard: stamped on the live frame by collage-host.js.
	await expect(livePreview(page).locator('.collage-tile > img[role="button"][tabindex="0"]')).toHaveCount(4);
}

const lightbox = (page: Page) => page.locator('.collage-lightbox');
/** The glide has ended: the photo carries no transform. */
const glideDone = (page: Page) => expect(lightbox(page).locator('img')).toHaveCSS('transform', 'none');
/**
 * Click `at` until the lightbox is gone. A backdrop click inside the first 400 ms of an open is
 * ignored on purpose (the ghost-click guard), so the retry is the behavior under test, not a sleep.
 */
const clickAway = (page: Page, at: { x: number; y: number }) =>
	expect(async () => {
		await page.mouse.click(at.x, at.y);
		await expect(lightbox(page)).toHaveCount(0, { timeout: 600 });
	}).toPass({ timeout: 10_000 });
const slideTitle = (page: Page) => livePreview(page).locator('.lattice h2').first();

test('@smoke @crosswidth a click on a photo in the Studio preview opens it; Escape and a click-away close it', async ({ page }, info) => {
	await openStudioDeck(page);
	const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}-${info.project.name}.png`) });
	await shot('1-closed');

	// OPEN. The click lands on the photo's screen position and crosses the pointer-events-none box.
	const at = await photoAt(page, 1);
	await page.mouse.click(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await expect(lightbox(page).locator('img')).toHaveAttribute('src', /photo-wide\.jpg/);
	await expect(lightbox(page).locator('p')).toHaveText('Wide landscape');
	await expect(slideTitle(page)).toHaveText('First slide'); // the click opened the photo and did not turn the slide
	await glideDone(page);
	await shot('2-open');

	// ESCAPE closes it.
	await page.keyboard.press('Escape');
	await expect(lightbox(page)).toHaveCount(0);
	await expect(slideTitle(page)).toHaveText('First slide'); // Escape closed the photo and did not turn the slide

	// CLICK-AWAY closes it. The corner is on the backdrop, away from the photo and the close button.
	await page.mouse.click(at.x, at.y);
	await expect(lightbox(page)).toBeVisible();
	await clickAway(page, { x: 4, y: 4 });
	await shot('3-closed-again');

	// THE KEYBOARD IS GIVEN BACK. A pointer open must not leave the photo focused (Space or Enter
	// would reopen it), and the keys that turn the preview must still reach the shell.
	await expect(slideTitle(page)).toHaveText('First slide');
	await page.keyboard.press('Space');
	await page.keyboard.press('Enter');
	await expect(lightbox(page)).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await expect(slideTitle(page)).toHaveText('Second slide');
	await page.keyboard.press('ArrowLeft');
	await expect(slideTitle(page)).toHaveText('First slide');
});

test('@parity @webkit-phone a tap on a photo in the Studio preview opens it; a tap on the close button closes it', async ({ page }, info) => {
	test.skip(!info.project.use.hasTouch, 'this project models a device with no touchscreen');
	await openStudioDeck(page);
	const at = await photoAt(page, 2);
	await page.touchscreen.tap(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await expect(lightbox(page).locator('img')).toHaveAttribute('src', /photo-square\.jpg/);
	await glideDone(page);
	await page.screenshot({ path: info.outputPath(`touch-open-${info.project.name}.png`) });
	await page.getByRole('button', { name: 'Close photo' }).tap();
	await expect(lightbox(page)).toHaveCount(0);
	// A tap on the backdrop closes it too (after the ghost-click window).
	await page.touchscreen.tap(at.x, at.y);
	await expect(lightbox(page)).toBeVisible();
	await expect(async () => {
		await page.touchscreen.tap(4, 4);
		await expect(lightbox(page)).toHaveCount(0, { timeout: 600 });
	}).toPass({ timeout: 10_000 });
});

// A mouse drag ends in a `click` too. On a `bleed` slide the tiles cover the slide, so without the
// tap slop (`collageDragged`, lib/core/collage-tap.mjs) a drag that ends on a photo opens it.
test('@smoke @crosswidth a mouse drag that ends on a photo does not open it; a plain click does', async ({ page }, info) => {
	test.skip(Boolean(info.project.use.hasTouch), 'a touch device has no mouse drag');
	await openStudioDeck(page);
	const at = await photoAt(page, 1);
	// Press on the photo, travel 40 px, release: the browser still fires `click`, on the holder.
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x + 20, at.y + 10, { steps: 4 });
	await page.mouse.move(at.x + 40, at.y + 20, { steps: 4 });
	await page.mouse.up();
	await expect(slideTitle(page)).toHaveText('First slide');
	await expect(lightbox(page)).toHaveCount(0);
	// ANTI-VACUITY: the same press-and-release without travel opens it, so "nothing opened" above
	// means the drag was refused, not that the photo was unreachable.
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x + 3, at.y + 2);
	await page.mouse.up();
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
});
