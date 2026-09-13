import type { Page } from '@playwright/test';
import { expect, gotoStudio, openAddSlide, test } from './studio-fixture';

// METAMORPHIC oracles for the add-slide gallery's live-preview window.
//
// WHY METAMORPHIC, and not another ceiling assertion. `gallery-preview-budget.spec.ts`
// asserts the one thing we have an absolute oracle for: the live count peaks below a
// ceiling. That is a THRESHOLD, and a threshold is exactly what cannot be written for the
// question actually in front of us — "is 32 live engine documents the right number on an
// iPhone?" has no oracle here, because the number that kills a tab depends on the device,
// the other tabs, and the OS. Picking a new constant and asserting it writes the answer
// into the test.
//
// A metamorphic relation needs no oracle. It states that two runs which SHOULD agree do
// agree — so it stays true whatever the budget is set to, and it keeps being the gate
// after the budget is re-tuned, after the window is re-shaped, and (if it comes to that)
// after live tiles are replaced by something cheaper. That is the property worth having
// BEFORE touching any of it: a suite that says whether a change BROKE the gallery,
// independent of whether the change made memory better.
//
// ── WHAT AN LRU WINDOW DOES AND DOES NOT PROMISE ────────────────────────────────────
// The first cut of this file got its relations wrong in an instructive way, and the
// correction is worth keeping, because the same mistake is the obvious one to make again.
// It asserted "the same scroll offset holds the same number of live previews, however you
// got there" — and that FAILED, at 7 vs 18 previews at the top of the grid.
//
// It failed because it contradicted the design. `slide-thumb.tsx` may retain a tile after it
// leaves the observer band: the budget caps RETENTION, not what is on screen, so the mounted
// set is a function of where you have BEEN, not only of where you ARE. A relation that
// forbids that forbids the feature. (How MUCH it retains has since changed — the ceiling now
// tracks the band, so above the floor the retained set is empty — but the relations below are
// written to survive exactly that kind of re-tuning, which is why they did.)
//
// What an LRU window DOES promise, and what these relations therefore assert:
//   · the retained set SATURATES — it stops growing, rather than never growing;
//   · the VISIBLE set is path-independent — what you can actually see is a function of the
//     offset alone, whatever route took you there;
//   · state does not survive a close;
//   · a recycled tile comes back correct.
// Measured shape of the current implementation, for whoever reads a failure here: at
// 390x844 the gallery shows 3 tiles and settles at ~13 mounted, at 820x1180 it shows 6 and
// settles at ~12, at 1440x900 it shows 7 and settles at ~17. Retention saturates on the
// FIRST traversal; a later pass may settle LOWER as the band contracts (measured on WebKit
// at 21 then 16), which is why MR-1 is one-sided.
//
// ── SCOPE (HARD RULE #23) ───────────────────────────────────────────────────────────
// These run in Chromium and — tagged `@webkit-phone` below — in real WebKit at the
// iPhone 15 Pro device profile. WebKit on Linux is the same ENGINE as iOS Safari and NOT
// the same memory manager: no jetsam, no per-tab content-process ceiling, no OS memory
// pressure. A green run here is evidence the window BEHAVES correctly. It is NOT evidence
// that a phone survives it, and nothing in this file should be quoted as if it were. The
// device claim is unreachable from this sandbox and is marked UNVERIFIED.

const SCROLLER = 'div.overflow-y-auto.overscroll-contain';

/** Live engine preview documents mounted anywhere in the page. */
const liveFrames = (page: Page) => page.evaluate(() => document.querySelectorAll('iframe.live').length);

/** Preview documents MOUNTED in the gallery — in-band plus retained-out-of-band. */
const mounted = (page: Page) =>
	page.evaluate((sel) => {
		const sc = document.querySelectorAll(sel)[0];
		return sc ? sc.querySelectorAll('iframe.live').length : 0;
	}, SCROLLER);

/** Preview documents the user can actually SEE — those intersecting the scroller's own box.
 *  This is the half of the mounted set that is a pure function of the scroll offset, and it
 *  is therefore what the path-independence relations are written against. */
