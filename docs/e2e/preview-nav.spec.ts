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
