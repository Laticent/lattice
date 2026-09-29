import type { Page, TestInfo } from '@playwright/test';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// Every boxed card tag on a slide takes one size: the widest tag's width and the tallest tag's
// height (lib/core/card-tag-equalize.js, run by the runtime inside the live preview). The owner's
// row: BUILD, a label that wraps to two lines, WHY NOT DELAY. Measured in the preview frame at the
// three shipped widths, with a screenshot of each for a human to look at.
// engineering/decisions/2026-09-27-card-tag-register.md §3.4.

const deckFor = (placement: string): string => [
	'---',
	'title: Card tags',
	'---',
	'',
	`<!-- _class: decision ${placement} -->`,
	'',
	'## Every tag takes the widest tag’s size.',
	'',
	'- Build',
	'  - Owns the scoring policy.',
	'- Why not buy from either shortlisted vendor',
	'  - Neither exposes the weights.',
	'- Why not delay',
	'  - The window closes.',
	'',
].join('\n');
const DECK = deckFor('');

async function expectOneTagSize(
	page: Page,
	info: TestInfo,
	label: string,
	width: number,
	height: number,
	deck: string = DECK,
): Promise<void> {
	// Type at desktop width, where the editor is on screen, then resize: the pass must also
	// re-run when the viewport changes the preview's layout.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.setViewportSize({ width, height });
	const slide = livePreview(page).locator('section.decision').first();
	await expect(slide).toBeVisible();
	// The pass runs on the preview's post-mutation dispatch and after fonts settle, so poll
	// until the three tags agree rather than sleeping.
	const sizes = () =>
		slide.evaluate((s) =>
			[...s.querySelectorAll(':scope > .cell-stage > ul > li > strong:first-child')].map((el) => {
				const r = el.getBoundingClientRect();
				return { w: r.width, h: r.height };
			}),
		);
	await expect
		.poll(async () => {
			const tags = await sizes();
			if (tags.length !== 3) return `found ${tags.length} tags`;
			const spread = (k: 'w' | 'h') => Math.max(...tags.map((t) => t[k])) - Math.min(...tags.map((t) => t[k]));
			return spread('w') < 1 && spread('h') < 1 ? 'equal' : JSON.stringify(tags);
		})
		.toBe('equal');
	await page.screenshot({ path: info.outputPath(`card-tag-equal-size-${label}.png`) });
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth every card tag on a slide is one size in the live preview at ${label} (${width}px)`, async ({ page }, info) => {
		await expectOneTagSize(page, info, label, width, height);
	});
}

// The same row in real WebKit (Safari's engine), at the webkit-tablet project's iPad-landscape
// box. The measure reads getComputedStyle on `::before` and on the lifted <strong>, which is
// engine behavior a Chromium run cannot stand in for.
test('every card tag on a slide is one size in the live preview @webkit-tablet', async ({ page }, info) => {
	await expectOneTagSize(page, info, 'webkit-tablet', 1180, 703);
});

// Each placement keeps the rule (engineering/decisions/2026-09-27-card-tag-register.md §6 phase 3):
// the same row with the wrapped label, one placement at a time. A band spans its card, and the
// decision cards share the row equally, so bands match in width as well.
// Each case first proves the placement took effect, so a stale build cannot pass it vacuously.
const PLACED: Record<string, (cs: { position: string; bottom: string; right: string; transform: string }) => boolean> = {
	'tag-foot': (cs) => cs.position === 'absolute' && cs.bottom === '0px',
	'tag-notch': (cs) => cs.position === 'absolute' && cs.transform !== 'none',
	'tag-band': (cs) => cs.position === 'absolute' && cs.right === '0px',
	'tag-inline': (cs) => cs.position === 'static',
};
// Each runs twice: untagged for Chromium desktop, and as an @webkit-tablet twin at that project's
// iPad-landscape box, because the measure reads computed styles WebKit resolves on its own.
for (const [engine, width, height] of [
	['', 1440, 900],
	[' @webkit-tablet', 1180, 703],
] as const) {
	for (const placement of ['tag-foot', 'tag-notch', 'tag-band', 'tag-inline'] as const) {
	test(`every card tag on a slide is one size at ${placement} in the live preview${engine}`, async ({ page }, info) => {
		await expectOneTagSize(page, info, `${placement}${engine ? '-webkit' : ''}`, width, height, deckFor(placement));
		const cs = await livePreview(page)
			.locator('section.decision > .cell-stage > ul > li > strong:first-child')
			.first()
			.evaluate((el) => {
				const c = getComputedStyle(el);
				return { position: c.position, bottom: c.bottom, right: c.right, transform: c.transform };
			});
		expect(PLACED[placement](cs), JSON.stringify(cs)).toBe(true);
	});
}
}
