import { expect, test } from '@playwright/test';

// Lighthouse reads the page's largest contentful paint. The Studio's slide lives in an iframe, which LCP does not look inside,
// so the candidates are the pre-paint shell (text, the skeleton) and whatever the app adds at mount. The loader the app builds
// at mount used to carry a noise image (`background-image: url(...)`), which Chrome counts as a candidate, and it became the
// page's LCP at the island's mount time: 13.7 s on the Lighthouse mobile profile. This reads the real entry on the real page and
// fails if the largest paint is, or sits inside, a `.nacre-loader`. Chromium only: the LCP API is a Chromium one.
// Two limits, found by an independent check: (1) the pre-paint shell's loader paints first, and a later candidate of the same size
// makes no new LCP entry, so the app's own loader regaining an image is NOT caught by the entry; the second test reads every shipped
// stylesheet rule instead. (2) It runs on the desktop project (unthrottled), not the phone profile where 13.7 s was measured; the
// identity of the largest element does not depend on throttling, its time does (see `npm run perf:startup` and Lighthouse).
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
	const read = () => page.evaluate(() => (window as unknown as { __lcp: string[] }).__lcp);
	await expect.poll(async () => (await read()).length, { message: 'the page reported no largest-contentful-paint entry', timeout: 15_000 }).toBeGreaterThan(0);
	const entries = await read();
	const last = entries[entries.length - 1];
	expect(last, `the largest contentful paint is inside the Nacre loader: ${entries.join(' -> ')}`).not.toContain('|in-loader|');
});

// The app's loader is built at React mount and may be gone by the time anything reads it, so read the CSS it ships with: no rule that
// styles a `.nacre-loader` may load an image (`url()`, `image-set()`), in any stylesheet the page carries.
test('no shipped rule that styles the Nacre loader loads an image @smoke', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'one browser is enough for a stylesheet scan');
	await page.goto('/studio/', { waitUntil: 'load' });
	const offenders = await page.evaluate(() => {
		const out: string[] = [];
		const walk = (rules: CSSRuleList) => {
			for (const r of Array.from(rules)) {
				const text = r.cssText;
				if (/nacre-loader/.test(text) && /url\(|image-set\(/i.test(text)) out.push(text.slice(0, 160));
				const inner = (r as CSSGroupingRule).cssRules;
				if (inner) walk(inner);
			}
		};
		for (const sheet of Array.from(document.styleSheets)) {
			try {
				walk(sheet.cssRules);
			} catch {
				/* a cross-origin sheet cannot be read; the page ships none for the loader */
			}
		}
		return out;
	});
	expect(offenders, `a rule styling the Nacre loader loads an image:\n${offenders.join('\n')}`).toEqual([]);
});
