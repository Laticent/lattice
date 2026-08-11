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
		v: 2,
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
			localStorage.setItem(`lattice-studio-session-${rec.id}`, JSON.stringify(rec));
		} catch {
			/* storage unavailable — the assertions below will say so */
		}
	}, staleCrashRecord(id, 20 * 60_000));
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
	await expect(toast).toBeVisible({ timeout: 15_000 });
	await expect(toast).toContainText(/stopped unexpectedly/i);

	// THE SHAPE. A capsule is right for one line; stretched around a title, a
	// description and an action it clipped its own last line of text at 390px.
	expect(await toast.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe('9999px');

	// THE DESCRIPTION MUST BE LEGIBLE. Sonner hardcodes #3f3f3f for descriptions,
	// which on this deliberately dark toast was ~1.07:1 — invisible, and only in
	// light mode, which is why review never caught it.
	const desc = toast.locator('[data-description]');
	await expect(desc).toBeVisible();
	expect(await desc.evaluate((el) => getComputedStyle(el).color)).not.toBe('rgb(63, 63, 63)');
	// …and inside its own box, rather than eaten by the corner curve.
	const clipped = await toast.evaluate((el) => {
		const d = el.querySelector('[data-description]');
		return d ? d.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom : true;
	});
	expect(clipped).toBe(false);

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
	await gotoStudio(page);
	await expectReportReadsWell(page);
});

test('the crash report reads correctly on WebKit at phone size @webkit-phone', async ({ page }) => {
	await seedCrash(page);
	await gotoStudio(page);
	await expectReportReadsWell(page);
});

test('a clean session is never reported as a crash', async ({ page }) => {
	await gotoStudio(page);
	await page.waitForTimeout(2_000);
	// The whole feature rests on "an unclosed record is the signal". If an ordinary
	// visit produced one, every boot would cry crash.
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

/**
 * #1616 — "Delete everything" undone by a tab that slept through it.
 *
 * Chromium only, and not for convenience: the freeze comes from the DevTools
 * protocol, and WebKit exposes no equivalent. Dispatching a `resume` event by
 * hand does NOT reproduce this — the document was never actually stopped, which
 * is the entire reason it misses the broadcast.
 */
test('a wipe survives a tab that was frozen through it', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium', 'needs CDP Page.setWebLifecycleState — no WebKit equivalent');

	await gotoStudio(page);
	await expect
		.poll(async () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')).length), {
			timeout: 20_000,
		})
		.toBeGreaterThan(0);

	// FREEZE: the browser stops running this document's tasks, exactly as a phone
	// suspends a backgrounded tab.
	const cdp = await context.newCDPSession(page);
	await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });

	// Another tab wipes, the way Workspace → Privacy & Data does.
	const other = await context.newPage();
	await gotoStudio(other);
	await other.evaluate(() => {
		for (const k of Object.keys(localStorage)) if (k.startsWith('lattice-studio-session-')) localStorage.removeItem(k);
		const at = String(Date.now());
		localStorage.setItem('lattice-studio-wipe-signal', at);
		localStorage.removeItem('lattice-studio-wipe-signal');
		localStorage.setItem('lattice-studio-wiped-at', at);
	});

	// Wake it and let several heartbeats pass. THIS is where the data used to
	// come back: the sleeper still held its session and simply wrote it out again.
	await cdp.send('Page.setWebLifecycleState', { state: 'active' });
	await page.bringToFront();
	await page.waitForTimeout(12_000);

	const resurrected = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-session-')));
	expect(resurrected).toEqual([]);
	await other.close();
});
