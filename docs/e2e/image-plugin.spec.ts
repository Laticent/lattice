import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── The image plugin and the shared display layer, in the REAL Studio ─────────────────────────────────────────────────
//
// engineering/decisions/2026-10-16-media-plugins.md §4.7, §7 slice 3. The Studio's live preview renders a deck through the
// same engine as the CLI, and the preview frame's runtime runs on top. HARD RULE #23: this drives the real Studio, at the
// widths and in the browsers the tags name (@crosswidth: 1440 and 390; @webkit-tablet: 820 in WebKit; @gecko: Firefox), and
// holds, for each seat the slide decides:
//
//   · an `image` slide: the record becomes the layout's `.lattice-bg` photo panel, with its finish layer inside it;
//   · an ordinary slide: a framed, toned figure on the shared layer, its title shown, its words stamped as data;
//   · a `bleed` slide: the picture is the slide's background;
//   · a `>{…}` clip on an ordinary slide: the video poster figure on the same layer, never an iframe.
//
// Each waits for the element the engine draws (a signal, not a sleep; HARD RULE #32). With LATTICE_EVIDENCE_DIR=<dir> it saves
// the Studio for the PR; off by default, so CI writes nothing.

test.describe.configure({ timeout: 120_000 });

const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';

const SEATS: Array<{ name: string; deck: string; selector: string; check: (html: string) => void }> = [
	{
		name: 'image-panel',
		deck: '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n\n## The panel\n\nA finish on the layout\'s own photo.\n\n`@image{sample:photo-wide.jpg, title="The lake", nimbus}`\n',
		selector: '.lattice-bg[data-lattice-media="image"]',
		check: (html) => {
			expect(html).toContain('data-finish="nimbus"');
			expect(html).toContain('aria-label="The lake"');
			expect(html).toContain('lat-media-finish');
		},
	},
	{
		name: 'flow-figure',
		deck: '---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## A framed figure\n\n`@image{sample:photo-square.jpg, title="The mug", description="On the table", frame=mat, duotone, show=title}`\n',
		selector: 'figure.lat-media[data-lattice-media="image"]',
		check: (html) => {
			expect(html).toContain('data-frame="mat"');
			expect(html).toContain('data-tone="duotone"');
			expect(html).toContain('data-lattice-description="On the table"');
			expect(html).toContain('<span class="lat-media-title" aria-hidden="true">The mug</span>');
			// The box before the bytes, in the Studio too: the engine knows a `sample:` picture's size (lib/integrations/markdown-it/sample-sizes.js).
			expect(html).toContain('--lat-media-ar:1"');
		},
	},
	{
		name: 'bleed',
		deck: '---\ntheme: indaco\n---\n\n<!-- _class: content dark bleed -->\n\n## Over the photo\n\n`@image{sample:photo-pano.jpg, description="A panorama"}`\n',
		selector: '.lattice-bg[data-lattice-media="image"]',
		check: (html) => expect(html).toContain('data-lattice-description="A panorama"'),
	},
	{
		name: 'clip',
		deck: '---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## A clip among the words\n\n`>{"https://youtu.be/dQw4w9WgXcQ", title="The tour", poster=sample:photo-wide.jpg, frame=device}`\n',
		selector: 'figure.video-embed[data-lattice-media="video"]',
		check: (html) => {
			expect(html).toContain('data-frame="device"');
			expect(html).not.toContain('<iframe');
		},
	},
];

for (const seat of SEATS) {
	test(`image plugin: the ${seat.name} seat draws in the live preview @crosswidth @webkit-tablet @gecko`, async ({ page }, info) => {
		// Written at 1440 (the editor is docked there on every project), then judged at the project's own box (desktop 1440,
		// mobile 390, webkit-tablet 1180), as the plugin attack spec does.
		const own = page.viewportSize() ?? { width: 1440, height: 900 };
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await setEditorContent(page, seat.deck);
		await page.setViewportSize(own);
		const el = livePreview(page).locator(seat.selector).first();
		// Visible, not merely attached: the preview reveals a slide once its faces are ready (a signal, not a sleep).
		await expect(el).toBeVisible({ timeout: 30_000 });
		seat.check(await el.evaluate((n) => n.outerHTML));
		// Drawn, not collapsed: the picture has a real box in the frame.
		// Polled, not read once: the preview can swap the node between the visibility check and the measure (seen in Gecko).
		await expect
			.poll(async () => {
				const box = await el.boundingBox();
				return box ? Math.min(box.width, box.height) : 0;
			}, { timeout: 30_000 })
			.toBeGreaterThan(40);
		if (EVIDENCE) {
			await page.screenshot({ path: `${EVIDENCE}/studio-${seat.name}-${info.project.name}.png` });
			// The QUALITY BAR's tablet width too (820), in this project's browser.
			await page.setViewportSize({ width: 820, height: 1180 });
			await expect(el).toBeVisible({ timeout: 30_000 });
			await page.screenshot({ path: `${EVIDENCE}/studio-${seat.name}-${info.project.name}-820.png` });
		}
	});
}