const visible = (page: Page) =>
	page.evaluate((sel) => {
		const sc = document.querySelectorAll(sel)[0] as HTMLElement | undefined;
		if (!sc) return 0;
		const r = sc.getBoundingClientRect();
		let n = 0;
		for (const fr of sc.querySelectorAll('iframe.live')) {
			const b = fr.getBoundingClientRect();
			if (b.bottom > r.top && b.top < r.bottom) n++;
		}
		return n;
	}, SCROLLER);

/**
 * Wait until the preview window has QUIESCED — the mounted count unchanged across several
 * consecutive samples — and return it.
 *
 * Every relation in this file reads a SETTLED state, because the window is asynchronous by
 * construction: the observer's task, the budget sweep and each tile's srcdoc write all land
 * on their own beats. The first cut of this file spent a fixed sleep waiting for that, which
 * is a bet that a loaded box finishes inside a guessed interval — and `check-ownership.js`'s
 * e2e-sleep gate rejected it, correctly: the thing being waited for HAS a signal, and this is
 * it. Polling stability instead is also strictly more robust, since a slow CI box gets more
 * time rather than a flake.
 *
 * Stability, not a target number, deliberately: the count a relation is about is exactly what
 * the test does not know in advance (that is the point of a metamorphic oracle), so the only
 * pollable property is that it has stopped moving.
 */
async function quiesced(page: Page, timeout = 25_000): Promise<number> {
	let last = -1;
	let stable = 0;
	await expect
		.poll(
			async () => {
				const n = await mounted(page);
				stable = n === last ? stable + 1 : 0;
				last = n;
				return stable;
			},
			{ timeout, intervals: [300], message: 'the preview window never stopped changing' },
		)
		.toBeGreaterThanOrEqual(4);
	return last;
}

/** Scroll by a continuous rAF loop — how a human flings a grid, and the only mode that makes
 *  IntersectionObserver coalesce its entries (see gallery-preview-budget.spec.ts's note on
 *  why a stepped scroll cannot see the defect class this guards). */
