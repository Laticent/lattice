import { RECORD_VERSION } from '../src/lib/crash-sentinel';
import { expect, gotoStudio, test } from './studio-fixture';

/**
 * The crash report, on a real browser.
 *
 * WHY THIS TIER AND NOT THE UNIT ONE. Every defect this feature has shipped was
 * invisible to jsdom, and there is a pattern to it: the unit suite can check what
 * the recorder WRITES, but not what a browser DOES. The toast that was a 110px
 * lozenge clipping its own text, the description that was near-black on
 * near-black (#1622), the record whose owner is a live tab, the tab that slept
 * through a privacy wipe (#1625) — none of them can fail a jsdom test, and two
 * bad designs shipped precisely because their unit tests passed.
 *
 * These specs are the committed form of throwaway harnesses that caught real
 * bugs (#1618). Each one is written so it FAILS against the code before its fix,
 * not merely passes against the code after — a passing test that cannot fail is
 * the thing that let those designs through.
 */

/** A record shaped like the first real report: WebKit, no memory figures, one error repeating. */
function staleCrashRecord(id: string, ageMs: number) {
	const started = Date.now() - ageMs;
	return {
		v: RECORD_VERSION,
		id,
		startedAt: started,
		lastBeat: started + 25_700,
		page: '/studio/',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1',
		nav: 'navigate',
		context: { Deck: 'The Seven Steps', Slides: '18' },
		crumbs: [
			{ t: 0, k: 'boot', m: 'studio boot (navigate)' },
			{ t: 600, k: 'render', m: 'first preview paint' },
		],
		mem: [],
		errorCount: 6,
		errorGroups: [{ message: 'Script error.', n: 6, firstT: 1900, lastT: 25_700, opaque: true }],
		lastError: { message: 'Script error.', t: 25_700, source: 'window.onerror', opaque: true },
		stallCount: 0,
		longestStallMs: 0,
	};
}

/**
 * Plant an unclosed record older than the staleness window, so this boot may
 * report it without depending on how the browser types its own navigation —
 * which is the unreliable signal #1621 exists for.
 */
async function seedCrash(page: Parameters<typeof gotoStudio>[0], id = 'e2e-crash') {
	await page.addInitScript((rec) => {
		try {
			// SEED ONCE. An unconditional write re-seeds a pristine record after the app
			// has already marked it reported, erasing the `reported` flag and making the
			// report look as though it never happened — the toast plainly on screen
			// while the durable evidence of it kept vanishing.
			//
			// The cause is NOT repeated navigation, which is what a first pass at this
			// comment claimed: `gotoStudio` issues exactly one `page.goto`. It is that
			// `addInitScript` runs in EVERY FRAME, and the Studio's live preview is a
			// same-origin iframe — so it shares this `localStorage` and re-runs the seed.
			// Measured: 3 init-script runs for 1 navigation, across the top document,
			// `about:blank` and the preview's `about:srcdoc`.
			if (!localStorage.getItem(`lattice-studio-session-${rec.id}`)) {
				localStorage.setItem(`lattice-studio-session-${rec.id}`, JSON.stringify(rec));
			}
		} catch {
			/* storage unavailable — the assertions below will say so */
		}
	}, staleCrashRecord(id, 20 * 60_000));
}

/**
 * Latch whether a crash toast was EVER on screen — a fact the toast's own
 * 12-second life destroys.
 *
 * This exists because the skip below cannot otherwise tell "it auto-dismissed"
 * (benign, on a slow box) from "it never rendered" (a total regression in the
 * component this spec is about). A checker made `Toaster` return `null` — the
 * crash toast gone entirely — and the suite reported `2 passed, 2 skipped`,
 * exit 0. `studio-e2e-nightly.yml` only files its tracking issue when a spec
 * FAILS, so a contract that skips forever raises nothing, ever.
 *
 * Installed as an init script so it is watching before the app's first paint,
 * and latched rather than sampled so no poll can miss the window.
 */
