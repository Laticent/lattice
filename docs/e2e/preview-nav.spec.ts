import { currentSlide, expect, gotoStudio, LIVE_PREVIEW, railButtons, slideCount, test, typeInEditor } from './studio-fixture';

// Preview navigation + reader lenses. The outer "Slide N / M" label and the rail
// count are the reliable outer-DOM oracles; the painted slide *changing* is
// asserted through the preview iframe (resilient to the seed deck's exact text).

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

// The slide's first heading is a stable content token (resilient to whitespace
// re-render, unlike the whole innerText).
function slideHeading(page: import('@playwright/test').Page): Promise<string> {
	return currentSlide(page).locator('h1, h2, h3').first().innerText();
}

test('next / previous move through the deck and repaint the slide', async ({ page }) => {
	const n = await slideCount(page);
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
	const head1 = await slideHeading(page);
	expect(head1.length).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Next slide' }).click();
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	// The painted heading actually changed.
	await expect(currentSlide(page)).not.toContainText(head1);

	await page.getByRole('button', { name: 'Previous slide' }).click();
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
	await expect(currentSlide(page)).toContainText(head1);
});

test('clicking a rail slide jumps to it and repaints', async ({ page }) => {
	const n = await slideCount(page);
	const head1 = await slideHeading(page);

	await railButtons(page).nth(2).click();
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
	await expect(currentSlide(page)).not.toContainText(head1);
});

// The Compose-preview reader-view reshape (build a view → preview it → the preview trims → Clear
// restores) now lives in lenses.spec ("previewing a reader view reshapes the Compose preview…"), which
// authors a real reader view first. The old author-blind exec/onepager heuristics that used to fill this
// picker for an untagged deck are retired, so there's nothing to reshape here without a reader view.

// ── Input-verb parity (#1294) ────────────────────────────────────────────────
// Every surface that shows a slide takes keyboard, wheel AND touch — and none of
// them is gated on device class, because no device class owns an input. A
// "desktop" may be a touchscreen laptop or a mouse-driven tower; a tablet takes a
// keyboard case and a mouse; a phone can be paired with either. Tagged @parity so
// this runs at all three widths, not just the one the feature was written on.
// Contract: engineering/decisions/2026-08-10-input-verb-parity.md.

/** The preview surface a finger or wheel actually lands on. */
function previewSurface(page: import('@playwright/test').Page) {
	return page.locator(LIVE_PREVIEW).first();
}
/** A real touch swipe — CDP touch points, not a synthesized DOM event. */
async function swipeLeft(page: import('@playwright/test').Page, box: { x: number; y: number; width: number; height: number }) {
	const cdp = await page.context().newCDPSession(page);
	const y = box.y + box.height / 2;
	const from = box.x + box.width * 0.7;
	// The CDP event type is a union, not a free string — spelling it out is what
	// keeps a typo ('touchesEnd') a compile error rather than a silently dead swipe.
	const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
	await send('touchStart', from);
	for (let i = 1; i <= 5; i++) await send('touchMove', from - (200 * i) / 5);
	await send('touchEnd', from - 200);
}

