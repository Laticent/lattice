import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

/**
 * THE PLAYGROUND — the stress tier.
 *
 * The Studio has two of these (`compose-stress.spec.ts`, `markdown-stress.spec.ts`). This
 * is the third surface and the one with the widest audience: `/playground/` is where a
 * visitor who has never written a line of Markdown lands, and its Explore mode is the only
 * part of Lattice most of them will ever drive. Every `test` below started as a
 * REPRODUCTION found by a randomized metamorphic walk over the real built site, not as a
 * guess about what might break (#2124).
 *
 * WHAT THE WALK FOUND, and it is one defect wearing nine faces. Explore is a filmstrip the
 * reader scrolls freely, with a stepper bolted on that never observed the scroll — so the
 * walk index was WRITE-ONLY. The bar ("6 / 13"), the caption, the Step dropdown and the
 * `?s=` URL were all set by a step and never corrected, which made every one of them lie
 * the moment the reader used any input the stepper did not own:
 *
 *   - a wheel or a finger scrolled the deck and moved none of them, so Next then scrolled
 *     the reader BACKWARDS — the primary control fighting the primary gesture;
 *   - the position was landed during the in-iframe FIT window and thrown away when FIT
 *     rescaled the deck, so every shared `?s=` link, every reload and every
 *     Explore→Edit→Explore opened on the title slide while naming a different one;
 *   - a resize re-scaled the deck under a scroll measured against the old geometry;
 *   - and clicking the slide moved focus into the <iframe>, after which the parent's
 *     keydown listener never saw another key and the arrows were simply dead.
 *
 * WHY NOTHING CAUGHT IT. `playground-explore.spec.ts` covers this surface and passes
 * throughout: it asserts the walk bar's text, the Step dropdown's label and the URL — i.e.
 * exactly the three readouts that were lying. A test written against the chrome cannot see
 * the chrome disagree with the deck. So the invariant this file adds is the one that was
 * missing: **derive the slide on screen from the frame's own geometry and hold the chrome
 * to it.** `visibleFractions` below is a deliberate second implementation of that
 * geometry — an independent oracle, not a re-run of the code under test.
 *
 * TAGS. The three input verbs carry `@parity`, so they run in both pointer states at all
 * three widths (the input-verb-parity rule is per-breakpoint, and the swipe cell only
 * exists on the touch projects). The rest are functional oracles and run on `desktop`.
 */

/** A component with a long, stable plan — 13 slides, so a walk has somewhere to go. */
const DECK = 'kpi';

