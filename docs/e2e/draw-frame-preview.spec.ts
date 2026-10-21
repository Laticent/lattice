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

// All three engines, as plugin-slots.spec.ts runs them: `@gecko` runs on the desktop (Chromium) project and the gecko one;
// the `@webkit-tablet` twin runs on WebKit. A sandboxed srcdoc frame, its CSP and postMessage are engine behavior.
for (const tag of [' @gecko', ' @webkit-tablet']) {
test(`function-plot draws in the preview through a sandboxed draw frame, and its library never loads into the deck page @smoke${tag}`, async ({ page, browserName }) => {
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
		if (evidence) await page.screenshot({ path: `${evidence}/draw-frame-plot${baseline ? '-baseline' : ''}-${browserName}-${width}.png` });
	}
});
}

// ── MERMAID: the same wall. The preview frame holds a stand-in for `window.mermaid` that sends each definition to a
//    sandboxed draw frame; the library is never loaded into the deck's page. A flowchart's tooltip and a gantt's link
//    still work, and the diagram fits the three widths.
// The preview shows one slide at a time, so each diagram has its own deck.
const FLOW_DECK = `---
theme: indaco
---

## A flow

\`\`\`mermaid
flowchart LR
  A[Draft] --> B{Review}
  B -->|ok| C[Ship]
  click A "https://example.com/draft" "Where it starts"
\`\`\`
`;
const GANTT_DECK = `---
theme: indaco
---

## A schedule

\`\`\`mermaid
gantt
  dateFormat YYYY-MM-DD
  section Build
  Design :d1, 2026-01-01, 5d
  Ship :d2, after d1, 3d
  click d1 href "https://example.com/design"
\`\`\`
`;

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`mermaid draws in the preview through a sandboxed draw frame, with its tooltip and its gantt link, and its library never loads into the deck page @smoke${tag}`, async ({ page, browserName }) => {
		// The host offers Mermaid (docs/src/lib/preview-draw-host.ts `KINDS`), so the frame arm runs; with LATTICE_NO_DRAW_HOST=1 the same
		// spec measures the in-page path for the before/after.
		const evidence = process.env.LATTICE_EVIDENCE_DIR;
		if (baseline) await page.addInitScript(() => Object.defineProperty(window, '__latticeDrawHost', { value: null, writable: false, configurable: false }));
		const loaded: string[] = [];
		page.on('request', (r) => {
			if (/mermaid(\.min)?\.js/.test(r.url())) loaded.push(`${r.frame()?.url() || ''} → ${r.url()}`);
		});
		await gotoStudio(page);
		const preview = livePreview(page);
		const started = Date.now();
		await setEditorContent(page, FLOW_DECK);

		const flow = preview.locator('svg[id^="lattice-mmd-"]').first();
		await expect(flow).toBeAttached({ timeout: 90_000 });
		await expect(preview.locator('[data-lattice-settle="rendered"]').first()).toBeAttached({ timeout: 90_000 });
		const firstDrawMs = Date.now() - started;
		await expect(flow.locator('.node').first()).toBeAttached();

		const offered = await page.evaluate(() => !!(window as unknown as { __latticeDrawHost?: { kinds?: string[] } }).__latticeDrawHost?.kinds?.includes('mermaid'));
		if (offered) {
			// NOT IN PAGE; ONE SANDBOXED FRAME; the library was fetched by the Studio page, not by the preview frame.
			expect(await preview.locator('html').evaluate(() => typeof (window as unknown as { mermaid?: { render?: unknown } }).mermaid?.render)).toBe('function');
			await expect(preview.locator('script[src*="mermaid"]')).toHaveCount(0);
			const frames = page.locator('iframe[data-lattice-draw-frame="mermaid"]');
			await expect(frames).toHaveCount(1);
			expect(await frames.first().getAttribute('sandbox')).toBe('allow-scripts');
			expect(loaded.filter((l) => l.startsWith('about:srcdoc')), `the preview frame requested the library: ${loaded.join(' | ')}`).toEqual([]);
		}

		// A LATER EDIT redraws: the time from the edit to the new label, through the open frame (or the loaded library).
		const again = Date.now();
		await setEditorContent(page, FLOW_DECK.replace('Draft', 'Drafted'));
		await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toContainText('Drafted', { timeout: 60_000 });
		const redrawMs = Date.now() - again;
		await setEditorContent(page, FLOW_DECK);
		await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).not.toContainText('Drafted', { timeout: 60_000 });

		// THE TOOLTIP: hovering the clickable node shows its text.
		const node = preview.locator('g.node.clickable').first();
		await expect(node).toBeAttached();
		if (offered) await expect(node).toHaveAttribute('data-lattice-tip', 'Where it starts');
		// A real pointer reaches the node only through the Studio's own stage, which the preview owns; the binder is the subject here.
		await node.dispatchEvent('mouseover');
		await expect(preview.locator('body > .mermaidTooltip').first()).toHaveText('Where it starts');

		// THE GANTT LINK: the bar of a task with a `click` opens the link; the frame sent the chart's links with its drawing.
		await setEditorContent(page, GANTT_DECK);
		const bar = preview.locator('svg[id^="lattice-mmd-"] rect[id$="-d1"]').first();
		await expect(bar).toBeAttached({ timeout: 60_000 });
		await preview.locator('html').evaluate(() => {
			const opened: string[] = [];
			(window as unknown as { __opened: string[] }).__opened = opened;
			window.open = ((u: string) => {
				opened.push(String(u));
				return null;
			}) as typeof window.open;
		});
		await bar.dispatchEvent('click');
		expect(await preview.locator('html').evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(['https://example.com/design']);

		test.info().annotations.push({ type: 'latency', description: `mermaid first draw ${firstDrawMs} ms, redraw ${redrawMs} ms` });
		const marks = await page.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('lattice-draw:')).map((m) => `${m.name.slice(13)}@${Math.round(m.startTime)}`));
		test.info().annotations.push({ type: 'phases', description: marks.join(' ') });
		if (evidence) {
			for (const [width, height] of [
				[1440, 900],
				[820, 1180],
				[390, 844],
			]) {
				await page.setViewportSize({ width, height });
				await expect(flow).toBeVisible();
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
				await page.screenshot({ path: `${evidence}/draw-frame-mermaid${baseline ? '-baseline' : ''}-${browserName}-${width}.png` });
			}
		}
	});
}