async function flick(page: Page, down: boolean) {
	await page.evaluate(
		async ([sel, goingDown]) => {
			const el = document.querySelectorAll(sel as string)[0] as HTMLElement;
			if (!el) return;
			await new Promise<void>((done) => {
				const step = () => {
					el.scrollTop += (goingDown ? 1 : -1) * 260;
					const atEnd = goingDown ? el.scrollTop >= el.scrollHeight - el.clientHeight - 1 : el.scrollTop <= 0;
					if (atEnd) done();
					else requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			});
		},
		[SCROLLER, down] as const,
	);
}

/** Let a few animation frames pass in the page. The thing `stepTo` needs between steps is an
 *  idle OBSERVER TASK, which is a frame-count property rather than a wall-clock one — so this
 *  counts frames instead of guessing milliseconds. */
const dwell = (page: Page, frames = 8) =>
	page.evaluate(
		(n) =>
			new Promise<void>((done) => {
				let i = 0;
				const tick = () => (++i >= n ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
		frames,
	);

/** Jump straight to an offset — one assignment, no intermediate frames. */
async function jumpTo(page: Page, top: number) {
	await page.evaluate(
		([sel, y]) => {
			const el = document.querySelectorAll(sel as string)[0] as HTMLElement;
			if (el) el.scrollTop = y as number;
		},
		[SCROLLER, top] as const,
	);
}

/** Walk to an offset in discrete steps, each with an idle window — the mode that gives the
 *  observer a clean task per step, and delivers no coalesced batches at all. */
async function stepTo(page: Page, top: number, stride = 300) {
	for (let y = 0; y <= top; y += stride) {
		await jumpTo(page, y);
		await dwell(page);
	}
	await jumpTo(page, top);
}

/**
 * Tile boxes inside the scroller's viewport that are NOT showing a painted slide — the
 * author-visible symptom, and the only floor worth holding a count against.
 *
 * A count floor like "more than one preview is mounted" is satisfied by a gallery that
 * collapsed to two tiles with five blank boxes on screen, which is the exact shape a
 * retention regression would take. This asks the question that matters instead.
 *
 * NOT zero even when everything is healthy: measured on the built site, a settled gallery
 * carries one unpainted box at 390x844 and at 820x1180 alike — the tile at the edge that is
 * still writing its srcdoc. The callers allow for that; they are guarding against a wall of
 * empty cards, not against one.
 */
const blankVisible = (page: Page) =>
	page.evaluate((sel) => {
		const sc = document.querySelectorAll(sel)[0] as HTMLElement | undefined;
		if (!sc) return { blank: 0, seen: 0 };
		const r = sc.getBoundingClientRect();
		let blank = 0;
		let seen = 0;
		for (const box of sc.querySelectorAll('.aspect-video')) {
			const b = box.getBoundingClientRect();
			if (b.bottom <= r.top || b.top >= r.bottom || b.height < 4) continue;
			seen++;
			const fr = box.matches('iframe.live') ? (box as HTMLIFrameElement) : box.querySelector<HTMLIFrameElement>('iframe.live');
			let painted = false;
			try {
				painted = !!fr?.contentDocument?.querySelector('.lattice, section[data-lattice-slide]');
			} catch {
				painted = false;
			}
			if (!painted) blank++;
		}
		return { blank, seen };
	}, SCROLLER);

/** Preview documents mounted inside an expanded LOOKS PANEL. The panel is the picker's only
 *  `scroll-mt-2` row (SlidePicker's `LooksPanel`), which is what makes it addressable at all —
 *  its look tiles share the grid tiles' `Insert …` aria-label prefix, so a role query cannot
 *  tell the two apart. */
const panelFrames = (page: Page) =>
	page.evaluate(() => {
		const panel = document.querySelector('[class*="scroll-mt-2"]');
		return panel ? panel.querySelectorAll('iframe.live').length : 0;
	});

const scrollHeight = (page: Page) =>
	page.evaluate((sel) => {
		const el = document.querySelectorAll(sel)[0] as HTMLElement | undefined;
		return el ? el.scrollHeight : 0;
	}, SCROLLER);

/** Wait until the first band has actually mounted previews, so a baseline is a real windowed
 *  set rather than zero. */
async function firstBandPainted(page: Page) {
	await expect.poll(() => mounted(page), { timeout: 30_000, message: 'the gallery never mounted a preview' }).toBeGreaterThan(1);
}

// Tolerance for a count comparison. The in-band set is viewport-derived and the observer is
// asynchronous, so two settled reads of the same logical state can differ by a tile or two
// without anything being wrong. Anything larger is the signal.
const SLACK = 4;

/** State two settled counts agree, with both numbers in the message — a bare comparison tells
 *  you a relation failed and nothing about how badly. */
function agree(a: number, b: number, what: string) {
	expect(Math.abs(a - b), `${what}: ${a} vs ${b} (slack ${SLACK})`).toBeLessThanOrEqual(SLACK);
}

test.describe('add-slide gallery — metamorphic relations over the live-preview window', () => {
	test('@crosswidth MR-1 · retention saturates: the second and third traversals add nothing', async ({ page }, testInfo) => {
		test.setTimeout(150_000);
		await gotoStudio(page);
		await openAddSlide(page, testInfo.project.name === 'mobile');
		await firstBandPainted(page);
		await quiesced(page);

		// One traversal is enough to sweep the whole 69-tile catalog past the band, so a window
		// that retains everything is already at its maximum after pass 1. The relation is about
		// what pass 2 and pass 3 do — nothing.
		const afterPass: number[] = [];
		for (let pass = 0; pass < 3; pass++) {
			await flick(page, true);
			await quiesced(page);
			await flick(page, false);
			await jumpTo(page, 0);
			await quiesced(page);
			afterPass.push(await mounted(page));
		}

		// THE RELATION, and it is ONE-SIDED on purpose. Not "the count returns to what it was" —
		// an LRU window promises no such thing, and the first cut of this file failed for
		// asserting it (see the header). What it promises is that the set stops GROWING.
		//
		// Shrinking is not a violation, it is the budget working: the ceiling now follows the
		// in-band set (slide-thumb.tsx `previewBudget`), so when a traversal ends and the band
		// contracts, the ceiling contracts with it and a later sweep trims further. Measured on
		// WebKit at the iPhone 15 Pro profile, passes 1 and 2 settled at 21 then 16 — a window
		// doing MORE of its job, which a symmetric comparison called a regression.
		//
		// Growth is the defect this guards (#1463): a window that accumulates instead of
		// recycling rises pass over pass, and no amount of slack hides three passes of it.
		expect(afterPass[1], `mounted previews GREW between traversal 1 and 2: ${afterPass[0]} → ${afterPass[1]}`).toBeLessThanOrEqual(afterPass[0] + SLACK);
		expect(afterPass[2], `mounted previews GREW between traversal 2 and 3: ${afterPass[1]} → ${afterPass[2]}`).toBeLessThanOrEqual(afterPass[1] + SLACK);
		// And the window is still a WINDOW. A set that shrank to nothing satisfies the one-sided
		// growth checks above perfectly, and — since the comment there licenses shrinking as "the
		// budget working" — a genuine bleed would present as exactly the monotone decline they
		// permit. So the floor is the author-visible symptom rather than a count: after three
		// traversals the tiles on screen are painted, not a wall of empty cards.
		const rest = await blankVisible(page);
		expect(rest.seen, 'no tile box was on screen, so nothing was checked').toBeGreaterThan(1);
		expect(rest.blank, `${rest.blank} of ${rest.seen} tile boxes on screen are blank after three traversals`).toBeLessThanOrEqual(2);
	});

	test('@crosswidth MR-2 · what you can SEE depends on the offset, never on the route', async ({ page }, testInfo) => {
		test.setTimeout(150_000);
		await gotoStudio(page);
		await openAddSlide(page, testInfo.project.name === 'mobile');
		await firstBandPainted(page);

		const h = await scrollHeight(page);
		expect(h, 'the gallery has no scrollable height, so there is no route to vary').toBeGreaterThan(0);
		const target = Math.floor(h * 0.55);

		const reach = async (how: 'jump' | 'step' | 'flick') => {
			await jumpTo(page, 0);
			await quiesced(page);
			if (how === 'jump') await jumpTo(page, target);
			else if (how === 'step') await stepTo(page, target);
			else {
				await flick(page, true);
				await jumpTo(page, target);
			}
			await quiesced(page);
			return visible(page);
		};

		const byJump = await reach('jump');
		const byStep = await reach('step');
		const byFlick = await reach('flick');
		expect(byJump, 'no preview was visible at 55% depth, so nothing was compared').toBeGreaterThan(0);

		// THE RELATION, and note it is over the VISIBLE set, not the mounted one. Which tiles are
		// RETAINED legitimately depends on the route (a flick passes every tile, a jump passes
		// none), so the mounted count is not path-independent and must not be asserted to be.
		// What the user can see is a pure function of the offset — and this is the relation the
		// coalesced-entry bug violates: a flick delivers `[intersecting, not-intersecting]` as
		// one batch where a stepped scroll never does, so a hook reading the wrong entry lands in
		// a different VISIBLE state depending only on how you got there.
		agree(byJump, byStep, 'visible previews at 55% depth, reached by jump vs by stepped scroll');
		agree(byJump, byFlick, 'visible previews at 55% depth, reached by jump vs by flick');
	});

	test('@crosswidth MR-3 · opening and closing the gallery is idempotent', async ({ page }, testInfo) => {
		test.setTimeout(210_000);
		const compact = testInfo.project.name === 'mobile';
		await gotoStudio(page);

		const opened: number[] = [];
		const closed: number[] = [];
		for (let cycle = 0; cycle < 3; cycle++) {
			if (cycle === 0) await openAddSlide(page, compact);
			else await reopen(page, compact);
			await firstBandPainted(page);
			await flick(page, true);
			await quiesced(page);
			opened.push(await mounted(page));

			await page.keyboard.press('Escape');
			await expect.poll(() => mounted(page), { timeout: 20_000, message: 'the gallery did not tear its previews down on close' }).toBe(0);
			await quiesced(page);
			closed.push(await liveFrames(page));
		}

		// THE RELATION, twice over.
		// (a) Closing RELEASES. Every gallery preview is gone; what remains is the Studio's own
		//     preview, which is not ours to count. This is the one that matters most to a user,
		//     because they open this gallery once per slide they add — a per-open residue is the
		//     shape that ends a session in a tab discard.
		for (const [i, n] of closed.entries()) {
			expect(n, `after close #${i + 1} the page still holds ${n} live preview documents`).toBeLessThanOrEqual(2);
		}
		// (b) Opening is the SAME each time. Cycle 3 must look like cycle 1 — a window carrying
		//     state across opens climbs here even when each individual close looks clean.
		agree(opened[0], opened[opened.length - 1], `mounted previews after a full scroll, open #1 vs open #${opened.length}`);
	});

	test('@crosswidth MR-4 · a filter round-trip leaves the gallery where it found it', async ({ page }, testInfo) => {
		test.setTimeout(150_000);
		await gotoStudio(page);
		await openAddSlide(page, testInfo.project.name === 'mobile');
		await firstBandPainted(page);

		// WARM the window before taking a baseline. A just-opened gallery has retained nothing,
		// and every comparison state below has been scrolled — so a cold baseline compares a cold
		// state against a warm one and "fails" on retention working exactly as designed. (That is
		// the mistake this file's first cut made; see the header.) One traversal saturates it.
		await flick(page, true);
		await quiesced(page);
		await flick(page, false);
		await jumpTo(page, 0);
		await quiesced(page);
		const baselineVisible = await visible(page);
		const baselineMounted = await mounted(page);

		const tabs = page.getByRole('tablist', { name: 'Slide categories' });
		const all = tabs.getByRole('tab', { name: 'All' });

		for (const facet of ['Statement', 'Comparison', 'Progression']) {
			const chip = tabs.getByRole('tab', { name: facet });
			if ((await chip.count()) === 0) continue;
			await chip.click();
			await quiesced(page);
			await flick(page, true);
			await quiesced(page);
			await all.click();
			await jumpTo(page, 0);
			await quiesced(page);

			// THE RELATION. A facet round-trip is a no-op on what the gallery shows. The result set
			// changes underneath the mounted tiles here, which is where a tile can be unmounted
			// without its budget slot being released — a leak invisible while you stay in one view.
			// Asserted on the visible set for identity and on the mounted set for saturation: the
			// retained tiles may be DIFFERENT ones after the round-trip, but there must not be more.
			agree(baselineVisible, await visible(page), `visible previews at the top of All, before vs after a ${facet} round-trip`);
			const m = await mounted(page);
			expect(m, `a ${facet} round-trip grew the mounted set from ${baselineMounted} to ${m}`).toBeLessThanOrEqual(baselineMounted + SLACK);
		}

		// The same relation across the SEARCH boundary — the other way the result set changes
		// under the grid, and the condition #1463 was originally reported against.
		const search = page.getByPlaceholder(/Search slides|Search \d+ slides/);
		await search.fill('compare options');
		await quiesced(page);
		await flick(page, true);
		await quiesced(page);
		await search.fill('');
		await jumpTo(page, 0);
		await quiesced(page);
		agree(baselineVisible, await visible(page), 'visible previews at the top of All, before vs after a search round-trip');
		const afterSearch = await mounted(page);
		expect(afterSearch, `a search round-trip grew the mounted set from ${baselineMounted} to ${afterSearch}`).toBeLessThanOrEqual(baselineMounted + SLACK);
	});

	test('@crosswidth MR-5 · a recycled tile renders what it rendered the first time', async ({ page }, testInfo) => {
		test.setTimeout(150_000);
		await gotoStudio(page);
		await openAddSlide(page, testInfo.project.name === 'mobile');
		await firstBandPainted(page);
		await quiesced(page);

		// What each mounted tile IS and whether it actually painted: the component's label, taken
		// from the tile chrome (stable across a recycle), mapped to whether its frame holds a
		// rendered slide — the thing a recycle could silently lose.
		//
		// A MAP, not a list, and that distinction is the whole correctness of this test. A list
		// compared with `toEqual` also asserts how MANY tiles are mounted, which is retention —
		// a different property, owned by MR-1, and one that legitimately differs between a cold
		// first read and a warm second one. Measured at 390x844: 3 tiles mounted before the
		// traversal and 6 after, the first three identical and painted. That is the window
		// working, and a list comparison called it a regression.
		const painted = () =>
			page.evaluate((sel) => {
				const sc = document.querySelectorAll(sel)[0] as HTMLElement | undefined;
				const out: Record<string, boolean> = {};
				if (!sc) return out;
				for (const fr of sc.querySelectorAll('iframe.live')) {
					const frame = fr as HTMLIFrameElement;
					const label = (frame.closest('div')?.textContent || '').trim().slice(0, 40);
					if (!label) continue;
					try {
						out[label] = !!frame.contentDocument?.querySelector('.lattice, section[data-lattice-slide]');
					} catch {
						out[label] = false;
					}
				}
				return out;
			}, SCROLLER);

		const before = await painted();
		const names = Object.keys(before);
		expect(names.length, 'no gallery tile was readable, so nothing was compared').toBeGreaterThan(1);
		expect(
			names.filter((k) => before[k]).length,
			`only ${names.filter((k) => before[k]).length} of ${names.length} first-band tiles painted a slide`,
		).toBeGreaterThan(1);

		// Drive the first band far enough out of the window that the budget reclaims it, then come back.
		await flick(page, true);
		await quiesced(page);
		await flick(page, false);
		await jumpTo(page, 0);
		await quiesced(page);
		const after = await painted();

		// THE RELATION, and the one that makes the other five mean anything. Every count relation
		// above is satisfied perfectly by a window that mounts NOTHING; this one requires each tile
		// that was painted before the round-trip to be mounted and painted after it — same
		// component, still rendering a slide, not a blank frame the counts would happily certify.
		const lost = names.filter((k) => before[k] && after[k] !== true);
		expect(lost, `these tiles were painted before a recycle round-trip and are blank or gone after it: ${lost.join(' · ')}`).toEqual([]);
	});

	test('@crosswidth MR-6 · a looks panel gives its previews back when it closes', async ({ page }, testInfo) => {
		test.setTimeout(150_000);
		await gotoStudio(page);
		await openAddSlide(page, testInfo.project.name === 'mobile');
		await firstBandPainted(page);
		await quiesced(page);

		// Any tile that HAS looks — the toggle's accessible name carries the variant count.
		const toggle = page.getByRole('button', { name: /looks — \d+ variants?/ }).first();
		if ((await toggle.count()) === 0) test.skip(true, 'no component in the first bands exposes variant looks');
		await toggle.scrollIntoViewIfNeeded();
		await quiesced(page);
		const beforeVisible = await visible(page);
		expect(await panelFrames(page), 'a looks panel was already open before the test opened one').toBe(0);

		await toggle.click();
		await quiesced(page);
		const inPanel = await panelFrames(page);

		await toggle.click();
		await quiesced(page);

		// Expanding really does mount previews — otherwise "collapsing returns to baseline" is
		// trivially true and this test guards nothing. Counted INSIDE the panel rather than as a
		// rise in the visible total, because the panel displaces grid tiles as it opens: measured
		// on the desktop dialog, visible previews went 7 → 5 while the panel itself mounted six.
		// A rise in the total is not what expanding a panel does.
		expect(inPanel, 'expanding the looks panel mounted no previews of its own').toBeGreaterThan(0);
		// THE RELATION. A panel's previews belong to the panel: closing it takes them off screen
		// and puts the grid back the way it was. Asserted on the visible set for the reason MR-2
		// gives — the panel's tiles may legitimately stay RETAINED after it closes, but they must
		// stop being shown, and the grid behind must return to the state the panel interrupted.
		expect(await panelFrames(page), 'the looks panel kept previews on screen after it was collapsed').toBe(0);
		agree(beforeVisible, await visible(page), 'visible previews before expanding a looks panel vs after collapsing it');
	});
});

/** Reopen the picker from whatever state the Studio was left in after a close. On a phone the
 *  launcher lives behind the drawer and the drawer is reached from the source pane, so the
 *  fixture's first-open path does not compose with itself. */
async function reopen(page: Page, compact: boolean) {
	const add = page.getByRole('button', { name: 'Add slide', exact: true }).first();
	if (await add.isVisible().catch(() => false)) {
		await add.click();
	} else if (compact) {
		// Each step waits for the control the PREVIOUS one reveals, so the chain is driven by the
		// UI's own signals rather than by three guessed intervals: source pane → drawer → launcher.
		const src = page.getByRole('button', { name: 'Markdown source' });
		if (await src.isVisible().catch(() => false)) await src.click();
		const menu = page.getByRole('button', { name: 'Menu' });
		await menu.waitFor({ state: 'visible' });
		await menu.click();
		const launcher = page.getByRole('button', { name: 'Add slide', exact: true }).first();
		await launcher.waitFor({ state: 'visible' });
		await launcher.click();
	}
	// The gallery is back when its scroller exists; its previews are the caller's business.
	await page.locator(SCROLLER).first().waitFor({ state: 'visible' });
}

// The two relations that exercise the window's asynchronous machinery hardest — retention
// across a traversal, and the open/close cycle a user actually repeats — on the engine a phone
// runs. Deliberately a SUBSET: a WebKit project is expensive here and the other four test the
// same code through the same DOM APIs.
//
// This is NOT a device verification and must not be quoted as one. WebKit-on-Linux has no
// jetsam and no content-process memory ceiling, so it can pass every relation while an iPhone
// still reloads the tab. What it covers is engine-divergent behavior in IntersectionObserver
// delivery and srcdoc teardown, which Chromium cannot stand in for — the reason `webkit-phone`
// exists at all (see playwright.config.ts).
test('@webkit-phone MR-1 + MR-3 hold on the engine a phone actually runs', async ({ page }) => {
	test.setTimeout(210_000);
	await gotoStudio(page);
	await openAddSlide(page, true);
	await firstBandPainted(page);
	await quiesced(page);

	const passes: number[] = [];
	for (let pass = 0; pass < 2; pass++) {
		await flick(page, true);
		await quiesced(page);
		await flick(page, false);
		await jumpTo(page, 0);
		await quiesced(page);
		passes.push(await mounted(page));
	}
	// One-sided, for the reason MR-1 gives above — and this is the surface that proved it
	// necessary: the ceiling follows the band, so a settled count may fall between passes.
	expect(passes[1], `WebKit: mounted previews GREW between traversal 1 and 2: ${passes[0]} → ${passes[1]}`).toBeLessThanOrEqual(passes[0] + SLACK);
	const rest = await blankVisible(page);
	expect(rest.seen, 'WebKit: no tile box was on screen, so nothing was checked').toBeGreaterThan(1);
	expect(rest.blank, `WebKit: ${rest.blank} of ${rest.seen} tile boxes on screen are blank`).toBeLessThanOrEqual(2);

	await page.keyboard.press('Escape');
	await expect.poll(() => mounted(page), { timeout: 20_000, message: 'WebKit: the gallery did not tear its previews down on close' }).toBe(0);
	await quiesced(page);
	const afterClose = await liveFrames(page);
	expect(afterClose, `WebKit: ${afterClose} live preview documents survived closing the gallery`).toBeLessThanOrEqual(2);
});
