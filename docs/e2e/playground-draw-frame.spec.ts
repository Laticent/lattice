import { controlReady, expect, test } from './studio-fixture';

// ── The Playground draws Mermaid the way the Studio does (followups.d/2822-p2-playground-draw-frame-parity.md) ──
//
// Both surfaces install the draw host (`load-engine.ts`) and share the runtime, so the preview frame's `window.mermaid` is a
// stand-in that sends each definition to ONE sandboxed draw frame, and the library never loads into the deck's page. The Studio's
// spec (`draw-frame-preview.spec.ts`) pins that on /studio/; nothing drove /playground/. These are the Studio's rows, on the
// Playground's page (HARD RULE #23: the real surface), on all three engines the way plugin-slots.spec.ts runs them.
//
// An edit HOLDS the previous diagram, as the Studio does: the old SVG stays until the new one is ready, so no painted frame shows
// an empty slot. This failed before `patchSections` carried `db-active` onto the replacement section (the runtime refuses to hold
// across a different scope key, and the key reads the class list): about 11 empty frames per edit.
// Baseline and numbers: engineering/decisions/2026-10-22-preview-baseline-oct-8-vs-frame.md § The Playground column.

test.describe.configure({ timeout: 300_000 });

const DECK = `---
theme: lattice
palette: indaco
---

# Prose

No diagram yet.

---

<!-- _class: diagram -->

## Signals move from input to decision.

\`\`\`mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
  C -->|yes| D[Ship]
\`\`\`

---

# Last

The caret ends here.
`;

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`the Playground draws Mermaid through a sandboxed draw frame, repaints on an edit, and never loads the library into the page @smoke${tag}`, async ({ page }) => {
		const pageLibrary: string[] = [];
		page.on('request', (r) => {
			if (/mermaid(\.min)?\.js/.test(r.url()) && !/\/frames\//.test(r.url())) pageLibrary.push(`${r.frame()?.url() || ''} → ${r.url()}`);
		});
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
		await controlReady(page.locator('#pg-template-trigger'));
		const preview = page.frameLocator('#preview');
		const editor = page.locator('.cm-content').first();
		await editor.waitFor({ timeout: 60_000 });
		await editor.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.press('Delete');
		await page.keyboard.insertText(DECK);

		// 1. DRAWN: the diagram arrives as an SVG in the preview.
		const svg = preview.locator('svg[id^="lattice-mmd-"]').first();
		await expect(svg).toBeAttached({ timeout: 90_000 });
		await expect(preview.locator('[data-lattice-settle="rendered"]').first()).toBeAttached({ timeout: 90_000 });
		await expect(svg.locator('.node').first()).toBeAttached();

		// 2. NOT IN PAGE: no script tag for the library in the preview's document, and the page never requested it.
		await expect(preview.locator('script[src*="mermaid"]')).toHaveCount(0);
		expect(await preview.locator('html').evaluate(() => typeof (window as unknown as { mermaid?: { render?: unknown } }).mermaid?.render)).toBe('function');
		expect(pageLibrary, `the Playground page loaded the Mermaid library: ${pageLibrary.join(' | ')}`).toEqual([]);

		// 3. SANDBOXED: ONE draw frame, `allow-scripts` and nothing more, an opaque origin.
		const frames = page.locator('iframe[data-lattice-draw-frame="mermaid"]');
		await expect(frames).toHaveCount(1);
		expect(await frames.first().getAttribute('sandbox')).toBe('allow-scripts');
		expect(await frames.first().evaluate((el) => (el as HTMLIFrameElement).contentDocument === null)).toBe(true);

		// 4. AN EDIT REDRAWS through the same frame: no second frame, and the new label reaches the diagram.
		await page.getByText('A[Input] --> B[Process]').first().click();
		await page.keyboard.press('End');
		await page.keyboard.press('ArrowLeft');
		// Count the frames the preview PAINTS with the fence's slot empty (no SVG, source hidden), from a sampler started here.
		await preview.locator('html').evaluate(() => {
			const w = window as unknown as { __blank: number; __stop: boolean };
			w.__blank = 0;
			w.__stop = false;
			const tick = () => {
				const code = document.querySelector('pre > code[class*="language-mermaid"]') as HTMLElement | null;
				if (code) {
					const target = code.parentElement?.nextElementSibling;
					const hidden = getComputedStyle(code).visibility === 'hidden' || getComputedStyle(code.parentElement as Element).display === 'none';
					if (hidden && !target?.querySelector('svg')) w.__blank++;
				}
				if (!w.__stop) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		const started = Date.now();
		await page.keyboard.type('x');
		await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toContainText('Processx', { timeout: 60_000 });
		test.info().annotations.push({ type: 'latency', description: `edit to repainted diagram ${Date.now() - started} ms` });
		await expect(frames).toHaveCount(1);
		expect(pageLibrary, 'the library loaded into the page after an edit').toEqual([]);
		const blank = await preview.locator('html').evaluate(() => {
			const w = window as unknown as { __blank: number; __stop: boolean };
			w.__stop = true;
			return w.__blank;
		});
		test.info().annotations.push({ type: 'blank-frames', description: String(blank) });
		expect(blank, `${blank} painted frames showed an empty diagram slot during the edit`).toBeLessThan(3);
	});
}

// A diagram that arrives in a frame that has never held one is hidden under its tag within a beat, not left as source for seconds
// (the Studio's row of the same name). Counts the frames the preview PAINTS with the source visible, from a sampler installed at
// document start in every preview frame.
test('the first diagram the Playground preview gains does not paint its source @gecko @webkit-tablet', async ({ page }) => {
	await page.addInitScript(() => {
		if (window === window.top) return;
		const w = window as unknown as { __srcFrames: number };
		w.__srcFrames = 0;
		const tick = () => {
			const code = [...document.querySelectorAll('pre > code')].find((c) => (c.textContent || '').includes('flowchart LR')) as HTMLElement | undefined;
			if (code) {
				const r = code.getBoundingClientRect();
				if (r.width > 2 && r.height > 2 && getComputedStyle(code).visibility !== 'hidden') w.__srcFrames++;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await controlReady(page.locator('#pg-template-trigger'));
	const preview = page.frameLocator('#preview');
	const editor = page.locator('.cm-content').first();
	await editor.waitFor({ timeout: 60_000 });
	await expect(preview.locator('.lattice').first()).toBeAttached({ timeout: 60_000 });
	const frameCount = () => preview.locator('.lattice').first().evaluate(() => (window as unknown as { __srcFrames: number }).__srcFrames);
	await editor.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(DECK);
	await expect(preview.locator('pre[data-lattice-hydrate="mermaid"]').first()).toHaveAttribute('data-lattice-settle', 'rendered', { timeout: 90_000 });
	// Absolute, not a difference: a full write replaces the document, and a new document restarts the counter.
	const frames = await frameCount();
	test.info().annotations.push({ type: 'source-frames', description: String(frames) });
	// The slow path is about ten frames (the 150 ms debounce); the bug it pins was about a hundred.
	expect(frames, `${frames} painted frames showed the diagram's source`).toBeLessThan(40);
});
