import type { Locator, Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// A RECORD TABLE IN A NARROW PANE: CARDS WHERE THEY FIT, THE TABLE WHERE THEY DON'T.
//
// lib/base/base.table-reflow.css turns a record table into one card per row once its pane is
// narrow, and on a slide lib/core/table-reflow-fit.js holds the table in table form when the
// cards would make the slide overflow (`lat-reflow-held`). The CLI runs the fit check in its
// export page; the live preview gets it from the runtime (lib/runtime/index.js), after fonts
// load. Unit tests pin the kernel in jsdom; this is the real preview, where a card's height is
// real. A three-row table in a 30% pane fits as cards; a six-row one does not and is held.
// engineering/decisions/2026-11-03-responsive-tables.md.
const table = (n: number) => [
	'| Owner | Role | Status |',
	'|---|---|---|',
	...Array.from({ length: n }, (_, i) => `| Person ${i + 1} | Reviewer | Open |`),
];
const slide = (n: number) => [
	`## ${n} rows in a narrow pane.`,
	'',
	'<!-- panes: 30/70 -->',
	'<!-- pane: content -->',
	'',
	...table(n),
	'',
	'<!-- pane: list -->',
	'',
	'- The pane on the left is too narrow for three columns.',
	'',
];
const deck = (n: number) => ['---', 'theme: indaco', '---', '', ...slide(n)].join('\n');

/** The pane's table once the runtime has judged it, and how its first body row lays out. */
async function paneTable(page: Page, n: number): Promise<Locator> {
	await gotoStudio(page);
	await setEditorContent(page, deck(n));
	const t = livePreview(page).locator('lat-pane table.lat-reflow-cards').first();
	await expect(t).toBeVisible({ timeout: 30_000 });
	return t;
}
const rowDisplay = (t: Locator) => t.locator('tbody tr').first().evaluate((tr: Element) => getComputedStyle(tr).display);

// One copy per engine tag, the repo's pattern (checkpoint-storage.spec.ts): the `@gecko` copy runs on
// desktop Chromium AND Firefox, the `@webkit-tablet` copy on WebKit. A title naming both tags reads as
// webkit-only to the desktop project's grepInvert and skipped Chromium.
for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`three rows in a 30% pane fit as cards, so the cards stand${tag}`, async ({ page }, info) => {
		const t = await paneTable(page, 3);
		// The runtime runs the fit check once fonts load and a frame has painted; wait for the same
		// signal inside the preview, plus a frame for the check itself, rather than a fixed sleep.
		await t.evaluate(
			() =>
				new Promise<void>((done) => {
					document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => done())));
				}),
		);
		await expect(t).not.toHaveClass(/lat-reflow-held/);
		expect(await rowDisplay(t)).not.toBe('table-row');
		const path = info.outputPath('three-rows-cards.png');
		await page.screenshot({ path });
		await info.attach('three-rows-cards.png', { path, contentType: 'image/png' });
	});

	test(`six rows in a 30% pane would overflow as cards, so the table form is held${tag}`, async ({ page }, info) => {
		const t = await paneTable(page, 6);
		await expect(t).toHaveClass(/lat-reflow-held/, { timeout: 30_000 });
		// Polled: the preview can refresh its DOM around the hold, and a row read mid-refresh has no
		// computed display (seen once in 8 Firefox runs). The settled row must be a table row.
		await expect.poll(() => rowDisplay(t), { timeout: 10_000 }).toBe('table-row');
		const path = info.outputPath('six-rows-held.png');
		await page.screenshot({ path });
		await info.attach('six-rows-held.png', { path, contentType: 'image/png' });
	});
}
