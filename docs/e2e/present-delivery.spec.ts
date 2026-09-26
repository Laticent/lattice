import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE DELIVERY PRESETS on the real Present surface (engineering/decisions/
// 2026-09-25-vetrina-delivery-presets.md §6). Both claims are about a real reader driving a real
// Guide over a real slide, so jsdom cannot settle them (HARD RULE #23):
//
//   - `restrained` sparks at most TWO moments on a slide however many blocks it narrates, spends
//     them on the figures rather than on the first things said, and draws no overlay ink;
//   - `expressive` sparks more, and inks only its top moment;
//   - `somber` sparks in a muted ink with no pulse, and shows NO cursor and NO ink.
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

/** Count spark MOMENTS on the live slide for `ms`: a row, a column or a series lights many
 *  elements in one batch, so class changes are grouped the way `inkBursts` groups ink. */
async function sparks(dialog: import('@playwright/test').Locator, ms: number): Promise<string[]> {
	const frame = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	return frame.locator('body').evaluate(async (body, duration) => {
		const moments: { t: number; text: string }[] = [];
		const t0 = Date.now();
		const obs = new MutationObserver((records) => {
			for (const r of records) {
				const el = r.target as Element;
				if (r.attributeName !== 'class' || !el.classList.contains('lat-spark') || (r.oldValue ?? '').includes('lat-spark')) continue;
				const t = Date.now() - t0;
				const last = moments[moments.length - 1];
				if (last && t - last.t < 400) continue;
				moments.push({ t, text: (el.textContent ?? '').trim().slice(0, 40) });
			}
		});
		obs.observe(body, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['class'] });
		await new Promise((r) => setTimeout(r, duration));
		obs.disconnect();
		return moments.map((m) => m.text);
	}, ms);
}

test('restrained sparks at most two moments in place, and draws no ink', async ({ page }) => {
	const dialog = await present(page, DENSE('restrained'));
	const [lit, bursts] = await Promise.all([sparks(dialog, 25_000), inkBursts(page, 25_000)]);
	expect(lit.length, 'no spark at all: the plan chose nothing, or the Guide never ran').toBeGreaterThan(0);
	expect(lit.length, 'restrained sparked past its budget of two').toBeLessThanOrEqual(2);
	expect(lit.join(' | '), 'the figure is the moment this slide exists for').toContain('$48.6M');
	expect(bursts, 'restrained changes the element; it draws no overlay').toBe(0);
});

test('expressive sparks more of the same slide, and inks only its top moment', async ({ page }) => {
	const dialog = await present(page, DENSE('expressive'));
	const [lit, bursts] = await Promise.all([sparks(dialog, 25_000), inkBursts(page, 25_000)]);
	expect(lit.length, 'expressive sparked no more than restrained is allowed to').toBeGreaterThan(2);
	expect(lit.length, 'expressive sparked past its budget of four').toBeLessThanOrEqual(4);
	expect(bursts, 'expressive inks its top moment, and only that one').toBe(1);
});

test('somber sparks in a muted ink with no pulse, no cursor and no ink', async ({ page }) => {
	const dialog = await present(page, DENSE('somber'));
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	await expect(slide.locator('li.lat-spark')).toHaveCount(1, { timeout: 30_000 });
	// The one somber moment is the top-ranked figure, not the first line spoken.
	await expect(slide.locator('li.lat-spark')).toContainText('$48.6M');
	await expect(slide.locator('section[data-spark="muted"]:not([data-spark-pulse])')).toHaveCount(1);
	// The peers stay exactly as they were: a spark recedes nothing.
	await expect(slide.locator('.lat-recede')).toHaveCount(0);
	// The spark is a different color from its peers.
	const [lit, peer] = await Promise.all([slide.locator('li.lat-spark').evaluate((e) => getComputedStyle(e).color), slide.locator('li:not(.lat-spark)').first().evaluate((e) => getComputedStyle(e).color)]);
	expect(lit).not.toBe(peer);
	expect(await page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
	expect(await inkBursts(page, 4_000)).toBe(0);
});
