import { expect, type Page, test } from '@playwright/test';

// The three behaviors this prototype turns on cannot be tested anywhere but a real browser,
// because all three are LAYOUT (HARD RULE #23): whether the caption is inside the host's box,
// whether the bubble is over the field being typed into, and whether a click lands on the word
// that names it. jsdom has no boxes and no clock worth trusting, so the unit tests pin the pure
// geometry and the port contract, and these pin what actually happens on screen.
//
// The oracles are rectangles and the page's own beat log — never a screenshot, never a fixed
// sleep — so a pacing change cannot silently turn these green.

const PROTO = '/proto/vetrina-caption/';
const APP = '#app';
const BUBBLE = '.vetrina-bubble';
const DOCK = '.vetrina-caption';

async function start(page: Page, opts: { caption: string; bounds: string; pacing: string; narr: string }): Promise<void> {
	await page.goto(PROTO);
	await page.check(`input[name="caption"][value="${opts.caption}"]`);
	await page.check(`input[name="bounds"][value="${opts.bounds}"]`);
	await page.check(`input[name="pacing"][value="${opts.pacing}"]`);
	await page.check(`input[name="narr"][value="${opts.narr}"]`);
	await page.locator('#run').click();
	await expect(page.locator('.vetrina-stage')).toBeVisible();
}

/** Every logged phase, as `beat:phase`. The page writes this row by row as the tour plays. */
const phases = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#logbody tr')].map((tr) => `${tr.children[2].textContent}:${tr.children[3].textContent}`));

/** The ms column of the first row whose phase matches. */
const at = (page: Page, match: string) =>
	page.evaluate(
		(m) => {
			const row = [...document.querySelectorAll('#logbody tr')].find((tr) => `${tr.children[2].textContent}:${tr.children[3].textContent}`.startsWith(m));
			return row ? Number(row.children[0].textContent) : null;
		},
		match,
	);

async function waitForPhase(page: Page, match: string, timeout = 40_000): Promise<void> {
	await expect.poll(async () => (await phases(page)).some((p) => p.startsWith(match)), { timeout }).toBe(true);
}

test.describe('caption placement — the caption is inside the box the tour runs in', () => {
	test('bounds:host keeps the BAR inside the host panel @crosswidth', async ({ page }) => {
		await start(page, { caption: 'bar', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, '1:say');
		const app = await page.locator(APP).boundingBox();
		const dock = await page.locator(DOCK).boundingBox();
		expect(app && dock).toBeTruthy();
		if (!app || !dock) return;
		// The bug this exists for: `width: calc(100vw - 24px)` put 704px of caption inside a
		// 642px app, hanging off both sides.
		expect(dock.x).toBeGreaterThanOrEqual(app.x - 1);
		expect(dock.x + dock.width).toBeLessThanOrEqual(app.x + app.width + 1);
		expect(dock.y).toBeGreaterThanOrEqual(app.y - 1);
		expect(dock.y + dock.height).toBeLessThanOrEqual(app.y + app.height + 1);
	});

	test('bounds:viewport is unchanged — the default still spans the window', async ({ page }) => {
		await start(page, { caption: 'bar', bounds: 'viewport', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, '1:say');
		const app = await page.locator(APP).boundingBox();
		const dock = await page.locator(DOCK).boundingBox();
		if (!app || !dock) return;
		// Anchored to the window, so it sits below the app rather than inside it.
		expect(dock.y).toBeGreaterThan(app.y);
	});

	test('the cursor bubble lands inside the host panel and clear of Exit @crosswidth', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, '1:say');
		await expect(page.locator(BUBBLE)).toBeVisible();
		const app = await page.locator(APP).boundingBox();
		const bubble = await page.locator(BUBBLE).boundingBox();
		const exit = await page.locator('button[aria-label="Exit the demo"]').boundingBox();
		if (!app || !bubble || !exit) return;
		expect(bubble.x).toBeGreaterThanOrEqual(app.x - 1);
		expect(bubble.x + bubble.width).toBeLessThanOrEqual(app.x + app.width + 1);
		expect(bubble.y).toBeGreaterThanOrEqual(app.y - 1);
		expect(bubble.y + bubble.height).toBeLessThanOrEqual(app.y + app.height + 1);
		// Exit is in the host's corner too, and the bubble is not sitting on it.
		expect(exit.x + exit.width).toBeLessThanOrEqual(app.x + app.width + 1);
		const overlapsExit = bubble.x < exit.x + exit.width && bubble.x + bubble.width > exit.x && bubble.y < exit.y + exit.height && bubble.y + bubble.height > exit.y;
		expect(overlapsExit).toBe(false);
	});
});

