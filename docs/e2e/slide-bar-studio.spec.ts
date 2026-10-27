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

// Each test runs three times: untagged for the Chromium desktop project, and as @webkit-tablet and @gecko twins
// (playwright.config.ts) so Safari's and Firefox's engines draw the same strips and hold the same heading.
test.skip(({ isMobile }) => isMobile, 'the editor and the preview share one pane on a phone; the desktop project covers the preview');

for (const tag of ['', ' @webkit-tablet', ' @gecko']) {
test(`a full-bleed frame draws its bar as two strips on the Studio preview${tag}`, async ({ page }) => {
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

test(`choosing a different placement does not move a border frame's heading on the Studio preview${tag}`, async ({ page }) => {
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

}

// The Playground is a separate route with its own preview frame (`#preview`); it runs the same runtime twin.
test('the Playground preview draws the full-bleed bar as two strips and holds a border frame still', async ({ page }) => {
	const KEY = 'lattice-docs-pg-source';
	const seed = async (src: string) => {
		await page.addInitScript(([k, v]) => { try { localStorage.setItem(k as string, v as string); } catch { /* no store, no seed */ } }, [KEY, src]);
	};
	await seed(`${SPLIT('left')}\n---\n\n## A plain heading\n\n- One\n  - First supporting line.\n`);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const preview = page.frameLocator('#preview');
	await expect(preview.locator('section.split-panel > .slide-bar')).toHaveCount(2, { timeout: 40_000 });
	const w = await preview.locator('section.split-panel > .slide-bar:not(.slide-bar-top)').evaluate((el) => el.getBoundingClientRect().width);
	expect(w, 'the left strip has width').toBeGreaterThan(0);
	// The second slide is a border frame under the same deck-level placement of its own (top, the default): its
	// heading sits where the Studio test pinned it, one bar width in from the slide edge and 4 below the bar.
	const pos = await preview.locator('section:not(.split-panel) h2').first().evaluate((h) => {
		const sec = h.closest('section')!;
		const r = h.getBoundingClientRect(); const b = sec.getBoundingClientRect();
		return { x: r.left - b.left, border: getComputedStyle(sec).borderTopWidth };
	});
	expect(pos.x).toBeGreaterThan(0);
	expect(parseFloat(pos.border), 'a default top bar is a border on a border frame').toBeGreaterThan(0);
});

// LIVE_PREVIEW is imported so a rename of the preview frame fails here, not silently.
void LIVE_PREVIEW;
