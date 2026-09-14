import { expect, gotoStudio, readStorage, test, toastText } from './studio-fixture';

// The PHONE-NATIVE "Watch demo" walkthrough (@mobile — 390px single-pane project).
// The desktop demo choreographs a cursor across the side-by-side editor+preview; a
// phone has ONE pane, so this storyboard alternates: tap Edit → type a slide → tap
// Preview → reveal, per slide. The load-bearing risk is that the mobile pane is
// conditionally rendered — the editor UNMOUNTS on Preview and REMOUNTS on the swap
// back — so the real oracle is end-to-end: the four-slide phone deck must land in the
// persisted "My First Deck" IN ORDER, with no slide dropped or duplicated by a
// remount race. If per-slide alternation + typeTail-across-remount works, the source
// is exactly four `_class` slides ending in `closing`.
//
// Mechanics (mount/unmount, typing, pane-swap, render) are NOT iOS-specific, so this
// 390px Chromium run is valid verification of them (HARD RULE #23). What it can NOT
// stand in for — real touch, iOS sheet behavior, the nested transform-scaled iframe —
// is owed on a real iPhone and tracked in the decision doc.

test.describe.configure({ timeout: 180_000 });

const STAGE = '.vetrina-stage';
const FIRST_DECK = 'My First Deck';

/** The persisted source of the demo-built "My First Deck" (empty until it's typed). We
 *  read THIS deck's src key specifically (not the first `src-*` key) so the seeded deck
 *  can't masquerade as the result. Autosave debounces ~400ms — read via expect.poll. */
async function firstDeckSource(page: import('@playwright/test').Page): Promise<string> {
	const idxRaw = await readStorage(page, 'lattice-studio-deck-index');
	if (!idxRaw) return '';
	let id = '';
	try {
		const d = (JSON.parse(idxRaw) as { id: string; title?: string }[]).find((x) => x.title === FIRST_DECK);
		id = d?.id ?? '';
	} catch {
		return '';
	}
	if (!id) return '';
	return (await readStorage(page, `lattice-studio-src-${id}`)) ?? '';
}

/** The `_class` slide count in a source string (one per slide). */
const slideClasses = (src: string) => (src.match(/<!--\s*_class:/g) ?? []).length;

/** Launch a tour from the persistent phone entry — "Menu" opens the StudioDrawer
 *  (2026-07-26-studio-mobile-eight-cell-bar.md; a bottom Sheet, replacing the old inlined "···"
 *  DropdownMenu). As of the "Two Doors" rebuild the tour cards no longer sit on the drawer's
 *  index: they live one level in, behind the "Show me" DOOR, which pushes a second level into
 *  the SAME sheet. So the phone path to a tour is three taps, and this helper walks all three
 *  — which is also the point of asserting it here: the drawer is the ONLY mobile entry to a
 *  guided tour (`StudioShell.tsx`'s tour menu is gated `!mobile`), and there is no first-run
 *  banner any more (the posture dial replaced it). Defaults to the full walkthrough (4 slides:
 *  title · big-number · radar · close). */
async function startMobileDemo(page: import('@playwright/test').Page, tourId = 'walkthrough'): Promise<void> {
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Show me' }).click();
	await page.locator(`[data-tour="${tourId}"]`).first().click();
}

test('@mobile the phone demo types the 4-slide deck across pane-swaps and completes', async ({ page }) => {
	await gotoStudio(page);
	await startMobileDemo(page);

	// The stage mounts over the single pane.
	await expect(page.locator(STAGE)).toBeVisible();

	// It alternates Edit⇄Preview, typing each slide; the built "My First Deck" grows to
	// the FULL four-slide phone deck — title → big-number → radar → closing, in order —
	// proving typeTail survived every editor unmount/remount.
	await expect.poll(() => firstDeckSource(page), { timeout: 90_000 }).toContain('_class: closing');
	const src = await firstDeckSource(page);
	expect(slideClasses(src)).toBe(4); // no slide dropped, none duplicated by a remount race
	expect(src.indexOf('_class: title')).toBeLessThan(src.indexOf('_class: big-number'));
	expect(src.indexOf('_class: big-number')).toBeLessThan(src.indexOf('_class: radar'));
	expect(src.indexOf('_class: radar')).toBeLessThan(src.indexOf('_class: closing'));

	// It completes on its own: the stage detaches and the deck is LEFT BEHIND.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 120_000 });
	// The completion toast NAMES NO DECK — the shared `use-studio-demo` toast reads
	// "Demo complete — the deck is yours to edit." A deck is titled by its first heading
	// since #1248, so by the end this one is called whatever the tour typed, not
	// "My First Deck". The desktop sibling (demo.spec.ts) was updated for that and this
	// one was not. FIRST_DECK survives below: the stable creation LABEL in the index is
	// still that, which is what firstDeckSource keys on.
	await expect(toastText(page)).toContainText('yours to edit');
	// Still a single "My First Deck" (deduped fixture — a re-run never doubles it).
	expect(await firstDeckSource(page)).toContain('_class: closing');
});

