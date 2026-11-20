import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Quick scroll — the jump-to-top / jump-to-bottom control (components/ui/quick-scroll.tsx, lib/quick-scroll.ts).
 *
 * What a reader would notice if it broke, one test each:
 *   - it never shows up, or a click does not reach the end (Playground preview, a frame's own document);
 *   - it shows up when the APP scrolls a pane, not the reader (the preview following the editor's caret);
 *   - on a mouse, the rail sits on a slide's delete button in Compose (a misclick next to a delete);
 *   - on a phone, the corner stack sits on the Studio's "New slide" button.
 * Every wait is on a state (a data attribute, a scroll position), never a duration (HARD RULE #32).
 */

const control = (page: Page, dir: 'top' | 'bottom') => page.locator(`[data-slot=quick-scroll][data-dir=${dir}]`);
const shown = (l: Locator) => expect(l).toHaveAttribute('data-state', 'shown');
const hidden = (l: Locator, timeout?: number) => expect(l).toHaveAttribute('data-state', 'hidden', timeout ? { timeout } : undefined);

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openPlayground(page: Page) {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await expect.poll(() => page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		return w.document.documentElement.scrollHeight > w.innerHeight * 2;
	})).toBe(true);
}

test('@gecko @crosswidth @webkit-tablet Playground preview: a wheel shows the rail, a click reaches the last slide, and it hides when idle', async ({ page }) => {
	await openPlayground(page);
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('preview frame has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 600);

	const down = control(page, 'bottom');
	await shown(down);
	await expect(down).toHaveAttribute('data-layout', 'rail');
	await shown(control(page, 'top'));

	await down.click();
	await expect.poll(() => page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		return w.document.documentElement.scrollHeight - w.innerHeight - w.scrollY;
	})).toBeLessThanOrEqual(4);
	// At the end, the arrow for that end goes; then, with the pointer elsewhere, the whole control idles out.
	await hidden(down);
	await page.mouse.move(5, 5);
	await hidden(control(page, 'top'), 5000);
});

test('@gecko @crosswidth @webkit-tablet Playground preview: the app scrolling the preview does not show the control; the reader does', async ({ page }) => {
	await openPlayground(page);
	// Scroll it the way the editor's caret-follow does: from script, with no reader input on the frame. ONE read,
	// taken after the frame's scroll event and two frames, never a retrying "count is 0": that would pass once the
	// control idled out 1.5s later, which is how this test's first draft survived its own failing arm.
	const shownAfterAppScroll = await page.evaluate(() => new Promise<number>((done) => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		w.addEventListener('scroll', () => requestAnimationFrame(() => requestAnimationFrame(() =>
			done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length))), { once: true });
		w.scrollTo(0, 900);
	}));
	expect(shownAfterAppScroll).toBe(0);
	// The control is alive, so the 0 above was a decision: a reader's wheel on the same frame shows it.
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('preview frame has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 300);
	await shown(control(page, 'top'));
});

test('Studio Compose: on a mouse the rail clears every slide delete button', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	const box = await host.boundingBox();
	if (!box) throw new Error('Compose has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 500);

	const up = control(page, 'top');
	await shown(up);
	const rail = await up.boundingBox();
	if (!rail) throw new Error('rail has no box');
	const deletes = await host.locator('.cs-sc-delete').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right).filter((r) => r > 0));
	expect(deletes.length).toBeGreaterThan(0);
	for (const right of deletes) expect(right).toBeLessThanOrEqual(rail.x - 4);
});

test('@webkit-phone Studio Compose: on a phone the stack sits above the New slide button', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: /^Compose/ }).first().click();
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	// A touch-drag, as the control hears it: the reader's touch on the pane, then the pane moving.
	await host.evaluate((el) => {
		el.dispatchEvent(new Event('touchstart', { bubbles: true }));
		el.scrollTop = el.scrollHeight / 3;
	});

	const up = control(page, 'top');
	const down = control(page, 'bottom');
	await shown(down);
	await expect(down).toHaveAttribute('data-layout', 'stack');
	const fab = await page.locator('[data-new-slide=fab]').boundingBox();
	const a = await up.boundingBox();
	const b = await down.boundingBox();
	if (!fab || !a || !b) throw new Error('missing a box');
	expect(b.width).toBeGreaterThanOrEqual(44);
	expect(overlaps(a, fab)).toBe(false);
	expect(overlaps(b, fab)).toBe(false);
	expect(b.y + b.height).toBeLessThanOrEqual(fab.y);
});

