/**
 * logo-wall's equal-weight sizing on the real Studio live preview: the runtime measures each mark
 * (logo-marks.js applyToDom fetches the same-origin SVGs) and stamps the same plan the CLI stamps
 * from the inlined SVGs (lib/core/logo-wall-pack.js). A 4:1, a 1:1, a
 * 1:2 and a 3:1 mark must draw at the same area (engineering/decisions/2026-10-16-mosaico-layout-library.md §8.2).
 */
import { createRequire } from 'node:module';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// The planner itself, so the spec can say what the CLI would stamp for the same deck.
const { planWall } = createRequire(import.meta.url)('../../lib/core/logo-wall-pack.js');

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

test('the live preview draws wordmarks and a badge at one area, and a crest at half @crosswidth @webkit-phone', async ({ page }) => {
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
		// Pinnacle 4:1, Keystone 1:1 and Acme 3:1 share one area; the Spire crest (1:2) is held to
		// the row's height, as in the old wall, so it keeps half of it.
		const [pinnacle, keystone, spire, acme] = areas;
		const shared = [pinnacle, keystone, acme];
		expect(Math.max(...shared) / Math.min(...shared)).toBeLessThan(1.03);
		expect(spire / keystone).toBeGreaterThan(0.47);
		expect(spire / keystone).toBeLessThan(0.53);
		// One row, as the plan says.
		expect(new Set(tops).size).toBe(1);
	}).toPass({ timeout: 20_000 });
});

// A portrait deck whose wall sits on a slide the preview is NOT showing while the deck is typed:
// the caret ends on slide 2. A slide that is not on screen can lay out at 0×0, and a plan made from
// that box would read the slide as 16:9; this set of marks plans differently at 16:9 and portrait,
// so the stamp must match the PORTRAIT plan the CLI makes (lattice.js passes the deck's own size).
const portraitDeck = `---
marp: true
size: portrait
---

<!-- _class: logo-wall -->

## Crests, a badge and two wordmarks.

- ![Spire](sample:logo-spire.svg)
- ![Spire](sample:logo-spire.svg)
- ![Spire](sample:logo-spire.svg)
- ![Spire](sample:logo-spire.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Acme](sample:logo-acme.svg)

---

## The second slide, where the caret ends.
`;

test('a wall on a slide that was off screen is planned for the deck\'s real shape', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, portraitDeck);
	await page.keyboard.press('Control+Home');
	const wall = livePreview(page).locator('section.logo-wall .cell-stage > ul[data-logo-wall="packed"]').first();
	await expect(wall).toBeVisible({ timeout: 20_000 });
	await expect(async () => {
		const { styles, family } = await wall.evaluate((ul) => ({
			styles: [...ul.children].map((li) => li.getAttribute('style')),
			family: (ul.closest('section') as HTMLElement).getAttribute('data-family'),
		}));
		const want = planWall([0.5, 0.5, 0.5, 0.5, 1, 1, 4, 3], { family, slideAspect: 1080 / 1350 });
		const wrong = planWall([0.5, 0.5, 0.5, 0.5, 1, 1, 4, 3], { family });
		expect(want.mode).toBe('packed');
		expect(JSON.stringify(want.itemStyles)).not.toBe(JSON.stringify(wrong.itemStyles));
		expect(styles).toEqual(want.itemStyles);
	}).toPass({ timeout: 20_000 });
});
