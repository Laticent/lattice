import { paintedMarkers } from '../marker-chrome';
import { currentSlide, expect, gotoStudio, livePreview, railButtons, readStorage, slideCount, test } from '../studio-fixture';

// Persona: a consultant re-branding a client deck. Goal: switch the palette and
// have EVERY slide re-theme cleanly — tokens resolved from the new palette on
// each slide, and no slide overflowing after the swap. The oracle walks the
// whole deck, not just the visible slide.

// Read a token as the ENGINE resolved it, from inside the preview iframe (the
// only place the re-theme is real). The theme scopes its tokens to the slide
// <section> (not the frame's :root), so read it there. Empty = did not resolve
// — including the moment the frame is mid-re-render (srcdoc swap), so callers
// poll rather than trust one read.
function slideToken(page: import('@playwright/test').Page, token: string): Promise<string> {
	return livePreview(page)
		.locator('section')
		.first()
		.evaluate((el, t) => getComputedStyle(el).getPropertyValue(t).trim(), token)
		.catch(() => '');
}

// The engine runtime flags a clipping slide by toggling `overflow` on its
// <section> and appending an "Overflows" tab — the honest signal a slide broke.
// Settles two frames INSIDE the evaluate so the post-paint probe has had its
// chance to speak; returns -1 when the frame re-rendered mid-read (srcdoc swap
// destroys the context), which a polling caller simply retries.
function settledOverflowFlags(page: import('@playwright/test').Page): Promise<number> {
	// PAINTED markers, not marker ELEMENTS: the three tabs are part of every rendered
	// slide now (lib/core/fit-berth.js), so counting them would return a positive
	// number on a perfectly clean deck. The two-frame settle moved inside the helper
	// (../marker-chrome), so this is one evaluate rather than a settle plus a read.
	return livePreview(page)
		.locator('body')
		.evaluate(paintedMarkers)
		.then((m) => m.total)
		.catch(() => -1);
}

test('switching the palette re-themes every slide with no overflow', async ({ page }) => {
	await gotoStudio(page);
	const total = await slideCount(page);
	expect(total).toBeGreaterThan(3); // the seeded deck is a real multi-component deck

	// The accent token under the CURRENT palette — the re-theme must change it.
	const accentBefore = await slideToken(page, '--accent');
	expect(accentBefore).not.toBe('');

	// Re-brand: pick a different palette from the topbar. It must differ from the
	// DEFAULT (cuoio since #1285) — the assertion below is that the resolved accent
	// CHANGES, which a re-pick of the palette already in effect cannot satisfy.
	await page.getByRole('button', { name: 'Theme' }).click();
	await page.getByRole('menuitem', { name: 'Burgundy' }).click();
	await expect.poll(() => readStorage(page, 'lattice-studio-palette')).toBe('burgundy');

	// The cause propagated INTO the render: the resolved accent actually changed.
	await expect.poll(() => slideToken(page, '--accent')).not.toBe(accentBefore);
	const accentAfter = await slideToken(page, '--accent');

	// Walk the whole deck: every slide re-themes (same resolved palette token) and
	// none of them overflows under the new type/color ramp.
	for (let i = 0; i < total; i++) {
		await railButtons(page).nth(i).click();
		await expect(page.getByText(`Slide ${i + 1} / ${total}`, { exact: true })).toBeVisible();
		await expect(currentSlide(page)).not.toBeEmpty();
		await expect.poll(() => slideToken(page, '--accent'), { message: `slide ${i + 1} tokens` }).toBe(accentAfter);
		await expect.poll(() => settledOverflowFlags(page), { message: `slide ${i + 1} overflow` }).toBe(0);
	}
});
