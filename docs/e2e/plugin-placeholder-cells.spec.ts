import fs from 'node:fs';
import path from 'node:path';
import { BARS_RENDERER, ganttZip } from './plugin-fence-fixture';
import { CHROME, expect, gotoStudio, livePreview, persistedSource, setEditorContent, test } from './studio-fixture';

// ── The plugin placeholder inside a grid cell and in the Reading view (followups.d/2651-p1) ──
//
// plugin-fence-ui.spec.ts drives the placeholder on a plain slide. A `figure` placeholder is sized in `cqi` of its
// container and a `stage` one fills the stage, so a `cards-grid` card or a `columns` pane, whose container is a grid
// cell, may size it differently. Each placement (`chip`, `figure`, `stage`) is drawn in a card and a pane at the three
// widths the Studio ships, and must sit inside its cell and its slide with room to show. Then the Studio's Reading view
// (Read · Article, the Studio's reflowing view) at 820 and 390, where it reads as a sentence. With LATTICE_EVIDENCE_DIR=<dir> it saves each state.

const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';
const FENCE = '```gantt\nDesign 2\nBuild 4\n```';
// No `plugins:` line: the plugin is installed and not listed, so a placeholder stands where each fence is.
const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'<!-- _class: cards-grid -->',
	'',
	'## Two cards hold a plan.',
	'',
	'- Plan',
	'  - The bars below.',
	'',
	`    ${FENCE.split('\n').join('\n    ')}`,
	'- Risks',
	'  - Two vendors are late.',
	'',
	'---',
	'',
	'<!-- _class: columns -->',
	'',
	'## A pane holds the plan.',
	'',
	'### Plan',
	'',
	FENCE,
	'',
	'### Notes',
	'',
	'- Two vendors are late.',
	'',
].join('\n');

type Fit = { cell: string; inCell: boolean; inSlide: boolean; w: number; h: number; clipped: boolean };
function fits(page: import('@playwright/test').Page) {
	return livePreview(page)
		.locator('[data-lattice-plugin-off="gantt-plugin"]')
		.evaluateAll((els) =>
			els.map((el) => {
				const r = el.getBoundingClientRect();
				// The grid cell it stands in: a card's item, or a pane.
				const cell = (el.closest('li, lat-pane, [data-pane]') || el.parentElement) as Element;
				const c = cell.getBoundingClientRect();
				const s = (el.closest('section') as Element).getBoundingClientRect();
				const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
				// The words block (`.lattice-plugin-words`) clipped by the placeholder's `overflow: hidden`.
				const words = el.querySelector('.lattice-plugin-words') as HTMLElement | null;
				const clipped = !!words && (words.scrollHeight > words.clientHeight + 1 || words.getBoundingClientRect().bottom > r.bottom + 1 || words.getBoundingClientRect().right > r.right + 1);
				return { cell: cell.localName, inCell: inside(r, c), inSlide: inside(r, s), w: Math.round(r.width), h: Math.round(r.height), clipped };
			}),
		) as Promise<Fit[]>;
}

for (const placement of ['chip', 'figure', 'stage'] as const) {
	for (const [label, width, height] of [
		['desktop', 1440, 900],
		['tablet', 820, 1180],
		['mobile', 390, 844],
	] as const) {
		test(`a ${placement} placeholder fits a card and a pane, at ${label} (${width}px)`, async ({ page }) => {
			await gotoStudio(page);
			const docked = page.getByRole('button', { name: 'Open Library' });
			await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
			await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(BARS_RENDERER, 'gantt-plugin', { placement }) });
			await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
			await page.keyboard.press('Escape');
			await setEditorContent(page, DECK);
			await expect.poll(() => persistedSource(page)).toContain('A pane holds the plan.');
			await page.setViewportSize({ width, height });
			// The preview shows one slide; the editor's cursor left it on the last. Each slide, then the one before it.
			for (const name of ['columns', 'cards'] as const) {
				if (name === 'cards') {
					const chip = page.getByRole('button', { name: /^Slide 1 —/ });
					await ((await chip.count()) && (await chip.first().isVisible()) ? chip.first() : page.getByRole('button', { name: 'Previous slide' }).first()).click();
					await expect(livePreview(page).locator('section h2', { hasText: 'Two cards hold a plan.' })).toHaveCount(1, { timeout: 15_000 });
				}
				const placeholder = livePreview(page).locator('[data-lattice-plugin-off="gantt-plugin"]');
				await expect(placeholder).toHaveCount(1, { timeout: 30_000 });
				await expect(placeholder).toHaveAttribute('data-placement', placement);
				await expect(livePreview(page).locator('section h2', { hasText: name === 'cards' ? 'Two cards hold a plan.' : 'A pane holds the plan.' })).toHaveCount(1);
				for (const f of await fits(page)) {
					expect(f.inSlide, `${placement} in ${name} (a ${f.cell}): inside its slide (${f.w}x${f.h})`).toBe(true);
					expect(f.inCell, `${placement} in ${name} (a ${f.cell}): inside its cell (${f.w}x${f.h})`).toBe(true);
					// It shows: not collapsed to a line or a sliver, and its words are not cut off.
					expect(f.w, `${placement} in ${name}: has width`).toBeGreaterThan(8);
					expect(f.h, `${placement} in ${name}: has height`).toBeGreaterThan(8);
					expect(f.clipped, `${placement} in ${name}: its words fit`).toBe(false);
				}
				if (EVIDENCE) {
					fs.mkdirSync(EVIDENCE, { recursive: true });
					await livePreview(page).locator('section').first().screenshot({ path: path.join(EVIDENCE, `placeholder-${placement}-${name}-${width}.png`) });
				}
			}
		});
	}
}

for (const [label, width, height] of [
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`the placeholder in the Reading view fits the article, at ${label} (${width}px)`, async ({ page }) => {
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(BARS_RENDERER, 'gantt-plugin', { placement: 'figure' }) });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, DECK);
		await expect(livePreview(page).locator('[data-lattice-plugin-off="gantt-plugin"]')).toHaveCount(1, { timeout: 30_000 });
		// The posture buttons live in the toolbar at desktop width; the reflow under test is the article's at the narrow one.
		await page.getByRole('button', { name: CHROME.postureStops[0] }).first().click();
		await page.setViewportSize({ width, height });
		await page.getByRole('button', { name: 'Read as an article' }).first().click();
		const article = page.locator('article.st-read-article');
		await expect(article).toBeVisible({ timeout: 30_000 });
		// A reading surface carries no slide paint, so the placeholder reads as a sentence (prose-projection.mjs
		// `withPlaceholderNotes`): its name and caption once ran together as "gantt-pluginPlugin block…".
		await expect(article).not.toContainText('Plugin block');
		const notes = article.locator('.lp-visual-note', { hasText: 'gantt-plugin' });
		await expect(notes).toHaveCount(2);
		await expect(notes.first()).toContainText("The plugin gantt-plugin draws here once this deck's plugins: list names it.");
		const got = await notes.evaluateAll((els) =>
			els.map((el) => {
				const r = el.getBoundingClientRect();
				return { inViewport: r.right <= window.innerWidth + 1 && r.left >= -1, w: Math.round(r.width), h: Math.round(r.height) };
			}),
		);
		for (const f of got) expect(f.inViewport && f.w > 8 && f.h > 8, `the note shows inside the viewport (${f.w}x${f.h})`).toBe(true);
		if (EVIDENCE) {
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await notes.first().scrollIntoViewIfNeeded();
			await page.screenshot({ path: path.join(EVIDENCE, `placeholder-read-${width}.png`) });
		}
	});
}
