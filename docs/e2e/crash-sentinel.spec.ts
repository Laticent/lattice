import { RECORD_VERSION } from '../src/lib/crash-sentinel';
import { expect, gotoStudio, test } from './studio-fixture';

/**
 * The crash report, on a real browser.
 *
 * WHY THIS TIER AND NOT THE UNIT ONE. Every defect this feature has shipped was
 * invisible to jsdom, and there is a pattern to it: the unit suite can check what
 * the recorder WRITES, but not what a browser DOES. The description that was
 * near-black on near-black (#1622), the record whose owner is a live tab, the tab
 * that slept through a privacy wipe (#1625) — none of them can fail a jsdom test,
 * and two bad designs shipped precisely because their unit tests passed.
 *
 * THE BOOT TOAST IS GONE, and most of this file used to be about it. It
 * announced every unclean ending on the next load, and the ending it announced
 * most was the browser unloading a tab that had been sitting in the background —
 * which is not a crash. What a real phone showed was a crash notice on returning
 * to an idle tab, over and over. So the report is now a place the author GOES
 * (Workspace → General → Crash reports), and these specs drive that route. The
 * presentation contract moved with it, onto the panel a human actually reads.
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
			// SEED ONCE. `addInitScript` runs in EVERY FRAME, and the Studio's live
			// preview is a same-origin iframe — so it shares this `localStorage` and
			// re-runs the seed. Measured: 3 init-script runs for 1 navigation, across
			// the top document, `about:blank` and the preview's `about:srcdoc`. An
			// unconditional write would keep restoring a pristine record underneath
			// whatever the app had done with it.
			if (!localStorage.getItem(`lattice-studio-session-${rec.id}`)) {
				localStorage.setItem(`lattice-studio-session-${rec.id}`, JSON.stringify(rec));
			}
		} catch {
			/* storage unavailable — the assertions below will say so */
		}
	}, staleCrashRecord(id, 20 * 60_000));
}

/**
 * Turn recording ON before the app boots — the Workspace switch, in storage terms.
 *
 * Needed by every spec that exercises the RECORDER, because it is off unless
 * explicitly on. Written in the same init script style as `seedCrash`, and for
 * the same reason: the hoisted page script reads this before the island hydrates,
 * so setting it afterwards would be too late for the boot it is meant to govern.
 */
async function allowRecording(page: Parameters<typeof gotoStudio>[0]) {
	await page.addInitScript(() => {
		try {
			const k = 'lattice-studio-settings';
			const cur = JSON.parse(localStorage.getItem(k) || '{}');
			localStorage.setItem(k, JSON.stringify({ ...cur, crashReports: true }));
		} catch {
			/* storage unavailable — the assertions will say so */
		}
	});
}

/** Open the Workspace sheet — the header control, at every width. */
async function openWorkspace(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await page.getByRole('tab', { name: 'General' }).click();
}

/**
 * The report was COLLECTED — the durable fact, and the one the toast used to
 * stand in for.
 *
 * It is asserted on the Workspace row rather than on storage, because the row is
 * now the whole of the feature's visibility: a report the recorder holds and no
 * surface offers is a report nobody will ever read. Polled, because the row's
 * count is gathered when the sheet opens and the shell may still be hydrating.
 */
