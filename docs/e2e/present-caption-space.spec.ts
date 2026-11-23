import { expect, gotoStudio, test, typeDeck } from './studio-fixture';

// The caption band and the slide each own their space: pressing Play, which fades the caption crawl in, and Pause,
// which fades it out, never resize the presented slide. Turning captions off or on adds or removes the band, and
// resizes the slide once, never through an animated height (owner, 2026-11-20). The band used to grow from 0 at Play
// and fold at Pause, so the slide shrank and grew back, and its frame rescaled at every Play and every slide's start.
// On an iPhone, with Guide on, that rescale of a 4K deck reloaded the tab. stage-chrome.js `.latt-cc-band`.
//
// No voice and no key: with the voice off, Present runs its estimate clock and still fills the caption band.
const deck = `---
marp: true
theme: indaco
---

## The caption has its own place

- The slide stays one size
- Play fades the caption in
- Pause fades it out

---

## A second slide

- So the deck has somewhere to go
`;

test('Play and Pause never resize the presented slide @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, deck);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const cc = dialog.getByRole('button', { name: 'Captions' });
	if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
	const slide = dialog.locator('[aria-label="Presented slide"]');
	await expect(slide.locator('iframe.live')).toHaveCSS('opacity', '1', { timeout: 20000 });

	// Count every resize of the presented slide from here on, and keep its size now.
	const before = await slide.evaluate((el) => {
		const w = window as Window & { __slideResizes?: number };
		w.__slideResizes = 0;
		let first = true;
		new ResizeObserver(() => {
			if (first) first = false; // the observer's own first call reports the current size
			else w.__slideResizes = (w.__slideResizes ?? 0) + 1;
		}).observe(el);
		const r = el.getBoundingClientRect();
		return { w: Math.round(r.width), h: Math.round(r.height) };
	});
	const band = dialog.locator('.latt-cc-band');
	const resizes = () => page.evaluate(() => (window as Window & { __slideResizes?: number }).__slideResizes ?? -1);
	const size = () => slide.evaluate((el) => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));

	await page.getByRole('button', { name: 'Play the presentation' }).click();
	// Shown, carrying words, and its fade finished: everything Play changes has happened.
	await expect(band).toHaveAttribute('data-shown', '1');
	await expect(band.locator('.latt-cc-track')).toHaveText(/\S/, { timeout: 15000 });
	await expect(band).toHaveCSS('opacity', '1');
	expect(await size(), 'the slide keeps its size when the caption fades in').toEqual(before);
	expect(await resizes(), 'the slide was never resized on the way').toBe(0);

	// On a phone Present hides its controls while it plays, so Pause is reached directly; pausing needs no gesture.
	await dialog.locator('button[aria-label="Pause"]').first().dispatchEvent('click');
	await expect(band).toHaveAttribute('data-shown', '0');
	await expect(band).toHaveCSS('opacity', '0');
	expect(await size(), 'the slide keeps its size when the caption fades out').toEqual(before);
	expect(await resizes(), 'the slide was never resized on the way back').toBe(0);

	// Captions off, then on: the band leaves and rejoins the layout in one step each, so the slide resizes once per
	// toggle at most (none where the slide is limited by the screen's width, as on a phone). An animated height would
	// resize it on every frame of the animation. "Settled" is a signal, not a wait: no animation left on the band, and
	// one more rendering update for the ResizeObserver to report.
	const settled = async () => {
		await expect.poll(() => band.evaluate((el) => el.getAnimations().length)).toBe(0);
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	};
	await cc.dispatchEvent('click');
	await expect(cc).toHaveAttribute('aria-pressed', 'false');
	await expect(band).toBeHidden();
	await settled();
	expect(await resizes(), 'turning captions off resizes the slide once at most').toBeLessThanOrEqual(1);
	await cc.dispatchEvent('click');
	await expect(cc).toHaveAttribute('aria-pressed', 'true');
	await expect(band).toBeVisible();
	await settled();
	expect(await resizes(), 'turning captions on resizes it once more at most').toBeLessThanOrEqual(2);
	expect(await size(), 'and the slide is back to its size').toEqual(before);
});
