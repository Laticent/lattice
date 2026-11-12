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
