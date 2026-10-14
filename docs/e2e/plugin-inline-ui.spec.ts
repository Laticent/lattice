import fs from 'node:fs';
import path from 'node:path';
import { chipZip } from './plugin-fence-fixture';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, test } from './studio-fixture';

// ── A zip plugin's INLINE kind (`@kind{…}`, engineering/decisions/2026-10-14-plugin-inline-door.md) in the real Studio ──
//
// The WEBSITE half, at the three widths the Studio ships (CLAUDE.md QUALITY BAR): a deck that writes a plugin's span but
// does not list the plugin shows the inline chip IN THE LINE, and the strip offers it; Approve lists it and the span is
// drawn from the fields its slot read, in a `<span>` root. The deck has a `cards-grid` slide (a span in a card's body) and a
// `columns` slide (a span in each pane), the layouts #2651's brief named; the preview shows the slide at the cursor.
// With LATTICE_EVIDENCE_DIR=<dir> it saves each state; off by default, so CI writes nothing.

const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';
const DECK = '## Launch status\n\nThe launch is `@tag-chip{Launch, hot}` and the pilot is `@tag-chip{Pilot, cold}` this week.\n\n---\n\n<!-- _class: cards-grid -->\n\n## Two streams carry the launch.\n\n- Platform\n  - On track `@tag-chip{Ready, cold}` for the first cohort.\n- Growth\n  - At risk `@tag-chip{Blocked, hot}` until pricing lands.\n\n---\n\n<!-- _class: columns -->\n\n## Pricing gates the growth stream.\n\n### Today\n\nThe page is `@tag-chip{Draft, cold}` and unreviewed.\n\n### Next week\n\nLegal signs off `@tag-chip{Review, hot}` on Tuesday.\n';

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`a plugin's inline kind: the chip in the line, then Approve draws the span, at ${label} (${width}px)`, async ({ page }) => {
		const shot = async (name: string) => {
			if (!EVIDENCE) return;
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `plugin-inline-${name}-${width}.png`) });
		};
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'chip-plugin.zip', mimeType: 'application/zip', buffer: await chipZip() });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, DECK);
		await expect.poll(() => persistedSource(page)).toContain('## Launch status');
		await page.setViewportSize({ width, height });

		const preview = livePreview(page);
		const notice = page.locator('[data-slot="code-packages"]');
		// Unlisted: an inline chip where each span was, with none of the author's text, sitting in its line.
		const chips = preview.locator('span[data-lattice-plugin-off="chip-plugin"][data-inline]');
		await expect(chips.first()).toBeVisible({ timeout: 30_000 });
		await expect(chips.first()).not.toContainText('Launch');
		await expect(notice).toHaveAttribute('data-state', 'offered');
		await expect(notice).toContainText('@tag-chip{…} spans');
		// The preview shows the slide at the cursor (the `cards` slide, where a span sits in a card's body): whichever slide
		// it is, the chip keeps the words before it on its own line, as the span it stands for did.
		const inLine = await chips.first().evaluate((el) => {
			const r = el.getBoundingClientRect();
			const s = el.closest('section')?.getBoundingClientRect();
			const host = el.parentElement as HTMLElement;
			const line = parseFloat(getComputedStyle(host).lineHeight) || r.height;
			const before = el.previousSibling;
			const range = document.createRange();
			if (before) range.selectNodeContents(before);
			const words = before?.nodeType === 3 ? range.getBoundingClientRect() : null;
			return {
				display: getComputedStyle(el).display,
				inside: !!s && r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1,
				h: r.height,
				line,
				sameLine: !!words && (before?.textContent ?? '').trim().length > 0 && Math.abs(words.top + words.height / 2 - (r.top + r.height / 2)) < line * 0.6,
			};
		});
		expect(inLine.display, 'the chip is inline, not a block').toBe('inline-flex');
		expect(inLine.inside, 'the chip sits inside its slide').toBe(true);
		expect(inLine.h, 'the chip is no taller than a line of text').toBeLessThanOrEqual(inLine.line * 1.2);
		expect(inLine.sameLine, 'the chip stays in its sentence').toBe(true);
		const box = await notice.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'the strip fits the width').toBe(true);
		await shot('placeholder');

		// Approve: one yes lists the plugin and records consent; each span is drawn from its fields.
		await notice.getByRole('button', { name: 'Approve the plugin chip-plugin' }).click();
		await expect.poll(() => persistedSource(page)).toContain('plugins: [chip-plugin]');
		const drawn = preview.locator('[data-lattice-plugin="chip-plugin"][data-kind="tag-chip"] .lp-chip-plugin-tag');
		// The `columns` slide is at the cursor: a span drawn in each pane, from its own fields.
		await expect(drawn.filter({ hasText: 'Draft' })).toHaveAttribute('data-tone', 'cold', { timeout: 30_000 });
		await expect(drawn.filter({ hasText: 'Review' })).toHaveAttribute('data-tone', 'hot');
		// The drawn span sits on its line: the middle of its own TEXT within a tenth of a line of the words before it (an
		// inline-block with overflow clipped takes its bottom edge as its baseline and rides above the text; seen, then fixed).
		const onLine = await preview.locator('[data-lattice-plugin="chip-plugin"]').first().evaluate((el) => {
			const mid = (node: Node) => {
				const range = document.createRange();
				range.selectNodeContents(node);
				const b = range.getBoundingClientRect();
				return b.top + b.height / 2;
			};
			const line = parseFloat(getComputedStyle(el.parentElement as HTMLElement).lineHeight) || 16;
			return el.previousSibling ? Math.abs(mid(el.previousSibling) - mid(el)) / line : 1;
		});
		expect(onLine, 'the drawn span\'s text sits on the line of the words before it').toBeLessThan(0.1);
		await shot('drawn-columns');
		// Back one slide: the `cards-grid`, a span in each card's body.
		await page.getByRole('button', { name: 'Previous slide' }).first().click();
		await expect(drawn.filter({ hasText: 'Ready' })).toHaveAttribute('data-tone', 'cold', { timeout: 30_000 });
		await expect(drawn.filter({ hasText: 'Blocked' })).toHaveAttribute('data-tone', 'hot');
		await expect(chips).toHaveCount(0);
		// The root is ours: a word-sized box that isolates its text's direction and contains its paint (the red team).
		const root = await preview.locator('[data-lattice-plugin="chip-plugin"]').first().evaluate((el) => {
			const cs = getComputedStyle(el);
			return { tag: el.tagName, display: cs.display, bidi: cs.unicodeBidi, contain: cs.contain };
		});
		expect(root.tag, 'the root stands where a word stood').toBe('SPAN');
		expect(root.display).toBe('inline-block');
		expect(root.bidi).toBe('isolate');
		expect(root.contain).toContain('paint');
		await shot('drawn-cards');
	});
}
