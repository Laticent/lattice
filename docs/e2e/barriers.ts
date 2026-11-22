import { expect, type Frame, type Page } from '@playwright/test';

// Barriers for "and then nothing happened" (HARD RULE #32). An absence check has no event of its own to wait for, so
// these specs used to wait a fixed interval. Each helper here waits instead for an ORDERED event that comes after the
// thing that must not happen would have happened.

/**
 * React's Scheduler posts each render, and each batch of passive effects, as a MessageChannel task. A MessageChannel
 * message posted now is queued behind every one already posted, so when `rounds` such round trips have come back, a
 * state update queued before the call has rendered, its effects have run, and the render THOSE asked for has run too.
 * Four rounds cover update → render → effects → the update an effect makes.
 */
export async function schedulerDrained(target: Page | Frame, rounds = 4): Promise<void> {
	await target.evaluate(
		(n) =>
			new Promise<void>((done) => {
				const round = (left: number) => {
					const ch = new MessageChannel();
					ch.port1.onmessage = () => (left > 1 ? round(left - 1) : done());
					ch.port2.postMessage(0);
				};
				round(n);
			}),
		rounds,
	);
}

/**
 * Every zero-delay timer the page queued before now has run. Timers of equal delay fire in the order they were queued,
 * so one more zero-delay timer, queued now, runs after all of them. Use it when the product publishes on
 * `setTimeout(0)` (Sonner's toast store does), after the moment that publish would have been queued.
 */
export async function timersDrained(target: Page | Frame): Promise<void> {
	await target.evaluate(() => new Promise<void>((done) => setTimeout(done, 0))); // flaky-ok: a task-order barrier (equal-delay timers run in queue order), not a wait for time
}

let witnessSeq = 0;
/**
 * Every request the page's main document issued before now has reached Playwright's request log. The page fetches one
 * marker URL (a same-origin 404, cheap and allowed by any `connect-src 'self'`), and requests from one document are
 * reported in the order they were issued, so when the marker's `request` event has fired, an earlier request has fired
 * its own. Use it after the moment the forbidden request would have been made (a timer the test has stepped past, a
 * click it has dispatched), then read the log.
 */
export async function requestsFlushed(page: Page): Promise<void> {
	const marker = `/__request-witness/${++witnessSeq}`;
	const seen = page.waitForRequest((r) => r.url().endsWith(marker));
	await page.evaluate((u) => {
		fetch(u).catch(() => {});
	}, marker);
	await seen;
}

/**
 * Everything a document (or the part of it under `within`) had started to load has finished, and two frames have run
 * after it: every `<img>` complete,
 * every `<video>`/`<audio>` past its first answer (metadata or an error), every `<iframe>` loaded. For an absence check
 * on what a payload in that document could do once its resource answered (an `onerror`, an `onload`): a handler the
 * document registered at parse time runs before one the test adds later, so when the test's own listener has fired,
 * the payload's has too. The two frames cover what fires on a rendering opportunity (an SVG animation's `begin`, a
 * `<details>` toggle task).
 */
export async function documentSettled(target: Page | Frame, within = ':root'): Promise<void> {
	await target.evaluate(async (scope) => {
		const root = document.querySelector(scope);
		if (!root) throw new Error(`documentSettled: nothing matches ${scope}`);
		const once = (el: Element, events: string[]) =>
			new Promise<void>((r) => {
				for (const e of events) el.addEventListener(e, () => r(), { once: true });
			});
		const pending: Promise<void>[] = [];
		for (const img of root.querySelectorAll('img')) if (!img.complete) pending.push(once(img, ['load', 'error']));
		for (const m of root.querySelectorAll('video, audio') as NodeListOf<HTMLMediaElement>) {
			if (m.getAttribute('src') && m.readyState === 0 && !m.error && m.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE) pending.push(once(m, ['loadedmetadata', 'error']));
		}
		for (const f of root.querySelectorAll('iframe')) {
			let loaded = false;
			try {
				loaded = f.contentDocument?.readyState === 'complete';
			} catch {
				loaded = true; // a cross-origin frame has loaded far enough to refuse us
			}
			if (!loaded) pending.push(once(f, ['load', 'error']));
		}
		await Promise.all(pending);
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	}, within);
}

/**
 * A layout change has run its course: two frames (a `ResizeObserver` reports after the layout of the frame the size
 * changed in), React's scheduler (a remount or state that observer set), and two frames again (the layout that render
 * asked for). For a check that reads geometry after a resize or a remount.
 */
