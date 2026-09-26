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

test('a deck that asks for no scale never creates the measuring frame', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, deck(6, ''));
	await cursorTo(page, 'Binding slide');
	await expect.poll(async () => (await shown(live(page))).scale, { timeout: 20_000 }).toBe('1');
	// Watch for the frame for 2s — well past the measure's 700 ms debounce — returning early if it
	// appears. A bounded wait on the signal itself, not a sleep: the outcome is "nothing happens".
	await page.waitForFunction((t0) => !!document.querySelector('[data-lattice-scale-measure]') || Date.now() - t0 > 2000, Date.now());
	expect(await page.locator('[data-lattice-scale-measure]').count(), 'no measuring frame for an unscaled deck').toBe(0);
	// The positive control: the same probe DOES see the frame once the deck asks for a scale.
	await setEditorContent(page, deck(6));
	await expect.poll(async () => await page.locator('[data-lattice-scale-measure]').count(), { timeout: 20_000 }).toBe(1);
});

test('the measure reads the deck it was asked about, not the one its frame held before', async ({ page }) => {
	// A too-full deck, then one that fits and ends on a Mermaid slide, with the caret left ON that
	// slide. The diagram flips the measuring frame's signature, so it rewrites its whole document,
	// and until the new page commits, `contentDocument` is still the capped deck. The bug this
	// pins (checker, 2026-09-26) measured that old document and cached its cap under the new
	// deck, so the fitting deck stayed at 1x. On a fresh page, so no earlier measure masks it.
	test.setTimeout(90_000);
	await gotoStudio(page);
	const opts = { timeout: 20_000 };
	await setEditorContent(page, deck(6));
	await expect.poll(async () => (await shown(live(page))).cap, { ...opts, message: 'the six-step deck is capped' }).not.toBeNull();
	// Let the measuring frame settle on the capped deck — every one of its slides stepped — so
	// the switch below finds a complete, capped document there, the state the bug read.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const f = document.querySelector('[data-lattice-scale-measure] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll('section[data-lattice-scale-step]').length ?? 0;
				}),
			opts,
		)
		.toBe(3);
	const withDiagram = `${deck(3)}\n---\n\n<!-- _class: diagram -->\n\n## A diagram slide.\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n`;
	await setEditorContent(page, withDiagram);
	// Read only once the measuring frame holds the NEW deck (four sections). Before that, a freshly
	// written preview frame shows 1.3x with no cap for a moment on BOTH the fixed and the broken
	// code, so an earlier read would pass either way; after it, the broken code has already
	// applied the old deck's cap.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const f = document.querySelector('[data-lattice-scale-measure] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll('section[data-lattice-slide]').length ?? 0;
				}),
			opts,
		)
		.toBe(4);
	await expect
		.poll(async () => await shown(live(page)), { ...opts, message: "the fitting deck must not keep the capped deck's cap" })
		.toEqual(expect.objectContaining({ scale: '1.3', cap: null }));
});
