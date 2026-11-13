import { FRAME_MS, pauseFrames, stepFrame } from './frame-clock';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE DELIVERIES on the real Present surface (engineering/decisions/
// 2026-09-27-delivery-styles-and-component-scenes.md §4, superseding the 2026-09-25 budget). The
// claims are about a real reader driving a real Guide over a real slide, so jsdom cannot settle
// them (HARD RULE #23):
//
//   - `restrained` focuses every block the narration names, one at a time, and draws no ink;
//   - `expressive` focuses the same blocks and inks each one, with the cursor on;
//   - `somber` gestures once, on the slide's top-ranked moment, with NO cursor and NO ink.
//
// No key and no voice: the silent reader drives the cue clock exactly as a narrated one does.

test.describe.configure({ timeout: 180_000 });

const CURSOR = '.vetrina-cursor';

const DENSE = (delivery: string) =>
	[
		'---',
		'marp: true',
		'theme: indaco',
		`delivery: ${delivery}`,
		'---',
		'',
		'## The quarter, line by line',
		'',
		'- Hiring continued on plan across every team.',
		'- ARR closed at $48.6M, ahead of plan.',
		'- The office move finished in August.',
		'- Payback stretched to 19 months.',
		'- The new logo landed in the spring.',
		'',
	].join('\n');

/** Start counting cue-ink bursts on the stage; the returned function reads the count so far.
 *  One gesture adds several nodes (the grouping `present-guide.spec.ts` explains), so nodes closer than 400 ms belong
 *  to one burst. On a fake clock (`frame-clock.ts`) that gap is virtual time, so a loaded runner cannot split a burst. */
async function watchInk(page: import('@playwright/test').Page): Promise<() => Promise<number>> {
	await page.evaluate(() => {
		const w = window as unknown as { __inkAt: number[] };
		w.__inkAt = [];
		new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if ((n as HTMLElement).dataset?.vtCue) w.__inkAt.push(Date.now());
		}).observe(document.body, { childList: true, subtree: true });
	});
	return async () => {
		const at = await page.evaluate(() => (window as unknown as { __inkAt: number[] }).__inkAt);
		return at.filter((t, i) => i === 0 || t - at[i - 1] > 400).length;
	};
}

/** Open Present with the Guide on. With `frames`, the page runs on a fake clock that is paused before Play, so the
 *  reading moves only as the test steps it (`frame-clock.ts`); `beforePlay` installs the watchers while nothing moves. */
async function present(page: import('@playwright/test').Page, deck: string, opts: { frames?: boolean; beforePlay?: (dialog: import('@playwright/test').Locator) => Promise<void> } = {}) {
	if (opts.frames) await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	if (opts.frames) await pauseFrames(page);
	await opts.beforePlay?.(dialog);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	return dialog;
}

/** Start recording focus MOMENTS on the live slide; the returned function reads them. Each focus recedes a batch of
 *  peers at once, so class changes closer than 400 ms (virtual, on a fake clock) are one moment, as for the ink. */
async function watchFoci(dialog: import('@playwright/test').Locator): Promise<() => Promise<string[]>> {
	const body = dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('body');
	await body.evaluate((el) => {
		const w = window as unknown as { __foci: { t: number; text: string }[] };
		w.__foci = [];
		new MutationObserver((records) => {
			for (const r of records) {
				const node = r.target as Element;
				if (r.attributeName !== 'class' || !node.classList.contains('lat-guide-dim') || (r.oldValue ?? '').includes('lat-guide-dim')) continue;
				const t = Date.now();
				const last = w.__foci[w.__foci.length - 1];
				if (last && t - last.t < 400) continue;
				// The moment is named by what STAYED full: the dimmed peer's sibling that is not dimmed.
				const focused = [...(node.parentElement?.children ?? [])].find((c) => c.tagName === node.tagName && !c.classList.contains('lat-guide-dim'));
				w.__foci.push({ t, text: (focused?.textContent ?? '').trim().slice(0, 40) });
			}
		}).observe(el, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['class'] });
	});
	return () => body.evaluate(() => (window as unknown as { __foci: { text: string }[] }).__foci.map((m) => m.text));
}

/** 25 s of the reading, in frames: the five-bullet slide is read well inside it. */
const READ_FRAMES = Math.ceil(25_000 / FRAME_MS);