test('@parity the arrow keys turn the deck', async ({ page }) => {
	const n = await slideCount(page);
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity PageDown / PageUp turn the deck — what a presentation clicker emits', async ({ page }) => {
	const n = await slideCount(page);
	await page.keyboard.press('PageDown');
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	await page.keyboard.press('PageUp');
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity Home / End jump to the first and last slide', async ({ page }) => {
	// The matrix that shipped the first cut of #1294 had no Home/End cell, and the
	// mover collapsed every non-'next' action to 'prev' — so End went BACKWARD one
	// slide while preventDefault stole the browser's own behavior.
	const n = await slideCount(page);
	await page.keyboard.press('End');
	await expect(page.getByText(`Slide ${n} / ${n}`, { exact: true })).toBeVisible();
	await page.keyboard.press('Home');
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity a plain mouse wheel turns the deck', async ({ page }) => {
	// deltaY ONLY — what every wheel mouse emits, and what the old horizontal-only
	// rule ignored on every surface in the shell (#1294).
	const n = await slideCount(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 260);
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity a trackpad flick turns the deck', async ({ page }) => {
	const n = await slideCount(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(260, 0);
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity a touch swipe turns the deck', async ({ page }) => {
	// Skipped only on the one project that models a machine with NO touchscreen (the
	// `desktop` tower). `desktop-touch` runs it at the same width, so the
	// touchscreen-laptop case is covered — it is the device, not the width, that
	// decides whether a finger exists.
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const n = await slideCount(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await swipeLeft(page, box);
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
});

// ── Zoom, and the gestures it had to take back (#pinch-zoom) ─────────────────
// A PINCH used to be measured as a swipe: every surface read `touches[0]` against
// `changedTouches[0]` and none counted the fingers, so two fingers spreading 100px
// each cleared the 45px swipe threshold and turned the deck. Measured on this
// surface before the fix: pinch on slide 3 landed on slide 4 at 1440 and 820, and
// the trackpad half (a pinch arrives as ctrl+wheel) misfired at every width.
// Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.
//
// These start MID-DECK deliberately. A misfired `prev` on slide 1 clamps and looks
// exactly like a correctly-ignored gesture — the first cut of this probe reported a
// false "no nav" on the phone project for precisely that reason.
async function toSlide3(page: import('@playwright/test').Page) {
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	const n = await slideCount(page);
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
	return n;
}
/** A real two-finger pinch — CDP touch points, not a synthesized DOM event. */
async function pinch(page: import('@playwright/test').Page, box: { x: number; y: number; width: number; height: number }, out = true) {
	const cdp = await page.context().newCDPSession(page);
	const cy = box.y + box.height / 2;
	const cx = box.x + box.width / 2;
	const pt = (x: number) => ({ x, y: cy, radiusX: 12, radiusY: 12, force: 1 });
	const from = out ? 20 : 100;
	const to = out ? 100 : 20;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - from), pt(cx + from)] });
	for (let i = 1; i <= 6; i++) {
		const half = from + ((to - from) * i) / 6;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half), pt(cx + half)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** The zoom badge only exists above fit scale, so its presence IS "the slide is zoomed". */
const zoomBadge = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Reset zoom to fit/ });

test('@parity a two-finger pinch zooms the slide instead of turning the deck', async ({ page }) => {
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const n = await toSlide3(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await pinch(page, box);
	// The deck did NOT move…
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
	// …and the slide DID zoom.
	await expect(zoomBadge(page)).toBeVisible();
	// Pinching back in returns to fit, which is the only way back on a touch-only device.
	await pinch(page, box, false);
	await expect(zoomBadge(page)).toHaveCount(0);
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
});

test('@parity a trackpad pinch (ctrl+wheel) zooms instead of turning the deck', async ({ page }) => {
	// Runs on EVERY project, touch or not: Chromium delivers a trackpad pinch as a
	// ctrl+wheel, so this is the desktop half of the same gesture and it misfired even
	// on the plain `desktop` project.
	const n = await toSlide3(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	// modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -240, modifiers: 2 });
	await expect(zoomBadge(page)).toBeVisible();
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
	// The badge is the pointer-free way back to fit — a trackpad has no middle button.
	await zoomBadge(page).click();
	await expect(zoomBadge(page)).toHaveCount(0);
});

test('@parity a middle-button drag zooms, and a middle click snaps back to fit', async ({ page }) => {
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(cx, cy - 120, { steps: 6 }); // drag UP → zoom in
	await page.mouse.up({ button: 'middle' });
	await expect(zoomBadge(page)).toBeVisible();
	// A press that does not travel is a click, not a drag.
	await page.mouse.move(cx, cy);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	await expect(zoomBadge(page)).toHaveCount(0);
});

test('@parity zoom does not leak onto the next slide', async ({ page }) => {
	// 3× carried onto the next slide would land the reader in a random corner of it.
	const n = await slideCount(page);
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: -240, modifiers: 2 });
	await expect(zoomBadge(page)).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	await expect(zoomBadge(page)).toHaveCount(0);
});

test('@parity navigating never steals the caret, so two presses both land', async ({ page }) => {
	// If turning the deck dropped focus into the editor, the SECOND arrow press
	// would move the caret instead — navigation that works exactly once.
	const n = await slideCount(page);
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
});

