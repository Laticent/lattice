import fs from 'node:fs';
import path from 'node:path';
import { chipZip } from './plugin-fence-fixture';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, test, typeInEditor } from './studio-fixture';

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
	test(`a plugin's inline kind: the chip in the line, then Approve draws the span, at ${label} (${width}px) @crosswidth @webkit-tablet @gecko`, async ({ page }) => {
		const shot = async (name: string) => {
			if (!EVIDENCE) return;
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `plugin-inline-${name}-${width}.png`) });
		};
		// Start wide on every project (the `mobile` project opens at 390px): the test drives its own widths.
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'chip-plugin.zip', mimeType: 'application/zip', buffer: await chipZip() });
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

// A plugin the deck LISTS but this browser has not approved: an inline span keeps its words (a card in a sentence would take
// the author's text out of a shared file), and the strip says why. The block form of the same plugin gets the drawn card instead.
test('a listed but unapproved plugin leaves its inline span as code, with the strip asking for the yes @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'chip-plugin.zip', mimeType: 'application/zip', buffer: await chipZip() });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await page.keyboard.press('Escape');
	await setEditorContent(page, `---\nplugins: [chip-plugin]\n---\n\n## Launch status\n\nThe launch is \`@tag-chip{Launch, hot}\` this week.\n`);
	const notice = page.locator('[data-slot="code-packages"]');
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	const preview = livePreview(page);
	await expect(preview.locator('section')).toContainText('Launch, hot', { timeout: 30_000 });
	await expect(preview.locator('[data-lattice-plugin-off]')).toHaveCount(0);
	await expect(preview.locator('[data-lattice-plugin="chip-plugin"]')).toHaveCount(0);
});

// ── The BUILT-IN kinds in the named spelling, in the real Studio ──
// `@icon{…}` and `@avatar{…}` are the same rows as `^{…}` and `!{…}` (inline-code-directives.js `NAMED_ROW`), so the
// preview draws the same SVG, and the root keeps the author's spelling in `data-src`. The `@` menu lists the kinds.
test('the built-in kinds in the named form: `@icon{…}` and `@avatar{…}` draw in the preview at three widths, and `@` lists the kinds @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	// Start wide on every project (the `mobile` project opens at 390px): the test drives its own widths.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, '## The data team\n\nThe store is `@icon{database}` and the lead is `@avatar{Ada Okafor}` this quarter.\n\n');
	const preview = livePreview(page);
	const icon = preview.locator('span.lat-icon[data-icon="database"]');
	const avatar = preview.locator('span.lat-avatar[aria-label="Ada Okafor"]');
	// At each width the Studio ships (CLAUDE.md QUALITY BAR), both draw in the line, at a real size.
	for (const [width, height] of [
		[1440, 900],
		[820, 1180],
		[390, 844],
	] as const) {
		await page.setViewportSize({ width, height });
		await expect(icon.locator('svg.lat-icon-svg path').first(), `${width}px`).toBeAttached({ timeout: 30_000 });
		await expect(icon).toHaveAttribute('data-src', '@icon{database}');
		await expect(avatar.locator('svg.lat-avatar-svg path').first(), `${width}px`).toBeAttached();
		await expect(avatar).toHaveAttribute('data-src', '@avatar{Ada Okafor}');
		for (const el of [icon, avatar]) {
			await expect.poll(async () => ((await el.boundingBox())?.height ?? 0) > 4, `${width}px`).toBe(true);
		}
	}
	await page.setViewportSize({ width: 1440, height: 900 });
	// The `@` menu: typing a kind's first letters inside a code span offers it.
	await typeInEditor(page, 'Owner: `@ava');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu.getByRole('option', { name: /@avatar/ })).toBeVisible();
});