/** Present `deck` on a fake clock, watch the whole reading, and return what was focused and how many ink bursts. */
async function readThrough(page: import('@playwright/test').Page, deck: string): Promise<{ lit: string[]; bursts: number }> {
	let foci!: () => Promise<string[]>;
	let ink!: () => Promise<number>;
	await present(page, deck, {
		frames: true,
		beforePlay: async (dialog) => {
			foci = await watchFoci(dialog);
			ink = await watchInk(page);
		},
	});
	for (let i = 0; i < READ_FRAMES; i++) await stepFrame(page);
	return { lit: await foci(), bursts: await ink() };
}

test('restrained focuses every bullet the narration names, and draws no ink', async ({ page }) => {
	const { lit, bursts } = await readThrough(page, DENSE('restrained'));
	// No budget: a slide read in five bullets shows five quiet focuses, so nothing named goes dark.
	expect(lit.length, 'restrained left named bullets dark').toBeGreaterThanOrEqual(4);
	expect(lit.join(' | '), 'the figure is focused when it is read').toContain('$48.6M');
	expect(bursts, 'restrained changes the element; it draws no overlay').toBe(0);
});

test('expressive focuses the same bullets, and inks each one', async ({ page }) => {
	const { lit, bursts } = await readThrough(page, DENSE('expressive'));
	expect(lit.length, 'expressive left named bullets dark').toBeGreaterThanOrEqual(4);
	// Ink marks every act, not only the top moment (owner, 2026-09-27).
	expect(bursts, 'expressive inks each named block').toBeGreaterThanOrEqual(4);
});

test('somber focuses the key beat: the rest recedes gently, with no cursor and no ink', async ({ page }) => {
	// Ink is watched from before Play, and read once the key beat has been focused: a gesture's ink is drawn with its
	// focus, so by then any ink the somber beat drew is on the stage.
	let ink!: () => Promise<number>;
	const dialog = await present(page, DENSE('somber'), {
		beforePlay: async () => {
			ink = await watchInk(page);
		},
	});
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	// The one somber moment is the slide's KEY beat: its four siblings recede, it stays whole. On a
	// prose slide the key is the list's FIRST item, not the top-ranked figure — a deliberate change
	// (guide storyboards, engineering/decisions/2026-09-27-guide-storyboards.md §7: "the key is what
	// §6 names and the goldens can pin"), pinned in guide-conductor.test.ts as well.
	await expect(slide.locator('li.lat-guide-dim')).toHaveCount(4, { timeout: 30_000 });
	const focused = slide.locator('ul > li:not(.lat-guide-dim)');
	await expect(focused).toHaveCount(1);
	await expect(focused).toContainText('Hiring continued on plan');
	// Somber recedes as deeply as restrained (owner, 2026-09-27), once and slowly; the target keeps its own opacity.
	await expect.poll(() => slide.locator('li.lat-guide-dim').first().evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 5_000 }).toBeCloseTo(0.7, 1);
	expect(await focused.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
	// Never the deck's own focus classes.
	await expect(slide.locator('.lat-focus, .lat-recede')).toHaveCount(0);
	expect(await page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
	expect(await ink()).toBe(0);
});

test('the slide reads along only with the captions off: the caption already does it', async ({ page }) => {
	const said = (dialog: import('@playwright/test').Locator) =>
		dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('body').evaluate(() => {
			const h = (window as unknown as { CSS: { highlights?: Map<string, { size: number }> } }).CSS.highlights?.get('lat-said');
			return h ? h.size : 0;
		});
	const dialog = await present(page, DENSE('restrained'));
	// Captions on (the default): the slide never carries a second copy of the words.
	await expect(dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('li.lat-guide-dim').first()).toBeVisible({ timeout: 30_000 });
	// "Nothing changes" is the claim, so sample every frame, from one focused bullet until the Guide moves to the
	// next: the whole of a bullet is read in between, which is exactly when a read-along would mark its words. The
	// most lat-said ranges any frame carried must be zero.
	const seen = await dialog.frameLocator('[aria-label="Presented slide"] iframe.live').locator('body').evaluate(
		(body) =>
			new Promise<number>((resolve) => {
				const w = window as unknown as { CSS: { highlights?: Map<string, { size: number }> } };
				const focused = () => [...body.querySelectorAll('li:not(.lat-guide-dim)')].map((li) => li.textContent).join('|');
				const first = focused();
				let most = 0;
				const tick = () => {
					most = Math.max(most, w.CSS.highlights?.get('lat-said')?.size ?? 0);
					if (focused() === first) requestAnimationFrame(tick);
					else resolve(most);
				};
				requestAnimationFrame(tick);
			}),
	);
	expect(seen, 'the slide read along while the caption was showing').toBe(0);
	// Captions off: the focused bullet reads along.
	await dialog.getByRole('button', { name: 'Captions' }).click();
	await expect.poll(() => said(dialog), { timeout: 30_000 }).toBeGreaterThan(0);
});

// THE GUIDE AND THE HOVER NEVER SHARE THE SCREEN (owner, 2026-09-26: "hover off while guide plays").
// Measured before: with the Guide focused on one bar, moving the pointer onto another dimmed the
// narrated bar and opened a card over the playing slide. While the Guide plays the pointer changes
// nothing; pausing hands the chart to the pointer, and the Guide's focus lifts.
test('while the Guide plays the chart hover is off, and pausing hands the chart back', async ({ page }) => {
	const deck = [
		'---', 'marp: true', 'theme: indaco', 'delivery: restrained', '---', '',
		'<!-- _class: bar -->', '', '## EMEA is where the quarter was won.', '',
		'- North America `$4.1M`', '  - Flat on last year.',
		'- LATAM `$1.2M`', '  - Two new logos.',
		'- EMEA `$6.8M`', '  - Three renewals landed.',
		'- APAC `$2.9M`', '  - Japan carried it.', '',
	].join('\n');
	const dialog = await present(page, deck);
	const frame = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	const card = page.locator('[data-slot="popover-content"], .db-pp-chartpop').filter({ hasText: /\S/ });
	// Playing: the Guide has focused a bar.
	await expect(frame.locator('rect.bar-mark.lat-guide-dim').first()).toBeAttached({ timeout: 60_000 });
	const hoverBar = async () => {
		// A bar the Guide receded, so a working hover would visibly take it over.
		const target = frame.locator('rect.bar-mark.lat-guide-dim').first();
		const box = (await target.boundingBox()) ?? (await frame.locator('rect.bar-mark').first().boundingBox());
		if (!box) throw new Error('no bar on screen');
		await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 - 30);
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
	};
	await hoverBar();
	// The pointer changed nothing: no card, and no bar took an inline hover opacity.
	await expect(card).toHaveCount(0);
	expect(await frame.locator('rect.bar-mark').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.opacity !== '').length)).toBe(0);
	// Pause: the Guide lets go of the chart…
	await dialog.getByRole('button', { name: 'Pause' }).click();
	await expect(frame.locator('.lat-guide-dim')).toHaveCount(0);
	// …and the pointer has it: hovering a bar opens its card.
	await page.mouse.move(5, 5);
	const bar = await frame.locator('rect.bar-mark[data-mark="2"]').boundingBox();
	if (!bar) throw new Error('no EMEA bar');
	await page.mouse.move(bar.x + bar.width / 2 - 30, bar.y + bar.height / 2 - 30);
	await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2, { steps: 10 });
	await expect(card.filter({ hasText: 'EMEA' })).toBeVisible();
	// Play again: the card goes, the hover's dimming goes, and the Guide's focus comes back.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(card).toHaveCount(0);
	await expect(frame.locator('rect.bar-mark.lat-guide-dim').first()).toBeAttached({ timeout: 30_000 });
	expect(await frame.locator('rect.bar-mark').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.opacity !== '').length)).toBe(0);
});

