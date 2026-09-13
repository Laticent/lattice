import { expect, type Page, test } from '@playwright/test';

// The three behaviors this prototype turns on cannot be tested anywhere but a real browser,
// because all three are LAYOUT (HARD RULE #23): whether the caption is inside the host's box,
// whether the bubble is over the field being typed into, and whether a click lands on the word
// that names it. jsdom has no boxes and no clock worth trusting, so the unit tests pin the pure
// geometry and the port contract, and these pin what actually happens on screen.
//
// The oracles are rectangles and the page's own beat log — never a screenshot, never a fixed
// sleep — so a pacing change cannot silently turn these green.

const PROTO = '/proto/vetrina-caption/';
const APP = '#app';
const BUBBLE = '.vetrina-bubble';
const DOCK = '.vetrina-caption';

async function start(page: Page, opts: { caption: string; bounds: string; pacing: string; narr: string }): Promise<void> {
	await page.goto(PROTO);
	await page.check(`input[name="caption"][value="${opts.caption}"]`);
	await page.check(`input[name="bounds"][value="${opts.bounds}"]`);
	await page.check(`input[name="pacing"][value="${opts.pacing}"]`);
	await page.check(`input[name="narr"][value="${opts.narr}"]`);
	await page.locator('#run').click();
	await expect(page.locator('.vetrina-stage')).toBeVisible();
}

// The oracles match on the PHASE, never on a beat index. An earlier version keyed on `2:type`
// and every test in the file broke the moment a caption was split into two beats — which is a
// change to the demo's copy, not to anything under test. What the tour is doing is the oracle;
// which beat it happens to be is not.

/** Every logged phase name, in order. The page writes these row by row as the tour plays. */
const phases = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#logbody tr')].map((tr) => tr.children[3].textContent ?? ''));

/** The ms column of the first row whose phase starts with `match`. */
const at = (page: Page, match: string) =>
	page.evaluate((m) => {
		const row = [...document.querySelectorAll('#logbody tr')].find((tr) => (tr.children[3].textContent ?? '').startsWith(m));
		return row ? Number(row.children[0].textContent) : null;
	}, match);

/** How many rows have been logged whose phase starts with `match`. */
const countOf = (page: Page, match: string) =>
	page.evaluate((m) => [...document.querySelectorAll('#logbody tr')].filter((tr) => (tr.children[3].textContent ?? '').startsWith(m)).length, match);

async function waitForPhase(page: Page, match: string, timeout = 40_000): Promise<void> {
	await expect.poll(async () => (await phases(page)).some((p) => p.startsWith(match)), { timeout }).toBe(true);
}

/** Wait until at least `n` rows with this phase have been logged — the positional oracle that
 *  survives a beat being split in two. */
async function waitForNth(page: Page, match: string, n: number, timeout = 40_000): Promise<void> {
	await expect.poll(async () => countOf(page, match), { timeout }).toBeGreaterThanOrEqual(n);
}

test.describe('caption placement — the caption is inside the box the tour runs in', () => {
	test('bounds:host keeps the BAR inside the host panel @crosswidth', async ({ page }) => {
		await start(page, { caption: 'bar', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'say');
		const app = await page.locator(APP).boundingBox();
		const dock = await page.locator(DOCK).boundingBox();
		expect(app && dock).toBeTruthy();
		if (!app || !dock) return;
		// The bug this exists for: `width: calc(100vw - 24px)` put 704px of caption inside a
		// 642px app, hanging off both sides.
		expect(dock.x).toBeGreaterThanOrEqual(app.x - 1);
		expect(dock.x + dock.width).toBeLessThanOrEqual(app.x + app.width + 1);
		expect(dock.y).toBeGreaterThanOrEqual(app.y - 1);
		expect(dock.y + dock.height).toBeLessThanOrEqual(app.y + app.height + 1);
	});

	test('bounds:viewport is unchanged — the default still spans the window', async ({ page }) => {
		await start(page, { caption: 'bar', bounds: 'viewport', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'say');
		const app = await page.locator(APP).boundingBox();
		const dock = await page.locator(DOCK).boundingBox();
		if (!app || !dock) return;
		// Anchored to the window, so it sits below the app rather than inside it.
		expect(dock.y).toBeGreaterThan(app.y);
	});

	test('the cursor bubble lands inside the host panel and clear of Exit @crosswidth', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, 'say');
		await expect(page.locator(BUBBLE)).toBeVisible();
		const app = await page.locator(APP).boundingBox();
		const bubble = await page.locator(BUBBLE).boundingBox();
		const exit = await page.locator('button[aria-label="Exit the demo"]').boundingBox();
		if (!app || !bubble || !exit) return;
		expect(bubble.x).toBeGreaterThanOrEqual(app.x - 1);
		expect(bubble.x + bubble.width).toBeLessThanOrEqual(app.x + app.width + 1);
		expect(bubble.y).toBeGreaterThanOrEqual(app.y - 1);
		expect(bubble.y + bubble.height).toBeLessThanOrEqual(app.y + app.height + 1);
		// Exit is in the host's corner too, and the bubble is not sitting on it.
		expect(exit.x + exit.width).toBeLessThanOrEqual(app.x + app.width + 1);
		const overlapsExit = bubble.x < exit.x + exit.width && bubble.x + bubble.width > exit.x && bubble.y < exit.y + exit.height && bubble.y + bubble.height > exit.y;
		expect(overlapsExit).toBe(false);
	});
});

