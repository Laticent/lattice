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