async function openCompose(page: Page) {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	const box = await host.boundingBox();
	if (!box) throw new Error('Compose has no box');
	return { host, box };
}

test('@gecko Studio Compose: typing that scrolls the pane (spaces included) does not show the control', async ({ page }) => {
	const { host, box } = await openCompose(page);
	// The pointer rests on the pane, as it does while someone types: the hover path must still refuse a
	// scroll that typing caused. A click into the text is not reader scroll intent either.
	await host.locator('.ProseMirror p').last().click();
	await page.keyboard.press('ControlOrMeta+End');
	const before = await host.evaluate((el) => el.scrollTop);
	await page.keyboard.type('one two three ');
	for (let i = 0; i < 12; i++) await page.keyboard.press('Enter');
	await page.keyboard.type('four five ');
	// ONE read once the caret-follow scroll has moved the pane and two frames have passed (not a retrying count).
	await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
	const shownWhileTyping = await page.evaluate(() => new Promise<number>((done) =>
		requestAnimationFrame(() => requestAnimationFrame(() => done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length)))));
	expect(shownWhileTyping).toBe(0);
	// Alive, so the 0 was a decision: the reader's wheel on the same pane shows it.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -400);
	await shown(control(page, 'top'));
});

test('@gecko Studio Compose: a scroll with no DOM event, under a resting pointer, shows the control', async ({ page }) => {
	// The shape of a scrollbar drag in an engine that sends no event for the press: the pointer is over the
	// pane, nobody typed, and the pane moves.
	const { host, box } = await openCompose(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await host.evaluate((el) => {
		el.scrollTop = el.scrollHeight / 3;
	});
	await shown(control(page, 'top'));
});

test('Studio Compose: a wheel over a shown button scrolls the pane under it', async ({ page }) => {
	const { host, box } = await openCompose(page);
	// Aim at where the TOP rail button appears (lib/quick-scroll.ts: INSET 8, rail SIZE 28), so the wheel that
	// reveals it leaves the pointer on it. The precondition is a STATE, not a race against the 1.5s idle: the
	// button is shown, under the pointer and hovered, which holds it open. Under load the first draft lost that
	// race and wheeled the bare pane; its retry then wheeled DOWN onto the bottom button until the pane reached
	// the end, where that arrow hides by design. The top arrow stays wanted the whole way down.
	const gutter = await host.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth);
	const x = box.x + box.width - gutter - 8 - 14;
	const y = box.y + 8 + 14;
	const up = control(page, 'top');
	await expect(async () => {
		await page.mouse.move(x - 1, y);
		await page.mouse.wheel(0, 120);
		await expect(up).toHaveAttribute('data-state', 'shown', { timeout: 2000 });
		await page.mouse.move(x, y);
		expect(await up.evaluate((el) => el.matches(':hover'))).toBe(true);
		await expect(up).toHaveAttribute('data-state', 'shown', { timeout: 500 });
	}).toPass();
	const before = await host.evaluate((el) => el.scrollTop);
	await page.mouse.wheel(0, 300);
	await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
});

test('Studio Compose: a resize while a button is hovered does not leave the control stuck on screen', async ({ page }) => {
	const { box } = await openCompose(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 300);
	const up = control(page, 'top');
	await shown(up);
	await up.hover();
	await page.setViewportSize({ width: 1400, height: 900 });
	await expect(up).toHaveCount(0);
	const nb = await page.locator('.cs-host').boundingBox();
	if (!nb) throw new Error('Compose has no box');
	await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
	await page.mouse.wheel(0, 200);
	await shown(control(page, 'top'));
	// It must idle out again: before the fix the stale hover kept it shown indefinitely.
	await hidden(control(page, 'top'), 5000);
});
