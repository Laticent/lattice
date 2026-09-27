import { expect, gotoStudio, openInspectorTab, persistedSource, setEditorContent, test } from './studio-fixture';

// A VENUE IS A FIXED SIZE, ON THE REAL SURFACES THAT SHOW ONE SLIDE AT A TIME.
//
// Owner ruling 2026-09-27: a venue is an intentional setting, like desktop zoom, so the deck
// never shrinks itself to fit (engineering/typography.md §7). The automatic step-down it
// replaced (STEP + LEVEL, and the Studio's hidden whole-deck measuring frame) is deleted.
// This spec pins what replaced it:
//   1. at `venue: conference` EVERY slide shows 1.3x in the editor preview and in Present —
//      the over-full slide included, which clips and carries the ring — and nothing measures
//      the whole deck (no measuring frame ever appears);
//   2. that slide gets the clip notice, and its two one-click fixes work: "Split slide" divides
//      it and the halves fit; "Use Huddle" moves the whole deck one room down;
//   3. deck settings → Look → Venue writes `venue:`;
//   4. Present's venue switch changes the size for the showing without touching the deck;
//   5. the Studio's own lint warns on a slide past its venue budget and names the fix.

const step = (n: number) => `${n}. Step ${n}\n   - Reads the ticket, plans the change, and writes down why before anyone asks.\n`;
const deck = (steps: number, venue = 'venue: conference\n') =>
	`---\nmarp: true\ntheme: indaco\npaginate: true\n${venue}header: "Live preview · venue"\n---\n\n` +
	'<!-- _class: list takeaway -->\n\n`First slide`\n\n## A short slide that fits at any size.\n\n- One point.\n- Two points.\n\n---\n\n' +
	`<!-- _class: list-steps -->\n\n\`Binding slide\`\n\n## Agents can now take a ticket all the way to review.\n\n${Array.from({ length: steps }, (_, i) => step(i + 1)).join('')}\n---\n\n` +
	'<!-- _class: list takeaway -->\n\n`Third slide`\n\n## Another short slide.\n\n- Three points.\n';

type Shown = { scale: string; header: string | null; overflow: boolean };
async function shown(frame: ReturnType<import('@playwright/test').Page['frameLocator']>): Promise<Shown> {
	return await frame.locator('section[data-lattice-slide]').first().evaluate((s) => {
		const h = s.querySelector(':scope > header');
		return {
			scale: getComputedStyle(s).getPropertyValue('--fs-scale').trim(),
			header: h ? getComputedStyle(h).fontSize : null,
			overflow: s.classList.contains('overflow'),
		};
	});
}
const live = (page: import('@playwright/test').Page) => page.frameLocator('[aria-label="Live deck preview"] iframe.live');
const notice = (page: import('@playwright/test').Page) => page.getByRole('status', { name: 'Slide clips at this venue' });

async function cursorTo(page: import('@playwright/test').Page, text: string) {
	await page.locator('.cm-content').getByText(text).first().click();
}