test('a Studio export draws Mermaid itself, never through the preview draw frame @smoke', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'the export path is the same code on every engine; one engine is enough to pin that the frame is not used');
	test.setTimeout(240_000);
	await gotoStudio(page);
	const preview = livePreview(page);
	await setEditorContent(page, FLOW_DECK);
	await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toBeAttached({ timeout: 90_000 });
	// Every draw the host takes leaves a mark. The preview's draw and the deck-wide check's draw (900 ms after the deck settles) both come first, so wait for both before clearing: any mark after that comes from the export.
	const marks = () => page.evaluate(() => performance.getEntriesByName('lattice-draw:draw-called').length);
	// Settled: at least the preview's and the check's draw are in, and the count has not moved for a full check interval.
	await expect
		.poll(async () => {
			const before = await marks();
			await new Promise((r) => setTimeout(r, 1500));
			return before >= 2 && before === (await marks());
		}, { timeout: 60_000 })
		.toBe(true);
	await page.evaluate(() => performance.clearMarks('lattice-draw:draw-called'));
	await page.getByRole('button', { name: 'Share', exact: true }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: /^PDF/ }).first().click();
	const download = page.waitForEvent('download', { timeout: 200_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Download PDF/ }).click();
	await download;
	expect(await page.evaluate(() => performance.getEntriesByName('lattice-draw:draw-called').length), 'the export asked the draw host to draw').toBe(0);
});

test('when the Mermaid frame cannot load its modules, the host says so at once and the next preview draws in the page @smoke', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'the fallback is engine-independent code; one engine pins it');
	test.setTimeout(240_000);
	// The frame's modules fail (a stale deploy, a dropped link), but only AFTER the preview frame has installed its stand-in for Mermaid:
	// the hard case, where the page must take the figure back from a stand-in it already holds. The gate holds every request under
	// frames/mermaid/ until the test lets it fail.
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/frames\/mermaid\//, async (route) => {
		await gate;
		await route.abort();
	});
	await gotoStudio(page);
	const preview = livePreview(page);
	await setEditorContent(page, FLOW_DECK);
	await expect.poll(() => preview.locator('html').evaluate(() => typeof (window as unknown as { mermaid?: { render?: unknown } }).mermaid?.render), { timeout: 60_000 }).toBe('function');
	release();
	// The host learns of the failure from the frame at once, not after its 30 s open timeout.
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __latticeDrawHost?: { kinds?: string[] } }).__latticeDrawHost?.kinds?.includes('mermaid') ?? false), { timeout: 20_000 })
		.toBe(false);
	// The next edit finds a stand-in that is stale and loads the library into the page.
	await setEditorContent(page, FLOW_DECK.replace('Draft', 'Drafted'));
	await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toContainText('Drafted', { timeout: 90_000 });
	expect(await page.locator('iframe[data-lattice-draw-frame="mermaid"]').count(), 'the failed frame is gone').toBe(0);
});

test("the Studio's deck-wide diagram check draws through the frame and never loads Mermaid into the page @smoke @gecko @webkit-tablet", async ({ page }) => {
	test.setTimeout(240_000);
	const pageLibrary: string[] = [];
	page.on('request', (r) => {
		if (/mermaid\.min\.js/.test(r.url())) pageLibrary.push(r.url());
	});
	await gotoStudio(page);
	const preview = livePreview(page);
	const slide = (n: number) => `## Flow ${n}\n\n\`\`\`mermaid\nflowchart LR\n  A${n}[Draft] --> B${n}[Ship]\n\`\`\`\n`;
	await setEditorContent(page, `---\ntheme: indaco\n---\n\n${slide(1)}\n---\n\n${slide(2)}\n---\n\n${slide(3)}`);
	await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toBeAttached({ timeout: 90_000 });
	// The preview draws the current slide (one draw). The check starts 900 ms after the deck settles and draws all three, one after the other.
	await expect
		.poll(() => page.evaluate(() => performance.getEntriesByName('lattice-draw:draw-called').length), { timeout: 60_000, message: 'the check drew the other slides' })
		.toBeGreaterThanOrEqual(4);
	expect(pageLibrary, 'the Studio page loaded the Mermaid library').toEqual([]);
});