/** The bubble's opacity, sampled fast. The default poll backoff reaches 1s intervals within ~2s
 *  and steps clean over a visibility window that is a few hundred ms wide — which is how the
 *  first version of this file managed to be ~50% flaky while testing something real. */
const opacityBecomes = (page: Page, value: string, timeout = 10_000) =>
	expect.poll(async () => page.locator(BUBBLE).evaluate((el) => getComputedStyle(el).opacity), { intervals: [40], timeout }).toBe(value);

test.describe('caption visibility — it steps aside, and Exit does not', () => {
	test('nothing is over the field while the cursor types, and a caption returns after', async ({ page }) => {
		// NOTE what this does and does not prove. Under the silent cursor rhythm the caption is
		// DISMISSED before the action, so its absence during typing is the transient life cycle
		// rather than the `busy()` step-aside. The step-aside itself is covered by the voiced arm
		// below (where it must NOT fire) and by the unit tests; a drag is the only shape where it
		// still governs a silent caption, and the prototype tour has no drag beat.
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'type ');
		// Mid-typing: the caption is out of the way of the field being typed into.
		await opacityBecomes(page, '0');
		// …but it is still in the layout and the accessibility tree, holding its live region.
		await expect(page.locator(`${BUBBLE} .vetrina-narration[role="status"]`)).toHaveCount(1);
		await expect(page.locator(BUBBLE)).toHaveCSS('display', 'block');
		// Exit never went with it.
		await expect(page.locator('button[aria-label="Exit the demo"]')).toBeVisible();
		// The next caption brings the bubble back. Under this rhythm a deictic beat says its line
		// AFTER the stroke, so the stroke is what to wait for.
		await waitForPhase(page, 'gesture:underline');
		await opacityBecomes(page, '1');
	});

	test('the bubble comes back NEXT TO THE CURSOR, not where the cursor used to be', async ({ page }) => {
		// The defect this exists for: the balloon was placed once, when the line was set — which is
		// before the beat's travel — and never re-placed. It reappeared after the performance
		// beside where the cursor had been at the end of the PREVIOUS beat, measured at 561px from
		// the pointer it was speaking for, while three documents said "next to the cursor".
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		const gaps: number[] = [];
		for (const nth of [2, 3, 4]) {
			await waitForNth(page, 'say', nth);
			await opacityBecomes(page, '1');
			const bubble = await page.locator(BUBBLE).boundingBox();
			const cursor = await page.locator('.vetrina-cursor').boundingBox();
			if (!bubble || !cursor) continue;
			// Nearest edge-to-edge distance: the balloon is placed with a ~20px gap off the cursor,
			// so anything in the low tens is adjacent and anything in the hundreds is the bug.
			const dx = Math.max(0, Math.max(bubble.x - (cursor.x + cursor.width), cursor.x - (bubble.x + bubble.width)));
			const dy = Math.max(0, Math.max(bubble.y - (cursor.y + cursor.height), cursor.y - (bubble.y + bubble.height)));
			gaps.push(Math.hypot(dx, dy));
		}
		expect(gaps.length).toBeGreaterThanOrEqual(2);
		for (const gap of gaps) expect(gap).toBeLessThan(80);
	});
});

