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

async function openStudioDeck(page: Page, source: string = deck) {
	// Type at desktop width, where the editor is on screen, then resize to the project's own box.
	const target = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, source);
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
const caption = (page: Page) => lightbox(page).locator('p').first();
const counter = (page: Page) => lightbox(page).locator('p').nth(1);
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
	await expect(caption(page)).toHaveText('Wide landscape');
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

// The Studio's preview box takes no pointer events, so `:hover` never reaches a tile in the frame. The holder
// hit-tests the pointer instead and marks the tile (`hoverCollageAt`, collage-host.js), which collage.styles.css
// reads beside `:hover`. Driven with a REAL mouse at the photo's screen position, as the click arms above are.
test('@smoke @gecko the photo under the mouse in the Studio preview pops, its neighbors recede, and both reset when the mouse leaves', async ({ page }) => {
	await openStudioDeck(page);
	const tiles = livePreview(page).locator('.collage-tile');
	const at = await photoAt(page, 1);
	await page.mouse.move(at.x - 40, at.y - 40);
	await page.mouse.move(at.x, at.y, { steps: 4 });
	await expect(tiles.nth(1)).toHaveAttribute('data-host-hover', '');
	await expect(tiles.nth(0)).not.toHaveAttribute('data-host-hover', '');
	// The look follows the marker: the hovered tile scales up and the rest drop their opacity.
	await expect.poll(() => tiles.nth(1).evaluate((el) => getComputedStyle(el).transform), { timeout: 5_000 }).not.toBe('none');
	await expect.poll(() => tiles.nth(0).evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5_000 }).toBeLessThan(1);
	// It also reads as something to click: the pointer is the zoom cursor (the holder wears it, because the frame takes
	// no pointer events), and the photo carries the accent ring the keyboard focus draws.
	const holderCursor = () =>
		page.evaluate(() => {
			for (let e = document.querySelector('iframe.live')?.parentElement ?? null; e; e = e.parentElement) if (e.style.cursor) return e.style.cursor;
			return '';
		});
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('zoom-in');
	await expect
		.poll(() => tiles.nth(1).locator('img').evaluate((el) => { const c = getComputedStyle(el); return `${c.outlineStyle} ${c.outlineWidth}`; }), { timeout: 5_000 })
		.toMatch(/^solid [1-9]/);
	await expect.poll(() => tiles.nth(0).locator('img').evaluate((el) => getComputedStyle(el).outlineStyle), { timeout: 5_000 }).toBe('none');
	// Moving off the photo onto the slide's margin takes the cue away again; the next move puts it back.
	const corner = await page.evaluate(() => {
		const b = (document.querySelector('iframe.live') as HTMLIFrameElement).getBoundingClientRect();
		return { x: b.left + 4, y: b.top + 4 };
	});
	await page.mouse.move(corner.x, corner.y, { steps: 4 });
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('');
	await expect(livePreview(page).locator('.collage-tile[data-host-hover]')).toHaveCount(0);
	await page.mouse.move(at.x, at.y, { steps: 4 });
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('zoom-in');
	// Moving to another photo moves the marker; there is never more than one.
	const next = await photoAt(page, 2);
	await page.mouse.move(next.x, next.y, { steps: 6 });
	await expect(tiles.nth(2)).toHaveAttribute('data-host-hover', '');
	await expect(livePreview(page).locator('.collage-tile[data-host-hover]')).toHaveCount(1);
	// Leaving the preview clears it.
	await page.mouse.move(5, 5);
	await expect(livePreview(page).locator('.collage-tile[data-host-hover]')).toHaveCount(0);
	await expect.poll(() => tiles.nth(2).evaluate((el) => getComputedStyle(el).transform), { timeout: 5_000 }).toBe('none');
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('');
});