async function watchForCrashToast(page: Parameters<typeof gotoStudio>[0]) {
	await page.addInitScript(() => {
		const w = window as unknown as { __crashToastEverRendered?: boolean };
		w.__crashToastEverRendered = false;
		const look = () => {
			for (const t of document.querySelectorAll('[data-sonner-toast]')) {
				if (/stopped unexpectedly/i.test(t.textContent || '')) w.__crashToastEverRendered = true;
			}
		};
		const start = () => {
			look();
			new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true });
		};
		if (document.body) start();
		else addEventListener('DOMContentLoaded', start, { once: true });
	});
}

/**
 * The report was RAISED — a fact that outlives the toast.
 *
 * Separated from the visual contract because the two fail for different reasons:
 * this one reds when the report did not happen at all, the visual one when it
 * happened and looked wrong. Reading only the toast conflates them, and on a slow
 * machine turns "the toast already dismissed" into "the feature is broken".
 */
async function expectReportWasRaised(page: Parameters<typeof gotoStudio>[0]) {
	await expect
		.poll(
			async () =>
				page.evaluate(() =>
					Object.keys(localStorage)
						.filter((k) => k.startsWith('lattice-studio-session-'))
						.some((k) => {
							try {
								return JSON.parse(localStorage.getItem(k) || '{}').reported === true;
							} catch {
								return false;
							}
						}),
				),
			{ timeout: 30_000 },
		)
		.toBe(true);
}

/**
 * The contract the report has to meet, shared by the two projects below.
 *
 * It runs on BOTH because the tag system is per-project and exclusive: a
 * `@webkit-phone` test does not run on `desktop`. Both matter here for different
 * reasons — desktop is the broad regression net, and WebKit is the engine the
 * original report came from, where the two defects were a rendered SHAPE and a
 * computed COLOR (the class chunk-load.spec.ts says a Chromium project cannot
 * stand in for).
 */
