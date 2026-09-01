import { expect, FIRST_PAINT_TIMEOUT, gotoStudio, slideCount, test } from './studio-fixture';

// The Present overlay: enter, navigate, switch reader lens, open the slide
// overview, and exit on Escape. The slide total is read from the seed deck so the
// counter assertions don't hard-code its size.

let total = 0;

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});

test('present navigates through slides and exits on Escape', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();

	// Scope to the overlay — the main preview also has a "Next slide" button.
	await dialog.getByRole('button', { name: 'Next slide' }).click();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('an untagged deck has no reader-view switcher in Present (heuristics retired)', async ({ page }) => {
	// The old author-blind exec/onepager heuristics are retired: a deck with no `lenses:` registry has
	// nothing to switch to, so Present shows a static "Full deck" label — not a dropdown. (Building +
	// approving a reader view, then switching to it in Present, is covered by lenses.spec — which also
	// carries the z-order regression guard for the picker-behind-the-overlay bug.)
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText('Full deck')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Reader view' })).toHaveCount(0);
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible(); // full deck, not trimmed
});

test('the presented slide card stays a 16:9 box inside its row (#1227) @webkit-tablet', async ({ page }) => {
	// The measured geometry oracle for the slide box: 16:9, clear of the header, inside
	// the row — the outcome that must hold on every engine.
	//
	// The `@webkit-tablet` tag is what makes this a GUARD rather than a formality. #1227 is
	// an engine divergence, and re-measuring the reverted fix showed it needs wide AND short:
	// WebKit at 1180x703 fails all three assertions below (ratio 1.685, covers the header,
	// +16px past the row) while WebKit at 1440x900 / 820x1180 / 390x844 — and Chromium at
	// every viewport — passes. So ONLY the `webkit-tablet` project (playwright.config.ts) can
	// catch a reintroduction; `desktop` deliberately doesn't run this (its `grepInvert`
	// excludes every `@webkit*` spec), because a Chromium pass here proves nothing about the
	// defect. The class-level invariant is gated separately and PR-side in
	// studio.present-layout.test.tsx, since this whole tier is nightly.
	const box = await page.evaluate(() => {
		const host = document.querySelector('[aria-label="Presented slide"]');
		const card = host?.closest('.aspect-video');
		const row = card?.parentElement?.parentElement;
		const header = document.querySelector('[role="dialog"][aria-label="Present"]')?.firstElementChild;
		if (!card || !row || !header) return null;
		const c = card.getBoundingClientRect();
		const sizer = card.parentElement as HTMLElement;
		const s = sizer.getBoundingClientRect();
		return {
			ratio: c.width / c.height,
			coversHeader: c.top < header.getBoundingClientRect().bottom - 0.5,
			overflowsRow: c.height - row.getBoundingClientRect().height,
			// How much of the sizer each axis uses. A 16:9 card in a non-16:9 box is
			// bound by exactly ONE axis and leaves slack in the other, so the binding
			// axis must come out at ~1.
			fillW: c.width / s.width,
			fillH: c.height / s.height,
		};
	});
	expect(box).not.toBeNull();
	expect(box?.ratio).toBeCloseTo(16 / 9, 2);
	expect(box?.coversHeader).toBe(false);
	expect(box?.overflowsRow).toBeLessThanOrEqual(0);
	// …and it FILLS the box it is given (#1282). The ratio assertions above all pass on a
	// card that is correctly-shaped but needlessly small — which is the exact state Present
	// shipped in before #1282, when the card was width-bound only and left the band above it
	// empty. `min(100cqw, 100cqh*16/9)` means the binding axis saturates the container, so
	// whichever one binds must measure ~100%. Without this, a reintroduced cap goes green.
	expect(Math.max(box?.fillW ?? 0, box?.fillH ?? 0)).toBeGreaterThan(0.99);
});

test('the slide overview opens with the G key and lists every slide', async ({ page }) => {
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await expect(overview).toBeVisible();
	await expect(overview.getByRole('button', { name: /^Slide \d+$/ })).toHaveCount(total);

	await page.getByRole('button', { name: 'Close slide overview' }).click();
	await expect(overview).toBeHidden();
});

// THE TILES THEMSELVES, which the test above cannot see. It asserts the overview's
// CHROME — a dialog, N buttons, a close control — and every one of those assertions
// passes over a grid of empty placeholder boxes. That is not hypothetical: these
// thumbnails do not paint under `astro dev` at all (the Vite dep-optimizer 504s the
// Studio island's lazy engine import), so the surface a human sees and the surface the
// chrome test sees came apart exactly where nobody was looking. Playwright builds and
// previews instead (see playwright.config.ts), which is what makes this assertable —
// and asserting it is what stops the config quietly regressing to a dev server.
//
// REUSE is the claim being guarded: SlideOverview.tsx says each thumbnail is "the SAME
// engine render as the main stage … not a screenshot". So the test is that a tile
// contains a real engine document with a painted `.lattice` root, not that a box of
// roughly the right size exists.
test('a slide-overview tile is a real engine render, and clicking it jumps there', async ({ page }) => {
	test.skip(total < 3, 'needs at least three slides to jump to a non-adjacent one');
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await expect(overview).toBeVisible();

	// The engine paints into the tile's own iframe document. `.lattice` is the painted
	// root the live preview asserts on too, so a tile that only booted an empty document
	// still fails here.
	const firstTile = overview.frameLocator('iframe.live >> nth=0');
	await expect(firstTile.locator('.lattice').first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

	// The tile shows ITS OWN slide, not slide 1 twelve times — the bug the component's
	// deck-context note records ("Handing each tile one sliced-out slide printed '1' on
	// every tile"). Page number is engine-rendered inside the frame, so this reads the
	// second tile's document rather than the button's own label.
	const secondTile = overview.frameLocator('iframe.live >> nth=1');
	await expect(secondTile.locator('.lattice').first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

	// The current slide is marked, so a presenter can see where they are in the grid.
	await expect(overview.getByRole('button', { name: 'Slide 1' })).toHaveAttribute('aria-current', 'true');

	// And the jump actually navigates — the overview closes and Present lands on 3.
	await overview.getByRole('button', { name: 'Slide 3', exact: true }).click();
	await expect(overview).toBeHidden();
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
});

// ── Zoom on the delivery surface (#pinch-zoom) ───────────────────────────────
// Present shared the shell's defect exactly: `touches[0]` measured against
// `changedTouches[0]` with no finger count, so a pinch cleared the 45px swipe
// threshold and turned the slide — in front of the room, mid-talk. Tagged @parity
// so it runs at all three widths in both pointer states.
// Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.

const presentZoomBadge = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Reset zoom to fit/ });

test('@parity a pinch in Present zooms the slide instead of turning it', async ({ page }) => {
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const dialog = page.getByRole('dialog', { name: 'Present' });
	// Start mid-deck: a misfired `prev` on slide 1 clamps and is indistinguishable
	// from a gesture correctly ignored.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

	const box = await page.locator('[aria-label="Presented slide"]').first().boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	const cy = box.y + box.height / 2;
	const cx = box.x + box.width / 2;
	const pt = (x: number) => ({ x, y: cy, radiusX: 12, radiusY: 12, force: 1 });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - 20), pt(cx + 20)] });
	for (let i = 1; i <= 6; i++) {
		const half = 20 + (90 * i) / 6;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half), pt(cx + half)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

	await expect(presentZoomBadge(page)).toBeVisible();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
});

