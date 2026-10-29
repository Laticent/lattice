import type { Page } from '@playwright/test';
import { expect, gotoStudio, railButtons, stripNote, test, typeDeck } from './studio-fixture';

// DRAG TO REORDER in both strips (2026-10-27-slide-structure-strip.md §5, lib/strip-actions/drag.ts). One rule for
// every pointer: a press held still lifts the slide, releasing it without moving opens the menu, moving it drags. A
// mouse that moves lifts at once; a finger that moves before the hold scrolls. The drop is one step of the history.

const DECK = '# Alpha\n\na\n\n---\n\n# Bravo\n\nb\n\n---\n\n# Charlie\n\nc\n\n---\n\n# Delta\n\nd\n\n---\n\n# Echo\n\ne\n';
// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const source = (page: Page) => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
const order = async (page: Page) => [...(await source(page)).matchAll(/^# (\w+)/gm)].map((m) => m[1]).join(' ');
const counter = (page: Page) => page.getByText(/^Slide \d+ \/ \d+$/).first();
const menu = (page: Page) => page.locator('[data-strip-menu-content]');
const center = (b: { x: number; y: number; width: number; height: number }, fx = 0.5) => ({ x: b.x + b.width * fx, y: b.y + b.height / 2 });
const box = async (page: Page, i: number, scope = 'nav[aria-label="Slide navigator"]') => {
	const b = await page.locator(`${scope} button[data-unit="${i}"]`).boundingBox();
	if (!b) throw new Error(`no slide ${i}`);
	return b;
};

/** Wait until the strip stops scrolling (it centers the current slide with a smooth scroll), so a box read now is
 *  where the slide will still be when the pointer arrives. */
async function settled(page: Page, scope = 'nav[aria-label="Slide navigator"]') {
	let last = -1;
	await expect
		.poll(async () => {
			const now = await page.locator(scope).first().evaluate((el) => (el.matches('nav') ? el : (el.querySelector('[class*="overflow-x-scroll"]') ?? el)).scrollLeft);
			const still = now === last;
			last = now;
			return still;
		}, { intervals: [250] })
		.toBe(true);
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
}

test.describe('with a mouse', () => {
	test.skip(({ isMobile }) => isMobile, 'the mouse arms run on the desktop project');
	test.beforeEach(async ({ page }) => {
		await gotoStudio(page);
		await typeDeck(page, DECK);
		await expect(railButtons(page)).toHaveCount(5);
	});

	test('dragging a pill past two others moves it there, as one step of the history', async ({ page }) => {
		await mouseDrag(page, center(await box(page, 0)), center(await box(page, 2), 0.8));
		await expect(page.locator('[data-strip-ghost]')).toHaveCount(1);
		await expect(page.locator('[data-strip-drop]')).toBeVisible();
		await page.mouse.up();
		await expect.poll(() => order(page)).toBe('Bravo Charlie Alpha Delta Echo');
		await expect(counter(page)).toHaveText('Slide 3 / 5');
		await expect(stripNote(page)).toContainText('Slide moved');
		await expect(page.locator('[data-strip-ghost]')).toHaveCount(0);
		await expect(menu(page)).toHaveCount(0);
		// One Undo takes back the whole drag, not one place of it.
		await stripNote(page).getByRole('button', { name: 'Undo', exact: true }).click();
		await expect.poll(() => order(page)).toBe('Alpha Bravo Charlie Delta Echo');
	});

	test('a drag back to where it started changes nothing; Escape cancels a drag', async ({ page }) => {
		const a = center(await box(page, 1));
		await mouseDrag(page, a, { x: a.x + 30, y: a.y });
		await page.mouse.move(a.x, a.y);
		await page.mouse.up();
		await expect(railButtons(page)).toHaveCount(5);
		expect(await order(page)).toBe('Alpha Bravo Charlie Delta Echo');
		await mouseDrag(page, center(await box(page, 0)), center(await box(page, 3), 0.8));
		await page.keyboard.press('Escape');
		await page.mouse.up();
		await expect(page.locator('[data-strip-ghost]')).toHaveCount(0);
		expect(await order(page)).toBe('Alpha Bravo Charlie Delta Echo');
	});

	test('a press held still, then released without moving, opens that slide’s menu', async ({ page }) => {
		const p = center(await box(page, 3));
		await page.mouse.move(p.x, p.y);
		await page.mouse.down();
		// Held still until the slide lifts (the tile says so), then released.
		await expect(page.locator('[data-lifted]')).toHaveCount(1);
		await page.mouse.up();
		await expect(menu(page)).toBeVisible();
		await expect(counter(page)).toHaveText('Slide 4 / 5');
	});

	test('in the slide map, a far drag scrolls the strip at its edge and lands far along', async ({ page }) => {
		const deck = Array.from({ length: 40 }, (_, i) => `# S${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n');
		await typeDeck(page, deck);
		await page.getByRole('button', { name: 'Slide map' }).first().click();
		const rail = page.locator('[data-map-rail]');
		await rail.locator('button[aria-current="true"]').focus();
		await page.keyboard.press('Home');
		await expect(counter(page)).toHaveText('Slide 1 / 40');
		const scroller = await rail.locator('[class*="overflow-x-scroll"]').first().boundingBox();
		if (!scroller) throw new Error('no scroller');
		await mouseDrag(page, center(await box(page, 0, '[data-map-rail]')), { x: scroller.x + scroller.width - 10, y: scroller.y + scroller.height / 2 });
		// Hold at the edge while the strip scrolls itself.
		await expect.poll(() => rail.locator('[class*="overflow-x-scroll"]').first().evaluate((el) => el.scrollLeft), { timeout: 10_000 }).toBeGreaterThan(1500);
		await page.mouse.up();
		await expect.poll(async () => (await order(page)).split(' ').indexOf('S1')).toBeGreaterThan(10);
		await expect(counter(page)).not.toHaveText('Slide 1 / 40');
	});
});

// Touch through Chromium's own input pipeline (CDP touch events become pointer events with real defaults: a moving
// finger scrolls the strip unless the page cancels it).
test.describe('@parity with a finger', () => {
	test.skip(({ browserName, hasTouch }) => browserName !== 'chromium' || !hasTouch, 'CDP touch needs Chromium with touch');
	test.beforeEach(async ({ page }) => {
		await gotoStudio(page);
		await typeDeck(page, DECK);
		await expect(railButtons(page)).toHaveCount(5);
		// The caret sits at the deck's end, so the strip has scrolled to its end: bring its start into view.
		await page.locator('nav[aria-label="Slide navigator"]').evaluate((el) => {
			el.scrollLeft = 0;
		});
		await settled(page);
	});
	const touch = async (page: Page) => {
		const cdp = await page.context().newCDPSession(page);
		return (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
	};

	test('a long press lifts the pill and a move drags it; release drops it', async ({ page }) => {
		const t = await touch(page);
		const from = center(await box(page, 0));
		const to = center(await box(page, 1), 0.8);
		await t('touchStart', from);
		await expect(page.locator('[data-lifted]')).toHaveCount(1);
		for (let i = 1; i <= 12; i++) await t('touchMove', { x: from.x + ((to.x - from.x) * i) / 12, y: from.y });
		await expect(page.locator('[data-strip-ghost]')).toHaveCount(1);
		await t('touchEnd');
		await expect.poll(() => order(page)).toBe('Bravo Alpha Charlie Delta Echo');
	});

	test('a long press released without moving opens the menu; a quick swipe moves nothing', async ({ page }) => {
		const t = await touch(page);
		const p = center(await box(page, 1));
		await t('touchStart', p);
		await expect(page.locator('[data-lifted]')).toHaveCount(1);
		await t('touchEnd');
		await expect(menu(page)).toBeVisible();
		await expect(counter(page)).toHaveText('Slide 2 / 5');
		await page.keyboard.press('Escape');
		await page.locator('nav[aria-label="Slide navigator"]').evaluate((el) => {
			el.scrollLeft = 0;
		});
		await settled(page);
		const q2 = center(await box(page, 0));
		await t('touchStart', q2);
		for (let i = 1; i <= 8; i++) await t('touchMove', { x: q2.x - i * 12, y: q2.y });
		await t('touchEnd');
		// The swipe (leftward, so the strip has somewhere to go) scrolled it, since a finger that moves before the hold is
		// a scroll, and lifted nothing.
		await expect.poll(() => page.locator('nav[aria-label="Slide navigator"]').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
		expect(await order(page)).toBe('Alpha Bravo Charlie Delta Echo');
		await expect(page.locator('[data-strip-ghost]')).toHaveCount(0);
	});
});

// The same gesture on real WebKit at an iPhone box. Playwright drives WebKit without a touch pipeline, so the arm
// dispatches the pointer events a finger produces (pointerType "touch") at the pill: it proves the gesture logic on
// WebKit's engine, not iOS Safari's touch handling, which stays UNVERIFIED without a device.
test('@webkit-phone a long press and a drag reorder the strip on WebKit', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect(railButtons(page)).toHaveCount(5);
	await page.locator('nav[aria-label="Slide navigator"]').evaluate((el) => {
		el.scrollLeft = 0;
	});
	await settled(page);
	const from = center(await box(page, 0));
	const to = center(await box(page, 1), 0.8);
	const fire = (type: string, p: { x: number; y: number }) =>
		page.evaluate(
			([type, x, y]) => {
				const target = (type === 'pointerdown' ? document.elementFromPoint(x as number, y as number) : document.querySelector('nav[aria-label="Slide navigator"]')) as Element;
				target.dispatchEvent(new PointerEvent(type as string, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x as number, clientY: y as number }));
			},
			[type, p.x, p.y] as const,
		);
	await fire('pointerdown', from);
	await expect(page.locator('[data-lifted]')).toHaveCount(1);
	for (let i = 1; i <= 12; i++) await fire('pointermove', { x: from.x + ((to.x - from.x) * i) / 12, y: from.y });
	await expect(page.locator('[data-strip-ghost]')).toHaveCount(1);
	await fire('pointerup', to);
	await expect.poll(() => order(page)).toBe('Bravo Alpha Charlie Delta Echo');
});
