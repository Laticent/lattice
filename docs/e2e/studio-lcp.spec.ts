import { expect, test } from '@playwright/test';

// Lighthouse reads the page's largest contentful paint. The Studio's slide lives in an iframe, which LCP does not look inside,
// so the candidates are the pre-paint shell (text, the skeleton) and whatever the app adds at mount. The loader the app builds
// at mount used to carry a noise image (`background-image: url(...)`), which Chrome counts as a candidate, and it became the
// page's LCP at the island's mount time: 13.7 s on the Lighthouse mobile profile. This reads the real entry on the real page and
// fails if the largest paint is, or sits inside, a `.nacre-loader`. Chromium only: the LCP API is a Chromium one.
test('the Studio’s largest contentful paint is not the Nacre loader @smoke', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'the largest-contentful-paint entry is Chromium-only');
	await page.addInitScript(() => {
		(window as unknown as { __lcp: string[] }).__lcp = [];
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) {
				const el = (e as unknown as { element?: Element }).element;
				(window as unknown as { __lcp: string[] }).__lcp.push(el ? `${el.tagName.toLowerCase()}|${el.closest('.nacre-loader') ? 'in-loader' : 'outside'}|${(el.className || '').toString().slice(0, 40)}` : 'none');
			}
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	});
	await page.goto('/studio/', { waitUntil: 'load' });
	// The app's own loader exists once the island has mounted, and the first slide is the end of the loading story.
	await expect(page.frameLocator('[aria-label="Live deck preview"] iframe.live').locator('.lattice').first()).toBeAttached({ timeout: 60_000 });
	await page.waitForTimeout(1500);
	const entries = await page.evaluate(() => (window as unknown as { __lcp: string[] }).__lcp);
	expect(entries.length, 'the page reported no largest-contentful-paint entry').toBeGreaterThan(0);
	const last = entries[entries.length - 1];
	expect(last, `the largest contentful paint is inside the Nacre loader: ${entries.join(' -> ')}`).not.toContain('|in-loader|');
});
