import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE DELIVERY PRESETS on the real Present surface (engineering/decisions/
// 2026-09-25-vetrina-delivery-presets.md §6). Both claims are about a real reader driving a real
// Guide over a real slide, so jsdom cannot settle them (HARD RULE #23):
//
//   - `restrained` focuses at most TWO moments on a slide however many blocks it narrates, spends
//     them on the figures rather than on the first things said, and draws no overlay ink;
//   - `expressive` focuses more, and inks only its top moment;
//   - `somber` recedes the rest gently, and shows NO cursor and NO ink.
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

/** Count focus MOMENTS on the live slide for `ms`: each focus recedes a batch of peers at once,
 *  so class changes are grouped the way `inkBursts` groups ink. */
async function foci(dialog: import('@playwright/test').Locator, ms: number): Promise<string[]> {
	const frame = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	return frame.locator('body').evaluate(async (body, duration) => {
		const moments: { t: number; text: string }[] = [];
		const t0 = Date.now();
		const obs = new MutationObserver((records) => {
			for (const r of records) {
				const el = r.target as Element;
				if (r.attributeName !== 'class' || !el.classList.contains('lat-guide-dim') || (r.oldValue ?? '').includes('lat-guide-dim')) continue;
				const t = Date.now() - t0;
				const last = moments[moments.length - 1];
				if (last && t - last.t < 400) continue;
				// The moment is named by what STAYED full: the dimmed peer's sibling that is not dimmed.
				const focused = [...(el.parentElement?.children ?? [])].find((c) => c.tagName === el.tagName && !c.classList.contains('lat-guide-dim'));
				moments.push({ t, text: (focused?.textContent ?? '').trim().slice(0, 40) });
			}
		});
		obs.observe(body, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['class'] });
		await new Promise((r) => setTimeout(r, duration));
		obs.disconnect();
		return moments.map((m) => m.text);
	}, ms);
}

test('restrained focuses at most two moments, and draws no ink', async ({ page }) => {
	const dialog = await present(page, DENSE('restrained'));
	const [lit, bursts] = await Promise.all([foci(dialog, 25_000), inkBursts(page, 25_000)]);
	expect(lit.length, 'no focus at all: the plan chose nothing, or the Guide never ran').toBeGreaterThan(0);
	expect(lit.length, 'restrained focused past its budget of two').toBeLessThanOrEqual(2);
	expect(lit.join(' | '), 'the figure is the moment this slide exists for').toContain('$48.6M');
	expect(bursts, 'restrained changes the element; it draws no overlay').toBe(0);
});

test('expressive focuses more of the same slide, and inks only its top moment', async ({ page }) => {
	const dialog = await present(page, DENSE('expressive'));
	const [lit, bursts] = await Promise.all([foci(dialog, 25_000), inkBursts(page, 25_000)]);
	expect(lit.length, 'expressive focused no more than restrained is allowed to').toBeGreaterThan(2);
	expect(lit.length, 'expressive focused past its budget of four').toBeLessThanOrEqual(4);
	expect(bursts, 'expressive inks its top moment, and only that one').toBe(1);
});

test('somber focuses the figure: the rest recedes gently, with no cursor and no ink', async ({ page }) => {
	const dialog = await present(page, DENSE('somber'));
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	// The one somber moment is the top-ranked figure: its four siblings recede, it stays whole.
	await expect(slide.locator('li.lat-guide-dim')).toHaveCount(4, { timeout: 30_000 });
	const focused = slide.locator('ul > li:not(.lat-guide-dim)');
	await expect(focused).toHaveCount(1);
	await expect(focused).toContainText('$48.6M');
	// Somber's depth is gentler than restrained's, and the target keeps its own opacity.
	await expect.poll(() => slide.locator('li.lat-guide-dim').first().evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 5_000 }).toBeCloseTo(0.62, 1);
	expect(await focused.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
	// Never the deck's own focus classes.
	await expect(slide.locator('.lat-focus, .lat-recede')).toHaveCount(0);
	expect(await page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
	expect(await inkBursts(page, 4_000)).toBe(0);
});

test('the slide reads along only with the captions off: the caption already does it', async ({ page }) => {
	const said = (dialog: import('@playwright/test').Locator) =>
		dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('body').evaluate(() => {
			const h = (window as unknown as { CSS: { highlights?: Map<string, { size: number }> } }).CSS.highlights?.get('lat-said');
			return h ? h.size : 0;
		});
	const dialog = await present(page, DENSE('restrained'));
	// Captions on (the default): the slide never carries a second copy of the words.
	await expect(dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('li.lat-guide-dim').first()).toBeVisible({ timeout: 30_000 });
	// "Nothing changes" is the claim, so sample it in the page for a fixed window: every frame for
	// 3 s, the most lat-said ranges any frame carried.
	const seen = await dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('body').evaluate(
		() =>
			new Promise<number>((resolve) => {
				const w = window as unknown as { CSS: { highlights?: Map<string, { size: number }> } };
				let most = 0;
				const t0 = performance.now();
				const tick = () => {
					most = Math.max(most, w.CSS.highlights?.get('lat-said')?.size ?? 0);
					if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
					else resolve(most);
				};
				requestAnimationFrame(tick);
			}),
	);
	expect(seen, 'the slide read along while the caption was showing').toBe(0);
	// Captions off: the focused bullet reads along.
	await dialog.getByRole('button', { name: 'Captions' }).click();
	await expect.poll(() => said(dialog), { timeout: 30_000 }).toBeGreaterThan(0);
});
