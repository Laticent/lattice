import type { Page } from '@playwright/test';
import { expect, gotoStudio, slideCount, test } from './studio-fixture';

// ── Zoom on the PRESENTER SCREEN — the surface #1555 shipped UNVERIFIED ──────
//
// The presenter view is a `window.open` second window whose whole document is
// written by `buildPresenterDoc()` (docs/src/components/studio/present/
// presenter-window.js). #1555 gave it the same fourth input verb as the shell
// preview and Present, carrying the same kernel rule — a gesture that ever held
// two pointers is a pinch and is never measured as a swipe — but the Playwright
// suite never drove the popup, so the decision note recorded that surface as
// UNVERIFIED rather than claiming it (HARD RULE #23). These cells close that:
// `context.waitForEvent('page')` catches the popup, and every gesture below is a
// genuine CDP touch/wheel event dispatched INTO it.
//
// What makes them oracles rather than formalities is the relay. The popup does
// not navigate — it posts `{pp:'go', v:±1}` to its OPENER, which clamps and
// moves the deck. So "the pinch did not turn the deck" is measured at the wire:
// every `pp:'go'` reaching the opener is recorded, and the assertion is that a
// pinch produces NONE while the stage scales. The plain-wheel cell at the bottom
// is the positive control for exactly that instrument — it drives the same relay
// through the same spy and REQUIRES a delta — so a spy that silently stopped
// recording, or a popup that never received the events at all, fails there
// instead of turning every "no nav" cell vacuously green.
//
// Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.

/** Records every navigation delta the popup relays, at the opener's `message` port. */
async function spyOnRelay(page: Page) {
	await page.evaluate(() => {
		const seen: number[] = [];
		(window as unknown as { __ppGo: number[] }).__ppGo = seen;
		window.addEventListener('message', (e) => {
			const d = (e.data ?? {}) as { pp?: string; v?: number };
			if (d.pp === 'go') seen.push(d.v ?? 0);
		});
	});
}
const relayed = (page: Page) => page.evaluate(() => (window as unknown as { __ppGo: number[] }).__ppGo);

/** The presenter popup, opened mid-deck with the relay spy already listening. */
async function openPresenter(page: Page, context: import('@playwright/test').BrowserContext) {
	await gotoStudio(page);
	const total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// The second screen is a ≥ `md` affordance: the launcher is `hidden … md:inline-flex`,
	// because a phone has no second screen to put a presenter view ON. So the mobile
	// projects SKIP here rather than pass — there is no surface to drive at 390px, which
	// is a fact about the product and not a hole in this evidence. Keyed on the control
	// actually being offered rather than on a width, so it tracks the breakpoint.
	const launcher = page.getByRole('button', { name: 'Presenter screen' });
	test.skip((await launcher.count()) === 0, 'the presenter screen is not offered below the md breakpoint');

	const popupPromise = context.waitForEvent('page');
	await launcher.click();
	const popup = await popupPromise;
	await expect(popup.locator('#count')).toBeVisible();

	// Start MID-DECK, for the reason the decision note gives: a misfired `prev` on
	// slide 1 clamps, and a clamp is indistinguishable from a gesture correctly
	// ignored — which is how a probe starting on slide 1 first read a broken cell
	// as a passing one. Driven from the opener so the popup's index arrives through
	// the real `sync()` path.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await expect(popup.locator('#count')).toHaveText(`2 / ${total}`);

	// Only NOW start recording, so the deltas from this setup are not in the sample.
	await spyOnRelay(page);
	return { popup, dialog, total };
}

/**
 * The current-slide stage's on-screen box. Grows iff the stage really scaled.
 *
 * Measured against the width recorded AT FIT, never against the `.pp-screen` that
 * clips it: that box carries a 1px border under `box-sizing: border-box`, so its
 * border-box rect is 2px wider than the iframe filling its content box — the same
 * gap that made the pan bound 2px too generous in #1555. Comparing the surface to
 * itself keeps the oracle honest about which box it is talking about.
 */