test('@mobile under prefers-reduced-motion the demo still TYPES the full deck (legible tier, not a collapse)', async ({ page }) => {
	// The reduced-motion regression this guards: a reduced-motion device used to collapse the
	// whole run to instant placement, so the iPhone demo raced past unwatchably. Vetrina now
	// resolves reduced-motion to the `legible` tier — vestibular motion off, but the typing
	// reveal KEPT. Force the OS preference and prove the run still builds the four-slide deck
	// in order and completes (it neither no-ops nor hangs under reduce). The char-by-char
	// cadence itself is unit-covered (motion.test.ts: system+reduce → still=false); this is the
	// real-surface guard that the end-to-end run survives the preference. (Chromium exercises
	// the media query + flag wiring; iOS Safari specifics remain owed on-device per the doc.)
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await gotoStudio(page);
	await startMobileDemo(page);

	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckSource(page), { timeout: 90_000 }).toContain('_class: closing');
	const src = await firstDeckSource(page);
	expect(slideClasses(src)).toBe(4);
	expect(src.indexOf('_class: title')).toBeLessThan(src.indexOf('_class: big-number'));
	expect(src.indexOf('_class: radar')).toBeLessThan(src.indexOf('_class: closing'));
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 120_000 });
});

test('@mobile a real tap mid-run takes over — stage detaches, the deck is kept', async ({ page }) => {
	await gotoStudio(page);
	await startMobileDemo(page);
	await expect(page.locator(STAGE)).toBeVisible();

	// Let it type real content, then the viewer taps a real control (the deck switcher in
	// the top bar — always present, not demo chrome). The only real input during a run is
	// the viewer's, so this unambiguously means "take over". Poll for TYPED text ("Q4 Board
	// Update"), not `_class: title` — the fresh deck's seed template carries a `_class: title`
	// too, so that marker would race the blank-then-type and fire before real content lands.
	await expect.poll(() => firstDeckSource(page), { timeout: 60_000 }).toContain('Q4 Board Update');
	await page.locator('[data-demo="deck-switcher"]').click({ force: true });

	// The stage tears down and what was typed is left behind (not restored to a prior deck).
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 15_000 });
	expect(await firstDeckSource(page)).toContain('Q4 Board Update');
	// The launch affordance is back.
	await page.keyboard.press('Escape'); // close the deck menu the tap opened
	await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
});