// RESUMING MID-BLOCK. The Guide gestures on the first sentence that names a block and holds the
// focus through the block's later sentences by resting on it, so a pause on the SECOND sentence
// used to come back to a bare slide for the rest of the block (checker, reproduced). Playing
// again must restore the focus on the sentence being read.
test('pausing on a later sentence of a block and playing again brings the focus back', async ({ page }) => {
	const deck = [
		'---', 'marp: true', 'theme: indaco', 'delivery: restrained', '---', '',
		'## The quarter, line by line', '',
		'- Hiring continued on plan across every team.',
		'- ARR closed at $48.6M. It beat the forecast by four points, and the board noticed. Renewals carried most of the growth in the quarter.',
		'- The office move finished in August.', '',
	].join('\n');
	const dialog = await present(page, deck);
	const frame = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	const now = page.locator('.latt-cc-line[data-state="now"]');
	await expect(now).toContainText('It beat the forecast', { timeout: 90_000 });
	await expect(frame.locator('li.lat-guide-dim').first()).toBeAttached();
	await dialog.getByRole('button', { name: 'Pause' }).click();
	await expect(frame.locator('.lat-guide-dim')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// Back on the same sentence, with the ARR bullet focused again.
	await expect(frame.locator('li.lat-guide-dim').first()).toBeAttached({ timeout: 2_000 });
	await expect(frame.locator('li:not(.lat-guide-dim)', { hasText: 'ARR closed' })).toHaveCount(1);
});
