import type { Frame, Page } from '@playwright/test';

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
 */
export async function motionSettled(target: Page | Frame, within: string): Promise<void> {
	await layoutSettled(target);
	await target.evaluate(async (scope) => {
		const root = document.querySelector(scope);
		if (!root) return;
		const finite = (a: Animation) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY;
		await Promise.all(root.getAnimations({ subtree: true }).filter(finite).map((a) => a.finished.catch(() => undefined)));
	}, within);
	await layoutSettled(target);
}