// A slide change moves no pointer. The slide under a still mouse changes, so the cursor and the marker have to
// follow the slide, not the last mouse move: wheel from a collage onto a text slide with the mouse where it is.
test('@smoke the zoom cursor and the marker leave with the slide when the wheel changes it under a still mouse', async ({ page }) => {
	const planDeck = ['---', 'marp: true', '---', '', '<!-- _class: collage -->', '', '## First slide', '', '- ![Tall portrait](sample:photo-tall.jpg)', '- ![Wide landscape](sample:photo-wide.jpg)', '- ![Square](sample:photo-square.jpg)', '- ![Panorama](sample:photo-pano.jpg)', '', '---', '', '## Second slide', '', 'Only words here.'].join('\n');
	await openStudioDeck(page, planDeck);
	const holderCursor = () =>
		page.evaluate(() => {
			for (let e = document.querySelector('iframe.live')?.parentElement ?? null; e; e = e.parentElement) if (e.style.cursor) return e.style.cursor;
			return '';
		});
	const at = await photoAt(page, 1);
	await page.mouse.move(at.x - 40, at.y - 40);
	await page.mouse.move(at.x, at.y, { steps: 4 });
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('zoom-in');
	await page.mouse.wheel(0, 300);
	await expect(slideTitle(page)).toHaveText('Second slide', { timeout: 15_000 });
	await expect.poll(holderCursor, { timeout: 5_000 }).toBe('');
	await expect(livePreview(page).locator('.collage-tile[data-host-hover]')).toHaveCount(0);
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

// ── bleed packs for the deck's own shape (#2641 P4) ──────────────────────────────────────
// A bleed grid is stretched to the slide, so what the layout leaves empty is cropped off each photo.
// The packer used to assume 16:9, so a 4:3 deck cropped about a third of every photo. The live path
// now measures the section and packs for its real aspect, as the CLI does from the deck's size.
test('@smoke the live preview packs a bleed collage for the deck\'s own 4:3 shape', async ({ page }) => {
	const fourThree = `---
marp: true
size: standard
---

<!-- _class: collage bleed -->

## First slide

${grid}
`;
	await openStudioDeck(page, fourThree);
	await expect(livePreview(page).locator('ul[data-collage="packed"]')).toHaveCount(1, { timeout: 30_000 });
	const m = await page.evaluate(() => {
		const doc = (document.querySelector('iframe.live') as HTMLIFrameElement).contentDocument as Document;
		const sec = doc.querySelector('section.collage') as HTMLElement;
		const crops = [...sec.querySelectorAll('.collage-tile')].map((t) => {
			const i = t.querySelector('img') as HTMLImageElement;
			const r = t.getBoundingClientRect();
			const a = i.naturalWidth / i.naturalHeight;
			const b = r.width / r.height;
			return 1 - Math.min(a / b, b / a);
		});
		return { slide: sec.offsetWidth / sec.offsetHeight, crops };
	});
	// ANTI-VACUITY: this really is a 4:3 canvas with four measured photos.
	expect(m.slide).toBeCloseTo(4 / 3, 2);
	expect(m.crops).toHaveLength(4);
	// Packed for 16:9 these were 0.33; packed for 4:3 the demo set crops 4.4%.
	for (const c of m.crops) expect(c).toBeLessThan(0.08);
});

// ── stepping (#2641 P5) ──────────────────────────────────────────────────────────────────
// The open photo steps through the collage's other photos in written order. The rules (which key,
// how far a swipe must go) are the transport kernel's; the Studio hands them to the opener.
const ALTS = photos.map(([alt]) => alt);

test('@smoke @crosswidth the open photo steps with the arrow keys and the two buttons', async ({ page }) => {
	await openStudioDeck(page);
	const at = await photoAt(page, 0);
	await page.mouse.click(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await expect(caption(page)).toHaveText(ALTS[0]);
	await expect(counter(page)).toHaveText('1 / 4');
	await glideDone(page);

	await page.keyboard.press('ArrowRight');
	await expect(caption(page)).toHaveText(ALTS[1]);
	await expect(lightbox(page).locator('img')).toHaveAttribute('src', /photo-wide\.jpg/);
	await expect(counter(page)).toHaveText('2 / 4');
	await page.getByRole('button', { name: 'Next photo' }).click();
	await expect(caption(page)).toHaveText(ALTS[2]);
	await page.keyboard.press('ArrowLeft');
	await page.getByRole('button', { name: 'Previous photo' }).click();
	await expect(caption(page)).toHaveText(ALTS[0]);
	await page.keyboard.press('End');
	await expect(caption(page)).toHaveText(ALTS[3]);
	await page.keyboard.press('ArrowRight');
	await expect(caption(page), 'next from the last wraps to the first').toHaveText(ALTS[0]);
	await page.keyboard.press('Home');
	await expect(counter(page)).toHaveText('1 / 4');

	// The keys went to the photo, not the deck behind it.
	await expect(slideTitle(page)).toHaveText('First slide');
	await page.keyboard.press('Escape');
	await expect(lightbox(page)).toHaveCount(0);
	await expect(slideTitle(page)).toHaveText('First slide');
});

// Each runs twice: untagged for the Chromium projects, and as a @gecko @webkit-tablet twin for the
// two other engines, which only run tests carrying their tag (the desktop project skips any title
// that names @webkit without @crosswidth), per playwright.config.ts. A wheel and a key are engine
// behavior: Blink's answer does not predict Gecko's or WebKit's.
for (const tag of ['', ' @gecko @webkit-tablet']) {
	test(`${tag ? '' : '@smoke @crosswidth '}a plain mouse-wheel flick steps the open photo once per flick; a pinch (ctrl + wheel) never steps${tag}`, async ({ page }) => {
		await openStudioDeck(page);
		const at = await photoAt(page, 0);
		await page.mouse.click(at.x, at.y);
		await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
		await expect(counter(page)).toHaveText('1 / 4');
		await glideDone(page);
		await page.mouse.move(at.x, at.y);

		// One flick is a burst of wheel events; the deck's cooldown turns it into one step.
		await page.mouse.wheel(0, 120);
		await page.mouse.wheel(0, 120);
		await page.mouse.wheel(0, 300);
		await expect(counter(page)).toHaveText('2 / 4');
		// Once the cooldown has passed, up is previous. Retry the flick until it lands: the retry IS the
		// cooldown under test, not a sleep.
		await expect(async () => {
			await page.mouse.wheel(0, -120);
			await expect(counter(page)).toHaveText('1 / 4', { timeout: 300 });
		}).toPass({ timeout: 10_000 });
		// A pinch is ctrl + wheel: it zooms (the signal) and never steps. The cooldown is over by now.
		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -400);
		await page.keyboard.up('Control');
		await expect.poll(async () => (await imgScale(page)).scale, { timeout: 5000 }).toBeGreaterThan(1.5);
		await expect(counter(page)).toHaveText('1 / 4');
		// The wheel did not turn the deck behind it.
		await expect(slideTitle(page)).toHaveText('First slide');
	});

	test(`${tag ? '' : '@smoke '}the digit keys 1 to 6 jump to that photo while it is open, and a digit past the set does nothing${tag}`, async ({ page }) => {
		await openStudioDeck(page);
		const at = await photoAt(page, 0);
		await page.mouse.click(at.x, at.y);
		await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
		await glideDone(page);
		await page.keyboard.press('3');
		await expect(caption(page)).toHaveText(ALTS[2]);
		await page.keyboard.press('1');
		await expect(caption(page)).toHaveText(ALTS[0]);
		await page.keyboard.press('4');
		await expect(counter(page)).toHaveText('4 / 4');
		await page.keyboard.press('6');
		await expect(counter(page), 'a four-photo set ignores 6').toHaveText('4 / 4');
		await expect(slideTitle(page)).toHaveText('First slide');
	});
}

/** One finger from (x, y) to (x + dx, y + dy), through the browser's own input pipeline. */
async function swipe(page: Page, at: { x: number; y: number }, dx: number, dy: number) {
	const cdp = await page.context().newCDPSession(page);
	const pt = (x: number, y: number) => ({ x, y, radiusX: 4, radiusY: 4, force: 1 });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(at.x, at.y)] });
	for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(at.x + (dx * i) / 6, at.y + (dy * i) / 6)] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

