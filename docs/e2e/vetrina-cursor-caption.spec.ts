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

test.describe('a VOICED narrator DOCKS the caption — the other half of the rule', () => {
	test('there is no balloon at all, and the docked caption stays up while the cursor types', async ({ page }) => {
		// The rule has two halves and only one of them had ever run on a real surface. Silent, the
		// caption and the action compete for one pair of eyes, so the caption steps aside; voiced,
		// the ear has the words and blanking a subtitle mid-sentence takes them from exactly the
		// viewer who is reading it BECAUSE they cannot hear it. Same policy, opposite outcome.
		//
		// And voiced does not merely keep the balloon up — it stops being a balloon. A voice removes
		// the reading trip the balloon exists to save, and what is left is a subtitle, which belongs
		// at a fixed screen position. Anchoring it to a moving cursor also left it stale: a voiced
		// caption never hides, and the bubble re-anchors only on the hidden -> shown edge, so it was
		// placed once per beat and measured 493px from the pointer it was speaking for.
		//
		// The audio is a placeholder (silence of the right length) and that is the point: what is
		// under test is the caption policy and the real Suono clock behind it, not a voice.
		await start(page, { caption: 'cursor', bounds: 'host', pacing: 'grounded', narr: 'voiced' });
		await waitForPhase(page, 'type ');
		expect(await page.locator(BUBBLE).count()).toBe(0);
		await expect(page.locator(DOCK)).toBeVisible();
		// "It did not hide" has to hold for the DURATION of the action, not for the instant an
		// assertion happened to land — and sampling that from the test side means guessing an
		// interval. So the page samples it: a rAF loop records the lowest opacity the bubble ever
		// reaches, and the assertion reads the minimum once the typing has finished.
		await page.evaluate(() => {
			const w = window as unknown as { __minOpacity?: number };
			w.__minOpacity = 1;
			// BOUNDED, because an in-page loop that outlives the test it belongs to is untidy.
			//
			// It is NOT the cause of the ENOENT-on-trace-file failures this file once produced: that
			// was traced to two concurrent Playwright runs sharing `outputDir: 'test-results'`, and it
			// reproduces on tests that install no sampler at all. If you hit it, pass your own
			// `--output=<dir>`. An earlier commit credited the bound with that fix; it was wrong.
			const until = performance.now() + 20_000;
			const tick = () => {
				const el = document.querySelector('.vetrina-caption') as HTMLElement | null;
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
			// Bounded, for the same reason as the sampler above (tidiness — see the note there about
			// what the ENOENT actually was).
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

test.describe('the red-team findings, pinned on the real page', () => {
	// Each of these is a defect that SHIPPED past a green suite, because the suite exercised the
	// configuration the author ran rather than the one a host gets. They are here, driving the real
	// prototype, because every one of them is invisible to jsdom (HARD RULE #23).

	test('bounds:host keeps Exit ON SCREEN when the host is taller than the window', async ({ page }) => {
		// The ordinary case the option exists for — a panel in a scrolling page. Seated from the RAW
		// host rect, Exit landed 638px above the top of the window under `cursor` and 536px below the
		// bottom under `bar`, which takes the whole caption bar with it. Exit is POINTER-ONLY: the
		// first Tab is a keydown the take-over guard reads as the viewer taking the wheel, so off
		// screen is not an inconvenience, it removes the only escape from a running tour.
		//
		// The file's own placement tests could never catch this: they measure against the proto's
		// `#app`, which is SMALLER than the viewport — the one shape that cannot fail.
		for (const caption of ['cursor', 'bar']) {
			await page.goto(PROTO);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.addStyleTag({ content: `${APP}{min-height:2200px}` });
			await page.check(`input[name="caption"][value="${caption}"]`);
			await page.check('input[name="bounds"][value="host"]');
			await page.locator('#run').click();
			await expect(page.locator('.vetrina-exit')).toBeVisible();
			const exit = await page.locator('.vetrina-exit').boundingBox();
			const vh = page.viewportSize()?.height ?? 0;
			expect(exit, `caption=${caption}`).not.toBeNull();
			expect(exit?.y ?? -1, `caption=${caption} exit=${JSON.stringify(exit)}`).toBeGreaterThanOrEqual(0);
			expect((exit?.y ?? 0) + (exit?.height ?? 0), `caption=${caption}`).toBeLessThanOrEqual(vh);
		}
	});

	test('the transient caption is legible under the DEFAULT pacing, not just under `grounded`', async ({ page }) => {
		// Every other case in this file passes `pacing: 'grounded'`. `caption:'cursor'` with the
		// DEFAULT `'legacy'` — one option, which is what a host sets after reading the caption-style
		// table — budgeted the SELF-DISMISSING caption at legacy's 300 wpm and erased an 8-word line
		// after 1900ms. The dwell is now `dwellMs`, always the grounded rate.
		await page.goto(PROTO);
		await page.check('input[name="caption"][value="cursor"]');
		await page.check('input[name="pacing"][value="legacy"]');
		await page.check('input[name="narr"][value="off"]');
		await page.locator('#run').click();

		// Sampled in the page: how long each distinct line is actually legible. Reading it from the
		// test side would mean guessing an interval, and the whole point is the duration.
		const spans = await page.evaluate(async () => {
			const out: { text: string; ms: number }[] = [];
			const t0 = performance.now();
			let current: string | null = null;
			let since = t0;
			while (performance.now() - t0 < 45_000) {
				const b = document.querySelector('.vetrina-bubble') as HTMLElement | null;
				if (!b) break;
				const text = Number.parseFloat(getComputedStyle(b).opacity) > 0.5 ? (b.textContent ?? '').trim() : null;
				if (text !== current) {
					if (current) out.push({ text: current, ms: Math.round(performance.now() - since) });
					current = text;
					since = performance.now();
				}
				await new Promise((r) => requestAnimationFrame(r));
			}
			if (current) out.push({ text: current, ms: Math.round(performance.now() - since) });
			return out.filter((s) => s.text.length > 0);
		});

		expect(spans.length).toBeGreaterThan(3);
		for (const s of spans) {
			const words = s.text.split(/\s+/).length;
			// The grounded budget: 300ms to notice, then 150 wpm, clamped 1.0-6.0s.
			const grounded = Math.max(1000, Math.min(6000, 300 + (60000 / 150) * words));
			expect(s.ms, `"${s.text}" (${words}w) was up ${s.ms}ms, needs ~${Math.round(grounded)}ms`).toBeGreaterThan(grounded * 0.8);
		}
		// And each line appears EXACTLY ONCE. A second, ~84ms span for the same text is the stale
		// reveal: the bubble fading back up carrying the previous beat's words before the swap.
		const seen = new Set<string>();
		for (const s of spans) {
			expect(seen.has(s.text), `"${s.text}" was shown twice — the caption came back stale`).toBe(false);
			seen.add(s.text);
		}
	});

	test('a DRAG beat holds its caption across the lift-to-drop, then takes it down', async ({ page }) => {
		// The seam the red team named as "where I would look next": a drag's performance window spans
		// the line, so the caption is legible only because it is explicitly HELD — and the tour had no
		// drag beat, so nothing on this branch had ever run it. It does now (beat 4).
		await page.goto(PROTO);
		await page.check('input[name="caption"][value="cursor"]');
		await page.check('input[name="narr"][value="off"]');
		await page.locator('#run').click();

		const span = await page.evaluate(async () => {
			const WANT = 'Drag draft';
			let up: number | null = null;
			let down: number | null = null;
			const t0 = performance.now();
			while (performance.now() - t0 < 45_000) {
				const b = document.querySelector('.vetrina-bubble') as HTMLElement | null;
				if (!b) break;
				const showing = Number.parseFloat(getComputedStyle(b).opacity) > 0.5 && (b.textContent ?? '').includes(WANT);
				if (showing && up == null) up = performance.now();
				if (!showing && up != null) {
					down = performance.now();
					break;
				}
				await new Promise((r) => requestAnimationFrame(r));
			}
			return up != null && down != null ? Math.round(down - up) : null;
		});

		expect(span, 'the drag beat never showed its line').not.toBeNull();
		// Eight words at the grounded rate is ~3500ms. It must be READ, not merely flashed while the
		// item is in the air — and it must come down, which is the property the style is sold on.
		expect(span ?? 0).toBeGreaterThan(2500);
		expect(span ?? 0).toBeLessThan(6500);
		// The reorder actually happened: the theater told the truth.
		await expect(page.locator('#tags > :first-child')).toHaveId('tag-draft');
	});

	test('a voiced narrator built once is not rebuilt per run — no AudioContext leak', async ({ page }) => {
		// `voicedNarrator` opens an AudioContext eagerly (the unlock has to be inside the user
		// gesture). Built inside the Run handler and never disposed, that was 8 live contexts after
		// 8 runs against a per-document cap whose constructor throws — from inside a handler that
		// has already disabled its own button, i.e. a page that cannot be restarted.
		await page.addInitScript(() => {
			(window as unknown as { __ac: number }).__ac = 0;
			const Real = window.AudioContext;
			(window as unknown as { AudioContext: unknown }).AudioContext = class extends Real {
				constructor(...a: ConstructorParameters<typeof AudioContext>) {
					super(...a);
					(window as unknown as { __ac: number }).__ac++;
				}
			};
		});
		await page.goto(PROTO);
		await page.check('input[name="caption"][value="cursor"]');
		await page.check('input[name="narr"][value="voiced"]');
		for (let i = 0; i < 4; i++) {
			await page.locator('#run').click();
			await waitForPhase(page, 'start');
			await page.keyboard.press('Escape');
			await expect(page.locator('#run')).toBeEnabled({ timeout: 20_000 });
		}
		expect(await page.evaluate(() => (window as unknown as { __ac: number }).__ac)).toBeLessThanOrEqual(1);
	});
});

test.describe("a scroll the VIEWER performs re-seats the bounds:'host' chrome", () => {
	// Under `bounds: 'host'` the chrome is measured against the VISIBLE part of the host, and it
	// lives in a `position: fixed` layer — so a scroll slides the host under chrome that does not
	// move, and the caption ends up describing where the host used to be. Only `resize` and the
	// stage's own reveal were wired to the re-seat; a viewer's scroll reached neither.
	//
	// This is layout, so it can only be pinned here (HARD RULE #23). The unit arms in
	// docs/src/lib/vetrina/reveal.test.ts pin the wiring and the no-work property; jsdom has no
	// scrolling and no boxes to check either against.

	/** Scroll the window by `dy` WITHOUT touching the page: the runner's take-over guard reads a
	 *  `pointerdown` as the viewer taking the wheel and would tear the run down mid-assertion. A
	 *  wheel is not a pointerdown, and `scrollBy` is not an input event at all. */
	async function viewerScroll(page: Page, dy: number): Promise<void> {
		await page.evaluate((d) => window.scrollBy(0, d), dy);
		await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
	}

	test('the caption follows the host through the window @crosswidth', async ({ page }) => {
		await start(page, { caption: 'bar', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'say');
		const before = { app: await page.locator(APP).boundingBox(), dock: await page.locator(DOCK).boundingBox() };
		expect(before.app && before.dock).toBeTruthy();
		if (!before.app || !before.dock) return;

		await viewerScroll(page, 220);
		const app = await page.locator(APP).boundingBox();
		const dock = await page.locator(DOCK).boundingBox();
		if (!app || !dock) return;
		// Guard the oracle: if the page did not actually scroll the host, nothing below is a test.
		expect(Math.abs(app.y - before.app.y), 'the page did not scroll — this proves nothing').toBeGreaterThan(100);
		// The dock is still inside the host's box. Without the re-seat it stays where it was while
		// the host moves out from under it, which is the whole defect.
		expect(dock.y, `the dock is at ${dock.y}, above a host that now starts at ${app.y}`).toBeGreaterThanOrEqual(app.y - 1);
		expect(dock.y + dock.height).toBeLessThanOrEqual(app.y + app.height + 1);
	});

	// HARD RULE #19 territory: the decision record refused this listener until the jank question was
	// measured, so the number ships with it. The baseline is the SAME scroll on the SAME page with
	// no tour running — i.e. what the browser costs by itself — which is a truer before/after than
	// two builds, because it isolates exactly what a running tour adds to a scroll frame.
	async function scrollFrameCost(page: Page): Promise<{ n: number; mean: number; worst: number; over20: number }> {
		return page.evaluate(async () => {
			const deltas: number[] = [];
			await new Promise<void>((res) => {
				let last = performance.now();
				let i = 0;
				let dir = 1;
				const tick = (t: number) => {
					deltas.push(t - last);
					last = t;
					// A scroll EVERY frame — the worst case a handler can be asked to survive.
					window.scrollBy(0, 7 * dir);
					if (window.scrollY < 30) dir = 1;
					else if (window.scrollY > 300) dir = -1;
					if (++i >= 200) return res();
					requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			deltas.shift(); // the first delta spans the wait, not a frame
			const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
			return { n: deltas.length, mean: Math.round(mean * 100) / 100, worst: Math.round(Math.max(...deltas) * 100) / 100, over20: deltas.filter((d) => d > 20).length };
		});
	}

	test('@mobile re-seating costs the scroll nothing measurable on a phone viewport', async ({ page }) => {
		// Baseline first, on the same page with no stage mounted.
		await page.goto(PROTO);
		const idle = await scrollFrameCost(page);

		await start(page, { caption: 'bar', bounds: 'host', pacing: 'grounded', narr: 'off' });
		await waitForPhase(page, 'say');
		const running = await scrollFrameCost(page);

		console.log(`[scroll-cost] idle mean ${idle.mean}ms worst ${idle.worst}ms (${idle.over20}/${idle.n} frames >20ms) | tour running mean ${running.mean}ms worst ${running.worst}ms (${running.over20}/${running.n} frames >20ms)`);
		// The claim is "not measurable", not "free": the handler reads the clamped box every frame
		// and re-seats only when it moved. A 4ms allowance on the MEAN is a quarter of a 60fps
		// frame and several times any plausible cost of two rect reads — generous enough not to be
		// flaky on a shared runner, tight enough that a per-frame relayout (the shape the decision
		// record refused) could not hide inside it.
		expect(running.mean, `a running tour added ${(running.mean - idle.mean).toFixed(2)}ms to the mean scroll frame`).toBeLessThan(idle.mean + 4);
	});
});