// ── Does the editor FOLLOW what the demo types? ────────────────────────────────────────────
//
// The phone types through the CONTROLLED `setSource` path — a native insert races the React
// `value` prop and drops characters (the first test above is what pins that) — and a controlled
// replace moves no caret, so CodeMirror has nothing to scroll to. `use-studio-demo`'s
// `followEditor` is the compensation, and until this spec existed nothing checked it.
//
// WHAT THIS DOES AND DOES NOT CLAIM. It is not a reproduction of a broken follow: measured across
// the whole tour, the OLD implementation (`scrollTop = scrollHeight` on a selector-found
// `.cm-scroller`) and the current one (CodeMirror's own `revealTail`) score the SAME worst gap on
// both engines reachable here — 0px on Chromium at 390px, 53px on real WebKit at an iPhone box.
// So this is the coverage that was missing, not a red arm turned green, and the fragility the
// change removes (a guessed scroller, and an extent CodeMirror may not have measured yet) is
// structural rather than something either engine shows us today.
//
// THE ORACLE IS CODEMIRROR'S OWN GEOMETRY, for a reason this file's other cases do not need. The
// question "is the end of the document visible" has two parts we must not answer ourselves: WHICH
// element scrolls (`view.scrollDOM`, not our guess at `.cm-scroller`) and WHERE a document
// position is on screen (`coordsAtPos`, which answers null when the position is not even
// rendered — the strongest form of "not following"). Sampling a scrollTop would not distinguish a
// view that follows from one that scrolled once and clamped short.
//
// AND IT IS MEASURED AGAINST THE *VISIBLE* BOX, WHICH IS NOT THE SCROLLER'S BOX. This is the
// correction that made the case able to fail at all, and the reason the numbers in the decision
// record's table were identical before and after the change that table was measuring. The
// sampler compared the tail to `scrollDOM.getBoundingClientRect().bottom` — "is the tail inside
// the editor" — while the thing being reported was "I cannot see what it is typing". Those come
// apart exactly here: a running tour paints its caption OVER the bottom of the editor, from a
// body-portalled fixed layer at z-index 2147482000 that nothing in the host's layout can see. On
// a phone that caption is `scrim`, a 230px gradient reaching 90% opacity at the bottom edge — and
// `revealTail` was landing the tail flush with that edge. Measured with the old reveal: the tail
// sat 115px inside the gradient on Chromium at 390x844 and 225px inside it on real WebKit at an
// iPhone 15 Pro box, while this sampler scored both 0px. So the visible bottom is the scroller's
// bottom OR the top of the tour's chrome, whichever is higher — `--vt-chrome-bottom`, which
// Vetrina publishes for exactly this (docs/src/lib/vetrina/README.md § "The caption is an
// occluder"). Off a tour the property is absent and this is byte-identical to the old oracle.
//
// IT SAMPLES ONLY WHILE THE DOCUMENT IS GROWING, and that gate is load-bearing rather than
// cautious. An editor showing a document taller than its pane, parked at the top, is the CORRECT
// state when nobody is typing — and the studio fixture seeds a deck of ~1,900 characters, so an
// ungated sampler recorded exactly that as a 2,702px failure before the demo had typed a
// character. "Follow the typing" is a claim about the typing.
//
// SUSTAINED, not instantaneous, exactly as vetrina-geometry.spec.ts argues: an insert is measured
// by CodeMirror after the frame that caused it, so the tail is legitimately a frame or two behind.
// What a missing follow looks like is an offset that never closes.
type TailSample = { off: number; scrollTop: number; overflow: number; rendered: boolean };
type TailReport = { samples: number; worst: TailSample | null; maxOff: number; maxRun: number; chrome: number; error?: string };
// SUSTAIN IS THE DISCRIMINATOR, NOT SLACK. What separates an engine's measure lag from a follow
// that is broken is DURATION: the lag is a couple of frames and then the view catches up, while a
// broken follow never closes. Measured on the shipped build, the longest run of frames over budget
// is 0 on BOTH engines — the transients below never reach the budget at all — while a `revealTail`
// mutated to a no-op is over it for the rest of the typing.
//
// It used to be 6, which was enough while the oracle saturated at 0 and the budget never had to
// tolerate a real transient. Once the oracle measured against the VISIBLE box (see above), WebKit's
// legitimate 283px lag became visible, and holding the arm on DEPTH alone would have meant a budget
// between 283 and the 457px a genuinely broken follow produces — 1.14x at best, a coin flip.
// Widening the window instead is what lets the budgets below sit close to the transient and still
// leave the real defect 1.9x / 1.5x clear of them.
const TAIL_SUSTAIN = 20;
const TAIL_TYPING_MS = 500; // a doc that changed this recently is being typed into
// The slack absorbs the frame or two between an insert and the engine's measure of it, and it is
// PER ENGINE because that lag is.
//
// BOTH NUMBERS GREW WHEN THE ORACLE ABOVE CHANGED, and the arithmetic is worth following, because
// it says the growth is the ruler and not a regression. On real WebKit the worst the tail ever
// reaches is the SAME absolute position before and after the fix — y=712 in a 659px window. Against
// the old ruler (the scroller's own bottom, 659) that reads 53px; against the new one (the top of
// the caption, 429) the identical frame reads 283px. One position, two rulers, and only the second
// one is about what a viewer can see. Chromium is the same story with the old reading SATURATED:
// its tail never passed 844, so `max(0, co.bottom - 844)` could only ever print 0, and the same
// frames measure 49px against a visible bottom of 614.
//
// Measured on the shipped build: the worst INSTANTANEOUS gap is 49px on Chromium at 390x844 (three
// runs, identical; 582/583/589 samples) and 283px on real WebKit at an iPhone 15 Pro box (two runs,
// identical; 326/339 samples).
//
// **THE BUDGET HAS TO BE BELOW THE CAPTION, and that is what decides these numbers.** The defect
// this file exists to catch is a tail parked at the scroller's bottom edge — the full 230px `scrim`
// band, under the caption. A budget above 230 cannot see it: the tail sits permanently covered,
// scores under budget, and the arm goes green forever. An earlier revision set WebKit to 300
// precisely so its 283px transient would never cross — a budget LARGER than the defect, which
// would have caught only the mutant that deletes the reveal outright (457px) and passed every
// partial regression: the margin halved, a new style's `occludes` returning null, the publish
// channel broken.
//
// So the budgets sit below the band and TAIL_SUSTAIN does the discriminating. WebKit's 283px
// transient IS above its 120px budget on the frame it happens — deliberately — and the arm holds
// because that transient lasts a couple of frames while a covered tail never closes.
//
// The SETTLED gap on both engines is 0: the tail parks with its bottom edge within a pixel of the
// caption's top (615 against a caption at 614 on Chromium, 429 against 429 on WebKit).
const TAIL_SLACK = { chromium: 60, webkit: 120 };