test('@parity a trackpad pinch in Present zooms; the badge returns it to fit', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	const box = await page.locator('[aria-label="Presented slide"]').first().boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	// modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: -240, modifiers: 2 });
	await expect(presentZoomBadge(page)).toBeVisible();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await presentZoomBadge(page).click();
	await expect(presentZoomBadge(page)).toHaveCount(0);
});

test('@parity leaving a slide in Present drops the zoom with it', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const box = await page.locator('[aria-label="Presented slide"]').first().boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: -240, modifiers: 2 });
	await expect(presentZoomBadge(page)).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await expect(presentZoomBadge(page)).toHaveCount(0);
});

// Present's swipe and wheel NAVIGATION moved out of React props and into the zoom
// controller. Nothing asserted it still worked there — so a later change to the
// backdrop, the effect order, or that module could have killed wheel and swipe nav
// in Present with every gate green. That is #1294's failure mode with a longer
// causal chain, and these two cells are the guard against it.

test('@parity a plain wheel still turns the deck in Present', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
	const box = await page.locator('[aria-label="Presented slide"]').first().boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 260);
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
});

test('@parity a one-finger swipe still turns the deck in Present', async ({ page }) => {
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
	const box = await page.locator('[aria-label="Presented slide"]').first().boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await page.context().newCDPSession(page);
	const y = box.y + box.height / 2;
	const from = box.x + box.width * 0.7;
	const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
	await send('touchStart', from);
	for (let i = 1; i <= 5; i++) await send('touchMove', from - (200 * i) / 5);
	await send('touchEnd', from - 200);
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
});

