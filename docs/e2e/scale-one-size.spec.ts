import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ONE TYPE SIZE PER DECK, ON THE REAL SURFACES THAT SHOW ONE SLIDE AT A TIME.
//
// A projection-scaled deck renders at one size: every slide that asked for a scale lands on
// the highest rung all of them fit (lib/core/scale-fit.js rule 7). The export and the player
// hold the whole deck in one document, so LEVEL sees every slide there. The Studio's editor
// preview and Present render ONE slide per document, and before docs/src/lib/scale-cap.ts
// they showed a `venue: conference` deck as 1.3x · 1x · 1.3x as you moved through it — the
// pulse the rule exists to stop. This spec pins the fix where it has to hold:
//   1. with one slide too full for 1.3x, EVERY slide shows the shared rung, in the editor
//      preview and in Present, and the running header is one size;
//   2. trimming that slide gives every slide 1.3x back — so a green run cannot come from the
//      deck simply never scaling;
//   3. a deck with no scale is never capped.

const step = (n: number) => `${n}. Step ${n}\n   - Reads the ticket, plans the change, and writes down why before anyone asks.\n`;
const deck = (steps: number, venue = 'venue: conference\n') =>
	`---\nmarp: true\ntheme: indaco\npaginate: true\n${venue}header: "Live preview · venue"\n---\n\n` +
	'<!-- _class: list takeaway -->\n\n`First slide`\n\n## A short slide that fits at any size.\n\n- One point.\n- Two points.\n\n---\n\n' +
	`<!-- _class: list-steps -->\n\n\`Binding slide\`\n\n## Agents can now take a ticket all the way to review.\n\n${Array.from({ length: steps }, (_, i) => step(i + 1)).join('')}\n---\n\n` +
	'<!-- _class: list takeaway -->\n\n`Third slide`\n\n## Another short slide.\n\n- Three points.\n';

type Shown = { scale: string; header: string | null; cap: string | null };
async function shown(frame: ReturnType<import('@playwright/test').Page['frameLocator']>): Promise<Shown> {
	return await frame.locator('section[data-lattice-slide]').first().evaluate((s) => {
		const h = s.querySelector(':scope > header');
		return {
			scale: getComputedStyle(s).getPropertyValue('--fs-scale').trim(),
			header: h ? getComputedStyle(h).fontSize : null,
			cap: s.ownerDocument.documentElement.getAttribute('data-lattice-scale-cap'),
		};
	});
}
const live = (page: import('@playwright/test').Page) => page.frameLocator('[aria-label="Live deck preview"] iframe.live');

async function cursorTo(page: import('@playwright/test').Page, text: string) {
	await page.locator('.cm-content').getByText(text).first().click();
}

test('one size per deck in the live preview and in Present; trimming gives the size back', async ({ page }) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	const opts = { timeout: 20_000 };

	// 1 — the editor preview, slide by slide: every slide at the shared rung (1x here).
	await setEditorContent(page, deck(6));
	const headers = new Set<string | null>();
	for (const text of ['First slide', 'Binding slide', 'Third slide']) {
		await cursorTo(page, text);
		await expect.poll(async () => (await shown(live(page))).scale, { ...opts, message: `${text}: the shared rung` }).toBe('1');
		headers.add((await shown(live(page))).header);
	}
	expect(headers.size, 'the running header is one size on every slide').toBe(1);

	// 1b — Present, slide by slide.
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const presented = dialog.getByRole('figure', { name: 'Presented slide' }).frameLocator('iframe');
	for (let k = 0; k < 3 && !(await dialog.getByText('1 / 3', { exact: true }).isVisible()); k++) {
		await dialog.getByRole('button', { name: 'Previous slide' }).click();
	}
	for (let i = 1; i <= 3; i++) {
		await expect(dialog.getByText(`${i} / 3`, { exact: true })).toBeVisible();
		await expect.poll(async () => (await shown(presented)).scale, { ...opts, message: `Present slide ${i}: the shared rung` }).toBe('1');
		if (i < 3) await dialog.getByRole('button', { name: 'Next slide' }).click();
	}
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// 2 — trim the binding slide: the whole deck gets 1.3x back, the first slide included.
	await setEditorContent(page, deck(3));
	await cursorTo(page, 'First slide');
	await expect.poll(async () => (await shown(live(page))).scale, { ...opts, message: 'trimmed: the full scale is back' }).toBe('1.3');

	// 3 — no scale asked: nothing is capped.
	await setEditorContent(page, deck(6, ''));
	await cursorTo(page, 'First slide');
	await expect.poll(async () => await shown(live(page)), opts).toEqual(expect.objectContaining({ scale: '1', cap: null }));
});
