import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE DELIVERY PRESETS on the real Present surface (engineering/decisions/
// 2026-09-25-vetrina-delivery-presets.md §6). Both claims are about a real reader driving a real
// Guide over a real slide, so jsdom cannot settle them (HARD RULE #23):
//
//   - `restrained` spends at most TWO gestures on a slide however many blocks it narrates, and
//     spends them on the figures rather than on the first things said;
//   - `somber` shows NO cursor and draws NO ink, and marks the named item on the slide itself.
//
// No key and no voice: the silent reader drives the cue clock exactly as a narrated one does.

test.describe.configure({ timeout: 180_000 });

const CURSOR = '.vetrina-cursor';

const DENSE = (delivery: string) =>
	[
		'---',
		'marp: true',
		'theme: indaco',
		`delivery: ${delivery}`,
		'---',
		'',
		'## The quarter, line by line',
		'',
		'- Hiring continued on plan across every team.',
		'- ARR closed at $48.6M, ahead of plan.',
		'- The office move finished in August.',
		'- Payback stretched to 19 months.',
		'- The new logo landed in the spring.',
		'',
	].join('\n');

/** Count cue-ink bursts on the stage for `ms` (the grouping `present-guide.spec.ts` explains). */
async function inkBursts(page: import('@playwright/test').Page, ms: number): Promise<number> {
	const at = await page.evaluate(async (duration) => {
		const stamps: number[] = [];
		const t0 = Date.now();
		const obs = new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if ((n as HTMLElement).dataset?.vtCue) stamps.push(Date.now() - t0);
		});
		obs.observe(document.body, { childList: true, subtree: true });
		await new Promise((r) => setTimeout(r, duration));
		obs.disconnect();
		return stamps;
	}, ms);
	return at.filter((t, i) => i === 0 || t - at[i - 1] > 400).length;
}

async function present(page: import('@playwright/test').Page, deck: string) {
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	return dialog;
}

test('restrained spends at most two gestures on a six-block slide', async ({ page }) => {
	await present(page, DENSE('restrained'));
	const bursts = await inkBursts(page, 25_000);
	expect(bursts, 'no ink at all: the plan chose nothing, or the Guide never ran').toBeGreaterThan(0);
	expect(bursts, 'restrained gestured past its budget of two').toBeLessThanOrEqual(2);
});

test('expressive spends more of the same slide than restrained does', async ({ page }) => {
	await present(page, DENSE('expressive'));
	const bursts = await inkBursts(page, 25_000);
	expect(bursts, 'expressive gestured no more than restrained is allowed to').toBeGreaterThan(2);
	expect(bursts, 'expressive gestured past its budget of four').toBeLessThanOrEqual(4);
});

test('somber shows no cursor, draws no ink, and marks the named item on the slide', async ({ page }) => {
	const dialog = await present(page, DENSE('somber'));
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	// The mark: one list item full, its peers receded, on the live slide.
	await expect(slide.locator('li.lat-focus')).toHaveCount(1, { timeout: 30_000 });
	await expect(slide.locator('li.lat-recede')).toHaveCount(4);
	// The one somber moment is the top-ranked figure, not the first line spoken.
	await expect(slide.locator('li.lat-focus')).toContainText('$48.6M');
	// …and no cursor or ink appeared while it did.
	expect(await page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
	expect(await inkBursts(page, 4_000)).toBe(0);
});