// ── Full screen ──────────────────────────────────────────────────────────────
//
// Driven on the REAL browser, because every interesting part of the Fullscreen
// API is browser behavior we do not control: whether the request is granted at
// all, what the document reports afterwards, and — the one that motivated the
// guard — who gets the Escape that leaves it. A jsdom test can only assert that
// we called the method (studio.present-fullscreen.test.tsx does exactly that);
// only this one can show the screen actually changed hands.

test('@gecko full screen is offered, granted, and driven from the button', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const btn = dialog.getByRole('button', { name: 'Fullscreen' });
	await expect(btn).toBeVisible();
	await expect(btn).toHaveAttribute('aria-pressed', 'false');

	await btn.click();
	// The ROOT element, not the dialog — the overlay already covers the viewport, and
	// the root is exempt from the UA rules that restyle a non-root fullscreen element.
	await expect
		.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
		.toBe(true);
	const leave = dialog.getByRole('button', { name: 'Fullscreen' });
	await expect(leave).toHaveAttribute('aria-pressed', 'true');

	await leave.click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
	await expect(dialog.getByRole('button', { name: 'Fullscreen' })).toHaveAttribute('aria-pressed', 'false');
});

test('@gecko `f` toggles full screen', async ({ page }) => {
	await page.keyboard.press('f');
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await page.keyboard.press('f');
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('@gecko Escape leaves full screen without closing Present', async ({ page }) => {
	// The two-step every video player has trained people to expect, and the reason the
	// overlay's Escape branch consults the document first: Safari DELIVERS the keydown
	// that leaves fullscreen (Chromium and Firefox swallow it), so an unguarded handler
	// dropped the presenter back into the editor mid-sentence on a Mac.
	//
	// This run is ALSO the third case, and it is why the overlay exits fullscreen itself
	// instead of leaving it to the browser: headless Chromium under Playwright neither
	// swallows the synthesized Escape nor acts on it, so a handler that merely declined
	// to close would leave the reader fullscreen with Escape no longer doing anything.
	// The assertion below therefore holds on every engine, however it routes the key.
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await dialog.getByRole('button', { name: 'Fullscreen' }).click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);

	await page.keyboard.press('Escape');
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
	await expect(dialog).toBeVisible();

	// The second press is the one that ends the talk.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('@gecko closing Present hands the window back', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await dialog.getByRole('button', { name: 'Fullscreen' }).click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await dialog.getByRole('button', { name: 'Exit present' }).click();
	await expect(dialog).toBeHidden();
	// Otherwise the EDITOR is left full-screen, in a state nothing on screen explains.
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