async function expectReportIsOffered(page: Parameters<typeof gotoStudio>[0]) {
	await openWorkspace(page);
	await expect(page.getByText(/session(s)? ended unexpectedly/)).toBeVisible();
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
	await page.getByRole('dialog', { name: /Workspace/ }).getByRole('button', { name: 'View', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: /Crash report/ });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByText(/stopped unexpectedly|unloaded this tab|reclaimed this tab/)).toBeVisible();

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

	// NOT CLIPPED, ON EITHER AXIS. Inherited from the toast contract this replaced,
	// where a `max-h` on one text layer left every other assertion green over a
	// report reading "Your decks are safe. See what the", second line gone — and a
	// `nowrap` title at 390px rendered "The Studio stoppe", cut off mid-word, with
	// the height oracle none the wiser. Checked per text layer, because the box
	// around them can be perfectly sized while a child escapes or is cut.
	const clipped = await sheet.evaluate((el) => {
		const cut = (n: Element) => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1;
		// SR-ONLY TEXT IS EXEMPT — it is a 1px clipped box on purpose, which is
		// exactly the geometry this oracle hunts. Filtered by SIZE rather than by
		// class name, so a differently-spelled visually-hidden helper is covered too.
		const visible = (n: Element) => {
			const r = n.getBoundingClientRect();
			return r.width > 2 && r.height > 2;
		};
		return [...el.querySelectorAll('p, li, dd')]
			.filter((n) => (n.textContent || '').trim().length > 0 && visible(n) && cut(n))
			.map((n) => (n.textContent || '').slice(0, 60));
	});
	expect(clipped, 'text in the crash report with its content cut off').toEqual([]);

	// LEGIBLE — measured, not compared against the one color that was wrong.
	// #1622 was #3f3f3f on a near-black pill at ~1.07:1. Anything under AA is the
	// bug, whatever its hex, and it is checked on EVERY text layer because
	// measuring one left the same defect available one element over.
	const contrast = await sheet.evaluate((el) => {
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
			// COMPOSITE THE WHOLE CHAIN, FROM THE DEEPEST OPAQUE LAYER UP. Measuring
			// against the panel's background flatters any layer that paints its own —
			// the "What you can try" card is `--accent-soft` over the panel, and a
			// single-level composite scored it against the wrong pixels. Starting from
			// an ASSUMED white canvas was the same bug the other way: measured, that
			// walk returned [224,224,224] where the real pixel was [15,15,15] under
			// `color-scheme: dark`. So the walk finds the deepest layer that is
			// actually opaque, and refuses to guess when there is none.
			const chain: Element[] = [];
			for (let cur: Element | null = node; cur; cur = cur.parentElement) chain.unshift(cur);
			// Format-agnostic: composite the color over black and over white, and see
			// whether the result moved. Only a fully opaque color is unaffected — no
			// parsing, so `oklab(… / .5)` and `color-mix()` are read correctly too.
			const opaque = (color: string) => {
				const a = px(color, 'rgb(0,0,0)');
				const b = px(color, 'rgb(255,255,255)');
				return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
			};
			let base = -1;
			for (let i = 0; i < chain.length; i++) {
				if (opaque(getComputedStyle(chain[i]).backgroundColor)) base = i;
			}
			if (base < 0) return null; // nothing opaque anywhere — refuse to guess
			let backdrop = px(getComputedStyle(chain[base]).backgroundColor);
			for (const layer of chain.slice(base + 1)) {
				backdrop = px(getComputedStyle(layer).backgroundColor, `rgb(${backdrop[0]},${backdrop[1]},${backdrop[2]})`);
			}
			const a = lum(px(getComputedStyle(node).color, `rgb(${backdrop[0]},${backdrop[1]},${backdrop[2]})`));
			const b = lum(backdrop);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		};
		const layers: Record<string, number | null> = {};
		const headline = el.querySelector('p');
		if (headline) layers.headline = ratio(headline);
		// One fact and one step — the two blocks painted on their own surfaces.
		const fact = el.querySelectorAll('li')[0];
		if (fact) layers.fact = ratio(fact);
		return layers;
	});
	for (const [layer, ratio] of Object.entries(contrast)) {
		// `null` means the walk found nothing opaque to stand on, so the ratio is
		// unknowable rather than bad. It fails — an unmeasurable contrast is not a
		// passing one, and this is the branch that would otherwise quietly return to
		// guessing a backdrop.
		expect(
			ratio,
			`${layer} contrast against the surface it is painted on (null = no opaque layer beneath it, so this could not be measured)`,
		).not.toBeNull();
		expect(ratio, `${layer} contrast against the surface it is painted on`).toBeGreaterThanOrEqual(4.5);
	}

	// Nothing may overflow the viewport sideways.
	expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test('a crash report is offered in Workspace and says what to try', async ({ page }) => {
	await seedCrash(page);
	await allowRecording(page);
	await gotoStudio(page);
	await expectReportIsOffered(page);
	await expectReportReadsWell(page);
});

