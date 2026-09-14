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
type TailReport = { samples: number; worst: TailSample | null; maxOff: number; error?: string };
const TAIL_SUSTAIN = 6;
const TAIL_TYPING_MS = 500; // a doc that changed this recently is being typed into
// The slack absorbs the frame or two between an insert and the engine's measure of it, and it is
// PER ENGINE because that lag is: measured worst instantaneous gap across the tour is 0px on
// Chromium at 390px and 53px (~2 lines) on real WebKit at an iPhone 15 Pro box, identical before
// and after the change. The failure they exist to catch is far larger than either: with every
// `scrollTop` write on the scroller blocked, this sampler records a 400px sustained gap — 10x the
// Chromium budget, measured on Chromium at 390px. That multiple is NOT claimed for WebKit: 120px is
// 2.3x the 53px lag it has to tolerate there, and nobody has run the blocked-follow case on that
// engine. (An earlier draft of this line said ~2,700px and "an order of magnitude" for both. The
// first was the UN-GATED sampler's reading of the fixture's seeded deck 11 lines above — a different
// measurement wearing this one's clothes; the second was arithmetic nobody had done.)
const TAIL_SLACK = { chromium: 40, webkit: 120 };

async function expectTailFollows(page: import('@playwright/test').Page, slack: number): Promise<void> {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(String(e)));

	// Sample from inside the page, continuously: the typing runs for tens of seconds and a
	// retrying matcher would simply wait for a moment the tail happens to be visible.
	await page.addInitScript(
		([sustain, slackPx, typingMs]: [number, number, number]) => {
			const w = window as unknown as { __tail: TailReport };
			w.__tail = { samples: 0, worst: null, maxOff: 0 };
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
						// How far the END of the document is from being on screen. `coordsAtPos` is null
						// when the tail is not rendered at all, and then the distance from the bottom of
						// the scroll range is the honest measure of how far behind the view is.
						const off = co ? Math.max(0, co.bottom - box.bottom, box.top - co.top) : overflow - sc.scrollTop;
						w.__tail.samples++;
						w.__tail.maxOff = Math.max(w.__tail.maxOff, Math.round(off));
						run = off > slackPx ? run + 1 : 0;
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
	expect(
		tail.worst,
		tail.worst
			? `the tail was ${tail.worst.off}px off screen for ${TAIL_SUSTAIN}+ consecutive frames while typing (scrollTop ${tail.worst.scrollTop} of ${tail.worst.overflow}, tail ${tail.worst.rendered ? 'rendered' : 'NOT rendered'})`
			: '',
	).toBeNull();
	// Printed on a PASS too: the headroom this case actually has, so "it still passes" can be read
	// as a number rather than taken on faith.
	console.log(`[tail] ${tail.samples} samples while typing, worst instantaneous offset ${tail.maxOff}px (slack ${slack}px)`);
}

test('@mobile the editor follows the typing — the tail of the deck stays on screen', async ({ page }) => {
	await expectTailFollows(page, TAIL_SLACK.chromium);
});

// THE SAME ON REAL WEBKIT AT AN IPHONE BOX, because the report this came from was an iPhone and
// the thing being asked is "does the editor scroll": which element scrolls, and how soon after an
// insert it is measured, are engine answers. Still not iOS — real touch, Safari's collapsing
// chrome and the visual-viewport offset the software keyboard introduces are not reachable here,
// and the phone report for THIS half is still unexplained (see the decision record).
test('@webkit-phone the editor follows the typing on real WebKit too', async ({ page }) => {
	await expectTailFollows(page, TAIL_SLACK.webkit);
});