// Untagged (desktop only, where the editor and the preview are on screen together —
// the "write mode with preview focused" case #1294 named). The guard is a focus
// rule, identical at every width; it is the three VERBS that need cross-width proof.
test('the arrow keys stand down while the author is typing', async ({ page }) => {
	// The caret owns its arrows: the editor moves the cursor, the deck stays put.
	// Read the counter AFTER focusing, not before — clicking into the editor maps the
	// preview to the caret's slide (existing, deliberate behavior), so "slide 1" would
	// be asserting the click, not the guard. What matters is that it does not move AGAIN.
	const counter = page.getByText(/^Slide \d+ \/ \d+$/);
	await typeInEditor(page, '');
	const parked = await counter.innerText();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(counter).toHaveText(parked);
	// And typing still types — the keystrokes are not being swallowed.
	await typeInEditor(page, 'parity');
	await expect(page.getByLabel('Deck source')).toContainText('parity');
});

// A collapsed preview is a layout the AUTHOR chose. Turning the deck by key must
// not rearrange it — `goToSlide`'s expand-first rule was written for an explicit
// PICK (a rail row, the < > buttons), where re-opening the pane is the point.
// Real-browser only: the split API needs real layout, so jsdom cannot see this.
test('arrow navigation does not re-open a preview the author collapsed', async ({ page }) => {
	const collapsed = () => page.locator('[data-split-collapsed="b"]');
	await expect(collapsed()).toHaveCount(0);
	await page.getByRole('button', { name: 'Collapse preview' }).click();
	await expect(collapsed()).toHaveCount(1);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('End');
	await expect(collapsed()).toHaveCount(1);
});

test('@parity resizing the pane while zoomed never blanks the slide', async ({ page }) => {
	// The splitter drag, "Collapse editor" and a window resize all change the zoom
	// box. Nothing re-bounded the pan, so a zoomed-and-panned slide sat entirely
	// outside the new box: the preview rendered BLANK with a "400%" badge beside it,
	// and on the chromeless surfaces there is no badge to click your way out with.
	const box = await previewSurface(page).boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	// Zoom hard, anchored at the far corner so the pan runs to its bound.
	for (let i = 0; i < 6; i++) {
		await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.width, y: box.y + box.height, deltaX: 0, deltaY: -240, modifiers: 2 });
	}
	await expect(zoomBadge(page)).toBeVisible();
	// Shrink the window — the same geometry change the splitter makes.
	const vp = page.viewportSize();
	expect(vp).not.toBeNull();
	if (!vp) return;
	await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
	await page.waitForTimeout(400);

	// TWO outcomes are correct here, and which one a project gets depends on whether
	// the new geometry crosses a layout branch: either the slide is STILL ZOOMED (the
	// pan re-bound against the new box), or the holder remounted and zoom RESET to fit
	// — a fresh controller starts at fit and now announces it, so the badge goes with
	// it. Asserting one specific outcome would be asserting this project's breakpoints.
	// What must never happen is the third state: zoomed, but no longer covering its
	// box — which is the blank preview this test exists for.
	const state = await page.evaluate(() => {
		const host = document.querySelector('[aria-label="Live deck preview"]');
		const clip = host?.parentElement;
		if (!host || !clip) return null;
		const a = host.getBoundingClientRect();
		const b = clip.getBoundingClientRect();
		return {
			transform: (host as HTMLElement).style.transform,
			gaps: { left: a.left - b.left, top: a.top - b.top, right: b.right - a.right, bottom: b.bottom - a.bottom },
		};
	});
	expect(state).not.toBeNull();
	if (!state) return;
	const zoomedNow = await zoomBadge(page).count();
	if (zoomedNow === 0) {
		// Reset to fit: the transform is cleared, so the slide fills its box by layout.
		expect(state.transform, 'reset to fit must clear the transform, not strand one').toBe('');
		return;
	}
	// Still zoomed — every edge must reach or overhang the clip box. A positive value
	// is exposed background; before the re-bound this was the full width of the box.
	for (const [edge, v] of Object.entries(state.gaps)) {
		expect(v, `${edge} edge exposed ${v}px of background`).toBeLessThanOrEqual(1);
	}
});
