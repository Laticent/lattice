import { expect, type Page, test } from '@playwright/test';

/**
 * Collapsing and expanding the Playground preview on the two-pane layout (followup 2851-p3). Each
 * test reads what a person reads: which slide the preview shows, frame by frame, from the click that
 * expands the pane until the render settles.
 *
 *   - collapse then expand returns the preview to the slide it was on, with no frame on another slide;
 *   - collapse, type on another slide, expand: the preview shows the caret's slide.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
const SLIDES = 14;
const TAGS = '@crosswidth @gecko @webkit-tablet';

const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

async function open(page: Page) {
	test.skip((page.viewportSize()?.width ?? 0) < 821, 'two-pane layout only');
	await page.addInitScript(
		([key, src]) => {
			localStorage.setItem(key, src);
			sessionStorage.removeItem('lattice-docs-pg-split-collapsed');
		},
		[SOURCE_KEY, deck],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.locator('.cm-content').waitFor({ timeout: 60_000 });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
	await expect.poll(() => shownSlide(page)).toBeGreaterThan(0);
}

/** The slide the preview shows most of (1-based), 0 when the frame has none laid out. */
const shownSlide = (page: Page) =>
	page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const win = f.contentWindow as Window;
		let best = 0;
		let bestSeen = 0;
		f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').forEach((el, i) => {
			const r = el.getBoundingClientRect();
			const seen = Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top));
			if (seen > bestSeen) {
				bestSeen = seen;
				best = i + 1;
			}
		});
		return best;
	});

/** Scroll the preview until slide `n` (1-based) is centered in it. */
const scrollPreviewTo = (page: Page, n: number) =>
	page.evaluate((i) => {
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const win = f.contentWindow as Window;
		const el = f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]')[i - 1] as HTMLElement | undefined;
		if (!el) return;
		const r = el.getBoundingClientRect();
		win.scrollTo({ top: r.top + win.scrollY - (win.innerHeight - r.height) / 2, behavior: 'auto' });
	}, n);

/** Record the slide a person SEES on every animation frame, until `stop()`: frames where the frame is covered (the wrap
 *  is not `is-live`) or the pane is still a rail show nothing, so they are skipped. The samples are the distinct runs in order. */
async function probe(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __probe: { on: boolean; runs: number[] } };
		w.__probe = { on: true, runs: [] };
		const f = document.getElementById('preview') as HTMLIFrameElement;
		const wrap = f.parentElement as HTMLElement;
		const tick = () => {
			if (!w.__probe.on) return;
			if (!wrap.classList.contains('is-live') || wrap.getBoundingClientRect().width < 100) return void requestAnimationFrame(tick);
			const win = f.contentWindow as Window | null;
			let best = 0;
			let bestSeen = 0;
			f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]').forEach((el, i) => {
				const r = el.getBoundingClientRect();
				const seen = Math.max(0, Math.min(win?.innerHeight ?? 0, r.bottom) - Math.max(0, r.top));
				if (seen > bestSeen) {
					bestSeen = seen;
					best = i + 1;
				}
			});
			const runs = w.__probe.runs;
			if (best && runs[runs.length - 1] !== best) runs.push(best);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	return async () =>
		page.evaluate(() => {
			const w = window as unknown as { __probe: { on: boolean; runs: number[] } };
			w.__probe.on = false;
			return w.__probe.runs;
		});
}

/** Let `n` animation frames pass, so a late wrong-slide frame has had its chance to show. */
const frames = (page: Page, n: number) =>
	page.evaluate(
		(count) =>
			new Promise<void>((done) => {
				let left = count;
				const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
		n,
	);

const collapse = (page: Page) => page.getByRole('button', { name: 'Collapse preview' }).click();
const expand = (page: Page) => page.getByRole('button', { name: 'Expand preview' }).click();

test(`collapse then expand returns the preview to its slide, with no frame elsewhere ${TAGS}`, async ({ page }) => {
	await open(page);
	await scrollPreviewTo(page, 9);
	await expect.poll(() => shownSlide(page)).toBe(9);
	await collapse(page);
	await expect(page.getByRole('button', { name: 'Expand preview' })).toBeVisible();
	const stop = await probe(page);
	await expand(page);
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(9);
	await frames(page, 60);
	expect(await stop()).toEqual([9]);
});

test(`collapse, type on another slide, expand: the preview shows the caret's slide ${TAGS}`, async ({ page }) => {
	await open(page);
	await scrollPreviewTo(page, 9);
	await expect.poll(() => shownSlide(page)).toBe(9);
	await collapse(page);
	await expect(page.getByRole('button', { name: 'Expand preview' })).toBeVisible();
	const line = page.locator('.cm-line', { hasText: 'Slide 3 title' }).first();
	await expect
		.poll(
			async () => {
				if (await line.count()) return true;
				await page.evaluate(() => {
					const sc = document.querySelector('.cm-scroller') as HTMLElement;
					sc.scrollTop = 0;
				});
				return false;
			},
			{ timeout: 20_000 },
		)
		.toBe(true);
	await line.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' edited');
	const stop = await probe(page);
	await expand(page);
	await expect.poll(() => shownSlide(page), { timeout: 20_000 }).toBe(3);
	await frames(page, 60);
	const runs = await stop();
	expect(runs[runs.length - 1]).toBe(3);
	expect(runs.filter((n) => n !== 3 && n !== 9)).toEqual([]);
	await expect(page.frameLocator('#preview').locator('section[data-lattice-slide="3"]')).toContainText('edited');
});