/** The bubble's opacity, sampled fast. The default poll backoff reaches 1s intervals within ~2s
 *  and steps clean over a visibility window that is a few hundred ms wide — which is how the
 *  first version of this file managed to be ~50% flaky while testing something real. */
const opacityBecomes = (page: Page, value: string, timeout = 10_000) =>
	expect.poll(async () => page.locator(BUBBLE).evaluate((el) => getComputedStyle(el).opacity), { intervals: [40], timeout }).toBe(value);

test.describe('caption visibility — it steps aside, and Exit does not', () => {
	test('the bubble is hidden while the cursor types, and back afterwards', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, '2:type');
		// Mid-typing: the caption is out of the way of the field being typed into.
		await opacityBecomes(page, '0');
		// …but it is still in the layout and the accessibility tree, holding its live region.
		await expect(page.locator(`${BUBBLE} .vetrina-narration[role="status"]`)).toHaveCount(1);
		await expect(page.locator(BUBBLE)).toHaveCSS('display', 'block');
		// Exit never went with it.
		await expect(page.locator('button[aria-label="Exit the demo"]')).toBeVisible();
		// The next caption brings the bubble back.
		await waitForPhase(page, '3:say');
		await opacityBecomes(page, '1');
	});

	test('the bubble comes back NEXT TO THE CURSOR, not where the cursor used to be', async ({ page }) => {
		// The defect this exists for: the balloon was placed once, when the line was set — which is
		// before the beat's travel — and never re-placed. It reappeared after the performance
		// beside where the cursor had been at the end of the PREVIOUS beat, measured at 561px from
		// the pointer it was speaking for, while three documents said "next to the cursor".
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		const gaps: number[] = [];
		for (const beat of ['2:say', '3:say', '4:say']) {
			await waitForPhase(page, beat);
			await opacityBecomes(page, '1');
			const bubble = await page.locator(BUBBLE).boundingBox();
			const cursor = await page.locator('.vetrina-cursor').boundingBox();
			if (!bubble || !cursor) continue;
			// Nearest edge-to-edge distance: the balloon is placed with a ~20px gap off the cursor,
			// so anything in the low tens is adjacent and anything in the hundreds is the bug.
			const dx = Math.max(0, Math.max(bubble.x - (cursor.x + cursor.width), cursor.x - (bubble.x + bubble.width)));
			const dy = Math.max(0, Math.max(bubble.y - (cursor.y + cursor.height), cursor.y - (bubble.y + bubble.height)));
			gaps.push(Math.hypot(dx, dy));
		}
		expect(gaps.length).toBeGreaterThanOrEqual(2);
		for (const gap of gaps) expect(gap).toBeLessThan(80);
	});
});

test.describe('the word cue — the click lands on the word that names it', () => {
	test('the click and the narration reaching “Publish” coincide', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, '4:narration says');
		const press = await at(page, '4:press');
		const word = await at(page, '4:narration says');
		expect(press).not.toBeNull();
		expect(word).not.toBeNull();
		if (press == null || word == null) return;
		// Broadcast lip-sync tolerance (ITU-R BT.1359) is asymmetric and generous compared with
		// this: ±125 ms is imperceptible. A quarter of that is a real regression net without
		// being a flaky one on a loaded CI box.
		expect(Math.abs(press - word)).toBeLessThan(120);
	});

	test('with narration off the beat still runs — the cue degrades, it does not break', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, '4:press');
		await expect.poll(async () => page.locator('#summary').textContent(), { timeout: 40_000 }).toContain('complete');
		await expect(page.locator('#status')).toContainText('Published');
	});
});
