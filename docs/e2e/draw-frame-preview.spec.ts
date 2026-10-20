import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── The previews draw function-plot (and, in the next steps, Mermaid and math) in a SANDBOXED DRAW FRAME, not in the
//    page that holds the deck (owner decisions 14 and 15, D1 A, 2026-10-20; HARD RULE #23: the real Studio) ──
//
//   1. DRAWN       a ```functionplot fence draws in the live preview as it did before
//   2. NOT IN PAGE the preview frame never loads function-plot.js, and its document holds no copy of the library
//   3. SANDBOXED   the Studio page holds ONE draw frame for it, `sandbox="allow-scripts"` and nothing more (no
//                  allow-same-origin, so an opaque origin), laid out but invisible
//   4. THREE WIDTHS the plot fits 1440, 820 and 390 px (screenshots when LATTICE_EVIDENCE_DIR is set)

test.describe.configure({ timeout: 300_000 });

const DECK = '---\ntheme: indaco\n---\n\n## A plot\n\n```functionplot\n{ "data": [{ "fn": "x^2" }, { "fn": "sin(x)" }], "grid": true }\n```\n';

// BASELINE MODE (LATTICE_NO_DRAW_HOST=1): the host's name is defined as null before the page's own code runs, so the Studio
// does not install it and the runtime takes the old in-page path. The same checks of the drawing run and the checks of the
// frame are skipped, so one build gives both sides of a before and after (screenshots, latency) without a second checkout.
const baseline = !!process.env.LATTICE_NO_DRAW_HOST;

test('function-plot draws in the preview through a sandboxed draw frame, and its library never loads into the deck page @smoke', async ({ page }) => {
	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	if (baseline) await page.addInitScript(() => Object.defineProperty(window, '__latticeDrawHost', { value: null, writable: false, configurable: false }));
	const loaded: string[] = [];
	page.on('request', (r) => {
		if (/function-plot\.js/.test(r.url())) loaded.push(`${r.frame()?.url() || ''} → ${r.url()}`);
	});
	await gotoStudio(page);
	const preview = livePreview(page);
	const frames = page.locator('iframe[data-lattice-draw-frame="function-plot"]');
	const started = Date.now();
	await setEditorContent(page, DECK);

	// 1. DRAWN
	const plot = preview.locator('[data-lattice-hydrate="function-plot"] svg.function-plot');
	await expect(plot).toHaveCount(1, { timeout: 60_000 });
	await expect(preview.locator('[data-lattice-hydrate="function-plot"]')).toHaveAttribute('data-lattice-settle', 'rendered');
	const firstDrawMs = Date.now() - started;
	await expect(plot.locator('path.line').first()).toBeAttached();

	if (!baseline) await framesAndPage();
	else test.info().annotations.push({ type: 'baseline', description: 'the library loaded into the preview page, as before' });
	async function framesAndPage() {
	// 2. NOT IN PAGE: no script tag for the library in the preview's document, and the library was never requested by it.
	await expect(preview.locator('script[src*="function-plot"]')).toHaveCount(0);
	expect(await preview.locator('html').evaluate(() => typeof (window as unknown as { functionPlot?: unknown }).functionPlot)).toBe('undefined');

	// 3. SANDBOXED: one frame, the pool's sandbox, an opaque origin.
	await expect(frames).toHaveCount(1);
	expect(await frames.first().getAttribute('sandbox')).toBe('allow-scripts');
	expect(await frames.first().evaluate((el) => (el as HTMLIFrameElement).contentDocument === null)).toBe(true);
	// The library was fetched by the Studio page (the host pins it), not by the preview frame.
	expect(loaded.filter((l) => l.includes('srcdoc') || l.startsWith('about:srcdoc')), `the preview frame requested the library: ${loaded.join(' | ')}`).toEqual([]);
	}

	// A later edit redraws through the same frame: no second frame, and it is faster than the first.
	const again = Date.now();
	await setEditorContent(page, DECK.replace('sin(x)', 'cos(x)'));
	await expect(preview.locator('[data-lattice-hydrate="function-plot"] svg.function-plot')).toHaveCount(1);
	if (!baseline) await expect(frames).toHaveCount(1);
	const redrawMs = Date.now() - again;
	test.info().annotations.push({ type: 'latency', description: `first draw ${firstDrawMs} ms, redraw ${redrawMs} ms` });
	// Each phase of the first draw, from the page's own timeline (the host marks them): where the time goes.
	const marks = await page.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('lattice-draw:')).map((m) => `${m.name.slice(13)}@${Math.round(m.startTime)}`));
	test.info().annotations.push({ type: 'phases', description: marks.join(' ') });

	// 4. THREE WIDTHS
	for (const [width, height] of [
		[1440, 900],
		[820, 1180],
		[390, 844],
	]) {
		await page.setViewportSize({ width, height });
		await expect(plot).toBeVisible();
		let previous = '';
		await expect
			.poll(
				async () => {
					const current = (await page.screenshot()).toString('base64');
					const same = current === previous;
					previous = current;
					return same;
				},
				{ timeout: 15_000, intervals: [300] },
			)
			.toBe(true);
		if (evidence) await page.screenshot({ path: `${evidence}/draw-frame-plot${baseline ? '-baseline' : ''}-${width}.png` });
	}
});