test('@parity a swipe on the open photo steps to the next or previous one', async ({ page }, info) => {
	test.skip(!info.project.use.hasTouch, 'this project models a device with no touchscreen');
	test.skip(info.project.name.startsWith('webkit'), 'WebKit exposes no CDP touch pipeline; its tap is covered above and its swipe is UNVERIFIED');
	await openStudioDeck(page);
	const at = await photoAt(page, 0);
	await page.touchscreen.tap(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await glideDone(page);
	const vp = page.viewportSize() ?? { width: 390, height: 844 };
	const mid = { x: vp.width * 0.6, y: vp.height * 0.5 };
	await swipe(page, mid, -vp.width * 0.4, 6); // a left swipe turns to the next photo
	await expect(caption(page)).toHaveText(ALTS[1]);
	await swipe(page, { x: vp.width * 0.3, y: vp.height * 0.5 }, vp.width * 0.4, 6); // right: back
	await expect(caption(page)).toHaveText(ALTS[0]);
	await swipe(page, mid, 4, -vp.height * 0.3); // a vertical move is not a swipe
	await expect(caption(page)).toHaveText(ALTS[0]);
	await expect(slideTitle(page)).toHaveText('First slide');
});

// ── zoom (#2641 P6) ──────────────────────────────────────────────────────────────────────
// The zoom machine is the shared kernel's (`createZoomGesture`, lib/core/present-transport.mjs); the
// opener only feeds it points and paints what it returns. These arms drive the real inputs: a
// trackpad pinch (ctrl + wheel), the keys, a mouse drag, and a two-finger pinch through the
// browser's own touch pipeline.
const imgScale = (page: Page) =>
	page.evaluate(() => {
		const el = document.querySelector('.collage-lightbox img') as HTMLElement;
		const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
		return { scale: m.a, x: m.e, y: m.f };
	});
const zoomPill = (page: Page) => lightbox(page).getByRole('button', { name: /Reset zoom to fit/ });

async function openWide(page: Page) {
	await openStudioDeck(page);
	const at = await photoAt(page, 1);
	await page.mouse.click(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await glideDone(page);
}

test('@smoke @crosswidth a trackpad pinch (ctrl + wheel) and the + - 0 keys zoom the open photo; the pill returns it to fit', async ({ page }) => {
	await openWide(page);
	expect((await imgScale(page)).scale).toBe(1);
	await expect(zoomPill(page)).toHaveCount(0);
	const box = (await lightbox(page).locator('img').boundingBox()) as { x: number; y: number; width: number; height: number };
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.keyboard.down('Control');
	await page.mouse.wheel(0, -400);
	await page.keyboard.up('Control');
	await expect.poll(async () => (await imgScale(page)).scale, { timeout: 5000 }).toBeGreaterThan(1.5);
	await expect(zoomPill(page)).toBeVisible();
	await expect(zoomPill(page)).toHaveText(/^\d+%$/);
	// A plain wheel neither zooms nor scrolls what is behind.
	const held = (await imgScale(page)).scale;
	await page.mouse.wheel(0, 300);
	expect((await imgScale(page)).scale).toBeCloseTo(held, 5);
	await page.screenshot({ path: test.info().outputPath(`zoomed-${test.info().project.name}.png`) });
	await zoomPill(page).click();
	await expect.poll(async () => (await imgScale(page)).scale).toBe(1);
	await expect(zoomPill(page)).toHaveCount(0);

	await page.keyboard.press('+');
	await page.keyboard.press('+');
	await expect.poll(async () => (await imgScale(page)).scale).toBeGreaterThan(1.4);
	await page.keyboard.press('-');
	await page.keyboard.press('-');
	await page.keyboard.press('-');
	await expect.poll(async () => (await imgScale(page)).scale).toBe(1);
	await page.keyboard.press('+');
	await page.keyboard.press('0');
	await expect.poll(async () => (await imgScale(page)).scale).toBe(1);
	// Zoom never leaks to the next photo, and a zoomed photo still closes on Escape.
	await page.keyboard.press('+');
	await page.keyboard.press('ArrowRight');
	await expect(caption(page)).toHaveText(ALTS[2]);
	expect((await imgScale(page)).scale).toBe(1);
	await page.keyboard.press('+');
	await page.keyboard.press('Escape');
	await expect(lightbox(page)).toHaveCount(0);
});

test('@smoke a mouse drag pans a zoomed photo, and stays inside the photo\'s own edges', async ({ page }, info) => {
	test.skip(Boolean(info.project.use.hasTouch), 'a touch device has no mouse drag');
	await openWide(page);
	await page.keyboard.press('+');
	await page.keyboard.press('+');
	await page.keyboard.press('+');
	await expect.poll(async () => (await imgScale(page)).scale).toBeGreaterThan(1.9);
	const box = (await lightbox(page).locator('img').boundingBox()) as { x: number; y: number; width: number; height: number };
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const before = await imgScale(page);
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx - 60, cy - 30, { steps: 5 });
	await page.mouse.up();
	const after = await imgScale(page);
	expect(after.scale).toBeCloseTo(before.scale, 5);
	expect(after.x).toBeLessThan(before.x - 20);
	expect(after.y).toBeLessThan(before.y - 10);
	// A pan is bounded: dragging far the other way stops at the photo's own edge (x = 0 at the left).
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 4000, cy + 4000, { steps: 8 });
	await page.mouse.up();
	const edge = await imgScale(page);
	expect(edge.x).toBeLessThanOrEqual(0.0001);
	expect(edge.y).toBeLessThanOrEqual(0.0001);
	await expect(lightbox(page)).toBeVisible();
});