async function expectReportReadsWell(page: Parameters<typeof gotoStudio>[0]) {
	// One non-blocking toast, not a modal: a page back from a crash owes the
	// author their work first.
	const toast = page.locator('[data-sonner-toast]');
	// THE TOAST HAS A 12-SECOND LIFE AND THE FIXTURE ALLOWS 45 FOR FIRST PAINT.
	// Moving the "did it report" oracle onto the persisted flag fixed the false
	// GREEN; it did not fix this half. Measured on this build at 16x/20x CPU
	// throttle: `reportedFlag=1` (the report happened) but `toastStillVisible=false`
	// (paint took 26-33s), so demanding the toast reds a healthy app inside the
	// budget the fixture deliberately grants. Skip rather than fail — the report was
	// already proven to have been raised, and a skip that says why is a true
	// statement where a red is a false one.
	// `.first()` so a second toast on screen cannot turn a strict-mode violation
	// into a silent skip; the count assertion below reds on it instead.
	const stillUp = await toast.first().isVisible().catch(() => false);
	if (!stillUp) {
		// THE SKIP MUST EARN ITSELF. Absent this, the predicate reads any missing
		// toast as "it dismissed in time" — including a toast that never existed.
		// The latch distinguishes them, so the only thing that can be excused here
		// is the thing the message actually claims.
		const everRendered = await page.evaluate(
			() => (window as unknown as { __crashToastEverRendered?: boolean }).__crashToastEverRendered === true,
		);
		expect(
			everRendered,
			'the crash toast NEVER rendered — this is a presentation regression, not a slow first paint, and it must not be skipped',
		).toBe(true);
	}
	test.skip(
		!stillUp,
		'the crash toast had already auto-dismissed before this assertion could run (first paint outran its 12s life) — ' +
			'it was observed on screen by the latch, and the report itself is verified separately by expectReportWasRaised',
	);
	// Exactly one, so two stacked toasts red here rather than tripping strict mode
	// somewhere less legible.
	await expect(toast).toHaveCount(1);
	await expect(toast).toContainText(/stopped unexpectedly/i);
	// AND IT MUST ACTUALLY RENDER. `toContainText` reads `textContent`, which
	// includes `display:none` text — hiding the title passed every assertion here
	// and produced a crash toast with no headline at all. A zero-height box also
	// overflows nothing and keeps its color, so neither the clipping nor the
	// contrast check notices.
	await expect(toast.locator('[data-title]')).toBeVisible();

	// THE SHAPE — asserted as the value it must BE, not as the one value it must
	// not be. `.not.toBe('9999px')` rejected exactly one literal and nothing else:
	// a checker reproduced the defect faithfully at `64px` with 1.67:1 text and
	// every assertion here stayed green. A test that only knows the old bad value
	// cannot catch the next one.
	expect(await toast.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('16px');

	// THE DESCRIPTION MUST BE LEGIBLE — measured, not compared against the one
	// color that was wrong. Sonner hardcodes #3f3f3f, which on this deliberately
	// dark toast was ~1.07:1; the palettes ranged 1.6-2.0:1. Anything under AA is
	// the bug, whatever its hex.
	const desc = toast.locator('[data-description]');
	await expect(desc).toBeVisible();
	// NOT CLIPPED — restored. The previous revision deleted this check while the
	// decision doc kept claiming it, which is a coverage claim without coverage:
	// clip the box (`max-h` + `overflow-hidden`) with the radius left correct and
	// every other assertion here stayed green over a toast whose last line was cut
	// off mid-word. Two tests, because they catch different clippings — the rect
	// test misses overflow, and the overflow test misses a child escaping the box.
	const geometry = await toast.evaluate((el) => {
		const d = el.querySelector('[data-description]');
		const box = el.getBoundingClientRect();
		// THREE TESTS, because each misses what the others catch. The rect test misses
		// overflow; the toast-overflow test misses a clipped CHILD — measured, a
		// `max-h` on the description alone left both green over a toast reading
		// "Your decks are safe. See what the", second line gone. Clipping is checked
		// on every text layer, not only on the box around them.
		// BOTH AXES. Every oracle here read HEIGHT only, and a checker walked
		// straight through the gap: a title held to 120px with `nowrap` +
		// `overflow:hidden` at 390px renders "The Studio stoppe" — cut off
		// mid-word — with `descOutside`, `overflowing`, `clippedLayers`, the
		// radius, the contrast and `toBeVisible` ALL green. `scrollWidth` was the
		// one signal never read, on the surface whose original bug report was an
		// unstyled black blob.
		const cut = (n: Element) => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1;
		const clippedLayers = [...el.querySelectorAll('[data-title],[data-description],button')]
			.filter(cut)
			.map((n) => n.getAttribute('data-title') !== null ? 'title' : n.getAttribute('data-description') !== null ? 'description' : 'action');
		const dRect = d?.getBoundingClientRect();
		return {
			descOutside: dRect ? dRect.bottom > box.bottom + 0.5 || dRect.right > box.right + 0.5 : true,
			overflowing: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
			clippedLayers,
		};
	});
	expect(geometry.descOutside).toBe(false);
	expect(geometry.overflowing).toBe(false);
	expect(geometry.clippedLayers, 'text layers with their content cut off').toEqual([]);

	const contrast = await toast.evaluate((el) => {
		const d = el.querySelector('[data-description]');
		if (!d) return 0;
		// PAINT THE COLORS, don't parse them. A regex over `getComputedStyle().color`
		// looked right and was wrong: Tailwind emits `oklab(1 0 0 / 0.8)` for an
		// opacity-modified color, which a naive `[\d.]+` match reads as rgb(1,0,0) —
		// near-black — and reported 1.21:1 for text that is actually white. Compositing
		// through a canvas asks the browser what the pixel really is, in sRGB, and
		// folds the alpha in the same way the eye sees it.
		const px = (color: string, over?: string) => {
			const c = document.createElement('canvas');
			c.width = c.height = 1;
			const g = c.getContext('2d');
			if (!g) return [0, 0, 0];
			if (over) {
				g.fillStyle = over;
				g.fillRect(0, 0, 1, 1);
			}
			g.fillStyle = color;
			g.fillRect(0, 0, 1, 1);
			const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
			return [r, gg, b];
		};
		const lum = ([r, g, b]: number[]) => {
			const f = (v: number) => {
				const x = v / 255;
				return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const ratio = (node: Element) => {
			// COMPOSITE THE WHOLE CHAIN, FROM THE PAGE UP. Measuring against the
			// toast's background flatters any layer that paints its own — the action
			// chip is `bg-white/15` and scored 5.78:1 against the toast where the
			// pixels it is drawn on give 3.67:1. Compositing only ONE level had the
			// same flaw one generation up: `[data-content]` wraps the title and
			// description, and a background there scored 17.3:1 / 11.4:1 against a
			// true 3.9 / 3.1.
			//
			// STARTING at the toast had the flaw one generation the OTHER way, and it
			// was the same bug a third time: painting an opaque canvas from the
			// toast's own declared color throws away the toast's ALPHA. A checker set
			// `--normal-bg: rgba(0,0,0,0.12)` — white text on a near-white pill,
			// rasterized at 1.147:1, WORSE than #1622 — and this scored it 21.000 and
			// passed. So the walk starts at the document, over the white the browser
			// paints under everything, and every layer down to the node composites in
			// turn — the toast included, alpha and all.
			const chain: Element[] = [];
			for (let cur: Element | null = node; cur; cur = cur.parentElement) chain.unshift(cur);
			let backdrop = [255, 255, 255];
			for (const layer of chain) {
				backdrop = px(getComputedStyle(layer).backgroundColor, `rgb(${backdrop[0]},${backdrop[1]},${backdrop[2]})`);
			}
			const a = lum(px(getComputedStyle(node).color, `rgb(${backdrop[0]},${backdrop[1]},${backdrop[2]})`));
			const b = lum(backdrop);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		};
		// EVERY TEXT LAYER, not just the description. Measuring one element left the
		// same defect available one element over: painting the TITLE `#2a2a2a` on the
		// near-black pill made it essentially invisible with every assertion green —
		// #1622's exact bug, relocated. The title is the line that says the Studio
		// crashed, so it is the last thing that should be unreadable.
		const layers: Record<string, number> = { description: ratio(d) };
		const title = el.querySelector('[data-title]');
		if (title) layers.title = ratio(title);
		const action = el.querySelector('button');
		if (action) layers.action = ratio(action);
		return layers;
	});
	for (const [layer, ratio] of Object.entries(contrast)) {
		expect(ratio, `${layer} contrast against the surface it is painted on`).toBeGreaterThanOrEqual(4.5);
	}

	await toast.getByRole('button', { name: /see report/i }).click();

	// THE ANSWER TO "what am I supposed to do with this?". Facts alone put the
	// work of interpretation on the one person who cannot do it.
	await expect(page.getByText('What you can try')).toBeVisible();
	// On an engine with no memory figures, the useful step is naming that gap.
	await expect(page.getByText(/Chrome or Edge/)).toBeVisible();

	// Six copies of an opaque error are ONE fault the browser refused to describe,
	// not six Studio bugs — and the report has to say which it is.
	await expect(page.getByText(/would not describe/)).toBeVisible();
	// The attribution appears TWICE by design — once as an observation, once as a
	// step to try — so each is matched by the phrase unique to it rather than by
	// the words they share.
	await expect(page.getByText(/most likely came from a browser extension/)).toBeVisible();
	await expect(page.getByText(/content blocker or browser extension/)).toBeVisible();

	// Nothing may overflow the viewport sideways.
	expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test('a crash report surfaces on the next boot and says what to try', async ({ page }) => {
	await seedCrash(page);
	await watchForCrashToast(page);
	await gotoStudio(page);
	await expectReportWasRaised(page);
	await expectReportReadsWell(page);
});

test('the crash report reads correctly on WebKit at phone size @webkit-phone', async ({ page }) => {
	await seedCrash(page);
	await watchForCrashToast(page);
	await gotoStudio(page);
	await expectReportWasRaised(page);
	await expectReportReadsWell(page);
});

test('a clean session is never reported as a crash', async ({ page }) => {
	await gotoStudio(page);
	// ASSERT DURABLE STATE, NOT THE TRANSIENT TOAST. The toast self-dismisses after
	// 12s, while the fixture deliberately allows up to 45s for first paint — so on a
	// loaded box the toast can be raised AND gone before the assertion runs, and a
	// `toHaveCount(0)` then passes on a boot that DID report a crash. A checker
	// measured exactly that at CPU throttle 20x: `toastsEverRendered` held the crash
	// headline while the count at assert time was 0. `markReported` persists into the
	// record instead, and outlives any paint delay.
	await page.waitForTimeout(2_000);
	const reported = await page.evaluate(() =>
		Object.keys(localStorage)
			.filter((k) => k.startsWith('lattice-studio-session-'))
			.map((k) => {
				try {
					return JSON.parse(localStorage.getItem(k) || '{}').reported === true;
				} catch {
					return false;
				}
			})
			.filter(Boolean).length,
	);
	expect(reported).toBe(0);
	// The toast is checked too, but as a second signal rather than the only one.
	await expect(page.getByText(/stopped unexpectedly/i)).toHaveCount(0);
});

/**
 * #1616 — "Delete everything" undone by a tab that slept through it.
 *
 * THIS TEST PREVIOUSLY ASSERTED NOTHING, and the way it failed is worth keeping.
 * It called CDP `Page.setWebLifecycleState('frozen')` and described that as "a
 * real freeze". The call succeeds and does nothing: instrumented, no `freeze`
 * event fires, the page's own interval never misses a beat, and the wipe
 * broadcast is delivered LIVE. So the test exercised the pre-existing `storage`
 * listener, not the catch-up path #1625 added — removing `catchUpOnWipe()` from
 * `onResume` left it green.
 *
 * It also went red against the un-fixed build for the wrong reason: the
 * assertion read origin-wide `localStorage`, and the record that came back
 * belonged to the WIPING tab, which the hand-rolled wipe left unsealed. The real
 * `clearAllSessions` seals it, so that failure mode does not exist in the product.
 *
 * Two changes make it honest: it verifies the freeze actually happened and SKIPS
 * with a reason when the environment will not honor it — a skip is a true
 * statement, a silent pass is not — and it asserts on the frozen page's OWN
 * record rather than on whatever else the origin holds.
 */
test('a wipe survives a tab that was frozen through it', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium', 'needs CDP Emulation.setScriptExecutionDisabled — no WebKit equivalent');
	// TWO FULL STUDIO BOOTS, each budgeted 45s by the fixture's FIRST_PAINT_TIMEOUT,
	// plus a stop window and a tick poll — against a 60s default that cannot cover
	// even one slow boot. Unlike the visual contract, this test has no skip escape,
	// so the failure mode is a hard RED on a healthy app whenever the runner is
	// loaded. Measured 23-26s here; the doc's own throttled figures are 26-33s for a
	// SINGLE boot.
	test.setTimeout(180_000);

	// Record whether the page heard the wipe — the one precondition the fix depends
	// on. (It does NOT observe Page Lifecycle events: the stop primitive below
	// fires no `freeze`/`resume`, so there is no lifecycle here to measure.)
	await page.addInitScript(() => {
		const w = window as unknown as { __heardWipe?: boolean; __ticks?: number };
		w.__heardWipe = false;
		// A drive signal that advances whether or not the record is rewritten. The
		// record's own heartbeat cannot serve: the wipe deletes it, so polling its
		// `lastBeat` waits forever for exactly the write this test asserts must never
		// happen — the drive signal and the assertion cannot be the same observable.
		w.__ticks = 0;
		setInterval(() => {
			w.__ticks = (w.__ticks ?? 0) + 1;
		}, 250);
		// RECORD THE ONE THING THE FIX DEPENDS ON. #1616 exists because a stopped
		// document never receives this event; if the page hears it, the pre-existing
		// live listener seals the tab and `catchUpOnWipe` is never the thing under
		// test. So the page writes down whether it heard, and the skip below reads it.
		addEventListener('storage', (e) => {
			if (e.key === 'lattice-studio-wipe-signal' || e.key === 'lattice-studio-wiped-at') w.__heardWipe = true;
		});
	});
	await gotoStudio(page);

	const ownKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')));
	expect(ownKeys.length).toBeGreaterThan(0);

	const cdp = await context.newCDPSession(page);
	// STOP THE PAGE FOR REAL. `Page.setWebLifecycleState('frozen')` is a silent
	// no-op in this environment — measured: it resolves, no `freeze` fires, and the
	// document's own interval never misses a beat — which is why this test spent
	// four commits asserting nothing. `Emulation.setScriptExecutionDisabled` does
	// stop it, and the storage broadcast is demonstrably dropped rather than
	// delivered, which is the precondition the fix exists for.
	//
	// It is NOT a Page Lifecycle freeze: no `freeze`/`resume` fires, so this
	// exercises the heartbeat catch-up path and leaves `onResume`'s uncovered.
	// Stated in the decision doc rather than implied away.
	await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
	await page.waitForTimeout(2_000);

	// The wipe lands while the page is stopped. `page.waitForTimeout` above is
	// runner-side and safe against a stopped document; `page.evaluate` is not, so
	// every read of the page's own state waits until after the resume below.
	const other = await context.newPage();
	await gotoStudio(other);
	await other.evaluate(() => {
		for (const k of Object.keys(localStorage)) if (k.startsWith('lattice-studio-session-')) localStorage.removeItem(k);
		const at = String(Date.now());
		localStorage.setItem('lattice-studio-wipe-signal', at);
		localStorage.removeItem('lattice-studio-wipe-signal');
		localStorage.setItem('lattice-studio-wiped-at', at);
	});

	await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
	const heardWipe = await page.evaluate(() => (window as unknown as { __heardWipe: boolean }).__heardWipe);
	// SKIP ON THE PRECONDITION, not on a proxy for it. If the page heard the
	// broadcast, it was never stopped in the way that matters and the live listener
	// — not the code under test — is what seals it. Passing then would assert
	// nothing, which is what four earlier revisions of this test did.
	test.skip(
		heardWipe,
		'this environment did not stop the page: it received the wipe broadcast live, so the pre-existing ' +
			'storage listener seals it and the catch-up path cannot be exercised here',
	);

	await page.bringToFront();
	// Poll the woken page's OWN tick counter rather than sleeping: the settle
	// condition is "this document has run enough heartbeats to have rewritten its
	// record", which is drivable, unlike the absence being asserted after it.
	// Let the resumed page run several of its own heartbeats — that write is what
	// would resurrect the record, so it must have had ample opportunity before an
	// absence means anything. Polled on the page's own tick counter, which advances
	// independently of the record.
	const wokeAt = await page.evaluate(() => (window as unknown as { __ticks: number }).__ticks);
	await expect
		.poll(async () => page.evaluate(() => (window as unknown as { __ticks: number }).__ticks), { timeout: 60_000 })
		.toBeGreaterThan(wokeAt + 3 * (5_000 / 250));

	const back = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')));
	// Only THIS page's records — the ones it could have resurrected.
	expect(back.filter((k) => ownKeys.includes(k))).toEqual([]);
	await other.close();
});