test('the crash report reads correctly on WebKit at phone size @webkit-phone', async ({ page }) => {
	await seedCrash(page);
	await allowRecording(page);
	await gotoStudio(page);
	await expectReportIsOffered(page);
	await expectReportReadsWell(page);
});

/**
 * THE REGRESSION THIS CHANGE EXISTS TO PREVENT.
 *
 * A boot with a crash record on file must not interrupt anyone. The old toast
 * fired on exactly this path, and the ending it announced most often was the
 * browser unloading an idle backgrounded tab — a crash notice where there had
 * been no crash, reported from a real phone.
 *
 * The oracle is a LATCH, not a sample: a toast has a life of its own and can be
 * raised and gone before any single assertion runs, which is how a `toHaveCount(0)`
 * passes over a toast the user plainly saw. This watches from before first paint.
 */
test('no toast interrupts a boot that found a crash record', async ({ page }) => {
	await seedCrash(page);
	await allowRecording(page);
	await page.addInitScript(() => {
		const w = window as unknown as { __anyToastEverRendered?: string | null };
		w.__anyToastEverRendered = null;
		const look = () => {
			for (const t of document.querySelectorAll('[data-sonner-toast]')) {
				const r = t.getBoundingClientRect();
				const cs = getComputedStyle(t);
				if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none') {
					w.__anyToastEverRendered = (t.textContent || '').slice(0, 120);
				}
			}
		};
		const start = () => {
			look();
			new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true });
			setInterval(look, 100);
		};
		if (document.body) start();
		else addEventListener('DOMContentLoaded', start, { once: true });
	});
	await gotoStudio(page);
	// The report IS collected — this is not "the feature was removed", it is "the
	// feature stopped shouting". Asserting the offer first also gives the boot the
	// time a toast would have had to appear in.
	await expectReportIsOffered(page);
	expect(
		await page.evaluate(() => (window as unknown as { __anyToastEverRendered?: string | null }).__anyToastEverRendered),
		'a toast rendered on a boot that found a crash record',
	).toBeNull();
});

/**
 * `window.onerror` sees only what nobody caught. The failures worth diagnosing
 * here are caught, logged and degraded around — and the console is wiped by the
 * reload that follows a crash, so the report used to say "no errors recorded"
 * about a session that printed a stack trace seconds before it ended.
 *
 * REAL BROWSER, REAL CONSOLE (HARD RULE #23): the patch has to survive whatever
 * else the page does to `console.error`, which is not a thing jsdom can prove.
 */
test('an error logged to the console lands in the live record', async ({ page }) => {
	await allowRecording(page);
	await gotoStudio(page);
	await page.evaluate(() => {
		const e = new Error('preview render failed');
		e.stack = 'Error: preview render failed\n    at renderSlide (engine.js:42:9)';
		console.error('while rendering %s', 'slide 8', e);
	});
	const read = () =>
		page.evaluate(() => {
			const key = Object.keys(localStorage).find((k) => k.startsWith('lattice-studio-session-'));
			if (!key) return null;
			try {
				const r = JSON.parse(localStorage.getItem(key) || '{}');
				return { message: r.lastError?.message ?? '', stack: r.lastError?.stack ?? '', source: r.errorGroups?.[0]?.source ?? '' };
			} catch {
				return null;
			}
		});
	// THE FORMAT STRING IS SUBSTITUTED, the way the console prints it — joining the
	// raw arguments would put "while rendering %s" in the report and the value on
	// the end. Polled rather than read once: a console error forces a write at most
	// once a second and the 5s heartbeat carries the rest (CONSOLE_PERSIST_MS).
	await expect.poll(async () => (await read())?.message ?? '', { timeout: 15_000 }).toContain('while rendering slide 8');
	const recorded = await read();
	// The stack is the whole point: it names the code that failed.
	expect(recorded?.stack).toContain('renderSlide');
	expect(recorded?.source).toBe('console.error');
});

