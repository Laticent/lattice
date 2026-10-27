import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test } from './studio-fixture';

// The spectrum bar on the real Studio preview (engineering/decisions/2026-10-26-spectrum-edge-shift.md).
// Two claims, driven on the live preview frame rather than a harness:
//   1. a full-bleed frame (split-panel) draws its bar as two `.slide-bar` strips, direct children of the
//      section, with a painted strip on the chosen edge (the runtime twin injects them);
//   2. a border frame (content) keeps its heading where it sits under the top placement when the placement
//      changes to left.

const SPLIT = (edge: string) =>
	`---\ntitle: Bar\n---\n\n<!-- _class: split-panel spectrum-edge-${edge} -->\n\n## The panel claims\n\n- One\n  - First supporting line.\n- Two\n  - Second supporting line.\n`;
const CONTENT = (edge: string) =>
	`---\ntitle: Bar\nspectrum-edge: ${edge}\n---\n\n## A plain heading\n\n- One\n  - First supporting line.\n- Two\n  - Second supporting line.\n`;

test.skip(({ isMobile }) => isMobile, 'the editor and the preview share one pane on a phone; the desktop project covers the preview');

test('a full-bleed frame draws its bar as two strips on the Studio preview', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, SPLIT('left'));
	const frame = page.frameLocator(LIVE_PREVIEW);
	await expect(frame.locator('section.split-panel > .slide-bar')).toHaveCount(2, { timeout: 20_000 });
	const painted = await frame.locator('section.split-panel > .slide-bar:not(.slide-bar-top)').evaluate((el) => {
		const r = el.getBoundingClientRect();
		const s = getComputedStyle(el);
		return { w: r.width, h: r.height, image: s.backgroundImage };
	});
	expect(painted.w, 'the left strip has width').toBeGreaterThan(0);
	expect(painted.h, 'and runs the slide height').toBeGreaterThan(100);
	expect(painted.image, 'and paints the spectrum').not.toBe('none');
});

test('choosing a different placement does not move a border frame\'s heading on the Studio preview', async ({ page }) => {
	await gotoStudio(page);
	const frame = page.frameLocator(LIVE_PREVIEW);
	const heading = async () => {
		await expect(frame.locator('section h2').first()).toBeVisible({ timeout: 20_000 });
		return frame.locator('section').first().evaluate((sec) => {
			const h = sec.querySelector('h2')!.getBoundingClientRect();
			const b = sec.getBoundingClientRect();
			return { x: h.left - b.left, y: h.top - b.top };
		});
	};
	await setEditorContent(page, CONTENT('top'));
	const top = await heading();
	await setEditorContent(page, CONTENT('left'));
	await expect.poll(() => frame.locator('section').first().evaluate((s) => s.className)).toContain('spectrum-edge-left');
	const left = await heading();
	expect(left.x).toBeCloseTo(top.x, 0);
	expect(left.y).toBeCloseTo(top.y, 0);
});

// LIVE_PREVIEW is imported so a rename of the preview frame fails here, not silently.
void LIVE_PREVIEW;