test('every slide renders at the venue size in the preview and in Present; nothing measures the deck', async ({ page }) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	const opts = { timeout: 20_000 };
	await setEditorContent(page, deck(7));

	// 1 — the editor preview, slide by slide: 1.3x everywhere, the over-full slide included.
	const headers = new Set<string | null>();
	for (const text of ['First slide', 'Binding slide', 'Third slide']) {
		await cursorTo(page, text);
		await expect.poll(async () => (await shown(live(page))).scale, { ...opts, message: `${text}: the venue size` }).toBe('1.3');
		headers.add((await shown(live(page))).header);
	}
	expect(headers.size, 'the running header is one size on every slide').toBe(1);
	await cursorTo(page, 'Binding slide');
	await expect.poll(async () => (await shown(live(page))).overflow, { ...opts, message: 'the over-full slide clips and is ringed' }).toBe(true);
	await expect(notice(page)).toBeVisible(opts);
	await expect(notice(page)).toContainText('Conference');
	await cursorTo(page, 'First slide');
	await expect(notice(page)).toBeHidden(opts);
	expect(await page.locator('[data-lattice-scale-measure]').count(), 'no whole-deck measuring frame').toBe(0);

	// 1b — Present, slide by slide.
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const presented = dialog.getByRole('figure', { name: 'Presented slide' }).frameLocator('iframe');
	// Back to slide 1. The counter lives in the dock, which folds away between moves, so read the
	// Previous button's state rather than the counter's visibility.
	const prev = dialog.getByRole('button', { name: 'Previous slide' });
	for (let k = 0; k < 3 && (await prev.isEnabled()); k++) await prev.click();
	for (let i = 1; i <= 3; i++) {
		await expect(dialog.getByText(`${i} / 3`, { exact: true })).toHaveCount(1);
		await expect.poll(async () => (await shown(presented)).scale, { ...opts, message: `Present slide ${i}: the venue size` }).toBe('1.3');
		if (i < 3) await dialog.getByRole('button', { name: 'Next slide' }).click();
	}

	// 4 — the venue switch: Hall for this showing, and the deck is not edited.
	const before = await persistedSource(page);
	await dialog.getByRole('button', { name: /^Venue:/ }).click();
	await page.getByRole('menuitem', { name: /^Hall/ }).click();
	await expect.poll(async () => (await shown(presented)).scale, { ...opts, message: 'Present at Hall' }).toBe('1.5');
	expect(await persistedSource(page), 'the switch never writes the deck').toBe(before);
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	// Back in the editor the deck's own venue holds.
	await cursorTo(page, 'Third slide');
	await expect.poll(async () => (await shown(live(page))).scale, opts).toBe('1.3');
	expect(await page.locator('[data-lattice-scale-measure]').count(), 'still no measuring frame').toBe(0);
});

test('the clip notice: "Split slide" divides the slide, "Use Huddle" moves the deck down a room', async ({ page }) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	const opts = { timeout: 20_000 };
	await setEditorContent(page, deck(7));
	await cursorTo(page, 'Binding slide');
	await expect(notice(page)).toBeVisible(opts);

	await notice(page).getByRole('button', { name: 'Split slide' }).click();
	await expect.poll(async () => (await persistedSource(page)).match(/Binding slide/g)?.length ?? 0, { ...opts, message: 'the heading repeats on the second half' }).toBe(2);
	await expect.poll(async () => (await shown(live(page))).overflow, { ...opts, message: 'the first half fits' }).toBe(false);
	await expect(notice(page)).toBeHidden(opts);

	await setEditorContent(page, deck(7));
	await cursorTo(page, 'Binding slide');
	await expect(notice(page)).toBeVisible(opts);
	await notice(page).getByRole('button', { name: 'Use Huddle' }).click();
	await expect.poll(async () => await persistedSource(page), opts).toContain('venue: huddle');
	await expect.poll(async () => (await shown(live(page))).scale, opts).toBe('1.15');
});

test('deck settings → Look → Venue writes venue:', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck(3, ''));
	await openInspectorTab(page, 'look');
	await page.getByRole('button', { name: 'Choose deck venue' }).click();
	await page.getByRole('menuitem', { name: /^Hall/ }).click();
	await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).toContain('venue: hall');
	await expect.poll(async () => (await shown(live(page))).scale, { timeout: 20_000 }).toBe('1.5');
	await page.getByRole('button', { name: 'Choose deck venue' }).click();
	await page.getByRole('menuitem', { name: /^Default/ }).click();
	await expect.poll(async () => await persistedSource(page), { timeout: 10_000 }).not.toContain('venue:');
});

test('the Studio lint warns on a slide past its venue budget, and names the fix', async ({ page }) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	// Five steps of ~13 words: list-steps holds 4 at conference (its venueCapacity) and 5 at
	// the designed size (its hard), so this is `capacity-scale`, a warning under a venue.
	await setEditorContent(page, deck(5));
	const squiggle = page.locator('.cm-content .cm-lintRange-warning').first();
	await expect(squiggle).toBeVisible({ timeout: 20_000 });
	await squiggle.hover();
	const tip = page.locator('.cm-tooltip-lint');
	await expect(tip).toContainText('at 1.3x', { timeout: 10_000 });
	await expect(tip).toContainText('holds about 4');
	await expect(tip).toContainText('Fix:');
	await expect(tip).toContainText(/set `venue: (huddle|laptop)`/);

	// The same deck with no venue: no budget to be past, so no warning.
	await setEditorContent(page, deck(5, ''));
	await expect(page.locator('.cm-content .cm-lintRange-warning')).toHaveCount(0, { timeout: 20_000 });
});
