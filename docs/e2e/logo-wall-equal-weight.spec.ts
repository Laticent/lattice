/**
 * logo-wall's equal-weight sizing on the real Studio live preview: the runtime measures each mark
 * (logo-marks.js applyToDom fetches the same-origin SVGs) and stamps the same plan the CLI stamps
 * from the inlined SVGs (lib/core/logo-wall-pack.js). A 4:1, a 1:1, a
 * 1:2 and a 3:1 mark must draw at the same area (engineering/decisions/2026-10-16-mosaico-layout-library.md §8.2).
 */
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

const deck = `---
marp: true
---

<!-- _class: logo-wall -->

## Four shapes, one weight.

- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Spire](sample:logo-spire.svg)
- ![Acme](sample:logo-acme.svg)
`;

test('the live preview draws every logo-wall mark at the same area @crosswidth @webkit-phone', async ({ page }) => {
	// Type at desktop width, where the editor is on screen, then resize to the project's own box
	// (as collage-lightbox.spec.ts does), so a phone project measures the phone preview.
	const target = page.viewportSize() ?? { width: 1440, height: 900 };
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.setViewportSize(target);
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="packed"]').first();
	await expect(wall).toBeVisible({ timeout: 20_000 });
	// One read of both facts, retried: a resize re-renders the preview and can swap the frame.
	// The mark is drawn in the span's content box (the padding is mask-free), so the content box IS
	// the drawn mark: width × (height minus padding).
	await expect(async () => {
		const { areas, tops } = await wall.evaluate((ul) => ({
			areas: [...ul.querySelectorAll(':scope > li > .logo-mark')].map((m) => {
				const cs = getComputedStyle(m);
				const h = (m as HTMLElement).clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
				return (m as HTMLElement).clientWidth * h;
			}),
			tops: [...ul.children].map((li) => (li as HTMLElement).offsetTop),
		}));
		expect(areas).toHaveLength(4);
		expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(1.03);
		// One row, as the plan says.
		expect(new Set(tops).size).toBe(1);
	}).toPass({ timeout: 20_000 });
});