/** Open Explore on `DECK` and wait for the deck to be on screen and settled. */
async function gotoExplore(page: Page, query = `?c=${DECK}&view=read`) {
	await page.goto(`/playground/${query}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText('/');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await settle(page);
}

/**
 * Wait for the surface to STOP MOVING, rather than for a guessed interval.
 *
 * The signal is the pair this file is about: the index the walk bar claims and the frame's
 * scroll offset. Both are still moving during a smooth `scrollTo`, a fresh srcdoc write and
 * the render loop's land-and-settle poll, and both are stable the moment none of those is
 * in flight — so two identical consecutive reads is the honest "it has landed", and it
 * costs a few milliseconds on a fast box instead of a fixed 900.
 */
async function settle(page: Page, timeout = 10_000) {
	const read = () =>
		page.evaluate(() => {
			const f = document.getElementById('preview') as HTMLIFrameElement | null;
			let sy = -1;
			let h = -1;
			let vis = '-';
			try {
				const win = f?.contentWindow;
				const doc = f?.contentDocument;
				const sec = doc?.querySelector('.lattice > section');
				sy = win?.scrollY ?? -1;
				h = sec ? Math.round(sec.getBoundingClientRect().height) : -1;
				// THE FIT WINDOW. A fresh deck is written unscaled and `.lattice` stays hidden
				// until the in-iframe fit agent has scaled it — a state in which the position,
				// the scroll and the slide count are all perfectly stable and none of the
				// geometry is final. Reading it is what made a gallery load look like a deck
				// rendered at 3x; including both here is what stops this helper returning inside it.
				vis = sec && win ? win.getComputedStyle(sec.parentElement as Element).visibility : '-';
			} catch {
				/* mid-navigation */
			}
			const pos = document.querySelector('#pg-walk .pg-walk-pos')?.textContent?.trim();
			return `${pos}|${Math.round(sy)}|${h}|${vis}`;
		});
	let last = '';
	let quiet = 0;
	// `expect.poll` rather than a loop around `waitForTimeout`: the repo's sleep gate is
	// syntactic and it is right to be — a poll interval and a guessed wait look identical in
	// a diff. This throws if the surface never settles, which is itself a defect worth failing.
	await expect
		.poll(
			async () => {
				const now = await read();
				quiet = now === last ? quiet + 1 : 0;
				last = now;
				return quiet;
			},
			{ message: 'the Playground never stopped moving', timeout, intervals: [80] },
		)
		.toBeGreaterThanOrEqual(2);
}

/**
 * THE ORACLE: how much of each slide a human can actually see, read from the frame's real
 * geometry. `visible[i]` is the fraction of slide i+1's own height inside the preview
 * viewport, 0..1.
 *
 * HEIGHT COMES FROM `getBoundingClientRect()`, deliberately. The in-iframe FIT agent gives
 * every section a fixed 720px layout box and scales it with a transform, so `offsetHeight`
 * reads 720 on a phone where the slide is 179px tall — an oracle built on it overstates
 * every slide by 4x and reports nonsense at exactly the narrow widths that matter. This is
 * a deliberate SECOND implementation of what `readingSlideIndex` ships, not a re-run of it.
 */
async function visibleFractions(page: Page): Promise<{ ofItself: number; ofPane: number }[]> {
	return page.evaluate(() => {
		const f = document.getElementById('preview') as HTMLIFrameElement | null;
		const win = f?.contentWindow;
		const secs = f?.contentDocument?.querySelectorAll<HTMLElement>('.lattice > section');
		if (!win || !secs?.length) return [];
		const top = win.scrollY;
		const pane = win.innerHeight;
		const bottom = top + pane;
		return Array.from(secs, (el) => {
			const h = el.getBoundingClientRect().height;
			if (h <= 0 || pane <= 0) return { ofItself: 0, ofPane: 0 };
			const seen = Math.max(0, Math.min(bottom, el.offsetTop + h) - Math.max(top, el.offsetTop));
			return { ofItself: seen / h, ofPane: seen / pane };
		});
	});
}

/** The slide filling most of the pane, 1-based; 0 when the frame has no deck yet. */
async function dominantSlide(page: Page): Promise<number> {
	const v = await visibleFractions(page);
	if (!v.length) return 0;
	let best = 0;
	for (let i = 1; i < v.length; i++) if (v[i].ofPane > v[best].ofPane) best = i;
	return best + 1;
}

/** The index the walk bar CLAIMS, and the total. */
async function claimed(page: Page): Promise<{ index: number; count: number }> {
	const text = ((await page.locator('#pg-walk .pg-walk-pos').textContent()) ?? '').trim();
	const m = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
	return { index: m ? Number(m[1]) : 0, count: m ? Number(m[2]) : 0 };
}

/**
 * THE INVARIANT, and it is deliberately not "the index equals the dominant slide".
 *
 * At 390x844 this deck lays out THREE slides to a pane, so which one the reader "is on" is
 * genuinely ambiguous and any of the three is a defensible answer — while the defect this
 * file exists for was never ambiguous at all: the bar said "1 / 13" with slide 7 filling
 * the screen and slide 1 nowhere. So the thing to hold is **the chrome never names a slide
 * the reader cannot see**, which is false for every one of the nine defects and true at
 * every width for a correct surface.
 *
 * Both readings are taken INSIDE the poll. Taking one of them once and polling the other
 * locks in whatever value the transition happened to be passing through — which is how the
 * first draft of this helper reported a cross-component PageUp as broken while the surface
 * was in fact correct a frame later.
 */
async function expectPositionIsTruthful(page: Page, note: string) {
	await expect
		.poll(
			async () => {
				const { index } = await claimed(page);
				const seen = await visibleFractions(page);
				if (!seen.length) return 'no deck on screen';
				const s = seen[index - 1];
				if (!s) return `walk bar says slide ${index}, which is not in the deck`;
				// EITHER measure passes, because a slide can fail one honestly. A slide TALLER
				// than the pane can only ever show a fraction of itself even while it is the
				// only thing on screen; a slide SHORTER than the pane can be wholly visible and
				// still be a small part of it. What both exclude is the case this file is
				// about — a named slide that is nowhere.
				//
				// THE PANE BAR IS A QUARTER, not a half, and that is not slack: the shipped
				// rule deliberately KEEPS the reader's current slide while it is at least half
				// as visible as the winner, so that the counter does not twitch under a nudge
				// of the wheel and does not fight the stepper where a phone shows three slides
				// to a pane. A flick that rests halfway between two slides therefore names one
				// of them at ~40% of the pane, correctly. Every defect this file was written
				// for measured 0%.
				const ok = s.ofItself > 0.5 || s.ofPane > 0.25;
				return ok
					? 'on screen'
					: `walk bar says slide ${index} — ${(s.ofItself * 100).toFixed(0)}% of it visible, ${(s.ofPane * 100).toFixed(0)}% of the pane`;
			},
			{ message: `the walk bar names a slide the reader cannot see after ${note}`, timeout: 6_000 },
		)
		.toBe('on screen');
}

async function wheelOverPreview(page: Page, dy: number) {
	await page.locator('#preview').hover();
	await page.mouse.wheel(0, dy);
	await settle(page);
}

/** A genuine CDP touch drag over the preview — not a synthesized event. */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
	for (let i = 1; i <= 12; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }],
		});
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
	await settle(page);
}

const nextSlide = (page: Page) => page.locator('.pg-walk-step.next');
const prevSlide = (page: Page) => page.locator('.pg-walk-step').first();

// ── The defects the walk found, one test each ──────────────────────────────────

test('a wheel scroll moves the walk position with it', async ({ page }) => {
	await gotoExplore(page);
	expect(await claimed(page)).toEqual({ index: 1, count: 13 });
	await wheelOverPreview(page, 3600);
	const on = await dominantSlide(page);
	expect(on).toBeGreaterThan(3); // the wheel really did travel
	await expectPositionIsTruthful(page, 'a wheel scroll');
	// …and the caption is the scrolled-to slide's, not the one left behind.
	await expect(page.locator('#pg-walk .pg-walk-caption')).not.toHaveText('Executive KPI system — one base, five layout modifiers.');
});

test('Next after a free scroll goes FORWARD, never back to where the stepper left off', async ({ page }) => {
	await gotoExplore(page);
	await wheelOverPreview(page, 3600);
	const before = await dominantSlide(page);
	await nextSlide(page).click();
	await settle(page);
	const after = await dominantSlide(page);
	// The reported symptom: scroll to slide 7, press Next, land on slide 2.
	expect(after, 'Next scrolled the reader backwards').toBeGreaterThan(before);
	expect(after).toBe(before + 1);
	await expectPositionIsTruthful(page, 'Next after a scroll');
});

test('a shared ?s= deep link opens ON the slide it names', async ({ page }) => {
	await gotoExplore(page, `?c=${DECK}&view=read&s=variant%3Atrajectory`);
	const { index } = await claimed(page);
	expect(index).toBe(6);
	await expect.poll(() => dominantSlide(page), { timeout: 8_000 }).toBe(6);
	await expect(page.locator('#pg-step')).toContainText('trajectory');
});

test('a reload keeps the reader on the slide they were on', async ({ page }) => {
	await gotoExplore(page);
	for (let i = 0; i < 4; i++) await nextSlide(page).click();
	await settle(page);
	expect(await dominantSlide(page)).toBe(5);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await expect.poll(() => dominantSlide(page), { timeout: 8_000 }).toBe(5);
	await expectPositionIsTruthful(page, 'a reload');
});

test('Explore → Edit → Explore comes back to the same slide', async ({ page }) => {
	await gotoExplore(page);
	for (let i = 0; i < 5; i++) await nextSlide(page).click();
	await settle(page);
	expect(await dominantSlide(page)).toBe(6);
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await settle(page);
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect.poll(() => dominantSlide(page), { timeout: 8_000 }).toBe(6);
	await expectPositionIsTruthful(page, 'an Edit round trip');
});

test('a pane resize keeps the reader on their slide', async ({ page }) => {
	await gotoExplore(page);
	for (let i = 0; i < 3; i++) await nextSlide(page).click();
	await settle(page);
	expect(await dominantSlide(page)).toBe(4);
	await page.setViewportSize({ width: 980, height: 720 });
	await expect.poll(() => dominantSlide(page), { timeout: 8_000 }).toBe(4);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(() => dominantSlide(page), { timeout: 8_000 }).toBe(4);
	await expectPositionIsTruthful(page, 'a resize');
});

// ── The three input verbs (engineering/decisions/2026-08-10-input-verb-parity.md) ──

test('@parity the arrow keys still turn the deck after the reader clicks the slide', async ({ page }) => {
	await gotoExplore(page);
	await page.keyboard.press('ArrowRight');
	await settle(page);
	expect((await claimed(page)).index).toBe(2);
	// Clicking the deck moves focus INTO the same-origin iframe. Before the fix the
	// parent's window listener stopped seeing keys here and the arrows died for good.
	await page.locator('#preview').click(); // centered — 390px wide on the phone project
	// The point of the click is that focus is now INSIDE the iframe. Wait for that, not for
	// a guessed interval — it is also the precondition the rest of this test depends on.
	await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('preview');
	await page.keyboard.press('ArrowRight');
	await settle(page);
	expect((await claimed(page)).index, 'arrows died once focus was inside the frame').toBe(3);
	await page.keyboard.press('ArrowLeft');
	await settle(page);
	expect((await claimed(page)).index).toBe(2);
	await expectPositionIsTruthful(page, 'arrow keys inside the frame');
});

test('@parity PageDown / PageUp / Home / End come from the shared keymap', async ({ page }) => {
	await gotoExplore(page);
	// A presentation clicker emits PageDown/PageUp; the hand-written two-key map had neither.
	await page.keyboard.press('PageDown');
	await settle(page);
	expect((await claimed(page)).index).toBe(2);
	await page.keyboard.press('End');
	await settle(page);
	expect((await claimed(page)).index).toBe(13);
	// NOT `dominantSlide === 13`. At 390 and 820 this deck lays out three slides to a pane
	// and the filmstrip clamps before the last one reaches the top, so slides 11, 12 and 13
	// are all fully on screen and the "dominant" one is the lowest of them. End put the
	// reader at the end of the deck; the invariant is that the deck's end is what they see.
	await expectPositionIsTruthful(page, 'End');
	await page.keyboard.press('Home');
	await settle(page);
	expect((await claimed(page)).index).toBe(1);
	await expectPositionIsTruthful(page, 'Home');
	// Off the FRONT of a plan the walk crosses into the previous component's closing
	// slide — the continuous read the Prev button already offers, now reachable from the
	// keyboard too. Asserted rather than assumed, because "PageUp did nothing" and "PageUp
	// crossed a component" look identical from the index alone.
	await page.keyboard.press('PageUp');
	await expect.poll(async () => (await page.locator('#pg-template-trigger').textContent())?.trim(), { timeout: 8_000 }).not.toBe(DECK);
	await expectPositionIsTruthful(page, 'PageUp across a component boundary');
});

test('@parity a horizontal swipe turns the slide; a vertical one scrolls the filmstrip', async ({ page, browserName }, testInfo) => {
	test.skip(!testInfo.project.use.hasTouch, 'a swipe needs a touchscreen project');
	await gotoExplore(page);
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('no preview box');
	const midY = box.y + box.height / 2;
	const right = box.x + box.width * 0.8;
	const left = box.x + box.width * 0.2;
	await swipe(page, { x: right, y: midY }, { x: left, y: midY });
	expect((await claimed(page)).index, 'a left swipe did not advance the deck').toBe(2);
	await swipe(page, { x: left, y: midY }, { x: right, y: midY });
	expect((await claimed(page)).index).toBe(1);
	// A vertical drag is a scroll, not a step — and the counter follows it honestly.
	await swipe(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.8 }, { x: box.x + box.width / 2, y: box.y + box.height * 0.15 });
	await expectPositionIsTruthful(page, 'a vertical swipe');
	expect(browserName).toBeTruthy();
});

test('clicking the tab you are already on does not destroy the deck', async ({ page }) => {
	// Both branches of `setViewMode` copy one source over the other, so re-entering a mode
	// overwrites work. The Explore tab replaced the 13-slide walk deck with the editor's
	// untouched one-slide draft while the bar went on reading "3 / 13"; the Edit tab is the
	// mirror image, replacing the author's draft with the explore deck.
	await gotoExplore(page);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await settle(page);
	const before = await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement | null)?.contentDocument?.querySelectorAll('.lattice > section').length ?? 0);
	expect(before).toBe(13);
	await page.getByRole('tab', { name: 'Explore' }).click();
	await settle(page);
	expect(
		await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement | null)?.contentDocument?.querySelectorAll('.lattice > section').length ?? 0),
		'the deck was replaced by re-entering the mode it was already in',
	).toBe(before);
	expect((await claimed(page)).index).toBe(3);
	await expectPositionIsTruthful(page, 're-entering Explore');

	// …and the same on the Edit side: the draft the author is holding survives.
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await settle(page);
	const draft = await page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
	await page.getByRole('tab', { name: 'Edit' }).click();
	await settle(page);
	expect(await page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '')).toBe(draft);
});

test('a wheel during the post-render landing is obeyed, not swallowed or undone', async ({ page }) => {
	// The observer is gated shut while `landWalk` places a freshly rendered deck. A reader
	// who scrolls inside that window used to be either ignored — the bar held "1 / 22" at a
	// scroll of 3033px — or scrolled back to where the render wanted them.
	await gotoExplore(page);
	// A resize re-fits and re-lands; wheel immediately, before that can finish.
	await page.setViewportSize({ width: 1000, height: 780 });
	await page.locator('#preview').hover();
	await page.mouse.wheel(0, 2600);
	await settle(page);
	const on = await dominantSlide(page);
	expect(on, 'the wheel was undone by the landing').toBeGreaterThan(2);
	await expectPositionIsTruthful(page, 'a wheel during the landing');
});

test('editing the deck in Edit re-points the walk instead of counting slides that are gone', async ({ page }) => {
	// Explore renders whatever the editor holds, but the WALK was a component plan and
	// stayed one — so picking a component in Edit (which loads its one-slide sample) left
	// the bar reading "1 / 13" over a single slide, Next stepping to a slide that did not
	// exist, and `?c=kpi` naming a deck nobody was looking at.
	await gotoExplore(page);
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await settle(page);
	await page.locator('#pg-template-trigger').click();
	await page.keyboard.type('funnel');
	await page.locator('[cmdk-item]').first().click();
	await settle(page);

	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await settle(page);
	const slides = await page.evaluate(
		() => (document.getElementById('preview') as HTMLIFrameElement | null)?.contentDocument?.querySelectorAll('.lattice > section').length ?? 0,
	);
	expect(slides).toBeGreaterThan(0);
	expect((await claimed(page)).count, 'the bar counted the old plan, not the deck on screen').toBe(slides);
	await expectPositionIsTruthful(page, 'entering Explore over an edited deck');
	// The URL must not go on naming a component this deck is not.
	await expect(page).not.toHaveURL(/c=kpi/);
	// Next cannot step past the end of a deck it is actually counting. It DISABLES at the
	// end of a `deck` walk (there is no adjacent component to cross into), so the loop stops
	// on that rather than waiting on a control that will never be clickable.
	for (let i = 0; i < slides + 3; i++) {
		if (await nextSlide(page).isDisabled()) break;
		await nextSlide(page).click({ timeout: 4_000 });
		await settle(page);
	}
	const { index, count } = await claimed(page);
	expect(index).toBeLessThanOrEqual(count);
	await expectPositionIsTruthful(page, 'stepping to the end of an edited deck');
});

test('a step taken while a fresh deck is still being fit lands on the slide it asked for', async ({ page }) => {
	// The in-iframe fit agent rescales a newly written deck a few hundred ms after it is
	// parsed — measured on this gallery, sections go from 2160px tall to 652. A step taken
	// in that window used to aim at the OLD geometry and land two slides past its target
	// with the bar still reading "1 / 58", and nothing would ever correct it: the document
	// did not clamp the scroll, so no scroll event fired.
	await gotoExplore(page);
	await page.locator('#pg-galleries-trigger').click();
	await page.getByRole('button', { name: /Jargon/ }).click();
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText('/');
	// Deliberately WITHOUT settling: the point is to step inside the fit window.
	await page.keyboard.press('PageDown');
	await settle(page);
	expect((await claimed(page)).index, 'the step was lost or overshot during the fit').toBe(2);
	await expectPositionIsTruthful(page, 'a step during a fresh deck fit');
	await page.keyboard.press('PageDown');
	await settle(page);
	expect((await claimed(page)).index).toBe(3);
	await expectPositionIsTruthful(page, 'a second step after the fit');
});

// ── Selecting ──────────────────────────────────────────────────────────────────

test('the component picker opens ON the current component, and Enter does not replace the deck', async ({ page }) => {
	await gotoExplore(page, '?c=wifi&view=read');
	await expect(page.locator('#pg-template-trigger')).toHaveText('wifi');
	await page.locator('#pg-template-trigger').click();
	const highlighted = page.locator('[cmdk-item][data-selected="true"]');
	await expect(highlighted).toHaveText(/wifi/);
	// …and it is on screen, not 2376px down a 69-row list.
	await expect(highlighted).toBeInViewport();
	// The destructive case: Enter to dismiss used to pick whatever sorted first.
	await page.keyboard.press('Enter');
	// The popover closing is the observable end of the interaction; a pick would have gone
	// through the same close, so this cannot pass by being too early.
	await expect(page.locator('[cmdk-list]')).toHaveCount(0);
	await expect(page.locator('#pg-template-trigger')).toHaveText('wifi');
	await settle(page);
	await expect(page.locator('#pg-template-trigger')).toHaveText('wifi');
});

test('typing a query moves the highlight to the top hit, so Enter picks what you searched for', async ({ page }) => {
	await gotoExplore(page, '?c=wifi&view=read');
	await page.locator('#pg-template-trigger').click();
	await page.keyboard.type('table');
	await expect(page.locator('[cmdk-item][data-selected="true"]')).toHaveText(/compare-table/);
	await page.keyboard.press('Enter');
	await expect(page.locator('#pg-template-trigger')).toHaveText('compare-table');
});

test('the status line stops claiming the editor is collapsed once it is not', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content')).toBeVisible();
	await expect(page.locator('.pg-status')).toContainText('Rendered');
	await page.getByRole('button', { name: 'Collapse editor' }).click();
	await expect(page.locator('.pg-status')).toContainText('Editor collapsed');
	await page.getByRole('button', { name: 'Expand editor' }).click();
	// The editor side renders nothing on expand, so the line used to sit there being wrong.
	await expect(page.locator('.pg-status')).toContainText('Rendered');
});

// ── The randomized walk itself ─────────────────────────────────────────────────

/** Deterministic PRNG: a fuzz failure has to be replayable from its seed alone. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

test('structural invariants hold across a randomized walk', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console: ${m.text()}`);
	});
	await gotoExplore(page);

	/** The chrome's own geometry — a band that changes height mid-read IS the jank. */
	const chrome = async () =>
		page.evaluate(() => {
			const h = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? -1);
			return { bar: h('.pg-bar'), walk: h('#pg-walk') };
		});
	const baseline = await chrome();

	const ops: Array<[string, () => Promise<void>]> = [
		['next', async () => void (await nextSlide(page).click())],
		['prev', async () => void (await prevSlide(page).click())],
		['key next', async () => void (await page.keyboard.press('ArrowRight'))],
		['key prev', async () => void (await page.keyboard.press('ArrowLeft'))],
		['key end', async () => void (await page.keyboard.press('End'))],
		['key home', async () => void (await page.keyboard.press('Home'))],
		['wheel down', () => wheelOverPreview(page, 1400)],
		['wheel up', () => wheelOverPreview(page, -900)],
		['click the deck', async () => void (await page.locator('#preview').click())],
		[
			'jump via the step list',
			async () => {
				// DECLINES TO ACT when focus mode has hidden the toolbar, or the plan has not
				// landed yet. A walk op that cannot run is not a failure — the invariants below
				// still have to hold — and asserting the click would only ever re-report the
				// state the previous op left, not a defect in this one.
				const step = page.locator('#pg-step');
				if (!(await step.isVisible()) || (await step.isDisabled())) return;
				await step.click();
				const opts = page.getByRole('option');
				const n = await opts.count();
				if (n) await opts.nth(n - 1).click();
				else await page.keyboard.press('Escape');
			},
		],
		[
			'round trip through Edit',
			async () => {
				await page.getByRole('tab', { name: 'Edit' }).click();
				await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
				await page.getByRole('tab', { name: 'Explore' }).click();
			},
		],
		['focus mode', async () => void (await page.getByRole('button', { name: 'Focus' }).click().catch(() => {}))],
		['leave focus mode', async () => void (await page.locator('.pg-focus-restore').click().catch(() => {}))],
	];

	const next = rng(0x5eed);
	const trail: string[] = [];
	for (let step = 0; step < 24; step++) {
		const [name, run] = ops[Math.floor(next() * ops.length)];
		trail.push(name);
		await run();
		await settle(page);
		const where = `step ${step + 1} (${name}); trail: ${trail.join(' → ')}`;

		// 1. The chrome names the slide on screen.
		await expectPositionIsTruthful(page, where);
		// 2. The position is inside the deck.
		const { index, count } = await claimed(page);
		expect(count, where).toBeGreaterThan(0);
		expect(index, where).toBeGreaterThanOrEqual(1);
		expect(index, where).toBeLessThanOrEqual(count);
		// 3. Nothing threw.
		expect(errors, where).toEqual([]);
		// 4. The chrome's bands never change height — a toolbar or walk bar that grows
		//    mid-read shoves the deck, which is the jank #1588 fixed for the walk bar's
		//    arrival and which no test held to afterwards. Focus mode hides the toolbar
		//    by design, so that band is only held while it is on screen.
		const now = await chrome();
		expect(now.walk, where).toBe(baseline.walk);
		// Focus mode HIDES the toolbar on purpose, which reads here as height 0. Hold the
		// band only while it is on screen — a bar that is present must not have changed size.
		if (now.bar > 0) expect(now.bar, where).toBe(baseline.bar);
	}
});