export async function layoutSettled(target: Page | Frame): Promise<void> {
	const frames = () => target.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
	await frames();
	await schedulerDrained(target);
	await frames();
}

/**
 * Everything under `within` has stopped moving: layout has settled, every finite animation and transition there has
 * finished (an infinite one, a spinner, never does), and layout has settled again after them. For a geometry read that
 * a reflow in flight would corrupt; it replaces "read until two consecutive reads agree", which samples quiet rather
 * than waiting for the motion to end.
 * `within` settles EVERY element it matches, not the first. A dialog opened over a sheet is the second
 * `[role="dialog"]` in the document: with only the first, the helper waited on the 390px Library sheet while the photo
 * dialog was still zooming in, and the test read the dialog's box mid-animation (library-images.spec.ts, 2/5 under
 * 4-worker load).
 */
export async function motionSettled(target: Page | Frame, within: string): Promise<void> {
	await layoutSettled(target);
	await target.evaluate(async (scope) => {
		const finite = (a: Animation) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY;
		const running = [...document.querySelectorAll(scope)].flatMap((root) => root.getAnimations({ subtree: true }));
		await Promise.all(running.filter(finite).map((a) => a.finished.catch(() => undefined)));
	}, within);
	await layoutSettled(target);
}

/**
 * Two screenshots of the page in a row are identical: what a picture of a settled layout waits for after a resize. Every
 * shot is taken with `animations: 'disabled'`, which runs a finite animation or transition to its end and holds an
 * infinite one at its first frame. Without that, an infinite animation never lets two shots match when the shots fall
 * half a cycle apart: the Studio's drawn caret blinks every 530 ms (`lx-caret-blink`, 1.06 s), and on WebKit one poll
 * of a 300 ms interval plus a ~220 ms screenshot took 520 to 570 ms, so every shot caught the caret in the other state
 * for 15 s (nightly run 43712760849, plugin-slots.spec.ts on webkit-tablet).
 */
export async function pictureStill(page: Page, timeout = 15_000): Promise<void> {
	let previous = '';
	await expect
		.poll(
			async () => {
				const current = (await page.screenshot({ animations: 'disabled' })).toString('base64');
				const same = current === previous;
				previous = current;
				return same;
			},
			{ message: 'two screenshots in a row were never identical', timeout, intervals: [300] },
		)
		.toBe(true);
}

/**
 * A page has SETTLED: no request in flight AND the main thread idle (`requestIdleCallback`, which fires only when no
 * task is queued; two animation frames on WebKit, which lacks it), twice in a row, so work spawned in stages is waited
 * out. The in-flight count comes from Playwright's own request events, counted from the moment this is called, so call
 * it once per page, before the navigations it will wait on.
 *
 * Why not `waitUntil: 'networkidle'`: it is Playwright's lifecycle event, and under load it can fail to fire with no
 * request open at all (measured on /studio/, 4 cores pinned, 8 contexts: a 40 s timeout with zero page and zero
 * service-worker requests in flight), and on a page that was already idle it returns at once (found by review in
 * site-csp.spec.ts, #3277). Moved here unchanged from site-csp.spec.ts, which now imports it. Puppeteer's
 * `networkidle0` is the same kind of quiet period (engineering/gotchas/browser-engine.md, "`setContent(…, { waitUntil:
 * 'networkidle0' })` times out on a document that fetches nothing").
 */
export function pageSettler(page: Page): () => Promise<void> {
	let inFlight = 0;
	page.on('request', () => inFlight++);
	page.on('requestfinished', () => inFlight--);
	page.on('requestfailed', () => inFlight--);
	const idle = () =>
		page.evaluate(
			() =>
				new Promise<void>((done) => {
					const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
					// One second, not ten. After some presses Chromium 159 (Playwright 1.65.1) gives a page no idle period at
					// all: on site-csp's Mosaico demo 14 of 38 waits ran the full timeout with no animation running, which took
					// that test from 1.0 min (Chromium 141) to 4.9 min, over its budget under load. Network quiet is the poll
					// below; this is only "let the page catch up", which WebKit already does with two frames.
					if (w.requestIdleCallback) w.requestIdleCallback(() => done(), { timeout: 1_000 });
					else requestAnimationFrame(() => requestAnimationFrame(() => done()));
				}),
		);
	return async () => {
		let quiet = 0;
		while (quiet < 2) {
			await expect.poll(() => inFlight, { timeout: 60_000 }).toBe(0);
			await idle();
			quiet = inFlight === 0 ? quiet + 1 : 0;
		}
	};
}
