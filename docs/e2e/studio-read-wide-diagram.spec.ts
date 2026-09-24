import { expect, test } from '@playwright/test';
import { CHROME, gotoStudio, livePreview, setEditorContent } from './studio-fixture';

// A WIDE diagram in the Read pane keeps legible labels and scrolls sideways.
//
// Until 2026-09-24 a re-hosted Mermaid diagram shrank to the column however narrow it got:
// the `<img>` contract (natural size, scaled DOWN, never up) has no floor, so an eight-stage
// LR flowchart drew its 14px labels at about 3px on a phone. The prose-projection kernel now
// writes each diagram figure's floor, 12/14 of its viewBox (`diagramFigureAttrs` in
// lib/transformers/prose-projection.mjs), and ReadArticle.tsx turns it into a min-width plus
// a figure that scrolls. The small diagram is the control: it never reaches the floor, so it
// must not scroll. Long form: engineering/mermaid.md § "How big the re-hosted diagram is".
const DECK = `---
theme: indaco
---

# How an order moves

An order passes through eight stages before it reaches the customer.

\`\`\`mermaid
flowchart LR
  A[Order placed] --> B[Payment checked] --> C[Stock reserved] --> D[Picked] --> E[Packed] --> F[Label printed] --> G[Shipped] --> H[Delivered]
\`\`\`

---

# A small one

\`\`\`mermaid
flowchart LR
  A[Draft] --> B[Review]
\`\`\`
`;

/** The rendered label size of each diagram in the article: font-size times the drawn scale. */
function labelSizes(page: import('@playwright/test').Page) {
	return page.locator('article.st-read-article').evaluate((article) =>
		[...article.querySelectorAll('figure.lp-diagram')].map((fig) => {
			const svg = fig.querySelector('svg[aria-roledescription]') as SVGSVGElement;
			const vb = svg.viewBox.baseVal;
			const r = svg.getBoundingClientRect();
			const label = svg.querySelector('text, foreignObject span, foreignObject div') as Element;
			const px = parseFloat(getComputedStyle(label).fontSize) * Math.min(r.width / vb.width, r.height / vb.height);
			return { px, scrolls: fig.scrollWidth > fig.clientWidth, tabindex: fig.getAttribute('tabindex') };
		}),
	);
}

test('a wide diagram in the Read pane keeps legible labels and scrolls instead of shrinking @crosswidth', async ({ page }, testInfo) => {
	// Load the deck and open the article with the wide layout, then return to the project's
	// width: at 390 the editor is a swapped-out pane and the dial lives in another bar. The
	// subject here is how the article LAYS OUT at each width, not how a phone reaches it.
	const size = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(livePreview(page).locator('svg[aria-roledescription]')).toHaveCount(1, { timeout: 30_000 });

	await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
	await page.getByRole('button', { name: CHROME.readArticle }).click();
	const figures = page.locator('article.st-read-article figure.lp-diagram');
	await expect(figures).toHaveCount(2, { timeout: 30_000 });
	await page.setViewportSize(size);
	await figures.first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: testInfo.outputPath('read-pane.png') });

	const [wide, small] = await labelSizes(page);
	// The floor is 12px against Lattice's 14px Mermaid labels; allow subpixel rounding.
	expect(wide.px).toBeGreaterThanOrEqual(11.9);
	expect(small.px).toBeGreaterThanOrEqual(11.9);
	expect(small.scrolls, 'a diagram that fits must not scroll').toBe(false);
	expect(wide.tabindex, 'a scroller must take focus').toBe('0');
	// At 390 the eight-stage flowchart cannot fit above its floor, so its figure pans.
	if ((page.viewportSize()?.width ?? 0) < 800) expect(wide.scrolls).toBe(true);
	// The page itself never scrolls sideways — only the figure does.
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// THE PHONE'S OWN ROUTE, in real WebKit at an iPhone 15 Pro profile (touch, mobile viewport).
// The test above reaches the article at a wide layout and resizes, which proves the layout but
// not the way a phone gets there. Here the deck is authored wide (the phone's editor is a
// swapped pane), then the page RELOADS at phone size on the Read stop and the reader TAPS into
// the article. No resize after the reload.
test('on a phone, Read → Read as an article shows the long diagram at 12px and pans only the figure @webkit-phone', async ({ page }) => {
	const phone = page.viewportSize() ?? { width: 393, height: 659 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(livePreview(page).locator('svg[aria-roledescription]')).toHaveCount(1, { timeout: 30_000 });
	// Park the persisted posture at Read, as a reader who chose it would have it.
	await page.evaluate(() => {
		const k = 'lattice-studio-settings';
		localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: 'read' }));
	});
	await page.setViewportSize(phone);
	// gotoStudio's init script re-seeds `craft` on every navigation; overwrite it back to Read.
	await page.addInitScript(() => {
		const k = 'lattice-studio-settings';
		localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: 'read' }));
	});
	await page.reload();

	await page.getByRole('button', { name: CHROME.readArticle }).tap();
	const figures = page.locator('article.st-read-article figure.lp-diagram');
	await expect(figures).toHaveCount(2, { timeout: 30_000 });
	const [wide, small] = await labelSizes(page);
	expect(wide.px).toBeGreaterThanOrEqual(11.9);
	expect(wide.scrolls).toBe(true);
	expect(small.scrolls).toBe(false);
	// Nothing between the figure and the root may claim the horizontal pan for itself.
	const blockers = await figures.first().evaluate((fig) => {
		const out: string[] = [];
		for (let e: Element | null = fig; e; e = e.parentElement) {
			const ta = getComputedStyle(e).touchAction;
			if (ta !== 'auto' && !/pan-x|manipulation/.test(ta)) out.push(`${e.tagName}:${ta}`);
		}
		return out;
	});
	expect(blockers, 'an ancestor blocks the sideways pan').toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