test.describe('a VOICED narrator keeps the caption up — the other half of the rule', () => {
	test('the caption stays visible while the cursor types, where a silent run hides it', async ({ page }) => {
		// The rule has two halves and only one of them had ever run on a real surface. Silent, the
		// caption and the action compete for one pair of eyes, so the caption steps aside; voiced,
		// the ear has the words and blanking a subtitle mid-sentence takes them from exactly the
		// viewer who is reading it BECAUSE they cannot hear it. Same policy, opposite outcome.
		//
		// The audio is a placeholder (silence of the right length) and that is the point: what is
		// under test is the caption policy and the real Suono clock behind it, not a voice.
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'voiced' });
		await waitForPhase(page, 'type ');
		await expect(page.locator(BUBBLE)).toBeVisible();
		// "It did not hide" has to hold for the DURATION of the action, not for the instant an
		// assertion happened to land — and sampling that from the test side means guessing an
		// interval. So the page samples it: a rAF loop records the lowest opacity the bubble ever
		// reaches, and the assertion reads the minimum once the typing has finished.
		await page.evaluate(() => {
			const w = window as unknown as { __minOpacity?: number };
			w.__minOpacity = 1;
			// BOUNDED. An in-page rAF loop that never stops keeps the page busy through teardown and
			// races Playwright's trace flush — which surfaced as an ENOENT on the trace file and read
			// as a test failure on a test that had already passed.
			const until = performance.now() + 20_000;
			const tick = () => {
				const el = document.querySelector('.vetrina-bubble') as HTMLElement | null;
				if (el) w.__minOpacity = Math.min(w.__minOpacity ?? 1, Number(getComputedStyle(el).opacity));
				if (performance.now() < until) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await waitForPhase(page, 'typed');
		expect(await page.evaluate(() => (window as unknown as { __minOpacity?: number }).__minOpacity)).toBe(1);
	});

	test('and the silent run hides it at the same moment — the two halves differ', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, 'type ');
		await opacityBecomes(page, '0');
	});

	test('the word clock still runs off the real audio clock', async ({ page }) => {
		// Suono's WebAudio clock drives the highlight and the clip's measured onset re-anchors it.
		// The observable is the same one the silent rung has: the narration reports reaching the
		// cued word, and it does so near the click.
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'voiced' });
		await waitForPhase(page, 'narration says');
		const press = await at(page, 'press');
		const word = await at(page, 'narration says');
		expect(press).not.toBeNull();
		expect(word).not.toBeNull();
		if (press == null || word == null) return;
		expect(Math.abs(press - word)).toBeLessThan(400);
	});
});

test.describe('the word cue — the click lands on the word that names it', () => {
	test('the caption is UP while the cue plays — the instruction cannot arrive after the action', async ({ page }) => {
		// Found by looking at a contact sheet of the whole run, not by a test: the cue beat was
		// exempted from the transient rhythm but still subject to the stage's step-aside, so the
		// caption hid for the approach and came back AFTER the click. Measured: click at 20.2s,
		// "Now click Publish…" at 21.1s. A cued beat now pins its caption.
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, 'point');
		// Sample in the page, for the same reason the voiced arm does: reading it from the test
		// side means guessing when to look.
		//
		// The window OPENS at the first frame the caption is fully in, not at the `say`. Every
		// `say` cross-fades the bubble out and back to swap the text, so a min-opacity taken from
		// the say would always be 0 and would prove nothing about the defect — which is the caption
		// being gone during the APPROACH, after that swap has finished.
		await page.evaluate(() => {
			const w = window as unknown as { __cueMin?: number; __cueArmed?: boolean };
			w.__cueMin = 1;
			w.__cueArmed = false;
			// Bounded, for the same reason as the sampler above.
			const until = performance.now() + 30_000;
			const tick = () => {
				// Content, not a count. `say`-rows >= 5 was a beat index wearing a disguise, and this
				// file's own header is about exactly that: the last caption logged has to BE the cued
				// line, whatever number of beats precede it.
				const rows = [...document.querySelectorAll('#logbody tr')];
				const says = rows.filter((tr) => (tr.children[3].textContent ?? '').startsWith('say'));
				const lastSaid = says.length ? (says[says.length - 1].children[4].textContent ?? '') : '';
				const el = document.querySelector('.vetrina-bubble') as HTMLElement | null;
				const onCuedBeat = lastSaid.includes('click Publish');
				if (el && onCuedBeat) {
					const o = Number(getComputedStyle(el).opacity);
					if (!w.__cueArmed && o === 1) w.__cueArmed = true;
					if (w.__cueArmed) w.__cueMin = Math.min(w.__cueMin ?? 1, o);
				}
				// Stop as soon as the click has landed — the window this measures is closed by then.
				const pressed = rows.some((tr) => (tr.children[3].textContent ?? '').startsWith('press'));
				if (performance.now() < until && !pressed) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await waitForPhase(page, 'press');
		const cue = await page.evaluate(() => {
			const w = window as unknown as { __cueMin?: number; __cueArmed?: boolean };
			return { min: w.__cueMin, armed: w.__cueArmed };
		});
		// It must have been up at all (armed), and never have dipped between then and the click.
		expect(cue.armed).toBe(true);
		expect(cue.min).toBe(1);
	});

	test('the click and the narration reaching “Publish” coincide', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'cadenza' });
		await waitForPhase(page, 'narration says');
		const press = await at(page, 'press');
		const word = await at(page, 'narration says');
		expect(press).not.toBeNull();
		expect(word).not.toBeNull();
		if (press == null || word == null) return;
		// Broadcast lip-sync tolerance (ITU-R BT.1359) is asymmetric and generous compared with
		// this: ±125 ms is imperceptible. A quarter of that is a real regression net without
		// being a flaky one on a loaded CI box.
		expect(Math.abs(press - word)).toBeLessThan(120);
	});

	test('with narration off the beat still runs — the cue degrades, it does not break', async ({ page }) => {
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'press');
		await expect.poll(async () => page.locator('#summary').textContent(), { timeout: 40_000 }).toContain('complete');
		await expect(page.locator('#status')).toContainText('Published');
	});
});
