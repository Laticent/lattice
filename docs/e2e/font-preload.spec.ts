import { expect, test } from '@playwright/test';

/**
 * THE PRELOADED FONT URLS MUST BE THE ONES THE STYLESHEET ACTUALLY REQUESTS.
 *
 * `/studio/` preloads the three woff2 files its PRE-PAINT SHELL paints with, so the shell's
 * first paint has the real metrics instead of the fallback's. Measured on a 400kbps/300ms
 * link, the deck title lands 188.4px with the preload and 230.3px without — a 41.9px shift of
 * the pill and everything right of it, at the moment the app takes over.
 *
 * The THIRD file is JetBrains Mono, added once `handoff-bench.mjs` measured what the other two
 * hid: the shell's EDIT and PREVIEW sub-bars (added with the structural bands in #1438) are
 * `font-mono`, so mono IS painted at first paint even though the top bar carries none. It
 * arrived ~640ms after the preloaded pair and moved the Reader-view pill 2.781px on the frame
 * it resolved, 3/3 runs.
 *
 * That whole benefit rests on ONE fragile identity: the preload `href` and the `url()` in
 * `styles/fonts.css` must resolve to the same hashed asset. Vite guarantees it today because
 * `studio.astro` imports the same files with `?url` — but the names disagree on purpose (the
 * vendored weights are variable fonts that dedupe to one asset, so `outfit-600.woff2?url`
 * yields `/_astro/outfit-300.<hash>.woff2`), and a re-subset, a rename, or a change to how the
 * fonts are bundled could break the match while every other guard stays green.
 *
 * A MISMATCH IS WORSE THAN NO PRELOAD: the browser downloads the preloaded file, never uses
 * it, warns in the console, and then fetches the real one on the old slow path. Nothing in the
 * repo would fail. Hence this spec.
 */
test('@smoke every font the Studio preloads is one its stylesheet actually requests', async ({ page, baseURL }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });

	const preloaded = await page.evaluate(() =>
		[...document.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => (l as HTMLLinkElement).getAttribute('href') ?? ''),
	);
	// A COUNT, not a set: this spec's job is the href identity below, but the count catches the
	// other way this breaks — someone drops a preload, and every remaining one still matches.
	expect(preloaded.length, 'the Studio should preload the three families its pre-paint shell paints with').toBe(3);
	for (const href of preloaded) {
		expect(href, 'a font preload with no href').toBeTruthy();
		// `crossorigin` is REQUIRED on a font preload even same-origin: without it the
		// preload is fetched in a different CORS mode than the CSS request, so the two
		// never share a cache entry and the file is downloaded twice.
		const cross = await page.evaluate(
			(h) => document.querySelector(`link[rel="preload"][as="font"][href="${h}"]`)?.hasAttribute('crossorigin'),
			href,
		);
		expect(cross, `${href} must carry crossorigin, or it is fetched twice`).toBe(true);
	}

	// Every stylesheet the route pulls, concatenated, must mention each preloaded URL.
	const sheets = await page.evaluate(() =>
		[...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href),
	);
	expect(sheets.length, 'no stylesheets on /studio/ — the selector or the build changed').toBeGreaterThan(0);
	let css = '';
	for (const href of sheets) {
		const res = await page.request.get(href);
		expect(res.ok(), `could not read ${href}`).toBe(true);
		css += await res.text();
	}
	for (const href of preloaded) {
		const file = href.split('/').pop() ?? href;
		expect(
			css.includes(file),
			`${file} is preloaded but NO stylesheet requests it — the preload is a wasted download and the real font still loads on the slow path. Re-derive the \`?url\` imports in studio.astro against styles/fonts.css.`,
		).toBe(true);
	}
	void baseURL;
});