/**
 * THE CONSENT GATE ON WEBKIT — a tagged twin of the spec above, because the tag
 * system is per-project and exclusive, so the `desktop` copy never runs here.
 *
 * Worth the duplication for this one specifically: it is a PRIVACY control, and
 * WebKit is both the engine the original report came from and the one whose
 * storage and lifecycle behavior a Chromium pass cannot stand in for. The claim
 * is the same and so is the strongest probe — that no patch installs itself into
 * a real console without consent.
 */
test('records nothing until the workspace switch is on, on WebKit @webkit-phone', async ({ page }) => {
	await gotoStudio(page); // deliberately WITHOUT allowRecording
	await page.evaluate(() => console.error('this must not be recorded', new Error('nor this stack')));
	await page.waitForTimeout(1_500); // longer than the console write throttle

	const state = await page.evaluate(() => ({
		records: Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')).length,
		tabMirror: sessionStorage.getItem('lattice-studio-tab-session'),
	}));
	expect(state.records, 'a session record was written with recording off').toBe(0);
	expect(state.tabMirror, 'the tab mirror was claimed with recording off').toBeNull();

	await openWorkspace(page);
	await page.getByRole('switch', { name: /Record what the Studio was doing/ }).click();
	await expect
		.poll(
			async () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')).length),
			{ timeout: 15_000, message: 'turning the switch on did not start the recorder' },
		)
		.toBeGreaterThan(0);
});

test('a clean session is never reported as a crash', async ({ page }) => {
	// BEFORE `gotoStudio`, not after. `addInitScript` applies to navigations that
	// come AFTER it is registered, so registering it second left the flag unseen by
	// the loaded document — the recorder never ran, no record could exist, and the
	// "no crash was reported" assertion passed while asserting nothing at all. That
	// is the vacuous-green failure this file's header exists to warn about, and it
	// was caught by a checker rather than by the suite.
	await allowRecording(page);
	await gotoStudio(page);
	// ASSERT WHAT THE AUTHOR IS OFFERED. The SWITCH is what is always present now
	// (the reports row appears only when something is stored), so this reds on both
	// failures worth catching: a clean boot reported as a crash, and the control
	// itself disappearing.
	await openWorkspace(page);
	// The switch is the group's standing state; the reports row appears only when
	// there is something to report. Both are asserted, so this reds on a clean boot
	// reported as a crash AND on the control itself disappearing.
	await expect(page.getByRole('switch', { name: /Record what the Studio was doing/ })).toBeVisible();
	await expect(page.getByText(/session(s)? ended unexpectedly/)).toHaveCount(0);
});

/**
 * THE CONSENT GATE, on a real browser.
 *
 * Off by default means off: no record, and — the half that matters most, because
 * it is the one that can carry text a third-party library chose to print — no
 * console patch. Asserted on the live page rather than in jsdom, since what is
 * being claimed is that nothing installs itself into a REAL console.
 */
test('records nothing until the workspace switch is on', async ({ page }) => {
	await gotoStudio(page); // deliberately WITHOUT allowRecording
	await page.evaluate(() => console.error('this must not be recorded', new Error('nor this stack')));
	await page.waitForTimeout(1_500); // longer than the console write throttle

	const state = await page.evaluate(() => ({
		records: Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')).length,
		tabMirror: sessionStorage.getItem('lattice-studio-tab-session'),
	}));
	expect(state.records, 'a session record was written with recording off').toBe(0);
	expect(state.tabMirror, 'the tab mirror was claimed with recording off').toBeNull();

	// Now turn it on through the real control, and it starts without a reload.
	await openWorkspace(page);
	await page.getByRole('switch', { name: /Record what the Studio was doing/ }).click();
	await expect
		.poll(
			async () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')).length),
			{ timeout: 15_000, message: 'turning the switch on did not start the recorder' },
		)
		.toBeGreaterThan(0);
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
	await allowRecording(page); // the premise is a record existing to be wiped
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
	await allowRecording(other); // the second tab records too — it is the one that must seal
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