const stageWidth = (popup: Page) => popup.locator('#cur').evaluate((el) => el.getBoundingClientRect().width);

test('@parity a pinch on the presenter screen zooms the stage and turns nothing', async ({ page, context }) => {
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const { popup, dialog, total } = await openPresenter(page, context);

	// The stage carries a real, painted slide — so "it scaled" is a claim about the
	// slide the presenter is reading, not about an empty box that happens to have a
	// transform on it.
	await expect(popup.frameLocator('#cur').locator('.lattice').first()).not.toBeEmpty();
	const fit = await stageWidth(popup);
	expect(fit).toBeGreaterThan(0);

	const box = await popup.locator('#cur').boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await context.newCDPSession(popup);
	const cy = box.y + box.height / 2;
	const cx = box.x + box.width / 2;
	const pt = (x: number) => ({ x, y: cy, radiusX: 12, radiusY: 12, force: 1 });
	// Two fingers spreading ~90px each: comfortably past `swipeAction`'s 45px
	// threshold on a perfectly horizontal axis, which is precisely why the
	// unguarded version read this as a confident swipe.
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - 20), pt(cx + 20)] });
	for (let i = 1; i <= 6; i++) {
		const half = 20 + (90 * i) / 6;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half), pt(cx + half)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

	// The stage scaled…
	await expect(popup.locator('#zoom')).toBeVisible();
	expect(await stageWidth(popup)).toBeGreaterThan(fit * 1.05);
	// …and nothing was relayed, at the wire and at the deck.
	expect(await relayed(page)).toEqual([]);
	await expect(popup.locator('#count')).toHaveText(`2 / ${total}`);
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
});

test('@parity a trackpad pinch on the presenter screen zooms; the badge returns it to fit', async ({ page, context }) => {
	// NO touch skip — this is the cell that matters on a plain desktop. A trackpad
	// pinch reaches the page as ctrl+wheel, which the pre-#1555 popup read as a firm
	// flick on the dominant axis: every laptop in the world scrubbed the deck from
	// the second screen, on a machine with no touchscreen at all.
	const { popup, dialog, total } = await openPresenter(page, context);
	const fit = await stageWidth(popup);

	const box = await popup.locator('#cur').boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	const cdp = await context.newCDPSession(popup);
	// modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: -240, modifiers: 2 });

	await expect(popup.locator('#zoom')).toBeVisible();
	await expect(popup.locator('#zoom')).toHaveText(/^[1-9]\d\d%$/); // above 100%, so the badge is truthful
	expect(await stageWidth(popup)).toBeGreaterThan(fit * 1.05);
	expect(await relayed(page)).toEqual([]);
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

	// The badge is the ONLY route back to fit on a trackpad — there is no middle
	// button — so it is part of the verb, not decoration.
	await popup.locator('#zoom').click();
	await expect(popup.locator('#zoom')).toBeHidden();
	expect(await stageWidth(popup)).toBeCloseTo(fit, 1);
	expect(await relayed(page)).toEqual([]);
});

test('@parity a plain wheel on the presenter screen still turns the deck', async ({ page, context }) => {
	// The positive control for the two cells above. It drives the SAME relay through
	// the SAME spy and requires a delta to arrive, so "the pinch relayed nothing"
	// cannot pass by way of a broken instrument. It is also the #1294 parity contract
	// on this surface in its own right: a plain wheel navigates, everywhere.
	const { popup, dialog, total } = await openPresenter(page, context);
	const box = await popup.locator('#cur').boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;
	await popup.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await popup.mouse.wheel(0, 260);

	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	await expect(popup.locator('#count')).toHaveText(`3 / ${total}`);
	expect(await relayed(page)).toEqual([1]);
	// Navigating never leaves the stage zoomed — the reset-on-slide-change rule,
	// which the popup applies on the `ppIndex` message.
	await expect(popup.locator('#zoom')).toBeHidden();
});