async function expectTailFollows(page: import('@playwright/test').Page, slack: number): Promise<void> {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(String(e)));

	// Sample from inside the page, continuously: the typing runs for tens of seconds and a
	// retrying matcher would simply wait for a moment the tail happens to be visible.
	await page.addInitScript(
		([sustain, slackPx, typingMs]: [number, number, number]) => {
			const w = window as unknown as { __tail: TailReport };
			w.__tail = { samples: 0, worst: null, maxOff: 0, maxRun: 0, chrome: 0 };
			let run = 0;
			let lastView: unknown = null;
			let lastLen = -1;
			let lastChange = 0;
			const tick = () => {
				try {
					// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
					const view = (document.querySelector('#studio-pane-editor .cm-content') as any)?.cmTile?.root?.view;
					const sc: HTMLElement | undefined = view?.scrollDOM;
					const overflow = sc ? sc.scrollHeight - sc.clientHeight : 0;
					// ARMING, and two things have to be excluded or the case fails on correct behavior.
					// (1) The FIRST observation of a view is not a change: the fixture's seeded ~1,900
					// character deck is sitting there before the demo types anything, and counting its
					// arrival as typing recorded it as a 2,702px failure. (2) A pane swap REMOUNTS the
					// editor, so a fresh view arrives already holding the whole document — also not a
					// change, and where it is scrolled is not the follow's business until the next
					// keystroke. So a view starts un-armed and only its own growth arms it.
					if (view !== lastView) {
						lastView = view;
						lastLen = view ? view.state.doc.length : -1;
						lastChange = 0;
						run = 0;
					} else if (view) {
						const len = view.state.doc.length;
						if (len !== lastLen) {
							lastLen = len;
							lastChange = performance.now();
						}
					}
					const typing = lastChange > 0 && performance.now() - lastChange < typingMs;
					// Only meaningful once the document is taller than the pane AND something is
					// actively typing into it.
					if (view && sc && overflow > 60 && typing) {
						const co = view.coordsAtPos(view.state.doc.length);
						const box = sc.getBoundingClientRect();
						// The band the running tour is painting over, in px up from the window's bottom
						// edge. Absent (no tour, or a build without the fix) → 0 → `visibleBottom` is
						// the scroller's own bottom, which is what this used to compare against.
						const chrome = Number.parseFloat(document.documentElement.style.getPropertyValue('--vt-chrome-bottom')) || 0;
						w.__tail.chrome = Math.max(w.__tail.chrome, chrome);
						const visibleBottom = Math.min(box.bottom, window.innerHeight - chrome);
						// How far the END of the document is from being on screen. `coordsAtPos` is null
						// when the tail is not rendered at all, and then the distance from the bottom of
						// the scroll range is the honest measure of how far behind the view is.
						const off = co ? Math.max(0, co.bottom - visibleBottom, box.top - co.top) : overflow - sc.scrollTop;
						w.__tail.samples++;
						w.__tail.maxOff = Math.max(w.__tail.maxOff, Math.round(off));
						run = off > slackPx ? run + 1 : 0;
						// The longest run seen, sustained or not — the number TAIL_SUSTAIN is set from,
						// and the one that says how much headroom a passing run actually had.
						w.__tail.maxRun = Math.max(w.__tail.maxRun, run);
						if (run >= sustain && (!w.__tail.worst || off > w.__tail.worst.off)) {
							w.__tail.worst = { off: Math.round(off), scrollTop: Math.round(sc.scrollTop), overflow: Math.round(overflow), rendered: !!co };
						}
					} else {
						run = 0;
					}
				} catch (e) {
					w.__tail.error = String(e);
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		},
		// The tuple assertion is load-bearing for the callback's own parameter type: the array
		// literal infers as `number[]`, which Playwright cannot match to a 3-tuple destructure.
		[TAIL_SUSTAIN, slack, TAIL_TYPING_MS] as [number, number, number],
	);

	await gotoStudio(page);
	await startMobileDemo(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckSource(page), { timeout: 90_000 }).toContain('_class: closing');

	const tail = await page.evaluate(() => (window as unknown as { __tail: TailReport }).__tail);
	// Guard the oracle itself: a sampler that threw, or that never saw an overflowing editor being
	// typed into, reports a clean `null` and is otherwise indistinguishable from a pass.
	expect(pageErrors, `the page threw: ${pageErrors.join(' | ')}`).toEqual([]);
	expect(tail.error, 'the sampler threw inside the page, so it measured nothing').toBeUndefined();
	expect(tail.samples, 'the editor was never both overflowing and being typed into — this proves nothing').toBeGreaterThan(TAIL_SUSTAIN * 10);
	// GUARD THE RULER ITSELF. `--vt-chrome-bottom` is what turns this from "is the tail inside the
	// editor" into "is the tail inside the VISIBLE part of it", and it is read with `|| 0` — so a
	// regression that stopped the stage publishing would blind this oracle and restore the defect
	// in one stroke, and the arm would go green. That is the exact shape of failure this whole
	// change is about, so the sampler records whether it ever saw a real band and says so here.
	expect(tail.chrome, 'the stage never published a chrome inset, so this measured the OLD blind ruler').toBeGreaterThan(0);
	// And the headroom the pass actually had, as an assertion rather than a log line: a legitimate
	// transient is a couple of frames, so a run anywhere near the window is drift worth seeing.
	expect(tail.maxRun, `the longest run over budget was ${tail.maxRun} frames against a ${TAIL_SUSTAIN}-frame window — the headroom this case relies on is gone`).toBeLessThan(TAIL_SUSTAIN / 2);
	expect(
		tail.worst,
		tail.worst
			? `the tail was ${tail.worst.off}px off screen for ${TAIL_SUSTAIN}+ consecutive frames while typing (scrollTop ${tail.worst.scrollTop} of ${tail.worst.overflow}, tail ${tail.worst.rendered ? 'rendered' : 'NOT rendered'})`
			: '',
	).toBeNull();
	// Printed on a PASS too: the headroom this case actually has, so "it still passes" can be read
	// as a number rather than taken on faith.
	console.log(`[tail] ${tail.samples} samples while typing, worst instantaneous offset ${tail.maxOff}px (slack ${slack}px), longest run over budget ${tail.maxRun} frames (of ${TAIL_SUSTAIN}), caption band ${tail.chrome}px`);
}

test('@mobile the editor follows the typing — the tail of the deck stays on screen', async ({ page }) => {
	await expectTailFollows(page, TAIL_SLACK.chromium);
});

// THE SAME ON REAL WEBKIT AT AN IPHONE BOX, because the report this came from was an iPhone and
// the thing being asked is "does the editor scroll": which element scrolls, and how soon after an
// insert it is measured, are engine answers. Still not iOS — real touch, Safari's collapsing
// chrome and the visual-viewport offset the software keyboard introduces are not reachable here
// (engineering/decisions/2026-09-14-tour-caption-is-an-occluder.md, "what is not verified").
test('@webkit-phone the editor follows the typing on real WebKit too', async ({ page }) => {
	await expectTailFollows(page, TAIL_SLACK.webkit);
});

// ── And the same question for the OTHER editor ────────────────────────────────────────────────
//
// A tour started in COMPOSE mode types through the same controlled `setSource` path — the
// markdown editor is not mounted in that mode, so `buildTypeOps` never picks the native channel —
// and a controlled replace moves no caret there either. `ComposeHandle.revealTail` is the
// compensation, and this is its real surface: jsdom has no layout, so the unit arms in
// `ComposeView.sync.test.tsx` stub both geometry reads and can only pin the wiring (HARD RULE #23).
//
// THE ORACLE IS DIFFERENT BY NECESSITY. ProseMirror hangs no back-reference to its view off the
// DOM, so there is no `coordsAtPos` to ask from out here. What stands in is the end of the
// rendered document — the last element inside `.ProseMirror` — measured against the visible part
// of `.cs-host`. That is weaker than the CodeMirror oracle (it cannot report "the tail is not
// rendered at all") and it is the strongest one available without a test hook in the component.
async function expectComposeTailFollows(page: import('@playwright/test').Page, slack: number): Promise<void> {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(String(e)));

	await page.addInitScript(
		([sustain, slackPx, typingMs]: [number, number, number]) => {
			const w = window as unknown as { __tail: TailReport };
			w.__tail = { samples: 0, worst: null, maxOff: 0, maxRun: 0, chrome: 0 };
			let run = 0;
			let lastLen = -1;
			let lastChange = 0;
			let lastHost: unknown = null;
			const tick = () => {
				try {
					const host = document.querySelector('#studio-pane-editor .cs-host') as HTMLElement | null;
					const pm = host?.querySelector('.ProseMirror') as HTMLElement | null;
					const last = pm?.lastElementChild as HTMLElement | null;
					const len = pm ? (pm.textContent ?? '').length : -1;
					// A remount arrives holding the whole document — not a change, same as the
					// CodeMirror sampler above.
					if (host !== lastHost) {
						lastHost = host;
						lastLen = len;
						lastChange = 0;
						run = 0;
					} else if (len !== lastLen) {
						lastLen = len;
						lastChange = performance.now();
					}
					const typing = lastChange > 0 && performance.now() - lastChange < typingMs;
					const overflow = host ? host.scrollHeight - host.clientHeight : 0;
					if (host && last && typing && overflow > 60) {
						const box = host.getBoundingClientRect();
						const chrome = Number.parseFloat(document.documentElement.style.getPropertyValue('--vt-chrome-bottom')) || 0;
						w.__tail.chrome = Math.max(w.__tail.chrome, chrome);
						const visibleBottom = Math.min(box.bottom, window.innerHeight - chrome);
						const off = Math.max(0, last.getBoundingClientRect().bottom - visibleBottom);
						w.__tail.samples++;
						w.__tail.maxOff = Math.max(w.__tail.maxOff, Math.round(off));
						run = off > slackPx ? run + 1 : 0;
						w.__tail.maxRun = Math.max(w.__tail.maxRun, run);
						if (run >= sustain && (!w.__tail.worst || off > w.__tail.worst.off)) {
							w.__tail.worst = { off: Math.round(off), scrollTop: Math.round(host.scrollTop), overflow: Math.round(overflow), rendered: true };
						}
					} else {
						run = 0;
					}
				} catch (e) {
					w.__tail.error = String(e);
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		},
		[TAIL_SUSTAIN, slack, TAIL_TYPING_MS] as [number, number, number],
	);

	await gotoStudio(page);
	// Switch the phone to the RICH editor before the tour starts. No tour changes `editMode`, so
	// this is the only way into the state — an author who chose Compose and then asked for a tour.
	await page.getByRole('button', { name: 'Compose — rich editor' }).click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await startMobileDemo(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckSource(page), { timeout: 120_000 }).toContain('_class: closing');

	const tail = await page.evaluate(() => (window as unknown as { __tail: TailReport }).__tail);
	expect(pageErrors, `the page threw: ${pageErrors.join(' | ')}`).toEqual([]);
	expect(tail.error, 'the sampler threw inside the page, so it measured nothing').toBeUndefined();
	expect(tail.samples, 'Compose was never both overflowing and being typed into — this proves nothing').toBeGreaterThan(TAIL_SUSTAIN * 5);
	expect(tail.chrome, 'the stage never published a chrome inset, so this measured a blind ruler').toBeGreaterThan(0);
	expect(
		tail.worst,
		tail.worst ? `the tail was ${tail.worst.off}px off screen for ${TAIL_SUSTAIN}+ consecutive frames while typing (scrollTop ${tail.worst.scrollTop} of ${tail.worst.overflow})` : '',
	).toBeNull();
	console.log(`[compose-tail] ${tail.samples} samples while typing, worst instantaneous offset ${tail.maxOff}px (slack ${slack}px), longest run over budget ${tail.maxRun} frames (of ${TAIL_SUSTAIN}), caption band ${tail.chrome}px`);
}

test('@mobile a tour started in COMPOSE mode follows its typing too', async ({ page }) => {
	await expectComposeTailFollows(page, TAIL_SLACK.chromium);
});