test('@parity a two-finger pinch zooms the open photo and does not step; one finger then pans, not swipes', async ({ page }, info) => {
	test.skip(!info.project.use.hasTouch, 'this project models a device with no touchscreen');
	test.skip(info.project.name.startsWith('webkit'), 'WebKit exposes no CDP touch pipeline: the pinch there is UNVERIFIED');
	await openStudioDeck(page);
	const at = await photoAt(page, 1);
	await page.touchscreen.tap(at.x, at.y);
	await expect(lightbox(page)).toBeVisible({ timeout: 15_000 });
	await glideDone(page);
	const box = (await lightbox(page).locator('img').boundingBox()) as { x: number; y: number; width: number; height: number };
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const cdp = await page.context().newCDPSession(page);
	const pt = (x: number, y: number) => ({ x, y, radiusX: 10, radiusY: 10, force: 1 });
	const half0 = Math.min(30, box.width / 8);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - half0, cy), pt(cx + half0, cy)] });
	for (let i = 1; i <= 8; i++) {
		const half = half0 + ((box.width / 3 - half0) * i) / 8;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half, cy), pt(cx + half, cy)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect.poll(async () => (await imgScale(page)).scale, { timeout: 5000 }).toBeGreaterThan(1.5);
	await expect(zoomPill(page)).toBeVisible();
	await expect(caption(page), 'a pinch is not a swipe').toHaveText(ALTS[1]);
	const zoomed = await imgScale(page);
	// One finger, zoomed in: a horizontal drag pans and must not turn to the next photo.
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx, cy)] });
	for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - (i * box.width) / 10, cy)] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect(caption(page), 'a pan while zoomed is not a swipe').toHaveText(ALTS[1]);
	expect((await imgScale(page)).x).toBeLessThan(zoomed.x - 10);
	await page.screenshot({ path: info.outputPath(`pinch-${info.project.name}.png`) });
	await zoomPill(page).tap();
	await expect.poll(async () => (await imgScale(page)).scale).toBe(1);
	await cdp.detach();
});
