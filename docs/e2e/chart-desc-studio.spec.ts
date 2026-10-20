import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

// ── A chart row's `>` description, on the REAL Studio ───────────────────────────
//
// The owner tested #2690 in the Studio on a phone: `> Hi` indented under a bar row dropped the
// row, and the hover card was the thing they expected it to feed. The Playground arm in
// chart-detail-reveal.spec.ts drives the shared reveal; this one drives the surface the owner
// used, whose preview iframe is TRANSFORM-SCALED (so frame coordinates are multiplied by the
// frame's measured scale before the pointer moves) and whose deck CSS is scoped by its own
// ancestor chain, which the card mirrors (chart-detail-layer.tsx `DeckHtml`).
const DECK = `---
marp: true
theme: indaco
paginate: true
---

# Title

---

<!-- _class: bar -->

## The European spelling draws the same bars.

- Germany \`1.234,5\`
  > Hi **bold** \`{LIVE, tag}\` \`~{1 3 2 5}\`
  > - we
  > - us
- France \`987,6\`
- Italy \`2.345,8\`
`;

for (const width of [1440, 390]) {
	test(`@crosswidth a bar row's description reveals as a rich, deck-styled card in the Studio at ${width}`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
		await gotoStudio(page);
		await waitForStudioPaint(page);
		// At 390 the Studio is one pane at a time, the owner's phone: Source to type, Preview to look.
		if (width === 390) await page.getByRole('button', { name: 'Markdown source' }).first().click();
		await setEditorContent(page, DECK);
		if (width === 390) await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
		const frame = page.locator(LIVE_PREVIEW).first();
		await expect(frame).toBeVisible({ timeout: 30_000 });
		// The bar chart painted with all three bars: before the fix Germany was dropped.
		await expect
			.poll(
				() =>
					frame.evaluate((fe: HTMLIFrameElement) => fe.contentDocument?.querySelectorAll('.bar-figure [data-mark]:not(template)').length ?? 0),
				{ timeout: 30_000 },
			)
			.toBe(3);
		// Germany's bar in PAGE coordinates: the iframe is transform-scaled, so scale the
		// frame-space box by the frame's own measured scale.
		const point = async () =>
			frame.evaluate((fe: HTMLIFrameElement) => {
				const fb = fe.getBoundingClientRect();
				const s = fb.width / fe.clientWidth;
				const n = fe.contentDocument!.querySelector('.bar-figure [data-mark="0"]:not(template)')!;
				const r = n.getBoundingClientRect();
				return { x: fb.x + (r.x + r.width / 2) * s, y: fb.y + (r.y + r.height * 0.6) * s };
			});
		const p = await point();
		await page.mouse.move(p.x - 40, p.y - 40);
		await page.mouse.move(p.x, p.y, { steps: 12 });
		if (width === 390) await page.mouse.click(p.x, p.y);
		const card = page.locator('[data-slot="popover-content"]');
		await expect(card).toBeVisible({ timeout: 10_000 });
		await expect(card).toContainText('Germany');
		const rich = await page.evaluate(() => {
			const host = [...document.querySelectorAll('[data-slot="popover-content"] div')].find((d) => d.shadowRoot);
			const root = host?.shadowRoot;
			if (!root) return null;
			const pill = root.querySelector('.lat-pill') as HTMLElement | null;
			const path = root.querySelector('.lat-spark path');
			const ps = pill ? getComputedStyle(pill) : null;
			return {
				text: root.textContent?.replace(/\s+/g, ' ').trim() ?? '',
				items: root.querySelectorAll('li').length,
				pillPainted: !!ps && ps.display === 'inline-block' && ps.borderTopStyle !== 'none',
				sparkStroked: !!path && getComputedStyle(path).fill === 'none',
			};
		});
		expect(rich).not.toBeNull();
		expect(rich!.text).toContain('Hi bold LIVE');
		expect(rich!.items).toBe(2);
		expect(rich!.pillPainted, 'the pill takes the deck\'s styling').toBe(true);
		expect(rich!.sparkStroked, 'the spark is a stroked line').toBe(true);
		// The slide's page number is `section::after`; the card copies the section, and on a
		// paginated deck it drew a stray "2" (the owner's phone test).
		expect(rich!.text).not.toMatch(/\b2\b/);
		const chrome = await page.evaluate(() => {
			const host = [...document.querySelectorAll('[data-slot="popover-content"] div')].find((d) => d.shadowRoot);
			const sec = host?.shadowRoot?.querySelector('section');
			return sec ? getComputedStyle(sec, '::after').content : 'missing';
		});
		expect(chrome, 'the page number does not reach the card').toBe('none');
		await page.screenshot({ path: testInfo.outputPath(`studio-bar-desc-${width}.png`) });
		// The card lives in the page, so a press anywhere outside the preview stage closes it on every
		// width: the frame's own listeners never hear it. Re-open, press the page header, expect it shut.
		await page.mouse.move(p.x - 40, p.y - 40);
		await page.mouse.move(p.x, p.y, { steps: 12 });
		if (width === 390) await page.mouse.click(p.x, p.y);
		await expect(card).toBeVisible({ timeout: 10_000 });
		await page.mouse.click(2, 2);
		await expect(card).toBeHidden({ timeout: 5_000 });
		await page.mouse.move(p.x - 40, p.y - 40);
		await page.mouse.move(p.x, p.y, { steps: 12 });
		if (width === 390) await page.mouse.click(p.x, p.y);
		await expect(card).toBeVisible({ timeout: 10_000 });
		// The card belongs to the preview: leaving it (Source at 390, as the owner did) closes it, so
		// it never floats over the editor.
		if (width === 390) {
			await page.getByRole('button', { name: 'Markdown source' }).first().click();
			await expect(card).toBeHidden({ timeout: 5_000 });
		}
	});
}
