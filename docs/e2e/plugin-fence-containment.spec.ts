import { ganttZip } from './plugin-fence-fixture';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── An approved plugin's fence paints inside its own block in the Studio, and cannot reach the top layer
//    (followup 2687-p7; HARD RULE #23: the real Studio preview, not the CLI render) ──
//
// The plugin is approved, so its markup reaches the slide. It returns a `position:fixed; inset:0` box that
// would cover the whole slide, and a `popover` with a button that would open it in the top layer, above
// every box. `section div[data-lattice-plugin]{contain:paint}` makes the plugin root the containing block
// for the fixed box and clips its paint; the fence door drops `popover`/`popovertarget`/`command*`.
//
//   1. PAINT    the fixed box's rect lies inside the plugin root's rect, and the root computes `contain: paint`.
//   2. TOP      no popover attribute survives; clicking the would-be opener leaves nothing `:popover-open`.

test.describe.configure({ timeout: 180_000 });

const COVER_RENDERER = `function render(fence) {
  return '<svg class="lp-gantt-plugin-chart" id="' + fence.id + '" viewBox="0 0 200 40" width="200"><rect width="200" height="40" fill="var(--accent)"></rect></svg>' +
    '<div data-probe="cover" style="position:fixed;inset:0;background:rgb(255,0,0);z-index:2147483647"></div>' +
    '<button data-probe="opener" popovertarget="lp-forged" popovertargetaction="show">open</button>' +
    '<div data-probe="popover" id="lp-forged" popover="manual" style="position:fixed;inset:0;background:rgb(0,0,255)">forged</div>' +
    '<button data-probe="command" commandfor="lp-forged" command="show-popover">cmd</button>';
}
export { render as default };
`;

const DECK = '---\nplugins: [gantt-plugin]\n---\n\n## Plan\n\n```gantt\nDesign 2\n```\n\nThe body text below the plugin block.\n';

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`an approved plugin's fence paints only inside its block and never reaches the top layer${tag}`, async ({ page, browserName }) => {
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(COVER_RENDERER) });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');

		const preview = livePreview(page);
		await setEditorContent(page, DECK);
		const notice = page.locator('[data-slot="code-packages"]');
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await notice.getByRole('button', { name: 'Approve the code of gantt-plugin' }).click();
		const root = preview.locator('[data-lattice-plugin="gantt-plugin"]');
		await expect(root.locator('svg.lp-gantt-plugin-chart')).toHaveCount(1, { timeout: 30_000 });

		// 1. PAINT: the fixed box is held inside the plugin root, which is far smaller than the slide.
		const cover = root.locator('[data-probe="cover"]');
		await expect(cover, 'the door kept the fixed box, so this measures containment, not removal').toHaveCount(1);
		const geo = await root.evaluate((r) => {
			const box = (el: Element) => {
				const b = el.getBoundingClientRect();
				return { x: b.x, y: b.y, w: b.width, h: b.height };
			};
			const slide = r.closest('section') as Element;
			return {
				contain: getComputedStyle(r).contain,
				root: box(r),
				cover: box(r.querySelector('[data-probe="cover"]') as Element),
				slide: box(slide),
			};
		});
		test.info().annotations.push({ type: 'geometry', description: `${browserName}: ${JSON.stringify(geo)}` });
		expect(geo.contain).toContain('paint');
		expect(geo.cover.x).toBeGreaterThanOrEqual(geo.root.x - 0.5);
		expect(geo.cover.y).toBeGreaterThanOrEqual(geo.root.y - 0.5);
		expect(geo.cover.x + geo.cover.w).toBeLessThanOrEqual(geo.root.x + geo.root.w + 0.5);
		expect(geo.cover.y + geo.cover.h).toBeLessThanOrEqual(geo.root.y + geo.root.h + 0.5);
		expect(geo.root.w * geo.root.h, 'the plugin block is a part of the slide, not all of it').toBeLessThan(geo.slide.w * geo.slide.h * 0.8);
		// The body text below the block stays visible: the top element at its center is the paragraph, not the red box.
		const hit = await preview.locator('section p', { hasText: 'The body text below' }).first().evaluate((p) => {
			const b = p.getBoundingClientRect();
			const top = p.ownerDocument.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
			return top ? (top.closest('[data-probe]')?.getAttribute('data-probe') ?? top.tagName) : 'none';
		});
		expect(hit, 'the paragraph under the plugin is not covered').toBe('P');

		// 2. TOP: the popover attributes are gone, and clicking the opener opens nothing.
		await expect(root.locator('[popover], [popovertarget], [popovertargetaction], [commandfor], [command]')).toHaveCount(0);
		for (const probe of ['opener', 'command']) {
			const btn = root.locator(`[data-probe="${probe}"]`);
			if (await btn.count()) await btn.click({ force: true });
		}
		const open = await root.evaluate((r) => {
			try {
				return r.ownerDocument.querySelectorAll(':popover-open').length;
			} catch {
				return 0;
			}
		});
		expect(open, 'nothing reached the top layer').toBe(0);

		const evidence = process.env.LATTICE_EVIDENCE_DIR;
		if (evidence) await preview.locator('section').first().screenshot({ path: `${evidence}/plugin-containment-${browserName}.png` });
	});
}
