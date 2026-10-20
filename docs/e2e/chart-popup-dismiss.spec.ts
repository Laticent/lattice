import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

// ── The chart detail card closes when attention leaves the preview ──────────────
//
// The card lives in the page, but the hit layer only hears events inside the preview frame, so a
// press or focus anywhere else used to leave it open (the owner's phone: Preview → Edit left it
// over the editor). chart-detail-layer.tsx `dismiss()` closes it. This spec drives the REAL Studio
// at the three widths that ship, with a mouse on Chromium and a real touch tap on WebKit.
const DECK = `---
marp: true
theme: indaco
---

# Title

---

<!-- _class: bar -->

## Bars

- Germany \`1.234,5\`
  > Hi there
- France \`987,6\`
- Italy \`2.345,8\`
`;

async function openCard(page: import('@playwright/test').Page, width: number, tap: boolean) {
	await gotoStudio(page);
	await waitForStudioPaint(page);
	if (width === 390) await page.getByRole('button', { name: 'Markdown source' }).first().click();
	await setEditorContent(page, DECK);
	if (width === 390) await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	const frame = page.locator(LIVE_PREVIEW).first();
	await expect(frame).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(() => frame.evaluate((fe: HTMLIFrameElement) => fe.contentDocument?.querySelectorAll('.bar-figure [data-mark]:not(template)').length ?? 0), { timeout: 30_000 })
		.toBe(3);
	const point = () =>
		frame.evaluate((fe: HTMLIFrameElement) => {
			const fb = fe.getBoundingClientRect();
			const s = fb.width / fe.clientWidth;
			const r = fe.contentDocument!.querySelector('.bar-figure [data-mark="0"]:not(template)')!.getBoundingClientRect();
			return { x: fb.x + (r.x + r.width / 2) * s, y: fb.y + (r.y + r.height * 0.6) * s };
		});
	const card = page.locator('[data-slot="popover-content"][data-state="open"]');
	const open = async () => {
		const p = await point();
		if (tap) await page.touchscreen.tap(p.x, p.y);
		else {
			await page.mouse.move(p.x - 40, p.y - 40);
			await page.mouse.move(p.x, p.y, { steps: 12 });
			if (width === 390) await page.mouse.click(p.x, p.y);
		}
		await expect(card).toBeVisible({ timeout: 10_000 });
		await expect(card).toContainText('Germany');
	};
	return { card, open };
}

for (const width of [1440, 820, 390]) {
	test(`@crosswidth the chart card closes on a press outside the preview at ${width}`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
		const { card, open } = await openCard(page, width, false);
		await open();
		await page.mouse.click(2, 2);
		await expect(card).toBeHidden({ timeout: 5_000 });
		await open(); // and it opens again afterwards: dismissal leaves the hit layer working
	});
}

test('@webkit-phone the chart card closes on a real tap outside, and when you switch to Source', async ({ page }) => {
	const { card, open } = await openCard(page, 390, true);
	await open();
	await page.touchscreen.tap(2, 2);
	await expect(card).toBeHidden({ timeout: 5_000 });
	await open();
	await page.getByRole('button', { name: 'Markdown source' }).first().tap();
	await expect(card).toBeHidden({ timeout: 5_000 });
});
